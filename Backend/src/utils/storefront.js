const DEFAULT_STOREFRONT_BASE = 'https://kinbech.app';

function getStorefrontBaseUrl() {
  const configured = String(process.env.STOREFRONT_BASE_URL || '').trim();
  return (configured || DEFAULT_STOREFRONT_BASE).replace(/\/+$/, '');
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
