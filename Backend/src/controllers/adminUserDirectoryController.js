const User = require('../models/User');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');

const DAY = 24 * 60 * 60 * 1000;
const LIVE_STATUSES = ['active', 'pending'];
const KINDS = ['buyer', 'individual', 'shop', 'both'];
const TRUST_TIERS = ['top', 'trusted', 'standard', 'watch', 'restricted', 'new'];
const SHOP_VERIFICATION = ['approved', 'pending', 'rejected', 'none'];
const SHOP_STATUSES = ['active', 'inactive', 'suspended'];

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  active_listings: { 'stats.active': -1, createdAt: -1 },
  most_sold: { soldCount: -1, createdAt: -1 },
  most_bought: { boughtCount: -1, createdAt: -1 },
  top_rated: { ratingAverage: -1, reviewCount: -1, createdAt: -1 },
  trust: { trustScore: -1, createdAt: -1 },
  recently_active: { lastActiveAt: -1, createdAt: -1 },
  recently_posted: { 'stats.lastPostedAt': -1, createdAt: -1 },
};
const STATS_SORTS = ['active_listings', 'recently_posted'];

/** `?activity=` and `?posted=` windows: positive = within N days, negative = none for N days. */
const WINDOWS = { today: 1, '7d': 7, '30d': 30, '90d': 90, idle30: -30, idle90: -90 };

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function numberParam(value) {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateParam(value, endOfDay = false) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  if (endOfDay) date.setUTCHours(23, 59, 59, 999);
  return date;
}

function windowMatch(field, key, now) {
  const days = WINDOWS[key];
  if (!days) return null;
  const since = new Date(now.getTime() - Math.abs(days) * DAY);
  if (days > 0) return { [field]: { $gte: since } };
  return { $or: [{ [field]: null }, { [field]: { $lt: since } }] };
}

/** Listing filters/sorts need per-user listing stats before paging; everything else does not. */
function needsStats(query) {
  return Boolean(
    numberParam(query.minActive) !== null
    || numberParam(query.maxActive) !== null
    || query.pending === 'yes'
    || query.hidden === 'yes'
    || WINDOWS[query.posted]
    || STATS_SORTS.includes(query.sort),
  );
}

/** Filters answerable from the user document (shop and category filters resolve to id lists). */
async function baseMatch(query, now) {
  const match = { role: 'user', deletedAt: null };
  const and = [];

  const search = String(query.q || '').trim();
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    const shopOwners = await Shop.distinct('owner', { name: re });
    and.push({ $or: [{ name: re }, { email: re }, { phone: re }, { _id: { $in: shopOwners } }] });
  }

  const place = String(query.location || '').trim();
  if (place) {
    const re = new RegExp(escapeRegex(place), 'i');
    const shopOwners = await Shop.distinct('owner', { $or: [{ location: re }, { address: re }] });
    and.push({ $or: [{ location: re }, { 'addresses.city': re }, { _id: { $in: shopOwners } }] });
  }

  const category = String(query.category || '').trim();
  if (category) {
    and.push({ _id: { $in: await Listing.distinct('seller', { category, status: { $in: LIVE_STATUSES } }) } });
  }

  const shopFilter = {};
  if (SHOP_VERIFICATION.includes(query.verification)) {
    shopFilter.verificationStatus = query.verification === 'none' ? { $in: ['none', null] } : query.verification;
  }
  if (SHOP_STATUSES.includes(query.shopStatus)) shopFilter.status = query.shopStatus;
  if (Object.keys(shopFilter).length) {
    and.push({ _id: { $in: await Shop.distinct('owner', shopFilter) } });
  }

  if (query.status === 'active') match.status = { $ne: 'suspended' };
  if (query.status === 'suspended') match.status = 'suspended';
  if (query.status === 'chat_locked') match.chatRestrictedUntil = { $gt: now };
  if (query.status === 'deleting') match.deletionScheduledFor = { $ne: null };
  if (query.status === 'strikes') match['strikes.0'] = { $exists: true };

  if (TRUST_TIERS.includes(query.trust)) match.trustTier = query.trust;

  if (query.plan === 'paid') match['subscription.endsAt'] = { $gt: now };
  if (query.plan === 'free') and.push({ $or: [{ 'subscription.endsAt': null }, { 'subscription.endsAt': { $lte: now } }] });

  if (query.profile === 'complete') match.profileComplete = true;
  if (query.profile === 'incomplete') match.profileComplete = { $ne: true };

  if (query.tester === 'only') match.isTester = true;
  if (query.tester === 'exclude') match.isTester = { $ne: true };

  const joinedFrom = dateParam(query.joinedFrom);
  const joinedTo = dateParam(query.joinedTo, true);
  if (joinedFrom || joinedTo) {
    match.createdAt = {};
    if (joinedFrom) match.createdAt.$gte = joinedFrom;
    if (joinedTo) match.createdAt.$lte = joinedTo;
  }

  const activity = windowMatch('lastActiveAt', query.activity, now);
  if (activity) and.push(activity);

  const minRating = numberParam(query.minRating);
  if (minRating) match.ratingAverage = { $gte: minRating };
  const minSold = numberParam(query.minSold);
  if (minSold) match.soldCount = { $gte: minSold };
  const minBought = numberParam(query.minBought);
  if (minBought) match.boughtCount = { $gte: minBought };

  return and.length ? { ...match, $and: and } : match;
}

