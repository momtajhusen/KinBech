const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const User = require('../models/User');
const Wishlist = require('../models/Wishlist');

const viewThrottle = new Map();
const VIEW_THROTTLE_MS = 10 * 60 * 1000;

function countsFromRows(rows) {
  const counts = {};
  for (const row of rows) {
    const name = String(row?._id || '').trim();
    if (!name) continue;
    counts[name] = Number(row.count) || 0;
  }
  return counts;
}

function mapToObject(value) {
  if (!value) return {};
  if (value instanceof Map) return Object.fromEntries(value);
  if (typeof value.toObject === 'function') return value.toObject();
  return { ...value };
}

function mergeCounts(...maps) {
  const out = {};
  for (const map of maps) {
    Object.entries(map || {}).forEach(([name, count]) => {
      out[name] = (out[name] || 0) + (Number(count) || 0);
    });
  }
  return out;
}

async function popularProductCounts() {
  const rows = await Listing.aggregate([
    { $match: { status: { $in: ['active', 'sold', 'pending'] } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  return countsFromRows(rows);
}

async function popularShopCounts() {
  const rows = await Shop.aggregate([
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  return countsFromRows(rows);
}

async function userPostedProductCounts(userId) {
  const rows = await Listing.aggregate([
    { $match: { seller: userId } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  return countsFromRows(rows);
}

async function userViewedProductCounts(userId) {
  const [user, wishlist] = await Promise.all([
    User.findById(userId).select('viewedCategoryCounts').lean(),
    Wishlist.findOne({ user: userId }).populate({ path: 'listings', select: 'category' }).lean(),
  ]);
  const viewed = mapToObject(user?.viewedCategoryCounts);
  const wished = {};
  (wishlist?.listings || []).forEach((listing) => {
    const name = listing?.category;
    if (!name) return;
    wished[name] = (wished[name] || 0) + 1;
  });
  return { viewed, wished };
}

async function userShopCategoryCounts(userId) {
  const shops = await Shop.find({ owner: userId }).select('category').lean();
  const counts = {};
  shops.forEach((shop) => {
    const name = String(shop.category || '').trim();
    if (!name) return;
    counts[name] = (counts[name] || 0) + 1;
  });
  return counts;
}

function scoreCategory(name, { mode, posted, viewed, wished, popular }) {
  const p = posted[name] || 0;
  const v = viewed[name] || 0;
  const w = wished[name] || 0;
  const pop = popular[name] || 0;
  if (mode === 'sell') {
    if (p > 0) return p * 1_000_000 + pop;
    return pop;
  }
  const personal = v * 4 + w * 3 + p * 2;
  if (personal > 0) return personal * 1_000_000 + pop;
  return pop;
}

function rankCategoryDocs(docs, weights) {
  return [...docs].sort((a, b) => {
    const diff = scoreCategory(b.name, weights) - scoreCategory(a.name, weights);
    if (diff) return diff;
    const order = (a.sortOrder || 0) - (b.sortOrder || 0);
    if (order) return order;
    return String(a.name).localeCompare(String(b.name));
  });
}

async function rankCategories(docs, { userId, type, mode }) {
  if (!docs.length) return docs;
  if (type === 'shop') {
    const [popular, posted] = await Promise.all([
      popularShopCounts(),
      userId ? userShopCategoryCounts(userId) : {},
    ]);
    return rankCategoryDocs(docs, {
      mode: mode === 'sell' ? 'sell' : 'browse',
      posted,
      viewed: {},
      wished: {},
      popular,
    });
  }

  const [popular, posted, interest] = await Promise.all([
    popularProductCounts(),
    userId ? userPostedProductCounts(userId) : {},
    userId ? userViewedProductCounts(userId) : { viewed: {}, wished: {} },
  ]);
  return rankCategoryDocs(docs, {
    mode: mode === 'sell' ? 'sell' : 'browse',
    posted,
    viewed: interest.viewed,
    wished: interest.wished,
    popular,
  });
}

function safeCategoryKey(name) {
  return String(name || '').trim().replace(/\./g, ' ');
}

async function recordCategoryView(userId, category) {
  const name = safeCategoryKey(category);
  if (!userId || !name) return;
  const key = `${userId}:${name}`;
  const last = viewThrottle.get(key) || 0;
  if (Date.now() - last < VIEW_THROTTLE_MS) return;
  viewThrottle.set(key, Date.now());
  if (viewThrottle.size > 5000) viewThrottle.clear();
  await User.updateOne(
    { _id: userId },
    { $inc: { [`viewedCategoryCounts.${name}`]: 1 } }
  );
}

module.exports = {
  rankCategories,
  recordCategoryView,
  mergeCounts,
};
