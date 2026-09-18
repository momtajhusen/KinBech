import Constants from 'expo-constants';
import { NativeModules, Platform } from 'react-native';
import { PRODUCTION_API_URL } from './productionApi';

const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const API_PORT = Number(process.env.EXPO_PUBLIC_API_PORT) || 5001;

function sanitizeUrlPiece(raw) {
  return String(raw || '')
    .trim()
    .replace(/^`+|`+$/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/^"+|"+$/g, '')
    .trim();
}

function normalizeHost(raw) {
  const h = sanitizeUrlPiece(raw).toLowerCase();
  if (!h) return null;
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0') {
    return null;
  }
  if (IPV4.test(h)) return h;
  return null;
}

function parseHostFromAny(value) {
  if (!value || typeof value !== 'string') return null;
  let text = sanitizeUrlPiece(value);
  try {
    text = decodeURIComponent(text);
  } catch {
    /* keep raw */
  }

  const ipv4Match = text.match(/(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?/);
  const fromIpv4 = normalizeHost(ipv4Match?.[1]);
  if (fromIpv4) return fromIpv4;

  const schemeMatch = text.match(/(?:https?|exp|exps):\/\/([^/:]+)/i);
  return normalizeHost(schemeMatch?.[1]);
}

function readScriptURL() {
  try {
    return NativeModules.SourceCode?.scriptURL || null;
  } catch {
    return null;
  }
}

function readMetroHost() {
  const candidates = [
    readScriptURL(),
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.expoGoConfig?.hostUri,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    Constants.manifest2?.extra?.expoGo?.debuggerHost,
    Constants.manifest?.debuggerHost,
    Constants.manifest?.hostUri,
    Constants.linkingUri,
    Constants.experienceUrl,
  ];

  for (const uri of candidates) {
    const host = parseHostFromAny(uri);
    if (host) return host;
  }
  return null;
}

function resolveDevMachineHostPort() {
  const metroHost = readMetroHost();
  if (metroHost) {
    return { host: metroHost, port: API_PORT };
  }

  if (Platform.OS === 'android') {
    return { host: '10.0.2.2', port: API_PORT };
  }

  const envHost = normalizeHost(process.env.EXPO_PUBLIC_DEV_API_HOST);
  if (envHost) {
    console.log('Using forced dev API host:', envHost);
    return { host: envHost, port: API_PORT };
  }

  return { host: '127.0.0.1', port: API_PORT };
}

function resolveProductionApiUrl() {
  const fromEnv = sanitizeUrlPiece(process.env.EXPO_PUBLIC_API_URL).replace(/\/$/, '');
  if (fromEnv) return fromEnv;

  const fromConfig = sanitizeUrlPiece(PRODUCTION_API_URL).replace(/\/$/, '');
  if (fromConfig && !fromConfig.includes('REPLACE_WITH_LIVE_API')) {
    return fromConfig;
  }

  console.warn(
    '[KinBech] Production API URL missing. Set EXPO_PUBLIC_API_URL or Mobile/src/config/productionApi.js',
  );
  return '';
}

export function getApiBaseUrl() {
  // Local Expo / Metro: always prefer LAN/localhost — never force VPS.
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    const { host, port } = resolveDevMachineHostPort();
    const url = `http://${sanitizeUrlPiece(host)}:${port}`;
    console.log('Using local dev API:', url);
    return url;
  }

  return resolveProductionApiUrl();
}

export function getApiBaseUrlCandidates() {
  const primary = getApiBaseUrl();
  const set = new Set();
  if (primary) set.add(primary);

  // Production APK: only hit the live API.
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return Array.from(set);
  }

  if (process.env.EXPO_PUBLIC_DEV_API_HOST) {
    console.log('Using forced dev host, skipping other candidates');
    return Array.from(set);
  }

  const metro = readMetroHost();
  if (metro) set.add(`http://${metro}:${API_PORT}`);

  if (Platform.OS === 'android') {
    set.add(`http://10.0.2.2:${API_PORT}`);
  }

  if (Platform.OS === 'ios') {
    set.add(`http://127.0.0.1:${API_PORT}`);
  }

  return Array.from(set);
}
