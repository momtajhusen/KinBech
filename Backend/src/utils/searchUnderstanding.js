const { voiceSearchQuery } = require('./aiSuggest');
const { listProductCategoryNames } = require('./productCategory');

// Letters outside plain English (Devanagari and any other script).
const OTHER_SCRIPT = /[^\u0000-\u024F\s\p{N}\p{P}\p{S}]/u;

const CACHE_MAX = 500;
const CACHE_MS = 24 * 60 * 60 * 1000;
const cache = new Map();

// Server sort names for the AI's sort words.
const SORTS = {
  'price-low': 'price-low',
  'price-high': 'price-high',
  newest: 'newest',
  popular: 'trending',
  nearby: 'distance',
};

const keyOf = (text) => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();

const isUseful = (search) => Boolean(search && (
  search.query || search.category || search.minPrice || search.maxPrice || search.condition || search.nearby
  || (search.sort && search.sort !== 'relevance') || search.where?.length || search.order?.length
));

/**
 * True when typed words go to the AI before searching: any non-English script, or more than one word (a sentence can
 * hold items, filters and an order in any language). One plain word is searched as text first (see `searchListings`).
 */
function needsUnderstanding(text) {
  const words = keyOf(text);
  if (!words) return false;
  return OTHER_SCRIPT.test(words) || (words.split(' ').length > 1 && words.length >= 5);
}

/** Keeps a search the AI already built for these words (e.g. a voice search), so the listing search reuses it. */
function rememberSearch(text, search) {
  const key = keyOf(text);
  if (!key || !isUseful(search)) return;
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), search });
}

/** True when the AI already built a search for these words (e.g. the English phrase of a voice search). */
function isRemembered(text) {
  const hit = cache.get(keyOf(text));
  return Boolean(hit && Date.now() - hit.at < CACHE_MS);
}

/** The typed or spoken words as one search (item words, category, price range, condition, sort), or null. */
async function understandSearch(text, userId = '') {
  const key = keyOf(text);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.search;
  const categories = (await listProductCategoryNames()).slice(0, 80);
  const search = await voiceSearchQuery({ text: key, categories, userId: String(userId || '') });
  if (!isUseful(search)) return null;
  rememberSearch(key, search);
  return search;
}

/** The listing search query with the understood search filled in; what the buyer chose in the app wins. */
function applyUnderstoodSearch(query, search) {
  const next = { ...query, q: search.query || '' };
  delete next.alt;
  if (search.query && search.alts?.length) next.alt = search.alts.join(',');
  if (search.category && (!next.category || next.category === 'All')) next.category = search.category;
  if (search.minPrice && !next.minPrice) next.minPrice = String(search.minPrice);
  if (search.maxPrice && !next.maxPrice) next.maxPrice = String(search.maxPrice);
  if (search.condition && !next.condition) next.condition = search.condition;
  if (SORTS[search.sort] && (!next.sort || next.sort === 'relevance')) next.sort = SORTS[search.sort];
  // Any other logic the buyer asked for (seller, place, post age, rating...) goes as-is to search (see searchLogic).
  if (search.where?.length && !next.where) next.where = JSON.stringify(search.where);
  if (search.order?.length && !next.order) next.order = JSON.stringify(search.order);
  return next;
}

module.exports = { applyUnderstoodSearch, isRemembered, needsUnderstanding, rememberSearch, understandSearch };
