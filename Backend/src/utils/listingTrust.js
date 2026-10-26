const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const Report = require('../models/Report');
const User = require('../models/User');
const Shop = require('../models/Shop');
const Category = require('../models/Category');
const Notification = require('../models/Notification');
const PlatformSettings = require('../models/PlatformSettings');
const { sendUserPush } = require('./callPush');
const listingQueryCache = require('./listingQueryCache');
const { scheduleJob } = require('./jobLock');
const { statusChange } = require('./listing');

/**
 * Keeps listings honest without asking sellers to do anything first:
 * - single items (individual, or a store's one-off piece): Sold-Likelihood score from
 *   chat, report and activity signals → push → rank down → auto-hide.
 * - store stock items: stock state (low / out / unconfirmed / under check) → rank → hide.
 * Every hide is reversible in one tap (POST /listings/:id/still-available).
 * Time alone never hides a listing: a hide needs buyers who are affected (a chat waiting
 * for a reply, or "not available" reports). Quiet listings only get a rare reminder.
 * Thresholds live in PlatformSettings.trust so admins tune them without an app update.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const DEFAULT_TRUST = {
  autoHideEnabled: true,
  /** Seller score is computed nightly from day one; it moves ranking only once an admin turns this on. */
  sellerScoreInRanking: false,
  /** Watch tier: max new listings per day. Restricted tier: every new listing goes to review. */
  watchDailyListings: 3,
  promptAt: 40,
  rankDownAt: 60,
  hideAt: 80,
  hideAfterHours: 48,
  notFoundHide: 3,
  sellerInactiveHideDays: 7,
  storeNotFoundCheck: 3,
  storeCheckHours: 48,
  storeUnconfirmedDays: 14,
  storeConfirmHideDays: 30,
  storeInactiveDays: 14,
  stockReminderDays: 7,
  points: {
    unansweredBuyers: 25,
    soldWord: 30,
    notFound: 35,
    notFoundExtra: 15,
    sellerInactive: 15,
    stale: 15,
    otherMeetup: 10,
    confirmedRecently: -40,
    responsive: -20,
  },
};

let settingsCache = { at: 0, value: DEFAULT_TRUST };

async function getTrustSettings() {
  if (Date.now() - settingsCache.at < 60 * 1000) return settingsCache.value;
  const doc = await PlatformSettings.findOne({ key: 'platform' }).select('trust').lean();
  const saved = doc?.trust || {};
  const value = { ...DEFAULT_TRUST, ...saved, points: { ...DEFAULT_TRUST.points, ...(saved.points || {}) } };
  settingsCache = { at: Date.now(), value };
  return value;
}

function clearTrustSettingsCache() {
  settingsCache = { at: 0, value: DEFAULT_TRUST };
}

const FAST = /phone|mobile|electronic|laptop|computer|camera|gadget|accessor|tablet|watch/i;
const SLOW = /vehicle|bike|car|scooter|motor|property|room|house|land|real estate|rent|flat|apartment/i;

let categoryCache = { at: 0, map: new Map() };
async function categoryTimers(name) {
  if (Date.now() - categoryCache.at > 10 * 60 * 1000) {
    const rows = await Category.find({ type: 'product' }).select('name expiryDays reminderDays').lean();
    categoryCache = { at: Date.now(), map: new Map(rows.map((r) => [String(r.name).toLowerCase(), r])) };
  }
  const row = categoryCache.map.get(String(name || '').toLowerCase());
  const base = FAST.test(name) ? { expiryDays: 14, reminderDays: 5 } : SLOW.test(name) ? { expiryDays: 45, reminderDays: 10 } : { expiryDays: 30, reminderDays: 7 };
  return {
    expiryDays: Number(row?.expiryDays) > 0 ? Number(row.expiryDays) : base.expiryDays,
    reminderDays: Number(row?.reminderDays) > 0 ? Number(row.reminderDays) : base.reminderDays,
  };
}

