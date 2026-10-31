const Listing = require('../models/Listing');
const { readUploadBuffer } = require('./serveUploads');
const { compareProductPhotos } = require('./aiSuggest');

/**
 * A seller posting the same item again (new title from the AI, same thing, same price) instead
 * of editing the one already live. Cheap checks pick the suspects; the AI compares cover photos
 * only when there is a suspect and a photo to compare.
 */
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PRICE_TOLERANCE = 0.15;
const SAME_PRODUCT_SCORE = 85;
const MAX_SUSPECTS = 5;
const CHECK_CACHE_MS = 30 * 60 * 1000;

// Shared by unrelated items, so they never make two titles "the same product" on their own.
const WEAK_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'without', 'of', 'in', 'on', 'to', 'by', 'from',
  'new', 'used', 'old', 'good', 'best', 'sale', 'item', 'original', 'brand', 'quality',
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple', 'orange', 'brown', 'grey',
  'gray', 'silver', 'gold', 'golden', 'dark', 'light', 'transparent', 'clear', 'multicolor',
  'plastic', 'wooden', 'wood', 'metal', 'steel', 'iron', 'fabric', 'leather', 'glass', 'cotton',
  'small', 'big', 'large', 'mini', 'portable', 'single', 'double', 'set', 'pack', 'piece', 'pcs',
]);

const checked = new Map();

function keyWords(title) {
  return new Set(
    String(title || '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((word) => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
      .filter((word) => word.length > 2 && !WEAK_WORDS.has(word) && !/^\d+$/.test(word))
  );
}

function sharesProductWord(a, b) {
  for (const word of a) if (b.has(word)) return true;
  return false;
}

function checkKey(userId, { title, category, price }) {
  return `${userId}|${String(title || '').trim().toLowerCase()}|${String(category || '').toLowerCase()}|${Number(price) || 0}`;
}

async function coverData(url) {
  const buffer = await readUploadBuffer(url).catch(() => null);
  if (!buffer) return null;
  const small = await require('sharp')(buffer)
    .rotate()
    .resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .toBuffer()
    .catch(() => null);
  return small ? small.toString('base64') : null;
}

/** The seller's recent live or in-review listings that look like the same item by text and price. */
async function findSuspects({ userId, title, category, price, excludeId }) {
  const amount = Number(price) || 0;
  const words = keyWords(title);
  if (!amount || !words.size) return [];
  const docs = await Listing.find({
    seller: userId,
    status: { $in: ['active', 'pending'] },
    createdAt: { $gte: new Date(Date.now() - WINDOW_MS) },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  })
    .sort({ createdAt: -1 })
    .limit(60)
    .setOptions({ skipAudience: true })
    .lean();
  const sameCategory = (doc) => !category || String(doc.category || '').toLowerCase() === String(category).toLowerCase();
  const closePrice = (doc) => Math.abs((Number(doc.price) || 0) - amount) <= PRICE_TOLERANCE * Math.max(amount, Number(doc.price) || 0);
  return docs
    .filter((doc) => sameCategory(doc) && closePrice(doc) && sharesProductWord(words, keyWords(doc.title)))
    .slice(0, MAX_SUSPECTS);
}

/**
 * The seller's own listing this new post repeats, or null.
 * `photo` ({ data, mimeType }) lets the AI confirm by cover photo; without it the text match decides.
 */
async function findOwnDuplicate({ userId, title, category, price, excludeId = '', photo = null }) {
  const suspects = await findSuspects({ userId, title, category, price, excludeId });
  let result = null;
  if (suspects.length && photo?.data) {
    const withCovers = (
      await Promise.all(suspects.map(async (doc) => {
        const data = doc.photos?.[0] ? await coverData(doc.photos[0]) : null;
        return data ? { doc, data } : null;
      }))
    ).filter(Boolean);
    if (withCovers.length) {
      try {
        const compared = await compareProductPhotos({
          source: { data: photo.data, mimeType: photo.mimeType, title, category },
          candidates: withCovers.map((row) => ({ data: row.data, title: row.doc.title })),
          userId: String(userId),
        });
        const best = withCovers
          .map((row, index) => ({ doc: row.doc, score: compared.matches.get(index + 1)?.score || 0 }))
          .sort((a, b) => b.score - a.score)[0];
        result = best && best.score >= SAME_PRODUCT_SCORE ? best : null;
      } catch (error) {
        console.warn('[duplicate] AI compare failed, using the text match:', error.message);
        result = { doc: suspects[0], score: null };
      }
    } else {
      result = { doc: suspects[0], score: null };
    }
  } else if (suspects.length) {
    result = { doc: suspects[0], score: null };
  }
  checked.set(checkKey(userId, { title, category, price }), { at: Date.now(), id: result ? String(result.doc._id) : '' });
  if (checked.size > 500) checked.delete(checked.keys().next().value);
  return result;
}

/**
 * Publish-time answer reusing the pre-publish check for the same title, category and price,
 * so posting never runs the AI twice. Falls back to the text match only.
 */
async function ownDuplicateAtPublish({ userId, title, category, price }) {
  const hit = checked.get(checkKey(userId, { title, category, price }));
  if (hit && Date.now() - hit.at < CHECK_CACHE_MS) {
    if (!hit.id) return null;
    const doc = await Listing.findOne({ _id: hit.id, status: { $in: ['active', 'pending'] } }).setOptions({ skipAudience: true }).lean();
    return doc ? { doc, score: null } : null;
  }
  const suspects = await findSuspects({ userId, title, category, price });
  return suspects.length ? { doc: suspects[0], score: null } : null;
}

module.exports = { findOwnDuplicate, ownDuplicateAtPublish };
