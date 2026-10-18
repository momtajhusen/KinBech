import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@kinbech_recent_searches_v1';
const MAX_ITEMS = 10;

let memory = null;

export async function loadRecentSearches() {
  if (memory) return memory;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    memory = Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    memory = [];
  }
  return memory;
}

function persist(next) {
  memory = next;
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export function rememberSearch(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!clean) return memory || [];
  const key = clean.toLowerCase();
  return persist([clean, ...(memory || []).filter((item) => item.toLowerCase() !== key)].slice(0, MAX_ITEMS));
}

export function forgetSearch(text) {
  return persist((memory || []).filter((item) => item !== text));
}

export function clearRecentSearches() {
  return persist([]);
}
