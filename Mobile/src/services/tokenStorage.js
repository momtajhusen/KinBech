import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'kinbech_token';
const REFRESH_KEY = 'kinbech_refresh_token';

// Builds made before expo-secure-store was added lack the native module; fall back until rebuilt.
let SecureStore = null;
try {
  SecureStore = require('expo-secure-store');
} catch {
  SecureStore = null;
}

let secureChecked = null;

async function canUseSecureStore() {
  if (!SecureStore) return false;
  if (secureChecked === null) {
    try {
      secureChecked = await SecureStore.isAvailableAsync();
    } catch {
      secureChecked = false;
    }
  }
  return secureChecked;
}

async function readKey(key) {
  if (!(await canUseSecureStore())) {
    return AsyncStorage.getItem(key);
  }
  try {
    const stored = await SecureStore.getItemAsync(key);
    if (stored) return stored;
  } catch {
    return AsyncStorage.getItem(key);
  }
  const legacy = await AsyncStorage.getItem(key);
  if (legacy) {
    try {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    } catch {
      // keep the legacy copy so the user stays signed in
    }
  }
  return legacy;
}

async function writeKey(key, value) {
  if (await canUseSecureStore()) {
    try {
      await SecureStore.setItemAsync(key, value);
      await AsyncStorage.removeItem(key);
      return;
    } catch {
      // fall through to AsyncStorage
    }
  }
  await AsyncStorage.setItem(key, value);
}

async function clearKey(key) {
  await AsyncStorage.removeItem(key);
  if (await canUseSecureStore()) {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch {
      // nothing stored
    }
  }
}

export function readToken() {
  return readKey(TOKEN_KEY);
}

export async function writeToken(token) {
  if (!token) return clearToken();
  return writeKey(TOKEN_KEY, token);
}

export async function clearToken() {
  await clearKey(TOKEN_KEY);
  await clearKey(REFRESH_KEY);
}

export function readRefreshToken() {
  return readKey(REFRESH_KEY);
}

export async function writeRefreshToken(token) {
  if (!token) return clearKey(REFRESH_KEY);
  return writeKey(REFRESH_KEY, token);
}