/** Who is a buyer, individual seller or shop, as id lists (used when stats are not joined). */
async function kindSets() {
  const [shopOwners, listers, individualListers] = await Promise.all([
    Shop.distinct('owner'),
    Listing.distinct('seller'),
    Listing.distinct('seller', { sellerType: 'individual' }),
  ]);
  const individualSet = new Set(individualListers.map(String));
  return {
    shopOwners,
    sellers: [...shopOwners, ...listers],
    listers,
    both: shopOwners.filter((id) => individualSet.has(String(id))),
  };
}

function kindCondition(kind, sets) {
  if (kind === 'buyer') return { _id: { $nin: sets.sellers }, soldCount: { $not: { $gt: 0 } } };
  if (kind === 'individual') return { _id: { $nin: sets.shopOwners }, $or: [{ _id: { $in: sets.listers } }, { soldCount: { $gt: 0 } }] };
  if (kind === 'shop') return { _id: { $in: sets.shopOwners } };
  if (kind === 'both') return { _id: { $in: sets.both } };
  return null;
}

function withKind(match, kind, sets) {
  const condition = kindCondition(kind, sets);
  return condition ? { $and: [match, condition] } : match;
}

const LOOKUP_STAGES = [
  {
    $lookup: {
      from: Listing.collection.name,
      let: { uid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$seller', '$$uid'] } } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
            sold: { $sum: { $cond: [{ $eq: ['$status', 'sold'] }, 1, 0] } },
            hidden: { $sum: { $cond: [{ $in: ['$status', ['hidden', 'removed']] }, 1, 0] } },
            individual: { $sum: { $cond: [{ $eq: ['$sellerType', 'individual'] }, 1, 0] } },
            lastPostedAt: { $max: '$createdAt' },
          },
        },
      ],
      as: 'listingStats',
    },
  },
  {
    $lookup: {
      from: Shop.collection.name,
      let: { uid: '$_id' },
      pipeline: [
        { $match: { $expr: { $eq: ['$owner', '$$uid'] } } },
        { $sort: { createdAt: -1 } },
        { $limit: 1 },
        { $project: { name: 1, logo: 1, status: 1, verificationStatus: 1, isVerified: 1, location: 1, followersCount: 1 } },
      ],
      as: 'shopDoc',
    },
  },
  {
    $addFields: {
      stats: {
        $ifNull: [
          { $arrayElemAt: ['$listingStats', 0] },
          { total: 0, active: 0, pending: 0, sold: 0, hidden: 0, individual: 0, lastPostedAt: null },
        ],
      },
      shop: { $arrayElemAt: ['$shopDoc', 0] },
    },
  },
  {
    $addFields: {
      kind: {
        $switch: {
          branches: [
            { case: { $and: ['$shop', { $gt: ['$stats.individual', 0] }] }, then: 'both' },
            { case: { $gt: ['$shop', null] }, then: 'shop' },
            { case: { $or: [{ $gt: ['$stats.total', 0] }, { $gt: [{ $ifNull: ['$soldCount', 0] }, 0] }] }, then: 'individual' },
          ],
          default: 'buyer',
        },
      },
    },
  },
];

const ROW_PROJECTION = {
  $project: {
    name: 1, phone: 1, email: 1, avatarUrl: 1, location: 1, status: 1, suspendedUntil: 1,
    chatRestrictedUntil: 1, deletionScheduledFor: 1, strikes: 1, isTester: 1, profileComplete: 1,
    createdAt: 1, lastActiveAt: 1, soldCount: 1, boughtCount: 1, dealsCompleted: 1, ratingAverage: 1,
    reviewCount: 1, trustScore: 1, trustTier: 1, subscription: 1, stats: 1, shop: 1, kind: 1,
  },
};

function statsMatch(query, now) {
  const and = [];
  const minActive = numberParam(query.minActive);
  const maxActive = numberParam(query.maxActive);
  if (minActive !== null || maxActive !== null) {
    const range = {};
    if (minActive !== null) range.$gte = minActive;
    if (maxActive !== null) range.$lte = maxActive;
    and.push({ 'stats.active': range });
  }
  if (query.pending === 'yes') and.push({ 'stats.pending': { $gt: 0 } });
  if (query.hidden === 'yes') and.push({ 'stats.hidden': { $gt: 0 } });
  const posted = windowMatch('stats.lastPostedAt', query.posted, now);
  if (posted) and.push(posted);
  return and.length ? { $and: and } : {};
}

