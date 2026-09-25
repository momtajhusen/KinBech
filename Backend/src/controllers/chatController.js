const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const { publicUser } = require('../utils/token');
const { recordShopMetric } = require('../utils/shopAnalytics');
const { assertChatTextAllowed } = require('../utils/chatAbuseFilter');
const {
  isChatRestricted,
  chatRestrictionPayload,
} = require('../utils/userRestriction');

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

function otherParticipant(chat, userId) {
  return (chat.participants || []).find(
    (person) => String(person._id || person) !== String(userId)
  );
}

async function getChats(req, res, next) {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate('participants', 'name phone avatarUrl rating preferences location')
      .populate('listing', 'title photos price')
      .sort({ lastMessageAt: -1 });

    res.json({
      chats: chats.map((chat) => ({
        id: chat._id,
        listing: chat.listing,
        otherUser: otherParticipant(chat, req.user._id)
          ? publicUser(otherParticipant(chat, req.user._id))
          : null,
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.lastMessageAt,
      })),
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
          .select('shopId')
          .lean()
          .then(async (listing) => {
            if (!listing?.shopId) return;
            const shop = await Shop.findById(listing.shopId).select('owner').lean();
            if (shop && String(req.user._id) !== String(shop.owner)) {
              await recordShopMetric(listing.shopId, 'inquiries');
            }
          })
          .catch(() => {});
      }
    }

    await chat.populate('participants', 'name phone avatarUrl rating preferences location');
    await chat.populate('listing', 'title photos price');

    res.status(201).json({
      chat: {
        id: chat._id,
        listing: chat.listing,
        otherUser: publicUser(otherParticipant(chat, req.user._id)),
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

    const messages = await Message.find({ chat: chat._id }).sort({ createdAt: 1 });
    res.json({
      messages: messages.map((message) => ({
        id: message._id,
        text: message.text,
        senderId: message.sender,
        createdAt: message.createdAt,
        mine: String(message.sender) === String(req.user._id),
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function sendMessage(req, res, next) {
  try {
    if (rejectIfChatRestricted(req.user, res)) return;

    const text = String(req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const abuse = assertChatTextAllowed(text);
    if (!abuse.ok) {
      return res.status(abuse.httpStatus || 400).json({
        message: abuse.message,
        code: abuse.code,
      });
    }

    const chat = await Chat.findOne({
      _id: req.params.id,
      participants: req.user._id,
    });

    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    const message = await Message.create({
      chat: chat._id,
      sender: req.user._id,
      text,
    });

    chat.lastMessage = text;
    chat.lastMessageAt = new Date();
    await chat.save();

    const otherId = (chat.participants || []).find(
      (person) => String(person._id || person) !== String(req.user._id)
    );
    if (otherId) {
      try {
        await Notification.create({
          user: otherId,
          type: 'chat',
          title: 'New message',
          body: text.slice(0, 140),
          icon: 'chatbubble-outline',
          route: 'Chat',
          params: { chatId: String(chat._id) },
          relatedChat: chat._id,
        });
      } catch {
        /* notification is best-effort */
      }
    }

    res.status(201).json({
      message: {
        id: message._id,
        text: message.text,
        senderId: message.sender,
        createdAt: message.createdAt,
        mine: true,
      },
    });
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

module.exports = { getChats, createChat, getMessages, sendMessage, confirmMeetup };
