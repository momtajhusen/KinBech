import AsyncStorage from '@react-native-async-storage/async-storage';
import { toCardItem } from './listing';

const KEY = '@kinbech_recently_viewed_v1';
const MAX_ITEMS = 16;

let memory = [];

export function getRecentlyViewed() {
  return memory;
}

export async function loadRecentlyViewed() {
  if (memory.length) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    memory = Array.isArray(parsed) ? parsed.filter((item) => item?.id) : [];
  } catch {
    memory = [];
  }
  return memory;
}

export function clearRecentlyViewed() {
  memory = [];
  AsyncStorage.removeItem(KEY).catch(() => {});
  return memory;
}

export function rememberViewedListing(source) {
  if (!source) return memory;
  const card = source.photo && source.id && !source.photos
    ? source
    : toCardItem(source.listing || source);
  if (!card?.id) return memory;
  memory = [card, ...memory.filter((item) => String(item.id) !== String(card.id))].slice(0, MAX_ITEMS);
  AsyncStorage.setItem(KEY, JSON.stringify(memory)).catch(() => {});
  return memory;
}