function kindOf(listing) {
  if (listing.listingKind) return listing.listingKind;
  return listing.sellerType === 'shop' ? 'stock' : 'single';
}

function totalStock(listing) {
  if (listing.hasVariants && Array.isArray(listing.variants) && listing.variants.length) {
    return listing.variants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
  }
  return Number(listing.stock) || 0;
}

const ms = (date) => (date ? new Date(date).getTime() : 0);
const ago = (date) => Date.now() - ms(date);

/** Sold-likelihood for a single item. Returns { score, reasons }. */
async function scoreSingle(listing, ctx, settings) {
  const p = settings.points;
  const reasons = [];
  let score = 0;
  const add = (points, reason) => {
    score += points;
    reasons.push(`${points > 0 ? '+' : ''}${points} ${reason}`);
  };
  const { expiryDays, reminderDays } = await categoryTimers(listing.category);
  const confirmedAt = ms(listing.availabilityConfirmedAt);
  const freshSince = Math.max(ms(listing.createdAt), confirmedAt);

  if (ctx.unanswered >= 3) add(p.unansweredBuyers, `${ctx.unanswered} buyers got no reply in 7 days`);
  if (ms(listing.trust?.soldWordAt) > confirmedAt && ago(listing.trust.soldWordAt) < 14 * DAY) add(p.soldWord, 'seller said "sold" in chat');
  if (ctx.notFound >= 2) add(p.notFound + (ctx.notFound - 2) * p.notFoundExtra, `${ctx.notFound} buyers reported "not available"`);
  if (ctx.sellerLastActive && ago(ctx.sellerLastActive) > 5 * DAY) add(p.sellerInactive, 'seller inactive 5+ days');
  if (Date.now() - freshSince > expiryDays * 0.7 * DAY && ago(confirmedAt || 0) > reminderDays * DAY) add(p.stale, 'old and not confirmed');
  if (ctx.otherMeetups > 0) add(p.otherMeetup, 'meetup scheduled with a buyer');
  if (confirmedAt && ago(confirmedAt) < 3 * DAY) add(p.confirmedRecently, 'seller confirmed available');
  if (ctx.sellerLastActive && ago(ctx.sellerLastActive) < DAY && ctx.unanswered === 0) add(p.responsive, 'seller active and replying');

  return { score: Math.max(0, Math.min(100, score)), reasons, expiredDays: Math.floor((Date.now() - freshSince) / DAY), expiryDays };
}

function stockStateOf(listing, ctx, settings) {
  const kind = kindOf(listing);
  if (kind === 'always') {
    return ago(listing.stockConfirmedAt || listing.createdAt) > settings.storeUnconfirmedDays * DAY ? 'unconfirmed' : 'in_stock';
  }
  if (ctx.notFound >= settings.storeNotFoundCheck) return 'under_check';
  const stock = totalStock(listing);
  if (stock <= 0) return 'out_of_stock';
  if (ago(listing.stockConfirmedAt || listing.createdAt) > settings.storeUnconfirmedDays * DAY) return 'unconfirmed';
  if (stock <= (Number(listing.lowStockLimit) || 0)) return 'low_stock';
  return 'in_stock';
}

const RANK_PENALTY = { out_of_stock: 60, under_check: 30, unconfirmed: 15 };

async function notifySeller(userId, fields) {
  try {
    const note = await Notification.create({ user: userId, type: 'listing', ...fields });
    sendUserPush({
      userId,
      title: note.title,
      body: note.body,
      data: { type: note.type, notificationId: String(note._id), route: note.route || '' },
    }).catch(() => {});
  } catch {
    /* best effort */
  }
}

