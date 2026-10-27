const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const User = require('../models/User');
const Review = require('../models/Review');
const { publicUser } = require('../utils/token');
const { recordShopMetric } = require('../utils/shopAnalytics');
const { recordInterestSoon } = require('../utils/userInterest');
const { assertChatTextAllowed } = require('../utils/chatAbuseFilter');
const {
  isChatRestricted,
  chatRestrictionPayload,
} = require('../utils/userRestriction');
const { createRtcToken } = require('../utils/agora');
const { recordCallMinutes, reportAccountFailure } = require('../utils/callSettings');
const { addCallSeconds, callAllowanceFor } = require('../utils/callAllowance');
const { sendIncomingCallPush, sendUserPush } = require('../utils/callPush');
const { scheduleDeal, noteChatMessage, recordDealOutcome } = require('../utils/deals');
const { detectScamRisk } = require('../utils/chatIntent');
const { sameAudienceUser } = require('../utils/audience');
const { isAdminRole } = require('../utils/adminScopes');
const { SUPPORT_NAME, SUPPORT_AVATAR } = require('../utils/support');
const { blockOf, blockStatus, messageBlockError, callBlockError } = require('../utils/blocks');

const MESSAGE_PAGE_MAX = 100;

/** Admins reach users through the contact center and always show up as KinBech Support. */
function chatPeer(user) {
  if (!user) return null;
  const peer = publicUser(user);
  if (!isAdminRole(user.role)) return peer;
  return { ...peer, name: SUPPORT_NAME, avatarUrl: SUPPORT_AVATAR, phone: '', isSupport: true };
}

function deliverPush(note) {
  if (!note?.user) return;
  sendUserPush({
    userId: note.user,
    title: note.title,
    body: note.body,
    dataOnly: note.type === 'chat',
    data: {
      type: note.type,
      notificationId: String(note._id),
      route: note.route || '',
      chatId: note.params?.chatId || '',
      name: note.params?.name || '',
      image: note.params?.image || '',
      listingImage: note.params?.listingImage || '',
      listingTitle: note.params?.listingTitle || '',
    },
  }).catch(() => {});
}

function rejectIfChatRestricted(user, res) {
  if (!isChatRestricted(user)) return false;
  const info = chatRestrictionPayload(user);
  res.status(403).json({
    message: info.reason,
    code: info.code,
    until: info.until,
  });
  return true;
}

const VIEW_EDIT_MS = 5000;

function hiddenFrom(message, userId) {
  return (message.deletedFor || []).some((id) => String(id) === String(userId));
}

function replyPreview(message, userId) {
  if (!message) return null;
  const deleted = Boolean(message.deletedForEveryone) || hiddenFrom(message, userId);
  let text = message.text || '';
  if (deleted) text = 'Message deleted';
  else if (message.kind === 'voice') text = 'Voice message';
  else if (message.kind === 'call') text = 'Voice call';
  return {
    id: message._id,
    text,
    mine: String(message.sender) === String(userId),
    kind: message.kind || 'text',
    deleted,
  };
}

function presentMessage(message, userId, reply) {
  const mine = String(message.sender) === String(userId);
  const deleted = Boolean(message.deletedForEveryone);
  return {
    id: message._id,
    text: deleted ? '' : message.text,
    senderId: message.sender,
    createdAt: message.createdAt,
    mine,
    kind: message.kind || 'text',
    editedAt: message.editedAt || null,
    viewedAt: message.viewedAt || null,
    deleted,
    safetyFlag: deleted ? '' : message.safetyFlag || '',
    reply: replyPreview(reply, userId),
    audio:
      !deleted && message.kind === 'voice'
        ? {
            url: message.audio?.url || '',
            durationSec: message.audio?.durationSec || 0,
          }
        : null,
    call:
      message.kind === 'call'
        ? {
            status: message.call?.status || 'missed',
            durationSec: message.call?.durationSec || 0,
          }
        : null,
  };
}

/** Deal state for the chat banner; null until a meetup is confirmed. */
async function presentDeal(chat, userId) {
  const deal = chat.deal || {};
  if (!chat.listing || !deal.state || deal.state === 'none') return null;
  const sellerId = String(chat.listing.seller?._id || chat.listing.seller || '');
  const role = sellerId === String(userId) ? 'seller' : 'buyer';
  const reviewed = deal.state === 'completed' && role === 'buyer'
    ? Boolean(await Review.exists({ reviewer: userId, listing: chat.listing._id }))
    : false;
  return {
    chatId: String(chat._id),
    state: deal.state,
    role,
    reviewed,
    source: deal.source || '',
    scheduledAt: deal.scheduledAt || null,
    completedAt: deal.completedAt || null,
    noShowBy: deal.noShowBy || '',
    sellerId,
    sellerType: chat.listing.sellerType || 'individual',
    shopId: chat.listing.shopId ? String(chat.listing.shopId) : null,
  };
}

