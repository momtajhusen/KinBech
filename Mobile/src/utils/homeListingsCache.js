import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@kinbech_home_listings';
const TTL_MS = 90_000;

/** @type {{ listings: any[], location?: string, coords?: { lat: number|null, lng: number|null }, fetchedAt: number } | null} */
let memory = null;

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