async function hideListing(listing, reason, message, { notify = true } = {}) {
  const res = await Listing.updateOne(
    { _id: listing._id, status: 'active' },
    {
      $set: {
        status: 'hidden',
        statusChange: statusChange('hidden', 'auto', reason),
        'autoHidden.at': new Date(),
        'autoHidden.reason': reason,
        'autoHidden.restoredAt': null,
      },
    }
  );
  if (!res.modifiedCount) return false;
  if (!notify) return true;
  await notifySeller(listing.seller, {
    title: 'Listing hidden',
    body: `"${listing.title}" is hidden: ${message} Tap to bring it back if it is still available.`,
    icon: 'eye-off-outline',
    route: 'MyListings',
    relatedListing: listing._id,
  });
  return true;
}

/** Signals for many listings at once. */
async function loadContext(listings) {
  const ids = listings.map((l) => l._id);
  const sellerIds = [...new Set(listings.map((l) => String(l.seller)))];
  const since7 = new Date(Date.now() - 7 * DAY);
  const [chats, reports, sellers] = await Promise.all([
    Chat.find({ listing: { $in: ids }, lastMessageAt: { $gte: since7 } })
      .select('listing lastMessageAt lastMessageSender deal.state')
      .lean(),
    Report.aggregate([
      { $match: { reason: 'not-available', reportedListing: { $in: ids }, createdAt: { $gte: since7 } } },
      { $group: { _id: { listing: '$reportedListing', reporter: '$reporter' }, last: { $max: '$createdAt' } } },
    ]),
    User.find({ _id: { $in: sellerIds } }).select('lastActiveAt autoHideRestores vacationUntil trustPromptedAt').lean(),
  ]);
  const sellerMap = new Map(sellers.map((s) => [String(s._id), s]));
  const reportsByListing = new Map();
  for (const r of reports) {
    const key = String(r._id.listing);
    if (!reportsByListing.has(key)) reportsByListing.set(key, []);
    reportsByListing.get(key).push(ms(r.last));
  }
  // Reports made before the seller last confirmed no longer count.
  const notFoundFor = (listing) => {
    const confirmed = Math.max(ms(listing.availabilityConfirmedAt), ms(listing.stockConfirmedAt));
    return (reportsByListing.get(String(listing._id)) || []).filter((at) => at > confirmed).length;
  };
  const byListing = new Map();
  for (const chat of chats) {
    const key = String(chat.listing);
    if (!byListing.has(key)) byListing.set(key, []);
    byListing.get(key).push(chat);
  }
  return (listing) => {
    const seller = sellerMap.get(String(listing.seller)) || {};
    const list = byListing.get(String(listing._id)) || [];
    const unanswered = list.filter(
      (c) => c.lastMessageSender && String(c.lastMessageSender) !== String(listing.seller) && ago(c.lastMessageAt) > DAY
    ).length;
    return {
      seller,
      sellerLastActive: seller.lastActiveAt || null,
      onVacation: ms(seller.vacationUntil) > Date.now(),
      unanswered,
      activeChats: list.length,
      otherMeetups: list.filter((c) => c.deal?.state === 'scheduled').length,
      notFound: notFoundFor(listing),
    };
  };
}

const TRUST_FIELDS = 'seller sellerType listingKind category title status stock hasVariants variants lowStockLimit stockConfirmedAt availabilityConfirmedAt trust createdAt shopId';