function mutationWindowOpen(message) {
  if (!message.viewedAt) return true;
  return Date.now() - new Date(message.viewedAt).getTime() <= VIEW_EDIT_MS;
}

function voiceUploadPath(value) {
  const raw = String(value || '').trim();
  if (raw.startsWith('/uploads/')) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.pathname.startsWith('/uploads/')) return parsed.pathname;
  } catch {
    /* not a URL */
  }
  return '';
}

function otherParticipant(chat, userId) {
  return (chat.participants || []).find(
    (person) => String(person._id || person) !== String(userId)
  );
}

/**
 * The store a chat partner is speaking for: the listing's shop when the chat is about
 * a shop listing, or their active shop for chats opened from a store page (no listing).
 */
async function shopIdentities(chats, userId) {
  const ownerIds = chats.map((chat) => otherParticipant(chat, userId)?._id).filter(Boolean);
  if (!ownerIds.length) return chats.map(() => null);
  const shops = await Shop.find({ owner: { $in: ownerIds }, status: 'active' })
    .select('name logo coverImage owner')
    .lean();
  const byOwner = new Map(shops.map((shop) => [String(shop.owner), shop]));
  return chats.map((chat) => {
    const other = otherParticipant(chat, userId);
    const shop = other ? byOwner.get(String(other._id)) : null;
    if (!shop) return null;
    if (chat.listing && String(chat.listing.shopId || '') !== String(shop._id)) return null;
    return { id: shop._id, name: shop.name, logo: shop.logo || '', coverImage: shop.coverImage || '' };
  });
}

async function getChats(req, res, next) {
  try {
    const chats = (await Chat.find({ participants: req.user._id })
      .populate('participants', 'name phone avatarUrl rating preferences location isTester role')
      .populate('listing', 'title photos price shopId seller')
      .sort({ lastMessageAt: -1 }))
      .filter((chat) => {
        const other = otherParticipant(chat, req.user._id);
        return isAdminRole(other?.role) || sameAudienceUser(other);
      });
    const shops = await shopIdentities(chats, req.user._id);
    const chatIds = chats.map((chat) => chat._id);
    const [unreadRows, latestRows] = chatIds.length
      ? await Promise.all([
          Message.aggregate([
            {
              $match: {
                chat: { $in: chatIds },
                sender: { $ne: req.user._id },
                viewedAt: null,
                deletedForEveryone: { $ne: true },
                deletedFor: { $ne: req.user._id },
              },
            },
            { $group: { _id: '$chat', count: { $sum: 1 } } },
          ]),
          Message.aggregate([
            {
              $match: {
                chat: { $in: chatIds },
                deletedForEveryone: { $ne: true },
                deletedFor: { $ne: req.user._id },
              },
            },
            { $sort: { createdAt: -1 } },
            {
              $group: {
                _id: '$chat',
                text: { $first: '$text' },
                kind: { $first: '$kind' },
                createdAt: { $first: '$createdAt' },
                sender: { $first: '$sender' },
                viewedAt: { $first: '$viewedAt' },
                callStatus: { $first: '$call.status' },
              },
            },
          ]),
        ])
      : [[], []];
    const unreadById = new Map(unreadRows.map((row) => [String(row._id), row.count]));
    const latestById = new Map(latestRows.map((row) => [String(row._id), row]));

    res.json({
      chats: chats.map((chat, i) => {
        const latest = latestById.get(String(chat._id));
        const other = otherParticipant(chat, req.user._id);
        const otherPublic = chatPeer(other);
        const lastMessageMine = latest?.sender
          ? String(latest.sender) === String(req.user._id)
          : chat.lastMessageSender
            ? String(chat.lastMessageSender) === String(req.user._id)
            : null;
        return {
          id: chat._id,
          listing: chat.listing,
          otherUser: otherPublic ? { ...otherPublic, shop: shops[i] } : null,
          lastMessage: latest?.text || chat.lastMessage || '',
          lastMessageAt: latest?.createdAt || chat.lastMessageAt,
          lastMessageKind: latest?.kind || chat.lastMessageKind || 'text',
          lastCallStatus: (latest?.kind || chat.lastMessageKind) === 'call' ? latest?.callStatus || '' : '',
          lastMessageMine,
          lastMessageViewed: latest ? Boolean(latest.viewedAt) : true,
          unreadCount: unreadById.get(String(chat._id)) || 0,
          myRole: chat.listing
            ? String(chat.listing.seller || '') === String(req.user._id) ? 'seller' : 'buyer'
            : null,
          block: other ? blockOf(req.user, other._id) : null,
        };
      }),
      callAllowance: await callAllowanceFor(req.user),
    });
  } catch (error) {
    next(error);
  }
}

