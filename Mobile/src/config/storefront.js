export const STOREFRONT_BASE_URL = (
  process.env.EXPO_PUBLIC_STOREFRONT_URL || 'https://kinbech.app'
).replace(/\/+$/, '');

export function buildStorefrontUrl(shopId) {
  if (!shopId) return null;
  return `${STOREFRONT_BASE_URL}/seller/${String(shopId)}?source=storefront`;
}
