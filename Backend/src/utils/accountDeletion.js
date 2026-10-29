const User = require('../models/User');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Wishlist = require('../models/Wishlist');
const Notification = require('../models/Notification');
const Session = require('../models/Session');
const Review = require('../models/Review');
const SupportTicket = require('../models/SupportTicket');
const UserInterest = require('../models/UserInterest');
const SellerScore = require('../models/SellerScore');
const LivePresence = require('../models/LivePresence');
const listingQueryCache = require('./listingQueryCache');
const { revokeAllSessions, presentSession } = require('./sessions');
const { openField } = require('./fieldCrypto');
const { removeOrphanUploads } = require('./mediaCleanup');

/**
 * Self-service account deletion (Google Play requirement).
 * Request: listings + shops hidden, every session revoked. Signing in again within the
 * grace period cancels it. After the grace period the purge job deletes the user's content
 * and anonymizes the account row. Safety reports and chats stay (the other party keeps
 * their history), attributed to "Deleted user".
 */

const GRACE_DAYS = Number(process.env.ACCOUNT_DELETION_GRACE_DAYS) || 30;
const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function scheduleDeletion(user) {
  const now = new Date();
  const listings = await Listing.find({ seller: user._id, status: { $in: ['active', 'pending', 'hidden'] } }).select('status').lean();
  const shops = await Shop.find({ owner: user._id, status: 'active' }).select('status').lean();
  const hidden = [
    ...listings.map((l) => ({ kind: 'listing', ref: l._id, status: l.status })),
    ...shops.map((s) => ({ kind: 'shop', ref: s._id, status: s.status })),
  ];

  if (listings.length) await Listing.updateMany({ _id: { $in: listings.map((l) => l._id) } }, { $set: { status: 'removed' } });
  if (shops.length) await Shop.updateMany({ _id: { $in: shops.map((s) => s._id) } }, { $set: { status: 'inactive' } });
  listingQueryCache.invalidateAll();

  const scheduledFor = new Date(now.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  await User.updateOne(
    { _id: user._id },
    {
      $set: { deletionRequestedAt: now, deletionScheduledFor: scheduledFor, deletionHidden: hidden, fcmToken: '' },
      $inc: { tokenVersion: 1 },
    }
  );
  await revokeAllSessions(user._id);
  return scheduledFor;
}

/** Restores what scheduleDeletion hid, unless an admin changed it meanwhile. */
async function cancelDeletion(userId) {
  const user = await User.findById(userId).select('+deletionHidden deletionScheduledFor');
  if (!user?.deletionScheduledFor) return false;
  for (const item of user.deletionHidden || []) {
    if (item.kind === 'listing') {
      await Listing.updateOne({ _id: item.ref, status: 'removed' }, { $set: { status: item.status } });
    } else if (item.kind === 'shop') {
      await Shop.updateOne({ _id: item.ref, status: 'inactive' }, { $set: { status: item.status } });
    }
  }
  listingQueryCache.invalidateAll();
  await User.updateOne(
    { _id: userId },
    { $set: { deletionRequestedAt: null, deletionScheduledFor: null, deletionHidden: [] } }
  );
  return true;
}

async function purgeUser(userId) {
  const user = await User.findById(userId);
  if (!user || user.deletedAt) return;

  const [listings, shops, voiceNotes] = await Promise.all([
    Listing.find({ seller: userId }).select('photos variants.photo').lean(),
    Shop.find({ owner: userId }).select('logo coverImage businessDocuments').lean(),
    Message.find({ sender: userId, kind: 'voice', 'audio.url': { $ne: '' } }).select('audio.url').lean(),
  ]);
  const media = [
    user.avatarUrl,
    ...listings.flatMap((l) => [...(l.photos || []), ...(l.variants || []).map((v) => v.photo)]),
    ...shops.flatMap((s) => [s.logo, s.coverImage, ...(s.businessDocuments || []).map((d) => d.url)]),
    ...voiceNotes.map((m) => m.audio?.url),
  ];

  await Listing.deleteMany({ seller: userId });
  await Shop.deleteMany({ owner: userId });
  await Wishlist.deleteMany({ user: userId });
  await Notification.deleteMany({ user: userId });
  await Session.deleteMany({ user: userId });
  await SupportTicket.deleteMany({ user: userId });
  await UserInterest.deleteMany({ user: userId });
  await SellerScore.deleteMany({ user: userId });
  await LivePresence.deleteMany({ user: userId });
  await Message.updateMany({ sender: userId, kind: 'text' }, { $set: { text: 'Message removed' } });
  await Message.updateMany(
    { sender: userId, kind: 'voice' },
    { $set: { text: 'Voice message removed', 'audio.url': '', 'audio.durationSec': 0 } }
  );
  listingQueryCache.invalidateAll();

  await User.updateOne(
    { _id: userId },
    {
      $set: {
        name: 'Deleted user',
        status: 'suspended',
        avatarUrl: '',
        bio: '',
        location: '',
        addresses: [],
        paymentMethods: [],
        blockedUserIds: [],
        blocks: [],
        pinnedStores: [],
        fcmToken: '',
        deletionHidden: [],
        deletedAt: new Date(),
      },
      $unset: { phone: 1, email: 1, googleId: 1, password: 1, coordinates: 1, referralCode: 1 },
      $inc: { tokenVersion: 1 },
    }
  );

  const files = await removeOrphanUploads(media);
  if (files) console.log(`Removed ${files} media file(s) for deleted account ${userId}`);
}

async function purgeDueAccounts() {
  const due = await User.find({ deletionScheduledFor: { $lte: new Date() }, deletedAt: null }).select('_id').lean();
  for (const { _id } of due) {
    try {
      await purgeUser(_id);
    } catch (error) {
      console.error(`Account purge failed for ${_id}:`, error.message);
    }
  }
  if (due.length) console.log(`Purged ${due.length} deleted account(s)`);
  return due.length;
}

function startAccountPurgeJob() {
  const run = () => purgeDueAccounts().catch((error) => console.error('Account purge job:', error.message));
  setTimeout(run, 60 * 1000).unref();
  setInterval(run, PURGE_INTERVAL_MS).unref();
}

const MESSAGE_EXPORT_LIMIT = 5000;

/** Everything we hold about the user, as one JSON document ("Download my data"). */
async function buildExport(user) {
  const userId = user._id;
  const [profile, listings, shops, wishlist, reviews, notifications, sessions, tickets, chats] = await Promise.all([
    User.findById(userId)
      .select('name phone email role status avatarUrl location coordinates bio addresses paymentMethods preferences sellerTypePreference referralCode featuredCredits soldCount boughtCount createdAt')
      .lean(),
    Listing.find({ seller: userId }).select('-searchWords').lean(),
    Shop.find({ owner: userId }).lean(),
    Wishlist.findOne({ user: userId }).populate('listings', 'title price status').lean(),
    Review.find({ reviewer: userId }).lean(),
    Notification.find({ user: userId }).sort({ createdAt: -1 }).limit(500).lean(),
    Session.find({ user: userId }).sort({ createdAt: -1 }).lean(),
    SupportTicket.find({ user: userId }).lean(),
    Chat.find({ participants: userId }).populate('listing', 'title').lean(),
  ]);

  const messages = await Message.find({ chat: { $in: chats.map((c) => c._id) }, deletedFor: { $ne: userId } })
    .sort({ createdAt: -1 })
    .limit(MESSAGE_EXPORT_LIMIT)
    .select('chat sender kind text createdAt')
    .lean();
  const byChat = new Map();
  for (const m of messages.reverse()) {
    const key = String(m.chat);
    if (!byChat.has(key)) byChat.set(key, []);
    byChat.get(key).push({ at: m.createdAt, fromMe: String(m.sender) === String(userId), kind: m.kind, text: m.text || '' });
  }

  return {
    exportedAt: new Date().toISOString(),
    profile,
    listings,
    shops: shops.map((s) => ({ ...s, panNumber: openField(s.panNumber), vatNumber: openField(s.vatNumber) })),
    wishlist: wishlist?.listings || [],
    reviewsWritten: reviews,
    chats: chats.map((c) => ({
      id: String(c._id),
      listing: c.listing?.title || '',
      createdAt: c.createdAt,
      messages: byChat.get(String(c._id)) || [],
    })),
    notifications,
    sessions: sessions.map((s) => presentSession(s)),
    supportTickets: tickets,
  };
}

module.exports = { GRACE_DAYS, scheduleDeletion, cancelDeletion, purgeUser, purgeDueAccounts, startAccountPurgeJob, buildExport };
