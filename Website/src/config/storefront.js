import { PRODUCTION_API_URL } from '../productionApi';

function siteFromApiBase(apiBase) {
  const raw = String(apiBase || '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^kinbechapi\./i, 'kinbech.');
    return `${url.protocol}//${host}`;
  } catch {
    return 'https://kinbech.codersalpha.com';
  }
}

const fromEnv = String(import.meta.env.VITE_STOREFRONT_URL || '').trim();
const useApiSite = !fromEnv || /kinbech\.app/i.test(fromEnv);

export const STOREFRONT_BASE_URL = (
  useApiSite
    ? siteFromApiBase(import.meta.env.VITE_API_URL || PRODUCTION_API_URL)
    : fromEnv
).replace(/\/+$/, '');

export function buildStorefrontUrl(shopId) {
  if (!shopId) return null;
  return `${STOREFRONT_BASE_URL}/seller/${String(shopId)}?source=storefront`;
}