async function createChat(req, res, next) {
  try {
    if (rejectIfChatRestricted(req.user, res)) return;

    const { listingId, userId } = req.body;
    if (!userId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ message: 'Cannot start a chat with yourself' });
    }

    if (!mongoose.isValidObjectId(userId) || (listingId && !mongoose.isValidObjectId(listingId))) {
      return res.status(400).json({ message: 'Invalid chat target' });
    }
    const peer = await User.findById(userId).select('isTester').lean();
    if (!peer || !sameAudienceUser(peer) || (listingId && !(await Listing.exists({ _id: listingId })))) {
      return res.status(404).json({ message: 'This seller is not available' });
    }

    let chat = await Chat.findOne({
      participants: { $all: [req.user._id, userId] },
      ...(listingId ? { listing: listingId } : {}),
    });

    if (!chat) {
      chat = await Chat.create({
        listing: listingId || undefined,
        participants: [req.user._id, userId],
      });

      if (listingId) {
        Listing.findById(listingId)
          .select('shopId seller category title searchWords price')
          .lean()
          .then(async (listing) => {
            if (listing && String(listing.seller) !== String(req.user._id)) {
              recordInterestSoon(req.user._id, { kind: 'chat', listing });
            }
            if (!listing?.shopId) return;
            const shop = await Shop.findById(listing.shopId).select('owner').lean();
            if (shop && String(req.user._id) !== String(shop.owner)) {
              await recordShopMetric(listing.shopId, 'inquiries');
            }
          })
          .catch(() => {});
      }
    }

    await chat.populate('participants', 'name phone avatarUrl rating preferences location role');
    await chat.populate('listing', 'title photos price shopId');
    const [shop] = await shopIdentities([chat], req.user._id);

    res.status(201).json({
      chat: {
        id: chat._id,
        listing: chat.listing,
        otherUser: { ...chatPeer(otherParticipant(chat, req.user._id)), shop },
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.lastMessageAt,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getMessages(req, res, next) {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    User.updateOne({ _id: req.user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
    await chat.populate('participants', 'name lastActiveAt avatarUrl isTester');
    await chat.populate('listing', 'title photos price shopId location coordinates seller sellerType');
    const other = otherParticipant(chat, req.user._id);
    if (!sameAudienceUser(other)) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    const [peerShop] = await shopIdentities([chat], req.user._id);
    const lastSeenAt = other?.lastActiveAt || null;
    const online = Boolean(
      lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < 45 * 1000
    );
    const typing = Boolean(
      chat.typing?.until &&
        new Date(chat.typing.until).getTime() > Date.now() &&
        String(chat.typing.user) !== String(req.user._id)
    );

    const requestedLimit = parseInt(req.query.limit, 10);
    const pageLimit = requestedLimit > 0 ? Math.min(MESSAGE_PAGE_MAX, requestedLimit) : 0;
    const before = req.query.before && mongoose.isValidObjectId(req.query.before)
      ? await Message.findOne({ _id: req.query.before, chat: chat._id }).select('createdAt').lean()
      : null;

    if (!before) {
      await Message.updateMany(
        {
          chat: chat._id,
          sender: { $ne: req.user._id },
          viewedAt: null,
          deletedForEveryone: { $ne: true },
          deletedFor: { $ne: req.user._id },
        },
        { $set: { viewedAt: new Date() } }
      );
    }

    const messageFilter = { chat: chat._id, deletedFor: { $ne: req.user._id } };
    if (before) {
      messageFilter.$or = [
        { createdAt: { $lt: before.createdAt } },
        { createdAt: before.createdAt, _id: { $lt: before._id } },
      ];
    }
    let messageQuery = Message.find(messageFilter).sort({ createdAt: -1, _id: -1 });
    if (pageLimit) messageQuery = messageQuery.limit(pageLimit + 1);
    const rows = await messageQuery.lean();
    const hasMore = pageLimit > 0 && rows.length > pageLimit;
    const visible = (hasMore ? rows.slice(0, pageLimit) : rows).reverse();
    const byId = new Map(visible.map((message) => [String(message._id), message]));
    const missingReplies = [...new Set(
      visible.map((message) => message.replyTo && String(message.replyTo)).filter((id) => id && !byId.has(id))
    )];
    if (missingReplies.length) {
      const replies = await Message.find({ _id: { $in: missingReplies } }).lean();
      replies.forEach((message) => byId.set(String(message._id), message));
    }
    const messages = visible.map((message) =>
      presentMessage(message, req.user._id, byId.get(String(message.replyTo)))
    );
    if (before) return res.json({ messages, hasMore });

    const blocks = await blockStatus(req.user, other?._id);
    res.json({
      block: blocks.mine,
      blockedBy: blocks.theirs,
      presence: {
        online,
        typing,
        lastSeenAt,
      },
      peer: other
        ? {
            id: other._id,
            name: other.name || '',
            avatarUrl: other.avatarUrl || '',
            shop: peerShop,
          }
        : null,
      listing: chat.listing
        ? {
            id: chat.listing._id,
            title: chat.listing.title || '',
            photos: chat.listing.photos || [],
            price: chat.listing.price,
            location: chat.listing.location || '',
            coordinates: chat.listing.coordinates || null,
          }
        : null,
      messages,
      hasMore,
      deal: await presentDeal(chat, req.user._id),
      myRole: chat.listing && String(chat.listing.seller) === String(req.user._id) ? 'seller' : 'buyer',
    });
  } catch (error) {
    next(error);
  }
}

async function setTyping(req, res, next) {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const active = req.body?.active !== false && String(req.body?.active) !== 'false';
    chat.typing = active
      ? { user: req.user._id, until: new Date(Date.now() + 4000) }
      : { user: null, until: null };
    await chat.save();
    User.updateOne({ _id: req.user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    if (rejectIfChatRestricted(req.user, res)) return;

    const isVoice = req.body?.kind === 'voice';
    let text = String(req.body.text || '').trim();
    let audio = null;
    if (isVoice) {
      const audioUrl = voiceUploadPath(req.body?.audioUrl);
      const durationSec = Math.max(1, Math.min(180, Math.round(Number(req.body?.durationSec) || 0)));
      if (!audioUrl) {
        return res.status(400).json({ message: 'Voice recording is required' });
      }
      text = 'Voice message';
      audio = { url: audioUrl, durationSec };
    } else if (!text) {
      return res.status(400).json({ message: 'Message text is required' });
    } else {
      const abuse = assertChatTextAllowed(text);
      if (!abuse.ok) {
        return res.status(abuse.httpStatus || 400).json({
          message: abuse.message,
          code: abuse.code,
        });
      }
    }

    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const blocked = messageBlockError(await blockStatus(req.user, otherParticipant(chat, req.user._id)));
    if (blocked) return res.status(403).json(blocked);

    let replyTo = null;
    if (req.body?.replyTo) {
      const reply = await Message.findOne({
        _id: req.body.replyTo,
        chat: chat._id,
      });
      if (reply && !reply.deletedForEveryone && !hiddenFrom(reply, req.user._id)) {
        replyTo = reply._id;
      }
    }

    const scamRisk = !isVoice && detectScamRisk(text);
    const message = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      text,
      kind: isVoice ? 'voice' : 'text',
      audio: audio || undefined,
      replyTo,
      safetyFlag: scamRisk ? 'scam_words' : '',
    });
    if (scamRisk) {
      Chat.updateOne({ _id: chat._id }, { $inc: { safetyFlags: 1 }, $set: { lastSafetyFlagAt: new Date() } }).catch(() => {});
    }

    chat.lastMessage = text;
    chat.lastMessageAt = new Date();
    chat.lastMessageSender = req.user._id;
    chat.lastMessageKind = isVoice ? 'voice' : 'text';
    await chat.save();
    if (!isVoice) noteChatMessage(chat, req.user._id, text);

    const otherId = (chat.participants || []).find(
      (person) => String(person._id || person) !== String(req.user._id)
    );
    if (otherId) {
      try {
        const listingDoc = chat.listing
          ? await Listing.findById(chat.listing).select('title photos shopId').lean()
          : null;
        const myShop = await Shop.findOne({ owner: req.user._id, status: 'active' }).select('name logo').lean();
        const asShop =
          myShop && (listingDoc ? String(listingDoc.shopId || '') === String(myShop._id) : true);
        const senderName = (asShop ? myShop.name : req.user.name) || 'KinBech user';
        const note = await Notification.create({
          user: otherId,
          type: 'chat',
          title: senderName,
          body: text.slice(0, 140),
          icon: 'chatbubble-ellipses-outline',
          route: 'Chat',
          params: {
            chatId: String(chat._id),
            name: senderName,
            image: (asShop ? myShop.logo : req.user.avatarUrl) || '',
            listingImage: listingDoc?.photos?.[0] || '',
            listingTitle: listingDoc?.title || '',
          },
          relatedChat: chat._id,
        });
        deliverPush(note);
      } catch {
        /* notification is best-effort */
      }
    }

    const replyDoc = replyTo
      ? await Message.findById(replyTo)
      : null;
    res.status(201).json({
      message: presentMessage(message, req.user._id, replyDoc),
    });
  } catch (error) {
    next(error);
  }
}

async function editMessage(req, res, next) {
  try {
    if (rejectIfChatRestricted(req.user, res)) return;
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Message text is required' });
    const abuse = assertChatTextAllowed(text);
    if (!abuse.ok) {
      return res.status(abuse.httpStatus || 400).json({ message: abuse.message, code: abuse.code });
    }

    const chat = await Chat.findOne({ _id: req.params.id, participants: req.user._id });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const message = await Message.findOne({ _id: req.params.messageId, chat: chat._id });
    if (!message || hiddenFrom(message, req.user._id)) {
      return res.status(404).json({ message: 'Message not found' });
    }
    if (String(message.sender) !== String(req.user._id) || message.kind !== 'text' || message.deletedForEveryone) {
      return res.status(400).json({ message: 'This message cannot be edited' });
    }
    if (!mutationWindowOpen(message)) {
      return res.status(400).json({ message: 'You can only edit within 5 seconds of it being seen' });
    }

    message.text = text;
    message.safetyFlag = detectScamRisk(text) ? 'scam_words' : '';
    message.editedAt = new Date();
    await message.save();

    const latest = await Message.findOne({ chat: chat._id, deletedForEveryone: { $ne: true } }).sort({ createdAt: -1 });
    if (latest && String(latest._id) === String(message._id)) {
      chat.lastMessage = text;
      await chat.save();
    }

    const reply = message.replyTo ? await Message.findById(message.replyTo) : null;
    res.json({ message: presentMessage(message, req.user._id, reply) });
  } catch (error) {
    next(error);
  }
}

async function deleteMessage(req, res, next) {
  try {
    const scope = req.body?.scope === 'everyone' ? 'everyone' : 'me';
    const chat = await Chat.findOne({ _id: req.params.id, participants: req.user._id });
    if (!chat) return res.status(404).json({ message: 'Chat not found' });

    const message = await Message.findOne({ _id: req.params.messageId, chat: chat._id });
    if (!message || hiddenFrom(message, req.user._id)) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const mine = String(message.sender) === String(req.user._id);
    if (message.deletedForEveryone) {
      return res.status(400).json({ message: 'This message is already deleted' });
    }

    if (scope === 'everyone') {
      if (!mine || message.viewedAt) {
        return res.status(400).json({ message: 'Delete for everyone is only available before it is seen' });
      }
      message.deletedForEveryone = true;
      message.text = 'This message was deleted';
      if (message.kind === 'voice') message.audio = { url: '', durationSec: 0 };
      await message.save();
      const latest = await Message.findOne({ chat: chat._id }).sort({ createdAt: -1 });
      if (latest && String(latest._id) === String(message._id)) {
        chat.lastMessage = 'This message was deleted';
        chat.lastMessageKind = 'text';
        await chat.save();
      }
      const reply = message.replyTo ? await Message.findById(message.replyTo) : null;
      return res.json({ message: presentMessage(message, req.user._id, reply) });
    }

    if (mine && !mutationWindowOpen(message)) {
      return res.status(400).json({ message: 'You can only delete this within 5 seconds of it being seen' });
    }

    await Message.updateOne(
      { _id: message._id },
      { $addToSet: { deletedFor: req.user._id } }
    );
    res.json({ ok: true, id: message._id });
  } catch (error) {
    next(error);
  }
}

async function confirmMeetup(req, res, next) {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    }).populate('listing', 'title photos price condition sellerType shopId seller');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    chat.meetupConfirmed = true;
    chat.meetupPlace = String(req.body.place || chat.meetupPlace || 'Public place');
    chat.meetupAt = new Date();
    await chat.save();
    await scheduleDeal(chat, chat.listing);

    const meetupPartner = otherParticipant(chat, req.user._id);
    const meetupPartnerId = meetupPartner?._id || meetupPartner;
    if (meetupPartnerId) {
      try {
        const note = await Notification.create({
          user: meetupPartnerId,
          type: 'system',
          title: 'Meetup confirmed',
          body: `${req.user.name || 'Someone'} confirmed a meetup at ${chat.meetupPlace}`,
          icon: 'location-outline',
          route: 'Chat',
          params: {
            chatId: String(chat._id),
            name: req.user.name || 'KinBech user',
          },
          relatedChat: chat._id,
        });
        deliverPush(note);
      } catch {
        /* notification is best-effort */
      }
    }

    res.json({
      ok: true,
      chat: {
        id: chat._id,
        meetupConfirmed: true,
        meetupPlace: chat.meetupPlace,
        meetupAt: chat.meetupAt,
        listing: chat.listing,
      },
    });
  } catch (error) {
    next(error);
  }
}

