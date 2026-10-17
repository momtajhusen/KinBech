import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@kinbech_home_listings_v3';
const EXPLORE_KEY = '@kinbech_explore_catalog_v3';
const TTL_MS = 90_000;

/** @type {{ listings: any[], location?: string, coords?: { lat: number|null, lng: number|null }, fetchedAt: number } | null} */
let memory = null;
/** @type {{ products: any[], featured: any[], popular: any[], nearby: any[], shops: any[], fetchedAt: number } | null} */
let exploreMemory = null;
const searchMemory = new Map();

export function catalogFingerprint(items) {
  return (items || [])
    .map((item) => {
      const id = item?.id || item?._id || '';
      const price = item?.listing?.price ?? item?.price ?? '';
      const title = item?.title || item?.listing?.title || item?.name || '';
      const photo = item?.photo || item?.listing?.photos?.[0] || item?.photos?.[0] || item?.avatarUrl || '';
      return `${id}|${price}|${title}|${photo}`;
    })
    .sort()
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

export function setHomeListingsCache(payload) {
  memory = {
    listings: payload.listings || [],
    location: payload.location || '',
    coords: payload.coords || { lat: null, lng: null },
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
    if (!parsed?.listings?.length) return null;
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
