const Listing = require('../models/Listing');

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

async function countListingsInWindow(sellerId, windowMs = DAILY_WINDOW_MS) {
  const since = new Date(Date.now() - windowMs);
  return Listing.countDocuments({
    seller: sellerId,
    createdAt: { $gte: since },
  });
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

  if (!isRestrictedSeller(user, { sellerType, shop })) {
    return { ok: true };
  }

  const count = await countListingsInWindow(user._id);
  if (count >= RESTRICTED_DAILY_LIMIT) {
    const reasons = [];
    if (!user.profileComplete) reasons.push('complete your profile');
    if (isNewAccount(user)) reasons.push('wait until your account is older');
    if (sellerType === 'shop' && shop && !shop.isVerified) {
      reasons.push('get your shop verified');
    }
    const hint = reasons.length
      ? ` To raise this limit, ${reasons.slice(0, 2).join(' or ')}.`
      : '';
    return {
      ok: false,
      httpStatus: 429,
      code: 'DAILY_LISTING_LIMIT',
      message: `New and unverified accounts can post up to ${RESTRICTED_DAILY_LIMIT} listings per day.${hint}`,
      meta: {
        limit: RESTRICTED_DAILY_LIMIT,
        used: count,
        windowHours: 24,
      },
    };
  }

  return { ok: true };
}

module.exports = {
  assertListingNotSpam,
  findDuplicateListing,
  isRestrictedSeller,
  normalizeTitle,
  DUPLICATE_WINDOW_MS,
  RESTRICTED_DAILY_LIMIT,
  NEW_ACCOUNT_AGE_DAYS,
};
