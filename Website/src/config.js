import { PRODUCTION_API_URL } from './productionApi';

function sanitize(url) {
  return String(url || '')
    .trim()
    .replace(/\/$/, '');
}

/**
 * Local `vite` → empty base (proxy to localhost:5001).
 * Production `vite build` → live VPS API.
 */
function resolveApiBase() {
  const fromEnv = sanitize(import.meta.env.VITE_API_URL);
  if (fromEnv) return fromEnv;

  if (import.meta.env.PROD) {
    const fromConfig = sanitize(PRODUCTION_API_URL);
    if (fromConfig && !fromConfig.includes('REPLACE_WITH_LIVE_API')) {
      return fromConfig;
    }
    console.warn(
      '[KinBech] Production API URL missing. Set VITE_API_URL or Website/src/config/productionApi.js',
    );
  }

  return '';
}

export const API_BASE = resolveApiBase();

export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  return API_BASE ? `${API_BASE}${p}` : p;
}