async function evaluateListings(listings, { allowPrompt = true } = {}) {
  if (!listings.length) return { hidden: 0, prompted: 0 };
  const settings = await getTrustSettings();
  const contextFor = await loadContext(listings);
  const promptsBySeller = new Map();
  const updates = [];
  let hidden = 0;
  const inactiveNotified = new Set();
  const hideOnce = (listing, reason, message) => {
    if (reason !== 'seller_inactive' && reason !== 'store_inactive') return hideListing(listing, reason, message);
    const key = String(listing.seller);
    const notify = !inactiveNotified.has(key);
    inactiveNotified.add(key);
    return hideListing(listing, reason, message, { notify });
  };

  for (const listing of listings) {
    const ctx = contextFor(listing);
    const kind = kindOf(listing);
    const set = {};

    if (kind === 'single') {
      const restores = Number(ctx.seller.autoHideRestores) || 0;
      const hideAt = settings.hideAt + Math.min(restores, 2) * 10;
      const { score, reasons, expiredDays, expiryDays } = await scoreSingle(listing, ctx, settings);
      set['trust.soldLikelihood'] = score;
      set['trust.reasons'] = reasons;
      set['trust.stockState'] = '';
      set['trust.rankPenalty'] = score >= settings.rankDownAt ? 40 : 0;
      const promptedAt = ms(listing.trust?.promptedAt);
      const confirmedAfterPrompt = ms(listing.availabilityConfirmedAt) > promptedAt;
      const promptOld = promptedAt && Date.now() - promptedAt > settings.hideAfterHours * HOUR && !confirmedAfterPrompt;
      const buyersWaiting = ctx.unanswered > 0;
      const buyerInterest = ctx.activeChats > 0 || ctx.notFound > 0;

      let hideReason = '';
      if (ctx.notFound >= settings.notFoundHide) hideReason = 'not_available_reports';
      else if (score >= hideAt && promptOld && buyerInterest) hideReason = 'likely_sold';
      else if (!ctx.onVacation && ctx.sellerLastActive && ago(ctx.sellerLastActive) > settings.sellerInactiveHideDays * DAY && buyersWaiting) hideReason = 'seller_inactive';
      else if (expiredDays > expiryDays && promptOld && buyersWaiting) hideReason = 'expired';
      const remindEvery = buyerInterest ? 3 * DAY : expiryDays * DAY;

      if (hideReason && settings.autoHideEnabled) {
        const messages = {
          not_available_reports: 'several buyers reported it is no longer available.',
          likely_sold: 'it looks sold and we did not hear back from you.',
          seller_inactive: 'buyers are waiting and you have not opened KinBech for a while.',
          expired: 'buyers messaged about it and it was not confirmed.',
        };
        if (await hideOnce(listing, hideReason, messages[hideReason])) hidden += 1;
      } else if (allowPrompt && (score >= settings.promptAt || expiredDays > expiryDays) && (!promptedAt || Date.now() - promptedAt > remindEvery)) {
        set['trust.promptedAt'] = new Date();
        set['trust.confirmBy'] = new Date(Date.now() + settings.hideAfterHours * HOUR);
        const key = String(listing.seller);
        if (!promptsBySeller.has(key)) promptsBySeller.set(key, []);
        promptsBySeller.get(key).push({ listing, buyers: ctx.activeChats });
      }
    } else {
      const state = stockStateOf(listing, ctx, settings);
      set['trust.stockState'] = state;
      set['trust.soldLikelihood'] = 0;
      set['trust.rankPenalty'] = RANK_PENALTY[state] || 0;
      if (state === 'out_of_stock' && !listing.trust?.outOfStockSince) set['trust.outOfStockSince'] = new Date();
      if (state !== 'out_of_stock' && listing.trust?.outOfStockSince) set['trust.outOfStockSince'] = null;
      if (state === 'under_check' && !listing.trust?.confirmBy) {
        set['trust.confirmBy'] = new Date(Date.now() + settings.storeCheckHours * HOUR);
        await notifySeller(listing.seller, {
          title: 'Please check your stock',
          body: `${ctx.notFound} buyers said "${listing.title}" was not available. Confirm or update the stock within ${settings.storeCheckHours} hours.`,
          icon: 'cube-outline',
          route: 'MyListings',
          relatedListing: listing._id,
        });
      }

      // Out of stock stays visible with its tag (ranked low), so nobody makes a wasted trip.
      let hideReason = '';
      const checkDue = ms(listing.trust?.confirmBy);
      const buyersWaiting = ctx.unanswered > 0;
      if (state === 'under_check' && checkDue && Date.now() > checkDue && ms(listing.stockConfirmedAt) < checkDue - settings.storeCheckHours * HOUR) hideReason = 'stock_check_failed';
      else if (ago(listing.stockConfirmedAt || listing.createdAt) > settings.storeConfirmHideDays * DAY && (buyersWaiting || ctx.notFound > 0)) hideReason = 'stock_unconfirmed';
      else if (!ctx.onVacation && ctx.sellerLastActive && ago(ctx.sellerLastActive) > settings.storeInactiveDays * DAY && buyersWaiting) hideReason = 'store_inactive';

      if (hideReason && settings.autoHideEnabled) {
        const messages = {
          stock_check_failed: 'buyers reported it unavailable and the stock was not confirmed.',
          stock_unconfirmed: `the stock was not confirmed for ${settings.storeConfirmHideDays} days.`,
          store_inactive: `buyers are waiting and your store was inactive for ${settings.storeInactiveDays} days.`,
        };
        if (await hideOnce(listing, hideReason, messages[hideReason])) hidden += 1;
      }
    }
    updates.push({ updateOne: { filter: { _id: listing._id }, update: { $set: set } } });
  }

  if (updates.length) await Listing.bulkWrite(updates, { ordered: false });

  // One push per seller per day, however many listings need attention.
  let prompted = 0;
  for (const [sellerId, items] of promptsBySeller) {
    const seller = await User.findById(sellerId).select('trustPromptedAt').lean();
    if (ms(seller?.trustPromptedAt) > Date.now() - 20 * HOUR) continue;
    const [first] = items;
    let body = `${items.length} of your listings need a quick check. Are they still available?`;
    if (items.length === 1) {
      body = first.buyers
        ? `${first.buyers} buyer${first.buyers === 1 ? '' : 's'} asked about "${first.listing.title}". Is it still available?`
        : `Is "${first.listing.title}" still available?`;
    }
    await notifySeller(sellerId, {
      title: 'Still available?',
      body,
      icon: 'help-circle-outline',
      route: 'MyListings',
      relatedListing: first.listing._id,
    });
    await User.updateOne({ _id: sellerId }, { $set: { trustPromptedAt: new Date() } });
    prompted += 1;
  }
  if (hidden) listingQueryCache.invalidateAll();
  return { hidden, prompted };
}

