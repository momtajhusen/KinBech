import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@kinbech_home_listings_v3';
const EXPLORE_KEY = '@kinbech_explore_catalog_v3';
const TTL_MS = 300_000; // 5 minutes - longer cache for faster perceived performance
const EXPLORE_TTL_MS = 300_000; // 5 minutes for explore cache

/** @type {{ listings: any[], location?: string, coords?: { lat: number|null, lng: number|null }, fetchedAt: number } | null} */
let memory = null;
/** @type {{ location: string, coords: { lat: number, lng: number } | null } | null} */
let placeMemory = null;

function placeFromCatalog() {
  if (!memory?.location && memory?.coords?.lat == null) return null;
  return {
    location: memory?.location || '',
    coords: memory?.coords?.lat != null ? memory.coords : null,
  };
}

/** Latest place shown on Home. Sell form reads this so it does not wait on GPS. */
export function getHomePlace() {
  if (placeMemory?.location || placeMemory?.coords?.lat != null) return placeMemory;
  return placeFromCatalog();
}

export function setHomePlace({ location, coords } = {}) {
  const prev = placeMemory || placeFromCatalog();
  const next = {
    location: location ? location : prev?.location || '',
    coords:
      coords?.lat != null && coords?.lng != null
        ? { lat: coords.lat, lng: coords.lng }
        : prev?.coords?.lat != null
          ? prev.coords
          : null,
  };
  if (!next.location && next.coords?.lat == null) return null;
  placeMemory = next;
  if (memory) {
    memory = {
      ...memory,
      location: next.location || memory.location,
      coords: next.coords || memory.coords,
    };
  }
  return placeMemory;
}
/** @type {{ products: any[], featured: any[], popular: any[], nearby: any[], shops: any[], fetchedAt: number } | null} */
let exploreMemory = null;
const searchMemory = new Map();
/** Testers and the public see different catalogs; a cache from the other side is never shown. */
let audience = 'public';

export function setCacheAudience(next) {
  const value = next === 'test' ? 'test' : 'public';
  if (value === audience) return;
  audience = value;
  memory = null;
  exploreMemory = null;
  searchMemory.clear();
}

export function catalogFingerprint(items) {
  return (items || [])
    .map((item) => {
      const id = item?.id || item?._id || '';
      const price = item?.listing?.price ?? item?.price ?? '';
      const title = item?.title || item?.listing?.title || item?.name || '';
      const photo = item?.photo || item?.listing?.photos?.[0] || item?.photos?.[0] || item?.avatarUrl || '';
      return `${id}|${price}|${title}|${photo}`;
    })
    .join('\n');
}

export function sameCatalog(prev, next) {
  return catalogFingerprint(prev) === catalogFingerprint(next);
}

export function getHomeListingsMemory() {
  return memory;
}

export function isHomeListingsFresh(maxAgeMs = TTL_MS) {
  return Boolean(memory?.listings?.length && Date.now() - memory.fetchedAt < maxAgeMs);
}

export function isExploreFresh(maxAgeMs = EXPLORE_TTL_MS) {
  return Boolean(
    (exploreMemory?.products?.length ||
      exploreMemory?.featured?.length ||
      exploreMemory?.popular?.length ||
      exploreMemory?.nearby?.length) &&
      Date.now() - exploreMemory.fetchedAt < maxAgeMs
  );
}

export function setHomeListingsCache(payload) {
  memory = {
    listings: payload.listings || [],
    location: payload.location || '',
    coords: payload.coords || { lat: null, lng: null },
    personalized: Boolean(payload.personalized),
    audience,
    fetchedAt: Date.now(),
  };
  AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => {});
  return memory;
}

export async function loadHomeListingsCache() {
  if (memory?.listings?.length) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.listings?.length || (parsed.audience || 'public') !== audience) return null;
    memory = parsed;
    return memory;
  } catch {
    return null;
  }
}

export function getExploreMemory() {
  return exploreMemory;
}

export function setExploreMemory(payload) {
  exploreMemory = {
    products: payload.products || [],
    featured: payload.featured || [],
    popular: payload.popular || [],
    nearby: payload.nearby || [],
    shops: payload.shops || exploreMemory?.shops || [],
    audience,
    fetchedAt: Date.now(),
  };
  AsyncStorage.setItem(EXPLORE_KEY, JSON.stringify(exploreMemory)).catch(() => {});
  return exploreMemory;
}

export async function loadExploreCache() {
  if (exploreMemory?.products?.length || exploreMemory?.featured?.length) return exploreMemory;
  try {
    const raw = await AsyncStorage.getItem(EXPLORE_KEY);
    if (!raw) return exploreMemory;
    const parsed = JSON.parse(raw);
    if (!parsed?.products?.length && !parsed?.featured?.length && !parsed?.shops?.length) return null;
    if ((parsed.audience || 'public') !== audience) return null;
    exploreMemory = parsed;
    return exploreMemory;
  } catch {
    return null;
  }
}

export function readSearchMemory(key) {
  return searchMemory.get(key) || null;
}

export function writeSearchMemory(key, payload) {
  searchMemory.set(key, payload);
}
