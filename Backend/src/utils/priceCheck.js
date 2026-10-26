const Listing = require('../models/Listing');

const STOP_WORDS = new Set([
  'for', 'sale', 'the', 'and', 'with', 'new', 'used', 'good', 'fair', 'condition',
  'urgent', 'best', 'price', 'only', 'set', 'pcs', 'piece',
]);

const MIN_COMPARABLES = 3;
const LOW_RATIO = 0.3;
const HIGH_RATIO = 3;

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function titleKeywords(title) {
  const words = String(title || '')
    .toLowerCase()
    .split(/[^a-z0-9\u0900-\u097F]+/)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 6);
}

function roundPrice(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const step = n < 1000 ? 50 : n < 10000 ? 100 : n < 100000 ? 500 : 1000;
  return Math.max(step, Math.round(n / step) * step);
}

function formatNpr(value) {
  return Math.round(Number(value) || 0).toLocaleString('en-IN');
}

/**
 * Median price of similar active/sold listings (same category, overlapping title words).
 * Returns `{ count }` only when there are too few comparables to trust.
 */
async function marketPriceFor({ title, category, excludeId } = {}) {
  const words = titleKeywords(title);
  if (!words.length) return { count: 0 };

  const filter = {
    status: { $in: ['active', 'sold'] },
    price: { $gt: 0 },
    title: { $regex: words.map(escapeRegex).join('|'), $options: 'i' },
  };
  if (category) filter.category = category;
  if (excludeId) filter._id = { $ne: excludeId };

  const rows = await Listing.find(filter)
    .select('title price')
    .sort({ createdAt: -1 })
    .limit(80)
    .lean();

  const need = Math.min(2, words.length);
  const prices = rows
    .filter((row) => {
      const text = String(row.title || '').toLowerCase();
      return words.filter((word) => text.includes(word)).length >= need;
    })
    .map((row) => Number(row.price))
    .filter((price) => price > 0)
    .sort((a, b) => a - b);

  if (prices.length < MIN_COMPARABLES) return { count: prices.length };
  const at = (p) => prices[Math.min(prices.length - 1, Math.max(0, Math.round((prices.length - 1) * p)))];
  return { count: prices.length, median: at(0.5), low: at(0.25), high: at(0.75) };
}

/** Similar-listing median when there are enough of them, otherwise the AI guess. */
function blendEstimate(market, aiPrice) {
  if (market?.median) return roundPrice(market.median);
  return roundPrice(aiPrice);
}

/** Empty string when the price looks normal; otherwise a short English reason for review. */
function priceReviewReason(price, estimate) {
  const value = Number(price);
  if (!Number.isFinite(value) || value <= 0) {
    return estimate > 0
      ? `Price is NPR 0. Similar items sell for about NPR ${formatNpr(estimate)}.`
      : 'Price is NPR 0.';
  }
  if (!(estimate > 0)) return '';
  const ratio = value / estimate;
  if (ratio < LOW_RATIO) {
    return `Price is much lower than similar items (about NPR ${formatNpr(estimate)}).`;
  }
  if (ratio > HIGH_RATIO) {
    return `Price is much higher than similar items (about NPR ${formatNpr(estimate)}).`;
  }
  return '';
}

/** Server-side estimate for a listing: market comparables first, the client's AI estimate as fallback. */
async function estimateForListing({ title, category, excludeId, clientEstimate }) {
  const market = await marketPriceFor({ title, category, excludeId }).catch(() => ({ count: 0 }));
  const fromClient = Number(clientEstimate);
  return blendEstimate(market, Number.isFinite(fromClient) && fromClient > 0 ? fromClient : 0);
}

module.exports = {
  blendEstimate,
  estimateForListing,
  marketPriceFor,
  priceReviewReason,
  roundPrice,
};