async function evaluateListingNow(listingId) {
  try {
    const listing = await Listing.findOne({ _id: listingId, status: 'active' }).select(TRUST_FIELDS).lean();
    if (listing) await evaluateListings([listing], { allowPrompt: true });
  } catch (error) {
    console.error('[listingTrust] evaluate:', error.message);
  }
}

async function trustSweep() {
  let lastId = null;
  const totals = { hidden: 0, prompted: 0 };
  for (;;) {
    const batch = await Listing.find({ status: 'active', ...(lastId ? { _id: { $gt: lastId } } : {}) })
      .sort({ _id: 1 })
      .limit(300)
      .select(TRUST_FIELDS)
      .lean();
    if (!batch.length) break;
    const result = await evaluateListings(batch);
    totals.hidden += result.hidden;
    totals.prompted += result.prompted;
    lastId = batch[batch.length - 1]._id;
  }
  if (totals.hidden || totals.prompted) console.log(`[listingTrust] hidden ${totals.hidden}, prompted ${totals.prompted} seller(s)`);
  return totals;
}

/** Weekly "is your stock right?" push, one per store owner. */
async function stockReminderSweep() {
  const settings = await getTrustSettings();
  const cutoff = new Date(Date.now() - settings.stockReminderDays * DAY);
  const shops = await Shop.find({ status: 'active', $or: [{ lastStockReminderAt: null }, { lastStockReminderAt: { $lt: cutoff } }] })
    .select('owner name')
    .limit(500)
    .lean();
  for (const shop of shops) {
    const count = await Listing.countDocuments({
      shopId: shop._id,
      status: 'active',
      listingKind: { $ne: 'single' },
      $or: [{ stockConfirmedAt: null, createdAt: { $lt: cutoff } }, { stockConfirmedAt: { $lt: cutoff } }],
    });
    if (count) {
      await notifySeller(shop.owner, {
        title: 'Is your stock right?',
        body: `Confirm stock for ${count} item${count === 1 ? '' : 's'} in ${shop.name} so buyers don't make a wasted trip.`,
        icon: 'cube-outline',
        route: 'MyListings',
      });
    }
    await Shop.updateOne({ _id: shop._id }, { $set: { lastStockReminderAt: new Date() } });
  }
}

