const Listing = require('../models/Listing');
const { getTrustSettings } = require('./listingTrust');
const { getPlatformSettings } = require('./platformSettings');
const { isAdminRole } = require('./adminScopes');

/** Same title + price within this window = duplicate spam */
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Rolling window for daily post caps */
const DAILY_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Accounts newer than this (days) are treated as new */
const NEW_ACCOUNT_AGE_DAYS = 7;
/** Max listings per rolling day for new / unverified sellers */
const RESTRICTED_DAILY_LIMIT = 5;

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isNewAccount(user) {
  if (!user?.createdAt) return true;
  const ageMs = Date.now() - new Date(user.createdAt).getTime();
  return ageMs < NEW_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Restricted sellers: incomplete profile, young account, or unverified shop listing.
 */
function isRestrictedSeller(user, { sellerType, shop } = {}) {
  if (!user) return true;
  if (!user.profileComplete) return true;
  if (isNewAccount(user)) return true;
  if (sellerType === 'shop' && shop && !shop.isVerified) return true;
  return false;
}

/**
 * Block re-posting the same title + price within 24 hours.
 */
async function findDuplicateListing({ sellerId, title, price }) {
  const titleNorm = normalizeTitle(title);
  if (!titleNorm || price == null || Number.isNaN(Number(price))) return null;

  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS);
  const recent = await Listing.find({
    seller: sellerId,
    price: Number(price),
    createdAt: { $gte: since },
  })
    .select('_id title price createdAt status')
    .lean();

  return (
    recent.find((row) => normalizeTitle(row.title) === titleNorm) || null
  );
}

async function countListingsInWindow(sellerId, windowMs = DAILY_WINDOW_MS, sellerType) {
  const since = new Date(Date.now() - windowMs);
  return Listing.countDocuments({
    seller: sellerId,
    createdAt: { $gte: since },
    ...(sellerType ? { sellerType } : {}),
  });
}

/** The approved plan while it lasts, else null. */
function activeSubscription(user) {
  const sub = user?.subscription;
  if (!sub?.endsAt || new Date(sub.endsAt).getTime() <= Date.now()) return null;
  return sub;
}

/** When the oldest post inside the 24-hour window ages out, freeing one slot. */
async function nextSlotAt(sellerId, sellerType) {
  const oldest = await Listing.findOne({
    seller: sellerId,
    createdAt: { $gte: new Date(Date.now() - DAILY_WINDOW_MS) },
    ...(sellerType ? { sellerType } : {}),
  })
    .sort({ createdAt: 1 })
    .select('createdAt')
    .lean();
  return oldest ? new Date(new Date(oldest.createdAt).getTime() + DAILY_WINDOW_MS) : null;
}

/**
 * How many more listings this seller can post in the rolling 24 hours, and which rule decides it.
 * Order: the admin's per-user limit (User 360), then an active plan, then Settings → Daily post
 * limits together with the new-account and watch-tier caps (whichever is lower).
 * Staff and a 0 limit are unlimited.
 */