const RING_MS = 60 * 1000;

async function createCall(req, res, next) {
  try {
    if (rejectIfChatRestricted(req.user, res)) return;

    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const joining = req.body?.join === true;
    const otherId = (chat.participants || []).find(
      (person) => String(person._id || person) !== String(req.user._id)
    );

    let maxSeconds = null;
    const peer = otherId ? await User.findById(otherId).select('name role').lean() : null;
    if (!isAdminRole(peer?.role)) {
      const mine = await callAllowanceFor(req.user);
      if (mine.remainingSeconds === 0) {
        return res.status(429).json({
          code: 'CALL_LIMIT_REACHED',
          message: `You have used your ${mine.limitMinutes} free call minutes for today. Calls open again at midnight. You can still send messages.`,
        });
      }
      maxSeconds = mine.remainingSeconds;
      if (joining) {
        const ringMax = chat.ringingCall?.maxSeconds;
        if (ringMax > 0) maxSeconds = maxSeconds == null ? ringMax : Math.min(maxSeconds, ringMax);
      } else if (peer) {
        const theirs = await callAllowanceFor(peer);
        if (theirs.remainingSeconds === 0) {
          return res.status(429).json({
            code: 'PEER_CALL_LIMIT',
            message: `${peer.name || 'This person'} has used today's call minutes. Try again tomorrow, or send a message.`,
          });
        }
        if (theirs.remainingSeconds != null) {
          maxSeconds = maxSeconds == null ? theirs.remainingSeconds : Math.min(maxSeconds, theirs.remainingSeconds);
        }
      }
    }

    const session = await createRtcToken({
      chatId: chat._id,
      userId: req.user._id,
      accountId: joining ? chat.ringingCall?.agoraAccountId : undefined,
      // The caller waits in the channel while it rings, so their token also covers ringing.
      ttlSeconds: maxSeconds == null ? undefined : maxSeconds + (joining ? 15 : RING_MS / 1000 + 15),
    });
    if (joining && chat.ringingCall?.startedAt) {
      chat.ringingCall.answeredAt = chat.ringingCall.answeredAt || new Date();
      chat.markModified('ringingCall');
      await chat.save();
    } else if (!joining && otherId) {
      const blocked = callBlockError(await blockStatus(req.user, otherId));
      if (blocked) return res.status(403).json(blocked);
      const guardCutoff = new Date(Date.now() - 5000);
      const placed = await Chat.findOneAndUpdate(
        {
          _id: chat._id,
          $and: [
            {
              $or: [
                { 'callGuard.at': null },
                { 'callGuard.at': { $exists: false } },
                { 'callGuard.user': { $ne: req.user._id } },
                { 'callGuard.at': { $lt: guardCutoff } },
              ],
            },
            {
              $or: [
                { 'ringingCall.startedAt': null },
                { 'ringingCall.startedAt': { $exists: false } },
                { 'ringingCall.caller': req.user._id },
                { 'ringingCall.answeredAt': { $ne: null } },
                { 'ringingCall.startedAt': { $lt: new Date(Date.now() - RING_MS) } },
              ],
            },
          ],
        },
        {
          $set: {
            ringingCall: {
              caller: req.user._id,
              callerName: req.user.name || 'KinBech user',
              callerImage: req.user.avatarUrl || '',
              startedAt: new Date(),
              agoraAccountId: session.accountId,
              maxSeconds,
            },
          },
        }
      );
      if (!placed) {
        return res.status(409).json({ message: 'This call was declined.' });
      }
      try {
        const note = await Notification.create({
          user: otherId,
          type: 'call',
          title: 'Incoming call',
          body: `${req.user.name || 'Someone'} is calling you`,
          icon: 'call-outline',
          route: 'Chat',
          params: {
            chatId: String(chat._id),
            name: req.user.name || 'KinBech user',
          },
          relatedChat: chat._id,
        });
      } catch {
        /* notification is best-effort */
      }
      const listing = chat.listing
        ? await Listing.findById(chat.listing).select('title photos price location').lean().catch(() => null)
        : null;
      sendIncomingCallPush({
        userId: otherId,
        chatId: chat._id,
        callerName: req.user.name || 'KinBech user',
        callerImage: req.user.avatarUrl || '',
        listing,
      }).catch(() => {});
    }

    res.json({ ...session, maxSeconds });
  } catch (error) {
    next(error);
  }
}

