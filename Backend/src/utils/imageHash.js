const sharp = require('sharp');
const MediaHash = require('../models/MediaHash');
const Listing = require('../models/Listing');

/** Hamming distance at or below this counts as the same photo (resized, recompressed, lightly cropped). */
const MAX_DISTANCE = 6;

/** 64-bit difference hash as 16 hex chars. */
async function dHash(buffer) {
  const pixels = await sharp(buffer).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      bits += pixels[row * 9 + col] > pixels[row * 9 + col + 1] ? '1' : '0';
    }
  }
  let hex = '';
  for (let i = 0; i < 64; i += 4) hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  return hex;
}

function distance(a, b) {
  let d = 0;
  for (let i = 0; i < 16; i += 1) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

// 8 bands of 8 bits: two hashes within 7 bits always share at least one band.
const bandsOf = (hash) => [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `${i}:${hash.slice(i * 2, i * 2 + 2)}`);

/** Called after a listing photo upload. Never throws. */
async function rememberPhotoHash({ buffer, filename, userId }) {
  try {
    const hash = await dHash(buffer);
    await MediaHash.updateOne(
      { filename },
      { $set: { filename, user: userId || null, hash, bands: bandsOf(hash) } },
      { upsert: true }
    );
  } catch (error) {
    console.warn('[imageHash]', error.message);
  }
}

const fileOf = (url) => String(url || '').split('?')[0].split('/').pop();

/**
 * Returns a review reason when a photo matches one in another seller's earlier listing.
 * Only the later listing is flagged, so the original seller is never held for being copied.
 */
async function duplicatePhotoReason(photos, sellerId, { excludeListingId = null, createdBefore = new Date() } = {}) {
  try {
    const files = (Array.isArray(photos) ? photos : []).map(fileOf).filter(Boolean);
    if (!files.length) return '';
    const own = await MediaHash.find({ filename: { $in: files } }).select('hash').lean();
    for (const { hash } of own) {
      const candidates = await MediaHash.find({ bands: { $in: bandsOf(hash) }, user: { $ne: sellerId } })
        .select('filename hash')
        .sort({ createdAt: -1 })
        .limit(3000)
        .lean();
      const close = candidates.filter((c) => distance(c.hash, hash) <= MAX_DISTANCE).map((c) => c.filename);
      if (!close.length) continue;
      const pattern = close.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      const other = await Listing.exists({
        seller: { $ne: sellerId },
        status: { $in: ['active', 'pending', 'sold', 'hidden'] },
        photos: { $regex: `(${pattern})(\\?|$)` },
        createdAt: { $lt: createdBefore },
        ...(excludeListingId ? { _id: { $ne: excludeListingId } } : {}),
      });
      if (other) return 'The same photo is used in another seller\'s listing.';
    }
    return '';
  } catch (error) {
    console.warn('[imageHash] duplicate check:', error.message);
    return '';
  }
}

module.exports = { dHash, distance, rememberPhotoHash, duplicatePhotoReason, MAX_DISTANCE };
