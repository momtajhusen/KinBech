const { isPrivateRef, refOwnerId, withViewUrls } = require('./privateMedia');
const { openField } = require('./fieldCrypto');

function normalizeTaxId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Only private document refs uploaded by this owner are accepted. Older public URLs
 * are kept only if the shop already had them.
 */
function parseBusinessDocuments(raw, { ownerId = '', existing = [] } = {}) {
  if (!Array.isArray(raw)) return null;
  const known = new Set((existing || []).map((doc) => String(doc?.url || '')));
  const allowed = (url) =>
    (isPrivateRef(url) && refOwnerId(url) === String(ownerId)) || known.has(url);
  return raw
    .map((doc) => {
      if (!doc) return null;
      const url = String(typeof doc === 'string' ? doc : doc.url || '').trim();
      if (!url || !allowed(url)) return null;
      return {
        url,
        label: String(doc.label || 'Business document').trim().slice(0, 60) || 'Business document',
        uploadedAt: doc.uploadedAt ? new Date(doc.uploadedAt) : new Date(),
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function hasVerificationMaterial(shopLike) {
  return Boolean(
    normalizeTaxId(shopLike.panNumber) ||
      normalizeTaxId(shopLike.vatNumber) ||
      (Array.isArray(shopLike.businessDocuments) && shopLike.businessDocuments.length > 0)
  );
}

/**
 * When seller adds/updates tax IDs or docs, mark shop pending review
 * (does not auto-grant isVerified).
 */
function markVerificationPending(shop) {
  if (!hasVerificationMaterial(shop)) {
    if (shop.verificationStatus === 'none' || !shop.verificationStatus) {
      shop.verificationStatus = 'none';
    }
    return;
  }
  if (shop.isVerified && shop.verificationStatus === 'approved') {
    // Already verified — keep badge; admin can re-check on edit if needed
    return;
  }
  if (shop.verificationStatus !== 'pending' && Array.isArray(shop.verificationHistory)) {
    shop.verificationHistory.push({ action: 'submitted', by: shop.owner?._id || shop.owner || null, byName: 'Shop owner' });
  }
  shop.verificationStatus = 'pending';
  shop.verificationSubmittedAt = new Date();
}

function shopPublicFields(shop) {
  const obj = shop.toObject ? shop.toObject() : shop;
  return {
    id: obj._id,
    _id: obj._id,
    owner: obj.owner?._id ? String(obj.owner._id) : obj.owner ? String(obj.owner) : null,
    name: obj.name,
    category: obj.category,
    description: obj.description,
    phone: obj.phone,
    address: obj.address,
    location: obj.location,
    openingHours: obj.openingHours,
    logo: obj.logo,
    coverImage: obj.coverImage || '',
    tagline: obj.tagline || '',
    whatsapp: obj.whatsapp || '',
    email: obj.email || '',
    website: obj.website || '',
    socialLinks: obj.socialLinks || {},
    openDays: Array.isArray(obj.openDays) ? obj.openDays : [],
    deliveryAvailable: Boolean(obj.deliveryAvailable),
    deliveryAreas: obj.deliveryAreas || '',
    paymentMethods: Array.isArray(obj.paymentMethods) ? obj.paymentMethods : [],
    returnPolicy: obj.returnPolicy || '',
    establishedYear: obj.establishedYear || null,
    coordinates: obj.coordinates,
    isVerified: Boolean(obj.isVerified),
    verificationStatus: obj.verificationStatus || 'none',
    ratingAverage: obj.ratingAverage,
    reviewCount: obj.reviewCount,
    followersCount: obj.followersCount,
    profileViews: obj.profileViews,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

/** Owner/admin view: public fields plus tax IDs, documents and review notes. */
function shopOwnerFields(shop) {
  if (!shop) return null;
  const obj = shop.toObject ? shop.toObject() : shop;
  return {
    ...shopPublicFields(obj),
    panNumber: openField(obj.panNumber),
    vatNumber: openField(obj.vatNumber),
    businessDocuments: withViewUrls(obj.businessDocuments),
    verificationNotes: obj.verificationNotes || '',
    verificationSubmittedAt: obj.verificationSubmittedAt || null,
  };
}

module.exports = {
  shopOwnerFields,
  normalizeTaxId,
  parseBusinessDocuments,
  hasVerificationMaterial,
  markVerificationPending,
  shopPublicFields,
};
