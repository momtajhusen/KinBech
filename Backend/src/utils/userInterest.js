const UserInterest = require('../models/UserInterest');
const { searchTokens } = require('./searchMatch');
const { listingTrustBoost } = require('./listing');
const { isListingFeatured } = require('./referral');

/** How strongly each action says "I want this". */
const SIGNAL_WEIGHTS = {
  category: 2,
  search: 3,
  view: 3,
  save: 6,
  chat: 9,
};
const HALF_LIFE_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;
const THROTTLE_MS = 10 * 60 * 1000;
const PROFILE_TTL_MS = 60 * 1000;
const MAX_CATEGORIES = 30;
const MAX_TERMS = 150;
const MIN_PROFILE_WEIGHT = 3;

const throttle = new Map();
const profileCache = new Map();

function safeKey(value) {
  return String(value || '')
    .trim()
    .replace(/\./g, ' ')
    .replace(/^\$+/, '')
    .slice(0, 60);
}

function decayFactor(since, now = Date.now()) {
  const days = Math.max(0, (now - new Date(since || now).getTime()) / DAY_MS);
  return 0.5 ** (days / HALF_LIFE_DAYS);
}

function listingTerms(listing) {
  const words = [
    ...searchTokens(listing?.title || ''),
    ...(Array.isArray(listing?.searchWords) ? listing.searchWords.slice(0, 12) : [])
      .flatMap((word) => searchTokens(word)),
  ];
  return [...new Set(words.map(safeKey).filter((word) => word.length >= 2))].slice(0, 16);
}

function topEntries(map, max) {
  const entries = [...map.entries()].filter(([, score]) => score >= 0.05);
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, max);
}

function throttled(key) {
  const last = throttle.get(key) || 0;
  if (Date.now() - last < THROTTLE_MS) return true;
  if (throttle.size > 20000) throttle.clear();
  throttle.set(key, Date.now());
  return false;
}

/**
 * Remembers a buyer action. `kind` is one of SIGNAL_WEIGHTS; pass the listing for view/save/chat,
 * `category` for a category tap, and `query` (plus optional category) for a search.
 */
async function recordInterest(userId, { kind, listing = null, category = '', query = '' } = {}) {
  const weight = SIGNAL_WEIGHTS[kind];
  if (!userId || !weight) return;
  const ref = listing?._id || listing?.id || category || query;
  if (!ref || throttled(`${userId}:${kind}:${String(ref).toLowerCase()}`)) return;

  const doc = (await UserInterest.findOne({ user: userId })) || new UserInterest({ user: userId });
  const now = Date.now();
  const factor = decayFactor(doc.decayedAt, now);
  const categories = new Map([...(doc.categories || new Map()).entries()].map(([k, v]) => [k, v * factor]));
  const terms = new Map([...(doc.terms || new Map()).entries()].map(([k, v]) => [k, v * factor]));
  const priceBands = new Map(
    [...(doc.priceBands || new Map()).entries()].map(([k, band]) => [
      k,
      { logSum: (band?.logSum || 0) * factor, weight: (band?.weight || 0) * factor },
    ])
  );

  const categoryKey = safeKey(listing?.category || category);
  if (categoryKey) categories.set(categoryKey, (categories.get(categoryKey) || 0) + weight);

  const words = listing ? listingTerms(listing) : searchTokens(query).map(safeKey).filter(Boolean);
  const termWeight = listing ? weight * 0.6 : weight;
  words.forEach((word) => terms.set(word, (terms.get(word) || 0) + termWeight));

  const price = Number(listing?.price);
  if (categoryKey && Number.isFinite(price) && price > 0) {
    const band = priceBands.get(categoryKey) || { logSum: 0, weight: 0 };
    priceBands.set(categoryKey, { logSum: band.logSum + Math.log(price) * weight, weight: band.weight + weight });
  }

  const keptCategories = topEntries(categories, MAX_CATEGORIES);
  const keptNames = new Set(keptCategories.map(([name]) => name));
  doc.categories = new Map(keptCategories);
  doc.terms = new Map(topEntries(terms, MAX_TERMS));
  doc.priceBands = new Map([...priceBands.entries()].filter(([name, band]) => keptNames.has(name) && band.weight >= 0.05));
  doc.decayedAt = new Date(now);
  await doc.save();
  profileCache.delete(String(userId));
}