/** POST /chats/:id/call/failure: the app saw Agora reject the account (bad App ID, token, or project). */
async function reportCallFailure(req, res, next) {
  try {
    const accountId = String(req.body?.accountId || '').slice(0, 64);
    const reason = String(req.body?.reason || '').replace(/[^\w:. -]/g, '').slice(0, 40);
    if (!accountId) return res.status(400).json({ message: 'accountId is required' });
    const chat = await Chat.findOne({ _id: req.params.id, participants: req.user._id }).select('ringingCall');
    if (!chat) return res.status(404).json({ message: 'Chat not found' });
    const ringAccount = chat.ringingCall?.agoraAccountId;
    if (ringAccount && ringAccount !== accountId) return res.json({ paused: false });
    const paused = await reportAccountFailure(accountId, req.user._id, reason);
    res.json({ paused });
  } catch (error) {
    next(error);
  }
}

function formatCallDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function callNotice(status, durationSec, role) {
  const duration = formatCallDuration(durationSec);
  if (status === 'answered') {
    return { title: 'Voice call', body: `Talked for ${duration}` };
  }
  if (status === 'rejected') {
    return role === 'caller'
      ? { title: 'Call declined', body: 'They declined the call' }
      : { title: 'Call declined', body: 'You declined the call' };
  }
  if (status === 'cancelled') {
    return role === 'caller'
      ? { title: 'Call cancelled', body: 'You cancelled before they answered' }
      : { title: 'Missed voice call', body: 'You missed a call' };
  }
  return role === 'caller'
    ? { title: 'No answer', body: 'They did not pick up' }
    : { title: 'Missed voice call', body: 'You missed a call' };
}

