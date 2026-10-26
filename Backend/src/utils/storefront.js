const DEFAULT_STOREFRONT_BASE = 'https://kinbech.codersalpha.com';

function siteFromApiBase(apiBase) {
  const raw = String(apiBase || '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^kinbechapi\./i, 'kinbech.');
    return `${url.protocol}//${host}`;
  } catch {
    return DEFAULT_STOREFRONT_BASE;
  }
}

function getStorefrontBaseUrl() {
  const configured = String(process.env.STOREFRONT_BASE_URL || '').trim();
  if (configured && !/kinbech\.app/i.test(configured)) {
    return configured.replace(/\/+$/, '');
  }
  const apiBase = String(process.env.PUBLIC_API_URL || process.env.API_PUBLIC_URL || '').trim();
  if (apiBase) return siteFromApiBase(apiBase);
  return DEFAULT_STOREFRONT_BASE;
}

function buildStorefrontUrl(shopId) {
  if (!shopId) return null;
  return `${getStorefrontBaseUrl()}/seller/${String(shopId)}?source=storefront`;
}

function buildStorefrontPayload(shop) {
  if (!shop) return null;
  const shopId = shop._id || shop.id;
  const url = buildStorefrontUrl(shopId);
  return {
    shopId: String(shopId),
    shopName: shop.name || 'Shop',
    category: shop.category || '',
    location: shop.location || shop.address || '',
    isVerified: Boolean(shop.isVerified),
    logo: shop.logo || '',
    url,
    followHint: 'Scan to view and follow this shop on KinBech',
  };
}

module.exports = {
  DEFAULT_STOREFRONT_BASE,
  getStorefrontBaseUrl,
  buildStorefrontUrl,
  buildStorefrontPayload,
};