/** `shop` includes shop owners who also post as individuals (`both`). */
function kindMatch(kind) {
  if (kind === 'shop') return { kind: { $in: ['shop', 'both'] } };
  if (KINDS.includes(kind)) return { kind };
  return {};
}

function presentUser(doc, now) {
  const shop = doc.shop || null;
  const stats = doc.stats || {};
  const endsAt = doc.subscription?.endsAt ? new Date(doc.subscription.endsAt) : null;
  return {
    id: doc._id,
    name: doc.name || '',
    phone: doc.phone || '',
    email: doc.email || '',
    avatarUrl: doc.avatarUrl || '',
    location: doc.location || shop?.location || '',
    type: doc.kind || 'buyer',
    shop: shop
      ? {
        id: shop._id,
        name: shop.name,
        status: shop.status,
        verificationStatus: shop.verificationStatus || 'none',
        isVerified: Boolean(shop.isVerified),
        followersCount: shop.followersCount || 0,
      }
      : null,
    listings: {
      active: stats.active || 0,
      pending: stats.pending || 0,
      sold: stats.sold || 0,
      hidden: stats.hidden || 0,
      total: stats.total || 0,
      lastPostedAt: stats.lastPostedAt || null,
    },
    soldCount: Math.max(doc.soldCount || 0, stats.sold || 0),
    boughtCount: doc.boughtCount || 0,
    dealsCompleted: doc.dealsCompleted || 0,
    ratingAverage: doc.ratingAverage || 0,
    reviewCount: doc.reviewCount || 0,
    trustScore: doc.trustScore ?? null,
    trustTier: doc.trustTier || 'new',
    plan: endsAt && endsAt > now ? { name: doc.subscription.name || 'Paid plan', endsAt } : null,
    status: doc.status === 'suspended' ? 'suspended' : 'active',
    suspendedUntil: doc.suspendedUntil || null,
    chatRestricted: Boolean(doc.chatRestrictedUntil && new Date(doc.chatRestrictedUntil) > now),
    deletionScheduledFor: doc.deletionScheduledFor || null,
    strikes: (doc.strikes || []).length,
    isTester: Boolean(doc.isTester),
    profileComplete: Boolean(doc.profileComplete),
    joinDate: doc.createdAt,
    lastActiveAt: doc.lastActiveAt || null,
  };
}

/**
 * GET /auth/admin/user-directory — every app user (buyers, individual sellers, shops) with
 * advanced filters. `counts` per type follow the other filters so the type tabs stay accurate.
 */
async function getUserDirectory(req, res, next) {
  try {
    const { query } = req;
    const now = new Date();
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const sort = SORTS[query.sort] || SORTS.newest;
    const kind = KINDS.includes(query.type) ? query.type : '';
    const base = await baseMatch(query, now);
    const categoriesPromise = Listing.distinct('category', { status: { $in: LIVE_STATUSES } });

    let counts;
    let total;
    let rows;

    if (needsStats(query)) {
      const [result] = await User.aggregate([
        { $match: base },
        ...LOOKUP_STAGES,
        { $match: statsMatch(query, now) },
        {
          $facet: {
            counts: [{ $group: { _id: '$kind', n: { $sum: 1 } } }],
            total: [{ $match: kindMatch(kind) }, { $count: 'n' }],
            rows: [{ $match: kindMatch(kind) }, { $sort: sort }, { $skip: (page - 1) * limit }, { $limit: limit }, ROW_PROJECTION],
          },
        },
      ]).allowDiskUse(true);
      const byKind = Object.fromEntries((result?.counts || []).map((row) => [row._id, row.n]));
      counts = {
        all: Object.values(byKind).reduce((sum, n) => sum + n, 0),
        buyer: byKind.buyer || 0,
        individual: byKind.individual || 0,
        shop: (byKind.shop || 0) + (byKind.both || 0),
        both: byKind.both || 0,
      };
      total = result?.total?.[0]?.n || 0;
      rows = result?.rows || [];
    } else {
      const sets = await kindSets();
      const [all, buyer, individual, shop, both, pageRows] = await Promise.all([
        User.countDocuments(base),
        ...KINDS.map((name) => User.countDocuments(withKind(base, name, sets))),
        User.aggregate([
          { $match: withKind(base, kind, sets) },
          { $sort: sort },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          ...LOOKUP_STAGES,
          ROW_PROJECTION,
        ]),
      ]);
      counts = { all, buyer, individual, shop, both };
      total = kind ? counts[kind] : all;
      rows = pageRows;
    }

    const categories = await categoriesPromise;
    res.json({
      users: rows.map((doc) => presentUser(doc, now)),
      counts,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      categories: categories.filter(Boolean).sort((a, b) => a.localeCompare(b)),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getUserDirectory };