function callPreview(status, durationSec) {
  if (status === 'answered') return `Voice call · ${formatCallDuration(durationSec)}`;
  if (status === 'rejected') return 'Call declined';
  if (status === 'cancelled') return 'Cancelled call';
  return 'Missed voice call';
}

async function recordCallHistory(chat, endedBy, forcedStatus) {
  const ring = chat?.ringingCall;
  if (!ring?.startedAt || !ring.caller) return;

  let status = forcedStatus;
  let durationSec = 0;
  if (!status) {
    if (ring.answeredAt) {
      status = 'answered';
      durationSec = Math.max(
        0,
        Math.round((Date.now() - new Date(ring.answeredAt).getTime()) / 1000)
      );
    } else if (String(ring.caller) === String(endedBy)) {
      status = 'cancelled';
    } else {
      status = 'rejected';
    }
  }

  // Agora bills each person in the channel per started minute; the caller sits in it while ringing.
  const ringEnd = ring.answeredAt ? new Date(ring.answeredAt).getTime() : Date.now();
  const ringSec = Math.min(RING_MS / 1000, Math.max(0, (ringEnd - new Date(ring.startedAt).getTime()) / 1000));
  const talkSec = status === 'answered' ? durationSec : 0;
  recordCallMinutes(
    ring.agoraAccountId,
    Math.max(1, Math.ceil(ringSec / 60)) + 2 * Math.ceil(talkSec / 60)
  );
  if (talkSec > 0) {
    addCallSeconds(
      [ring.caller, otherParticipant(chat, ring.caller)].filter(Boolean).map((person) => person._id || person),
      ring.maxSeconds > 0 ? Math.min(talkSec, ring.maxSeconds) : talkSec
    );
  }

  const text = callPreview(status, durationSec);
  await Message.create({
    chat: chat._id,
    sender: ring.caller,
    text,
    kind: 'call',
    call: { status, durationSec },
  });
  await Chat.updateOne(
    { _id: chat._id },
    {
      $set: {
        lastMessage: text,
        lastMessageAt: new Date(),
        lastMessageSender: ring.caller,
        lastMessageKind: 'call',
      },
    }
  );

  const otherId = (chat.participants || []).find(
    (person) => String(person._id || person) !== String(ring.caller)
  );
  const notices = [
    {
      user: ring.caller,
      role: 'caller',
      name: '',
    },
    otherId
      ? {
          user: otherId,
          role: 'other',
          name: ring.callerName || 'KinBech user',
        }
      : null,
  ].filter(Boolean);

  try {
    const created = await Notification.insertMany(
      notices.map((notice) => {
        const copy = callNotice(status, durationSec, notice.role);
        return {
          user: notice.user,
          type: 'call',
          title: copy.title,
          body: copy.body,
          icon: 'call-outline',
          route: 'Chat',
          params: {
            chatId: String(chat._id),
            ...(notice.name ? { name: notice.name } : {}),
          },
          relatedChat: chat._id,
        };
      })
    );
    created.forEach((note) => deliverPush(note));
  } catch {
    /* notification is best-effort */
  }
}

