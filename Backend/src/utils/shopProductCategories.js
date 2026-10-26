const Category = require('../models/Category');
const { suggestShopCategories } = require('./aiSuggest');
const { listProductCategoryNames, resolveProductCategory } = require('./productCategory');
const { evaluatePublicText } = require('./listingModeration');

const FAILURE_COOLDOWN_MS = 10 * 60 * 1000;
const inFlight = new Map();
const failedAt = new Map();

/** "Other" stores have nothing in common, so each one keeps its own list. */
function shopKeyFor(shop) {
  const type = String(shop?.category || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!type || type === 'other') return shop?._id ? `shop:${shop._id}` : '';
  return type;
}

async function linkedCategories(key) {
  if (!key) return [];
  return Category.find({ type: 'product', isActive: true, shopKeys: key }).sort({ sortOrder: 1, name: 1 });
}

async function linkCategoryToShop(categoryId, shop) {
  const key = shopKeyFor(shop);
  if (!key || !categoryId) return;
  await Category.updateOne({ _id: categoryId, type: 'product' }, { $addToSet: { shopKeys: key } });
}

async function suggestAndLink(shop, key) {
  const existing = await listProductCategoryNames();
  const { categories } = await suggestShopCategories({
    type: String(shop.category || 'Other').trim(),
    name: String(shop.name || '').trim().slice(0, 80),
    description: String(shop.description || '').trim().slice(0, 300),
    existing: existing.slice(0, 60),
  });
  const ids = [];
  for (const name of categories || []) {
    const check = await evaluatePublicText({ title: name, category: name }, 'listing');
    if (!check.ok) continue;
    const resolved = await resolveProductCategory({ name, createIfMissing: true });
    if (resolved?.id && !ids.includes(resolved.id)) ids.push(resolved.id);
  }
  if (ids.length) {
    await Category.updateMany({ _id: { $in: ids }, type: 'product' }, { $addToSet: { shopKeys: key } });
  }
  return ids.length;
}

/**
 * Product categories for this seller's store. When none are linked yet, Gemini suggests
 * them once and they are saved for every store of the same type.
 * Returns { categories, suggested }; `categories` is empty when nothing could be found.
 */
async function categoriesForShop(shop, { allowAi = true } = {}) {
  const key = shopKeyFor(shop);
  if (!key) return { categories: [], suggested: false };
  const linked = await linkedCategories(key);
  if (linked.length || !allowAi) return { categories: linked, suggested: false };
  if (Date.now() - (failedAt.get(key) || 0) < FAILURE_COOLDOWN_MS) {
    return { categories: [], suggested: false };
  }

  if (!inFlight.has(key)) {
    inFlight.set(
      key,
      suggestAndLink(shop, key)
        .catch((error) => {
          failedAt.set(key, Date.now());
          console.warn('[ai] shop categories failed:', error.message || error);
          return 0;
        })
        .finally(() => inFlight.delete(key)),
    );
  }
  const count = await inFlight.get(key);
  if (!count) return { categories: [], suggested: false };
  return { categories: await linkedCategories(key), suggested: true };
}

module.exports = { categoriesForShop, linkCategoryToShop, shopKeyFor };
