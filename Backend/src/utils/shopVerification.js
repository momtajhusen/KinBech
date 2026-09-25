function normalizeTaxId(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function parseBusinessDocuments(raw) {
  if (!Array.isArray(raw)) return null;
  return raw
    .map((doc) => {
      if (!doc) return null;
      if (typeof doc === 'string') {
        const url = doc.trim();
        if (!url) return null;
        return { url, label: 'Business document', uploadedAt: new Date() };
      }
      const url = String(doc.url || '').trim();
      if (!url) return null;
      return {
        url,
        label: String(doc.label || 'Business document').trim() || 'Business document',
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
  shop.verificationStatus = 'pending';
  shop.verificationSubmittedAt = new Date();
}

function shopPublicFields(shop) {
  const obj = shop.toObject ? shop.toObject() : shop;
  return {
    id: obj._id,
    _id: obj._id,
    name: obj.name,
    category: obj.category,
    description: obj.description,
    phone: obj.phone,
    address: obj.address,
    location: obj.location,
    openingHours: obj.openingHours,
    logo: obj.logo,
    coordinates: obj.coordinates,
    isVerified: Boolean(obj.isVerified),
    panNumber: obj.panNumber || '',
    vatNumber: obj.vatNumber || '',
    businessDocuments: Array.isArray(obj.businessDocuments) ? obj.businessDocuments : [],
    verificationStatus: obj.verificationStatus || 'none',
    verificationNotes: obj.verificationNotes || '',
    verificationSubmittedAt: obj.verificationSubmittedAt || null,
    ratingAverage: obj.ratingAverage,
    reviewCount: obj.reviewCount,
    followersCount: obj.followersCount,
    profileViews: obj.profileViews,
    status: obj.status,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
  };
}

module.exports = {
  normalizeTaxId,
  parseBusinessDocuments,
  hasVerificationMaterial,
  markVerificationPending,
  shopPublicFields,
};
