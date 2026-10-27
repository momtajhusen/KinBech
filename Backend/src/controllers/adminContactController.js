const mongoose = require('mongoose');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { createRtcToken } = require('../utils/agora');
const { sendIncomingCallPush, sendUserPush } = require('../utils/callPush');
const { SUPPORT_NAME, SUPPORT_AVATAR } = require('../utils/support');
const { deliverPush, presentMessage } = require('./chatController');

const RING_MS = 60 * 1000;
// An answered call whose end was never reported stops counting as live after this.
const CALL_STALE_MS = 2 * 60 * 60 * 1000;
const CONTACT_FIELDS = 'name phone email avatarUrl sellerTypePreference location fcmToken preferences lastActiveAt status isTester soldCount createdAt';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function presentContact(user, shop, extra = {}) {
  return {
    id: String(user._id),
    name: user.name || 'Unnamed user',
    phone: user.phone || '',
    email: user.email || '',
    avatarUrl: user.avatarUrl || '',
    sellerType: ['shop', 'both'].includes(user.sellerTypePreference) ? 'shop' : 'individual',
    shop: shop ? { id: String(shop._id), name: shop.name, logo: shop.logo || '', status: shop.status } : null,
    location: user.location || '',
    pushReady: Boolean(user.fcmToken),
    notificationsOn: user.preferences?.notifications !== false,
    lastActiveAt: user.lastActiveAt || null,
    status: user.status || 'active',
    isTester: Boolean(user.isTester),
    soldCount: user.soldCount || 0,
    joinedAt: user.createdAt || null,
    ...extra,
  };
}

async function findTarget(userId) {
  if (!mongoose.isValidObjectId(userId)) return null;
  return User.findOne({ _id: userId, role: 'user' }).select(CONTACT_FIELDS).lean();
}

async function supportChat(adminId, userId, { create = false } = {}) {
  const filter = {
    participants: { $all: [adminId, userId], $size: 2 },
    $or: [{ listing: null }, { listing: { $exists: false } }],
  };
  const existing = await Chat.findOne(filter);
  if (existing || !create) return existing;
  return Chat.create({ participants: [adminId, userId] });
}

function callState(ring) {
  if (!ring?.startedAt) return null;
  const age = Date.now() - new Date(ring.startedAt).getTime();
  if (ring.answeredAt) return Date.now() - new Date(ring.answeredAt).getTime() < CALL_STALE_MS ? 'active' : null;
  if (age > RING_MS) return null;
  return ring.deliveredAt ? 'ringing' : 'calling';
}

async function namesFor(ids) {
  const unique = [...new Set(ids.filter(Boolean).map(String))];
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select('name role').lean();
  return new Map(
    users.map((user) => [String(user._id), user.role && user.role !== 'user' ? SUPPORT_NAME : user.name || 'User'])
  );
}

function presentNotification(item, names) {
  return {
    id: String(item._id),
    type: item.type || 'system',
    title: item.title,
    body: item.body || item.message || '',
    unread: item.unread !== false,
    createdAt: item.createdAt,
    user: names ? { id: String(item.user), name: names.get(String(item.user)) || 'User' } : undefined,
  };
}

async function presentCalls(messages) {
  const chatIds = [...new Set(messages.map((message) => String(message.chat)))];
  const chats = await Chat.find({ _id: { $in: chatIds } }).select('participants').lean();
  const participantsByChat = new Map(chats.map((chat) => [String(chat._id), chat.participants.map(String)]));
  const names = await namesFor(chats.flatMap((chat) => chat.participants));
  return messages.map((message) => {
    const callerId = String(message.sender);
    const people = participantsByChat.get(String(message.chat)) || [];
    const receiverId = people.find((id) => id !== callerId) || '';
    return {
      id: String(message._id),
      chatId: String(message.chat),
      status: message.call?.status || 'missed',
      durationSec: message.call?.durationSec || 0,
      createdAt: message.createdAt,
      caller: { id: callerId, name: names.get(callerId) || 'User' },
      receiver: { id: receiverId, name: names.get(receiverId) || 'User' },
    };
  });
}

