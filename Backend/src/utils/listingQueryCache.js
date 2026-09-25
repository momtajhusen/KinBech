/**
 * In-memory TTL cache for popular listing list / search / category-count queries.
 * Avoids repeating expensive compound filters (price + category + distance) for a few minutes.
 */

const DEFAULT_TTL_MS = 7 * 60 * 1000; // 7 minutes (within 5–10 min)
const MAX_ENTRIES = 200;

const store = new Map();

function pruneExpired(now = Date.now()) {
  for (const [key, entry] of store.entries()) {
    if (entry.expiresAt <= now) store.delete(key);
  }
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

function normalizeCoord(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(2);
}

/**
 * Stable cache key from endpoint + query. Rounds lat/lng so nearby users share cache.
 */
function buildListingCacheKey(endpoint, query = {}) {
  const keys = Object.keys(query || {}).sort();
  const parts = [endpoint];
  for (const key of keys) {
    let value = query[key];
    if (value == null || value === '') continue;
    if (key === 'lat' || key === 'lng') {
      value = normalizeCoord(value);
      if (!value) continue;
    } else {
      value = String(value).trim().toLowerCase();
    }
    parts.push(`${key}=${value}`);
  }
  return parts.join('|');
}

function get(key) {
  pruneExpired();
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }
  // refresh LRU order
  store.delete(key);
  store.set(key, entry);
  return entry.payload;
}

function set(key, payload, ttlMs = DEFAULT_TTL_MS) {
  pruneExpired();
  if (store.has(key)) store.delete(key);
  store.set(key, {
    payload,
    expiresAt: Date.now() + Math.max(60_000, ttlMs),
  });
  while (store.size > MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }
}

function invalidateAll() {
  store.clear();
}

module.exports = {
  DEFAULT_TTL_MS,
  buildListingCacheKey,
  get,
  set,
  invalidateAll,
};