function recordInterestSoon(userId, signal) {
  recordInterest(userId, signal).catch((error) => {
    console.warn('[interest] record failed:', error.message || error);
  });
}

/** Decayed interest profile, or null when the user has not shown enough interest yet. */
async function loadInterestProfile(userId) {
  if (!userId) return null;
  const key = String(userId);
  const cached = profileCache.get(key);
  if (cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.profile;

  const doc = await UserInterest.findOne({ user: userId }).lean();
  let profile = null;
  if (doc) {
    const factor = decayFactor(doc.decayedAt);
    const categories = {};
    const terms = {};
    const prices = {};
    let total = 0;
    Object.entries(doc.categories || {}).forEach(([name, score]) => {
      categories[name] = score * factor;
      total += score * factor;
    });
    Object.entries(doc.terms || {}).forEach(([word, score]) => {
      terms[word] = score * factor;
    });
    Object.entries(doc.priceBands || {}).forEach(([name, band]) => {
      if (band?.weight > 0) prices[name] = Math.exp(band.logSum / band.weight);
    });
    if (total >= MIN_PROFILE_WEIGHT) {
      profile = {
        categories,
        terms,
        prices,
        maxCategory: Math.max(...Object.values(categories), 1),
        maxTerm: Math.max(...Object.values(terms), 1),
      };
    }
  }
  if (profileCache.size > 5000) profileCache.clear();
  profileCache.set(key, { at: Date.now(), profile });
  return profile;
}

/** 0..~1.25: how well one listing matches the profile (category, words, usual price). */
function interestScore(listing, profile) {
  if (!profile) return 0;
  const categoryKey = safeKey(listing?.category);
  const categoryNorm = (profile.categories[categoryKey] || 0) / profile.maxCategory;
  const termSum = listingTerms(listing).reduce((sum, word) => sum + (profile.terms[word] || 0), 0);
  const termNorm = Math.min(1, termSum / (profile.maxTerm * 1.5));
  let priceFit = 0;
  const usual = profile.prices[categoryKey];
  const price = Number(listing?.price);
  if (usual > 0 && price > 0) {
    priceFit = Math.max(0, 1 - Math.abs(Math.log(price / usual)) / Math.log(4));
  }
  return 0.6 * categoryNorm + 0.4 * termNorm + 0.25 * priceFit * (categoryNorm > 0 ? 1 : 0.3);
}

function sellerIdOf(doc) {
  return String(doc?.seller?._id || doc?.seller || '');
}

/**
 * Orders `{ doc, distance }` entries for this buyer: interest first, then freshness, distance and trust.
 * `diversify` stops one category from taking the whole top of a mixed feed.
 */
function rankForUser(entries, profile, { userId = null, diversify = true } = {}) {
  const now = Date.now();
  const me = userId ? String(userId) : '';
  const scored = entries.map((entry) => {
    const { doc, distance } = entry;
    const ageDays = Math.max(0, (now - new Date(doc.createdAt || now).getTime()) / DAY_MS);
    const fresh = Math.exp(-ageDays / 10);
    const near = distance != null ? 1 / (1 + distance / 8) : 0.3;
    const trust = Math.max(-1, Math.min(1, listingTrustBoost(doc) / 40));
    const own = me && sellerIdOf(doc) === me ? -1 : 0;
    const featured = isListingFeatured(doc) ? 0.35 : 0;
    const score = 1.3 * interestScore(doc, profile) + 0.45 * fresh + 0.3 * near + 0.15 * trust + featured + own;
    return { entry, score, category: safeKey(doc.category) };
  });
  scored.sort((a, b) => b.score - a.score);
  if (diversify) {
    const seen = {};
    scored.forEach((row) => {
      const count = seen[row.category] || 0;
      row.score -= 0.08 * count;
      seen[row.category] = count + 1;
    });
    scored.sort((a, b) => b.score - a.score);
  }
  return scored.map((row) => row.entry);
}

/** Category names ordered by this user's interest (strongest first). */
async function topInterestCategories(userId, limit = 12) {
  const profile = await loadInterestProfile(userId);
  if (!profile) return [];
  return Object.entries(profile.categories)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, score]) => ({ name, score: Math.round(score * 100) / 100 }));
}

module.exports = {
  interestScore,
  loadInterestProfile,
  rankForUser,
  recordInterest,
  recordInterestSoon,
  topInterestCategories,
};