/** Seller says the item is still there (also restores an auto-hidden listing). */
async function confirmAvailable(listing, { stock } = {}) {
  const now = new Date();
  const set = {
    availabilityConfirmedAt: now,
    stockConfirmedAt: now,
    'trust.soldWordAt': null,
    'trust.soldLikelihood': 0,
    'trust.reasons': [],
    'trust.rankPenalty': 0,
    'trust.confirmBy': null,
    'trust.promptedAt': null,
  };
  if (stock != null && Number.isFinite(Number(stock)) && !listing.hasVariants) {
    set.stock = Math.max(0, Math.floor(Number(stock)));
  }
  const wasHidden = listing.status === 'hidden';
  const undoAutoSold = listing.status === 'sold' && Boolean(listing.trust?.autoSoldAt);
  if (wasHidden || undoAutoSold) set.statusChange = statusChange('active', 'seller', 'still_available');
  if (wasHidden) {
    set.status = 'active';
    set['autoHidden.restoredAt'] = now;
  }
  if (undoAutoSold) {
    set.status = 'active';
    set.soldAt = null;
    set['trust.autoSoldAt'] = null;
    if (listing.sellerType === 'shop' && !listing.hasVariants && !(Number(listing.stock) > 0)) set.stock = 1;
    await User.updateOne({ _id: listing.seller, soldCount: { $gt: 0 } }, { $inc: { soldCount: -1 } });
  }
  await Listing.updateOne({ _id: listing._id }, { $set: set, ...(wasHidden ? { $inc: { 'autoHidden.restoreCount': 1 } } : {}) });
  if (undoAutoSold) listingQueryCache.invalidateAll();
  if (wasHidden) {
    // A restore within 2 days of hiding counts as a wrong hide and loosens this seller's threshold.
    if (ago(listing.autoHidden?.at) < 2 * DAY) await User.updateOne({ _id: listing.seller }, { $inc: { autoHideRestores: 1 } });
    listingQueryCache.invalidateAll();
  }
  return { restored: wasHidden };
}

/** Ends 7-day strike suspensions and brings their listings back. */
async function liftExpiredSuspensions() {
  const users = await User.find({ status: 'suspended', suspendedUntil: { $ne: null, $lte: new Date() } }).select('_id').lean();
  for (const { _id } of users) {
    await User.updateOne({ _id }, { $set: { status: 'active', suspendedUntil: null } });
    await Listing.updateMany(
      { seller: _id, status: 'hidden', 'autoHidden.reason': 'account_suspended' },
      { $set: { status: 'active', 'autoHidden.restoredAt': new Date(), statusChange: statusChange('active', 'auto', 'suspension_ended') } }
    );
  }
  if (users.length) listingQueryCache.invalidateAll();
}

function startListingTrustJobs() {
  scheduleJob('listing-trust', HOUR, trustSweep, { delayMs: 3 * 60 * 1000 });
  scheduleJob('stock-reminder', 6 * HOUR, stockReminderSweep, { delayMs: 5 * 60 * 1000 });
  scheduleJob('suspension-expiry', HOUR, liftExpiredSuspensions, { delayMs: 6 * 60 * 1000 });
}

module.exports = {
  DEFAULT_TRUST,
  getTrustSettings,
  clearTrustSettingsCache,
  categoryTimers,
  kindOf,
  totalStock,
  evaluateListings,
  evaluateListingNow,
  trustSweep,
  stockReminderSweep,
  confirmAvailable,
  liftExpiredSuspensions,
  startListingTrustJobs,
};