async function takeRing(chatId, startedAt) {
  const filter = {
    _id: chatId,
    'ringingCall.startedAt': startedAt || { $ne: null },
  };
  return Chat.findOneAndUpdate(filter, { $unset: { ringingCall: 1 } }, { new: false });
}

async function settleExpiredRings(userId) {
  const cutoff = new Date(Date.now() - RING_MS);
  const stale = await Chat.find({
    participants: userId,
    'ringingCall.startedAt': { $lt: cutoff, $ne: null },
    $or: [{ 'ringingCall.answeredAt': null }, { 'ringingCall.answeredAt': { $exists: false } }],
  }).select('ringingCall');

  for (const chat of stale) {
    const previous = await takeRing(chat._id, chat.ringingCall.startedAt);
    if (previous?.ringingCall?.startedAt && !previous.ringingCall.answeredAt) {
      await recordCallHistory(previous, null, 'missed');
    }
  }
}

function isFreshRing(ring, userId) {
  if (!ring?.startedAt || !ring.caller || ring.answeredAt) return false;
  if (String(ring.caller) === String(userId)) return false;
  return Date.now() - new Date(ring.startedAt).getTime() < RING_MS;
}

async function getIncomingCall(req, res, next) {
  try {
    await settleExpiredRings(req.user._id);
    const chats = await Chat.find({
      participants: req.user._id,
      'ringingCall.startedAt': { $gte: new Date(Date.now() - RING_MS) },
    })
      .populate('listing', 'title photos price location coordinates')
      .sort({ 'ringingCall.startedAt': -1 })
      .limit(5);

    const chat = chats.find((item) => isFreshRing(item.ringingCall, req.user._id));
    if (!chat) {
      return res.json({ call: null });
    }

    res.json({
      call: {
        chatId: String(chat._id),
        callerName: chat.ringingCall.callerName || 'KinBech user',
        callerImage: chat.ringingCall.callerImage || '',
        listing: chat.listing
          ? {
              id: chat.listing._id,
              title: chat.listing.title || '',
              photos: chat.listing.photos || [],
              price: chat.listing.price,
              location: chat.listing.location || '',
              coordinates: chat.listing.coordinates || null,
            }
          : null,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getCallStatus(req, res, next) {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    }).select('ringingCall');

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const ring = chat.ringingCall;
    if (ring?.answeredAt) {
      return res.json({ status: 'active' });
    }
    const fresh = Boolean(
      ring?.startedAt && Date.now() - new Date(ring.startedAt).getTime() < RING_MS
    );
    if (ring?.startedAt && !fresh) {
      const previous = await takeRing(chat._id, ring.startedAt);
      if (previous?.ringingCall?.startedAt && !previous.ringingCall.answeredAt) {
        await recordCallHistory(previous, null, 'missed');
      }
      return res.json({ status: 'ended' });
    }
    if (!fresh) return res.json({ status: 'ended' });
    res.json({ status: ring.deliveredAt ? 'ringing' : 'calling' });
  } catch (error) {
    next(error);
  }
}

async function markCallDelivered(req, res, next) {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
      'ringingCall.startedAt': { $ne: null },
    });
    if (!chat?.ringingCall?.caller) return res.json({ ok: false });
    if (String(chat.ringingCall.caller) === String(req.user._id)) {
      return res.json({ ok: false });
    }
    if (!chat.ringingCall.deliveredAt) {
      chat.ringingCall.deliveredAt = new Date();
      chat.markModified('ringingCall');
      await chat.save();
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function endCall(req, res, next) {
  try {
    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    }).select('ringingCall participants');
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const ring = chat.ringingCall;
    const declined =
      Boolean(ring?.startedAt) &&
      !ring.answeredAt &&
      String(ring.caller) !== String(req.user._id);
    const update = { $unset: { ringingCall: 1 } };
    if (declined) {
      update.$set = { callGuard: { user: req.user._id, at: new Date() } };
    }
    const previous = ring?.startedAt
      ? await Chat.findOneAndUpdate(
          { _id: chat._id, 'ringingCall.startedAt': ring.startedAt },
          update,
          { new: false }
        )
      : await takeRing(chat._id);
    if (previous?.ringingCall?.startedAt) {
      await recordCallHistory(previous, req.user._id);
    }
    const ended = previous?.ringingCall;
    if (ended?.startedAt && !ended.answeredAt && String(ended.caller) === String(req.user._id)) {
      // Stops the ringing call notification on the other phone, even when the app there is closed.
      const calleeId = (chat.participants || []).find((id) => String(id) !== String(req.user._id));
      if (calleeId) {
        sendUserPush({
          userId: calleeId,
          incomingCall: true,
          data: { type: 'call_ended', chatId: String(chat._id) },
        }).catch(() => {});
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

/** Optional fallback when automatic detection is unsure: { outcome: 'completed' | 'no_show' }. */
async function setDealOutcome(req, res, next) {
  try {
    const chat = await Chat.findOne({ _id: req.params.id, participants: req.user._id });
    if (!chat?.listing) return res.status(404).json({ message: 'Chat not found' });
    const result = await recordDealOutcome(chat, req.user, String(req.body?.outcome || ''));
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  deliverPush,
  presentMessage,
  setDealOutcome,
  getChats,
  createChat,
  getMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  setTyping,
  confirmMeetup,
  createCall,
  reportCallFailure,
  getIncomingCall,
  getCallStatus,
  markCallDelivered,
  endCall,
};
