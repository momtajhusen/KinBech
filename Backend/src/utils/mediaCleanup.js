const fs = require('fs');
const path = require('path');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const User = require('../models/User');
const r2 = require('./r2');
const { getUploadsRoot } = require('../config/uploads');
const { isPrivateRef, deletePrivate } = require('./privateMedia');

const UPLOAD_KEY = /(?:^|\/)uploads\/([a-z0-9_-]+)\/([^/?#]+)/i;

function uploadKeyOf(url) {
  const match = String(url || '').match(UPLOAD_KEY);
  if (!match || match[2] === '..' || match[2] === '.') return null;
  return `uploads/${match[1]}/${match[2]}`;
}

async function removeUpload(key) {
  try {
    if (r2.isEnabled()) await r2.deleteUpload(key);
    await fs.promises.unlink(path.join(getUploadsRoot(), key.slice('uploads/'.length))).catch(() => {});
  } catch {
    // Media cleanup is best effort; the records are already gone.
  }
}

/**
 * Deletes stored files for these URLs once no record points at them anymore.
 * Files still used by someone else (a copied photo URL) are kept. Call after the records are gone.
 */
async function removeOrphanUploads(urls) {
  let removed = 0;
  for (const url of [...new Set(urls.filter(Boolean))].slice(0, 500)) {
    if (isPrivateRef(url)) {
      await deletePrivate(url).catch(() => {});
      removed += 1;
      continue;
    }
    const key = uploadKeyOf(url);
    if (!key) continue;
    const stillUsed = await Promise.all([
      Listing.exists({ $or: [{ photos: url }, { 'variants.photo': url }] }),
      Shop.exists({ $or: [{ logo: url }, { coverImage: url }] }),
      User.exists({ avatarUrl: url }),
    ]);
    if (stillUsed.some(Boolean)) continue;
    await removeUpload(key);
    removed += 1;
  }
  return removed;
}

module.exports = { uploadKeyOf, removeUpload, removeOrphanUploads };