/** GET /chats/admin/contacts?q=&type=all|sellers|shops|individual */
async function listContacts(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    const type = String(req.query.type || 'all');
    const filter = { role: 'user' };
    if (q) {
      const pattern = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ name: pattern }, { phone: pattern }, { email: pattern }];
      if (mongoose.isValidObjectId(q)) filter.$or.push({ _id: q });
    }
    if (type === 'shops') filter.sellerTypePreference = { $in: ['shop', 'both'] };
    if (type === 'individual') filter.sellerTypePreference = 'individual';
    if (type === 'sellers' || type === 'individual') {
      filter._id = { $in: await Listing.distinct('seller') };
    }
    const users = await User.find(filter).select(CONTACT_FIELDS).sort({ lastActiveAt: -1 }).limit(40).lean();
    const shops = await Shop.find({ owner: { $in: users.map((user) => user._id) } })
      .select('name logo owner status')
      .lean();
    const shopByOwner = new Map(shops.map((shop) => [String(shop.owner), shop]));
    res.json({ contacts: users.map((user) => presentContact(user, shopByOwner.get(String(user._id)))) });
  } catch (error) {
    next(error);
  }
}

/** GET /chats/admin/feed: live calls plus the latest calls and notifications across the app. */
async function getFeed(req, res, next) {
  try {
    const since = new Date(Date.now() - RING_MS);
    const [liveChats, callMessages, notes] = await Promise.all([
      Chat.find({
        'ringingCall.startedAt': { $ne: null },
        $or: [
          { 'ringingCall.startedAt': { $gte: since } },
          { 'ringingCall.answeredAt': { $gte: new Date(Date.now() - CALL_STALE_MS) } },
        ],
      })
        .select('participants ringingCall')
        .sort({ 'ringingCall.startedAt': -1 })
        .limit(20)
        .lean(),
      Message.find({ kind: 'call' }).sort({ createdAt: -1 }).limit(25).lean(),
      Notification.find({ user: { $ne: null }, type: { $ne: 'broadcast' } })
        .sort({ createdAt: -1 })
        .limit(30)
        .lean(),
    ]);
    const names = await namesFor([
      ...liveChats.flatMap((chat) => chat.participants),
      ...notes.map((note) => note.user),
    ]);
    const live = liveChats
      .map((chat) => {
        const state = callState(chat.ringingCall);
        if (!state) return null;
        const callerId = String(chat.ringingCall.caller);
        const receiverId = chat.participants.map(String).find((id) => id !== callerId) || '';
        return {
          chatId: String(chat._id),
          state,
          startedAt: chat.ringingCall.startedAt,
          answeredAt: chat.ringingCall.answeredAt || null,
          caller: { id: callerId, name: names.get(callerId) || chat.ringingCall.callerName || 'User' },
          receiver: { id: receiverId, name: names.get(receiverId) || 'User' },
        };
      })
      .filter(Boolean);
    res.json({
      live,
      calls: await presentCalls(callMessages),
      notifications: notes.map((note) => presentNotification(note, names)),
    });
  } catch (error) {
    next(error);
  }
}