async function postQuota(user, { sellerType, shop } = {}) {
  const type = sellerType === 'shop' ? 'shop' : 'individual';
  const plan = activeSubscription(user);
  const planInfo = plan ? { name: plan.name, endsAt: plan.endsAt } : null;
  if (!user || isAdminRole(user.role)) {
    return { sellerType: type, unlimited: true, source: 'staff', plan: planInfo };
  }

  const caps = [];
  const own = user.postLimits?.[type];
  const planLimit = plan?.[type === 'shop' ? 'shopDailyListings' : 'individualDailyListings'];
  if (own != null) {
    if (own > 0) caps.push({ source: 'custom', limit: own, scope: type });
  } else if (planLimit != null) {
    if (planLimit > 0) caps.push({ source: 'plan', limit: planLimit, scope: type });
  } else {
    const settings = await getPlatformSettings();
    const base = type === 'shop' ? settings.shopDailyListings : settings.individualDailyListings;
    if (base > 0) caps.push({ source: 'default', limit: base, scope: type });
    if (user.trustTier === 'watch') {
      const { watchDailyListings } = await getTrustSettings();
      caps.push({ source: 'watch', limit: watchDailyListings, scope: 'all' });
    }
    if (isRestrictedSeller(user, { sellerType: type, shop })) {
      caps.push({ source: 'new_account', limit: RESTRICTED_DAILY_LIMIT, scope: 'all' });
    }
  }
  if (!caps.length) return { sellerType: type, unlimited: true, source: own != null ? 'custom' : plan ? 'plan' : 'default', plan: planInfo };

  const counts = {};
  const countFor = async (scope) => {
    if (counts[scope] == null) counts[scope] = await countListingsInWindow(user._id, DAILY_WINDOW_MS, scope === 'all' ? undefined : scope);
    return counts[scope];
  };
  let binding = null;
  for (const cap of caps) {
    const used = await countFor(cap.scope);
    const remaining = Math.max(0, cap.limit - used);
    if (!binding || remaining < binding.remaining) binding = { ...cap, used, remaining };
  }
  const resetsAt = binding.used > 0 ? await nextSlotAt(user._id, binding.scope === 'all' ? undefined : binding.scope) : null;

  const hints = [];
  if (binding.source === 'new_account') {
    if (!user.profileComplete) hints.push('complete your profile');
    if (isNewAccount(user)) hints.push('wait until your account is 7 days old');
    if (type === 'shop' && shop && !shop.isVerified) hints.push('get your shop verified');
  }

  return {
    sellerType: type,
    unlimited: false,
    source: binding.source,
    limit: binding.limit,
    used: binding.used,
    remaining: binding.remaining,
    resetsAt,
    plan: planInfo,
    hints,
    windowHours: 24,
  };
}

function quotaMessage(quota) {
  const n = quota.limit;
  const posts = `${n} listing${n === 1 ? '' : 's'}`;
  switch (quota.source) {
    case 'custom':
      return `Your account can post up to ${posts} in 24 hours.`;
    case 'plan':
      return `Your ${quota.plan?.name || 'current'} plan includes ${posts} a day.`;
    case 'watch':
      return `You can post up to ${posts} per day for now. Reply to buyers and keep listings up to date to raise this limit.`;
    case 'new_account':
      return `New and unverified accounts can post up to ${posts} per day.${quota.hints?.length ? ` To raise this limit, ${quota.hints.slice(0, 2).join(' or ')}.` : ''}`;
    default:
      return `${quota.sellerType === 'shop' ? 'Stores' : 'Individual sellers'} can post up to ${posts} in 24 hours.`;
  }
}

/**
 * Enforce duplicate + daily caps before create.
 * @returns {{ ok: true } | { ok: false, httpStatus: number, code: string, message: string, meta?: object }}
 */
async function assertListingNotSpam(user, { title, price, sellerType, shop }) {
  const dup = await findDuplicateListing({
    sellerId: user._id,
    title,
    price,
  });
  if (dup) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'DUPLICATE_LISTING',
      message:
        'You already posted a listing with the same title and price in the last 24 hours. Edit the existing one or wait before posting again.',
      meta: { existingListingId: String(dup._id) },
    };
  }

  const quota = await postQuota(user, { sellerType, shop });
  if (!quota.unlimited && quota.remaining <= 0) {
    return {
      ok: false,
      httpStatus: 429,
      code: 'DAILY_LISTING_LIMIT',
      message: quotaMessage(quota),
      meta: { limit: quota.limit, used: quota.used, windowHours: 24, sellerType: quota.sellerType, quota },
    };
  }

  return { ok: true };
}

module.exports = {
  assertListingNotSpam,
  postQuota,
  quotaMessage,
  activeSubscription,
  findDuplicateListing,
  isRestrictedSeller,
  normalizeTitle,
  DUPLICATE_WINDOW_MS,
  RESTRICTED_DAILY_LIMIT,
  NEW_ACCOUNT_AGE_DAYS,
};
