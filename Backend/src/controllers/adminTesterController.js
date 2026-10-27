const mongoose = require('mongoose');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Review = require('../models/Review');
const Report = require('../models/Report');
const Wishlist = require('../models/Wishlist');
const Notification = require('../models/Notification');
const Session = require('../models/Session');
const SupportTicket = require('../models/SupportTicket');
const UserInterest = require('../models/UserInterest');
const SellerScore = require('../models/SellerScore');
const ShopAnalyticsDaily = require('../models/ShopAnalyticsDaily');
const MediaHash = require('../models/MediaHash');
const AiUserUsage = require('../models/AiUserUsage');
const OtpEvent = require('../models/OtpEvent');
const FlaggedMedia = require('../models/FlaggedMedia');
const listingQueryCache = require('../utils/listingQueryCache');
const { forgetViewer } = require('../utils/audience');
const { recordAudit } = require('../utils/audit');
const { removeOrphanUploads } = require('../utils/mediaCleanup');
const { refreshRatings } = require('./reviewController');
const { sendUserPush } = require('../utils/callPush');

/** Tell the user their account switched in or out of the tester sandbox. */
async function notifyTester(userId, { title, body, icon, route }) {
  try {
    const note = await Notification.create({ user: userId, type: 'system', title, body, icon, route });
    sendUserPush({
      userId,
      title,
      body,
      data: { type: 'tester', route, notificationId: String(note._id) },
    }).catch(() => {});
  } catch {
    /* the app still shows the tester badge on next refresh */
  }
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
async function sellerCounts(userIds) {
  if (!userIds.length) return { listings: new Map(), shops: new Map() };
  const [rows, shops] = await Promise.all([
    Listing.aggregate([
      { $match: { seller: { $in: userIds } } },
      {
        $group: {
          _id: '$seller',
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
        },
      },
    ]),
    Shop.find({ owner: { $in: userIds } }).select('owner name logo status').lean(),
  ]);
  return {
    listings: new Map(rows.map((row) => [String(row._id), row])),
    shops: new Map(shops.map((shop) => [String(shop.owner), shop])),
  };
}

function presentSeller(user, counts) {
  const row = counts.listings.get(String(user._id));
  const shop = counts.shops.get(String(user._id));
  return {
    id: user._id,
    name: user.name || 'Unnamed',
    phone: user.phone || '',
    avatarUrl: user.avatarUrl || '',
    status: user.status || 'active',
    isTester: Boolean(user.isTester),
    testerSince: user.testerSince || null,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt || null,
    listings: row?.total || 0,
    activeListings: row?.active || 0,
    shop: shop ? { id: shop._id, name: shop.name, logo: shop.logo || '', status: shop.status } : null,
  };
}

const SELLER_FIELDS = 'name phone avatarUrl status isTester testerSince createdAt lastActiveAt';

/** Data from before `testerSince` was public and can go back; anything newer is test data. */
function testerWindow(user) {
  return { $gte: user.testerSince || new Date() };
}

async function restorePlan(user) {
  const during = testerWindow(user);
  const [listingsBack, listingsDropped, shopsBack, shopsDropped] = await Promise.all([
    Listing.countDocuments({ seller: user._id, createdAt: { $lt: during.$gte } }),
    Listing.countDocuments({ seller: user._id, createdAt: during }),
    Shop.countDocuments({ owner: user._id, createdAt: { $lt: during.$gte } }),
    Shop.countDocuments({ owner: user._id, createdAt: during }),
  ]);
  return { listingsBack, listingsDropped, shopsBack, shopsDropped };
}

/** Testers on top, then sellers (or every user) that can be made testers. */
async function getTesters(req, res, next) {
  try {
    const search = String(req.query.q || '').trim().slice(0, 60);
    const scope = req.query.scope === 'all' ? 'all' : 'sellers';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 25));

    const filter = { role: 'user', isTester: { $ne: true }, deletedAt: null };
    if (scope === 'sellers') {
      const [listingSellers, shopOwners] = await Promise.all([
        Listing.distinct('seller'),
        Shop.distinct('owner'),
      ]);
      filter._id = { $in: [...listingSellers, ...shopOwners] };
    }
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ name: re }, { phone: re }];
    }

    const [testers, total, sellers] = await Promise.all([
      User.find({ role: 'user', isTester: true }).select(SELLER_FIELDS).sort({ testerSince: -1 }).lean(),
      User.countDocuments(filter),
      User.find(filter)
        .select(SELLER_FIELDS)
        .sort({ lastActiveAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const counts = await sellerCounts([...testers, ...sellers].map((user) => user._id));
    const restorePlans = await Promise.all(testers.map((user) => restorePlan(user)));
    res.json({
      testers: testers.map((user, i) => ({ ...presentSeller(user, counts), restore: restorePlans[i] })),
      sellers: sellers.map((user) => presentSeller(user, counts)),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    next(error);
  }
}

async function makeTester(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(userId).select('name role isTester deletedAt');
    if (!user || user.deletedAt) return res.status(404).json({ message: 'User not found' });
    if (user.role !== 'user') return res.status(400).json({ message: 'Only app users can be testers' });
    if (user.isTester) return res.status(400).json({ message: 'Already a tester' });

    user.isTester = true;
    user.testerSince = new Date();
    await user.save();
    const [listings, shops] = await Promise.all([
      Listing.updateMany({ seller: user._id }, { $set: { isTest: true } }),
      Shop.updateMany({ owner: user._id }, { $set: { isTest: true } }),
    ]);
    forgetViewer(user._id);
    listingQueryCache.invalidateAll();
    await notifyTester(user._id, {
      title: 'Your account is in Tester mode',
      body: 'Only other testers see your posts and chats for now. Tap to see what changes.',
      icon: 'flask-outline',
      route: 'TesterMode',
    });

    recordAudit(req, {
      action: 'tester.add',
      targetType: 'user',
      targetId: user._id,
      summary: `Made ${user.name || 'user'} a tester`,
      meta: { listings: listings.modifiedCount || 0, shops: shops.modifiedCount || 0 },
    });
    res.json({ message: `${user.name || 'User'} is now a tester`, hidden: { listings: listings.modifiedCount || 0, shops: shops.modifiedCount || 0 } });
  } catch (error) {
    next(error);
  }
}

/** Hard delete: the tester, their listings, shops, chats, reviews, reports and media. */
async function purgeTester(user) {
  const userId = user._id;
  const [listings, shops, chats] = await Promise.all([
    Listing.find({ seller: userId }).select('photos variants.photo').lean(),
    Shop.find({ owner: userId }).select('logo coverImage businessDocuments').lean(),
    Chat.find({ participants: userId }).select('_id').lean(),
  ]);
  const listingIds = listings.map((l) => l._id);
  const shopIds = shops.map((s) => s._id);
  const chatIds = chats.map((c) => c._id);
  const voiceNotes = chatIds.length
    ? await Message.find({ chat: { $in: chatIds }, 'audio.url': { $ne: '' } }).select('audio.url').lean()
    : [];

  const media = [
    user.avatarUrl,
    ...listings.flatMap((l) => [...(l.photos || []), ...(l.variants || []).map((v) => v.photo)]),
    ...shops.flatMap((s) => [s.logo, s.coverImage, ...(s.businessDocuments || []).map((d) => d.url)]),
    ...voiceNotes.map((m) => m.audio?.url),
  ];

  const [messages, chatsGone, reviews, reports, notifications] = await Promise.all([
    Message.deleteMany({ chat: { $in: chatIds } }),
    Chat.deleteMany({ _id: { $in: chatIds } }),
    Review.deleteMany({
      $or: [
        { reviewer: userId },
        { seller: userId },
        { reviewedUser: userId },
        { shopId: { $in: shopIds } },
        { listing: { $in: listingIds } },
      ],
    }),
    Report.deleteMany({
      $or: [{ reporter: userId }, { reportedUser: userId }, { reportedListing: { $in: listingIds } }],
    }),
    Notification.deleteMany({
      $or: [{ user: userId }, { sender: userId }, { relatedListing: { $in: listingIds } }],
    }),
  ]);

  await Promise.all([
    Wishlist.deleteMany({ user: userId }),
    listingIds.length ? Wishlist.updateMany({ listings: { $in: listingIds } }, { $pull: { listings: { $in: listingIds } } }) : null,
    shopIds.length ? User.updateMany({ 'pinnedStores.storeId': { $in: shopIds } }, { $pull: { pinnedStores: { storeId: { $in: shopIds } } } }) : null,
    Session.deleteMany({ user: userId }),
    SupportTicket.deleteMany({ user: userId }),
    UserInterest.deleteMany({ user: userId }),
    SellerScore.deleteMany({ user: userId }),
    shopIds.length ? ShopAnalyticsDaily.deleteMany({ shop: { $in: shopIds } }) : null,
    MediaHash.deleteMany({ user: userId }),
    AiUserUsage.deleteMany({ user: userId }),
    OtpEvent.deleteMany({ user: userId }),
    FlaggedMedia.deleteMany({ user: userId }),
  ]);

  await Promise.all([
    Listing.deleteMany({ seller: userId }),
    Shop.deleteMany({ owner: userId }),
  ]);
  await User.deleteOne({ _id: userId });
  forgetViewer(userId);
  listingQueryCache.invalidateAll();

  const files = await removeOrphanUploads(media);
  return {
    listings: listingIds.length,
    shops: shopIds.length,
    chats: chatsGone.deletedCount || 0,
    messages: messages.deletedCount || 0,
    reviews: reviews.deletedCount || 0,
    reports: reports.deletedCount || 0,
    notifications: notifications.deletedCount || 0,
    files,
  };
}

async function deleteTester(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(userId).select('name phone avatarUrl role isTester').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.isTester || user.role !== 'user') {
      return res.status(400).json({ message: 'Only tester accounts can be wiped here' });
    }

    const removed = await purgeTester(user);
    recordAudit(req, {
      action: 'tester.delete',
      targetType: 'user',
      targetId: user._id,
      summary: `Deleted tester ${user.name || ''} and all their data`.replace(/\s+/g, ' '),
      meta: removed,
    });
    res.json({ message: `${user.name || 'Tester'} and all their data were deleted`, removed });
  } catch (error) {
    next(error);
  }
}

/**
 * Undo "Make tester": listings and shops from before `testerSince` go public again;
 * everything created while testing (listings, shops, chats, reviews, reports) is deleted
 * so no test data leaks to the public.
 */
async function returnToPublic(user) {
  const userId = user._id;
  const during = testerWindow(user);

  const newShops = await Shop.find({ owner: userId, createdAt: during }).select('logo coverImage businessDocuments').lean();
  const newShopIds = newShops.map((s) => s._id);
  const newListings = await Listing.find({
    seller: userId,
    $or: [{ createdAt: during }, { shopId: { $in: newShopIds } }],
  }).select('photos variants.photo').lean();
  const newListingIds = newListings.map((l) => l._id);
  const testChats = await Chat.find({ participants: userId, createdAt: during }).select('_id').lean();
  const testChatIds = testChats.map((c) => c._id);
  const voiceNotes = testChatIds.length
    ? await Message.find({ chat: { $in: testChatIds }, 'audio.url': { $ne: '' } }).select('audio.url').lean()
    : [];

  const [messages, chatsGone, reviews, reports, notifications] = await Promise.all([
    Message.deleteMany({ chat: { $in: testChatIds } }),
    Chat.deleteMany({ _id: { $in: testChatIds } }),
    Review.deleteMany({
      $or: [
        { reviewer: userId, createdAt: during },
        { seller: userId, createdAt: during },
        { listing: { $in: newListingIds } },
        { shopId: { $in: newShopIds } },
      ],
    }),
    Report.deleteMany({
      $or: [
        { reporter: userId, createdAt: during },
        { reportedUser: userId, createdAt: during },
        { reportedListing: { $in: newListingIds } },
      ],
    }),
    Notification.deleteMany({
      $or: [
        { user: userId, createdAt: during },
        { sender: userId, createdAt: during },
        { relatedListing: { $in: newListingIds } },
      ],
    }),
  ]);

  const [testListingIds, testShopIds] = await Promise.all([
    Listing.distinct('_id', { isTest: true, seller: { $ne: userId } }),
    Shop.distinct('_id', { isTest: true, owner: { $ne: userId } }),
  ]);
  await Promise.all([
    newListingIds.length ? Wishlist.updateMany({ listings: { $in: newListingIds } }, { $pull: { listings: { $in: newListingIds } } }) : null,
    newShopIds.length ? User.updateMany({ 'pinnedStores.storeId': { $in: newShopIds } }, { $pull: { pinnedStores: { storeId: { $in: newShopIds } } } }) : null,
    testListingIds.length ? Wishlist.updateOne({ user: userId }, { $pull: { listings: { $in: testListingIds } } }) : null,
    testShopIds.length ? User.updateOne({ _id: userId }, { $pull: { pinnedStores: { storeId: { $in: testShopIds } } } }) : null,
    newShopIds.length ? ShopAnalyticsDaily.deleteMany({ shop: { $in: newShopIds } }) : null,
  ]);

  await Promise.all([
    Listing.deleteMany({ _id: { $in: newListingIds } }),
    Shop.deleteMany({ _id: { $in: newShopIds } }),
  ]);
  const [listingsBack, shopsBack] = await Promise.all([
    Listing.updateMany({ seller: userId }, { $set: { isTest: false } }),
    Shop.updateMany({ owner: userId }, { $set: { isTest: false } }),
  ]);
  await User.updateOne({ _id: userId }, { $set: { isTester: false, testerSince: null } });
  forgetViewer(userId);
  listingQueryCache.invalidateAll();

  const keptShops = await Shop.find({ owner: userId }).select('_id').lean();
  await refreshRatings({ seller: userId });
  await Promise.all(keptShops.map((shop) => refreshRatings({ shopId: shop._id })));

  const files = await removeOrphanUploads([
    ...newListings.flatMap((l) => [...(l.photos || []), ...(l.variants || []).map((v) => v.photo)]),
    ...newShops.flatMap((s) => [s.logo, s.coverImage, ...(s.businessDocuments || []).map((d) => d.url)]),
    ...voiceNotes.map((m) => m.audio?.url),
  ]);

  return {
    listingsBack: listingsBack.modifiedCount || 0,
    shopsBack: shopsBack.modifiedCount || 0,
    listingsDeleted: newListingIds.length,
    shopsDeleted: newShopIds.length,
    chats: chatsGone.deletedCount || 0,
    messages: messages.deletedCount || 0,
    reviews: reviews.deletedCount || 0,
    reports: reports.deletedCount || 0,
    notifications: notifications.deletedCount || 0,
    files,
  };
}

async function restoreTester(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user id' });
    const user = await User.findById(userId).select('name role isTester testerSince').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.isTester) return res.status(400).json({ message: 'This user is not a tester' });

    const result = await returnToPublic(user);
    await notifyTester(user._id, {
      title: 'Tester mode is off',
      body: 'Your account is public again. Listings from before testing are back; test posts and chats were removed.',
      icon: 'checkmark-circle-outline',
      route: 'MyListings',
    });
    recordAudit(req, {
      action: 'tester.restore',
      targetType: 'user',
      targetId: user._id,
      summary: `Returned ${user.name || 'user'} to public`,
      meta: result,
    });
    res.json({ message: `${user.name || 'User'} is public again`, result });
  } catch (error) {
    next(error);
  }
}

module.exports = { getTesters, makeTester, deleteTester, restoreTester };