/** GET /chats/admin/users/:userId: everything needed to check and contact one user. */
async function getContact(req, res, next) {
  try {
    const user = await findTarget(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const [shop, listingCount, chat, notes, userChats] = await Promise.all([
      Shop.findOne({ owner: user._id }).select('name logo status').lean(),
      Listing.countDocuments({ seller: user._id }),
      supportChat(req.user._id, user._id),
      Notification.find({ user: user._id }).sort({ createdAt: -1 }).limit(30).lean(),
      Chat.find({ participants: user._id }).select('_id ringingCall participants').limit(500).lean(),
    ]);
    const callMessages = userChats.length
      ? await Message.find({ chat: { $in: userChats.map((item) => item._id) }, kind: 'call' })
          .sort({ createdAt: -1 })
          .limit(20)
          .lean()
      : [];
    const messages = chat
      ? (await Message.find({ chat: chat._id, deletedForEveryone: { $ne: true } })
          .sort({ createdAt: -1 })
          .limit(60))
          .reverse()
          .map((message) => presentMessage(message, req.user._id, null))
      : [];
    const ringing = userChats.find((item) => callState(item.ringingCall));
    res.json({
      contact: presentContact(user, shop, {
        listingCount,
        onCall: ringing ? callState(ringing.ringingCall) : null,
      }),
      chatId: chat ? String(chat._id) : null,
      supportCall: chat ? callState(chat.ringingCall) : null,
      messages,
      notifications: notes.map((note) => presentNotification(note)),
      calls: await presentCalls(callMessages),
    });
  } catch (error) {
    next(error);
  }
}

/** POST /chats/admin/users/:userId/messages { text } */
async function sendSupportMessage(req, res, next) {
  try {
    const user = await findTarget(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const text = String(req.body?.text || '').trim().slice(0, 2000);
    if (!text) return res.status(400).json({ message: 'Write a message first' });

    const chat = await supportChat(req.user._id, user._id, { create: true });
    const message = await Message.create({ chat: chat._id, sender: req.user._id, text, kind: 'text' });
    chat.lastMessage = text;
    chat.lastMessageAt = new Date();
    chat.lastMessageSender = req.user._id;
    chat.lastMessageKind = 'text';
    await chat.save();

    const note = await Notification.create({
      user: user._id,
      type: 'chat',
      title: SUPPORT_NAME,
      body: text.slice(0, 140),
      icon: 'chatbubble-ellipses-outline',
      route: 'Chat',
      params: { chatId: String(chat._id), name: SUPPORT_NAME, image: SUPPORT_AVATAR },
      relatedChat: chat._id,
    });
    deliverPush(note);
    res.status(201).json({
      chatId: String(chat._id),
      message: presentMessage(message, req.user._id, null),
      pushReady: Boolean(user.fcmToken),
    });
  } catch (error) {
    next(error);
  }
}

/** POST /chats/admin/users/:userId/notify { title, body } */
async function notifyUser(req, res, next) {
  try {
    const user = await findTarget(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const title = String(req.body?.title || '').trim().slice(0, 100);
    const body = String(req.body?.body || '').trim().slice(0, 500);
    if (!title || !body) return res.status(400).json({ message: 'Title and message are required' });

    const note = await Notification.create({
      user: user._id,
      type: 'system',
      title,
      body,
      message: body,
      icon: 'megaphone-outline',
      sender: req.user._id,
    });
    let pushed = false;
    try {
      pushed = await sendUserPush({
        userId: user._id,
        title,
        body,
        data: { type: 'system', notificationId: String(note._id) },
      });
    } catch {
      pushed = false;
    }
    res.status(201).json({ notification: presentNotification(note), pushed });
  } catch (error) {
    next(error);
  }
}

/** POST /chats/admin/users/:userId/call: rings the user as KinBech Support and returns the admin's voice session. */
async function callUser(req, res, next) {
  try {
    const user = await findTarget(req.params.userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.status === 'suspended') return res.status(400).json({ message: 'This account is suspended' });

    const chat = await supportChat(req.user._id, user._id, { create: true });
    const busy = await Chat.exists({
      _id: { $ne: chat._id },
      participants: user._id,
      'ringingCall.answeredAt': { $gte: new Date(Date.now() - CALL_STALE_MS) },
    });
    if (busy) return res.status(409).json({ message: 'They are on another call right now' });

    const session = createRtcToken({ chatId: chat._id, userId: req.user._id });
    await Chat.updateOne(
      { _id: chat._id },
      {
        $set: {
          ringingCall: {
            caller: req.user._id,
            callerName: SUPPORT_NAME,
            callerImage: SUPPORT_AVATAR,
            startedAt: new Date(),
          },
        },
        $unset: { callGuard: 1 },
      }
    );
    Notification.create({
      user: user._id,
      type: 'call',
      title: 'Incoming call',
      body: `${SUPPORT_NAME} is calling you`,
      icon: 'call-outline',
      route: 'Chat',
      params: { chatId: String(chat._id), name: SUPPORT_NAME, image: SUPPORT_AVATAR },
      relatedChat: chat._id,
    }).catch(() => {});
    sendIncomingCallPush({
      userId: user._id,
      chatId: chat._id,
      callerName: SUPPORT_NAME,
      callerImage: SUPPORT_AVATAR,
    }).catch(() => {});

    res.json({ chatId: String(chat._id), session, pushReady: Boolean(user.fcmToken) });
  } catch (error) {
    if (error.status === 503) return res.status(503).json({ message: error.message });
    next(error);
  }
}

module.exports = {
  SUPPORT_NAME,
  listContacts,
  getFeed,
  getContact,
  sendSupportMessage,
  notifyUser,
  callUser,
};
