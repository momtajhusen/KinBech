const { publicUser } = require('./token');
const { serializeVariantsForPayload } = require('./listingVariants');
const { isListingFeatured, featuredTrustBoost } = require('./referral');
const { coordsForPlaceName } = require('./nepalLocations');

function pickCoords(source) {
  if (!source) return null;
  const c = source.coordinates || source;
  const lat = Number(c.lat != null ? c.lat : c.latitude);
  const lng = Number(c.lng != null ? c.lng : c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function listingPoint(listing) {
  const own = pickCoords(listing);
  if (own) return own;
  if (listing?.sellerType === 'shop' || listing?.shopId) {
    const shop = pickCoords(listing.shopId);
    if (shop) return shop;
  }
  const named = coordsForPlaceName(listing?.location);
  if (named) return named;
  const seller = pickCoords(listing?.seller);
  if (seller) return seller;
  const sellerCity = coordsForPlaceName(listing?.seller?.location);
  if (sellerCity) return sellerCity;
  return coordsForPlaceName(listing?.shopId?.location || listing?.shopId?.address);
}

/**
 * Individual (OTP) sellers → Phone Verified
 * Business-verified shops → Business Verified
 */
function resolveListingVerification(listing) {
  const sellerType = listing?.sellerType || 'individual';
  if (sellerType === 'shop') {
    const shop = listing.shopId;
    const isVerified = Boolean(
      shop && (shop.isVerified === true || shop.isVerified === 'true')
    );
    if (isVerified) {
      return {
        verified: true,
        verificationKind: 'business',
        verificationLabel: 'Business Verified',
        trustBoost: 25,
      };
    }
    return {
      verified: false,
      verificationKind: null,
      verificationLabel: null,
      trustBoost: 0,
    };
  }

  // Individual — KinBech accounts are created via phone OTP
  const seller = listing?.seller;
  if (!seller) {
    return {
      verified: false,
      verificationKind: null,
      verificationLabel: null,
      trustBoost: 0,
    };
  }
  const phone = String(seller.phone || seller.phoneNumber || '').trim();
  const hasSeller = Boolean(seller._id || seller.id);
  if (phone || hasSeller) {
    return {
      verified: true,
      verificationKind: 'phone',
      verificationLabel: 'Phone Verified',
      trustBoost: 12,
    };
  }

  return {
    verified: false,
    verificationKind: null,
    verificationLabel: null,
    trustBoost: 0,
  };
}

function listingTrustBoost(listing) {
  return (resolveListingVerification(listing).trustBoost || 0) + featuredTrustBoost(listing);
}

function listingPayload(listing, distanceKm, extras = {}) {
  if (!listing) return null;

  // Resolve verification from raw populated docs (before publicUser hides phone)
  const verification = resolveListingVerification(listing);
  const featured = isListingFeatured(listing);

  // KinBech accounts are created via phone OTP, so the registered number is always
  // exposed here — the item detail screen needs it to place a call.
  const seller = listing.seller && listing.seller._id
    ? { ...publicUser(listing.seller), phone: String(listing.seller.phone || '') }
    : listing.seller;

  const shop = listing.shopId && listing.shopId._id
    ? {
        id: listing.shopId._id,
        name: listing.shopId.name,
        logo: listing.shopId.logo,
        coverImage: listing.shopId.coverImage || '',
        tagline: listing.shopId.tagline || '',
        ratingAverage: listing.shopId.ratingAverage,
        reviewCount: listing.shopId.reviewCount,
        isVerified: listing.shopId.isVerified,
        phone: listing.shopId.phone || '',
        location: listing.shopId.location || listing.shopId.address || '',
        coordinates: listing.shopId.coordinates,
      }
    : listing.shopId;

  const point = listingPoint(listing);
  const variantFields =
    listing.sellerType === 'shop' ? serializeVariantsForPayload(listing) : {};

  return {
    id: listing._id,
    title: listing.title,
    description: listing.description,
    price: listing.price,
    currency: listing.currency,
    category: listing.category,
    condition: listing.condition,
    photos: listing.photos,
    location: listing.location,
    coordinates: point,
    meetupOption: listing.meetupOption,
    status: listing.status,
    moderationReason: listing.moderationReason || '',
    matchedKeywords: Array.isArray(listing.matchedKeywords) ? listing.matchedKeywords : [],
    heldAt: listing.heldAt || null,
    views: Number(listing.views) || 0,
    searchWords: Array.isArray(listing.searchWords)
      ? listing.searchWords.map((word) => String(word || '').trim()).filter(Boolean)
      : [],
    seller,
    sellerType: listing.sellerType || 'individual',
    shopId: shop,
    verified: verification.verified,
    verificationKind: verification.verificationKind,
    verificationLabel: verification.verificationLabel,
    isFeatured: featured,
    featuredUntil: featured ? listing.featuredUntil : null,
    featuredSource: featured ? listing.featuredSource || '' : '',
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    distanceKm:
      typeof distanceKm === 'number' && Number.isFinite(distanceKm)
        ? Math.round(distanceKm * 10) / 10
        : null,
    ...variantFields,
    ...(extras.chats != null ? { chats: Number(extras.chats) || 0 } : {}),
  };
}

function parsePrice(value) {
  if (value == null || value === '') return NaN;
  return Number(String(value).replace(/,/g, '').replace(/[^\d.]/g, ''));
}

function haversineDistanceKm(aLat, aLng, bLat, bLng) {
  const latA = Number(aLat);
  const lngA = Number(aLng);
  const latB = Number(bLat);
  const lngB = Number(bLng);
  if (![latA, lngA, latB, lngB].every(Number.isFinite)) {
    return null;
  }
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(latB - latA);
  const dLng = toRad(lngB - lngA);
  const lat1 = toRad(latA);
  const lat2 = toRad(latB);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

module.exports = {
  listingPayload,
  parsePrice,
  haversineDistanceKm,
  listingPoint,
  resolveListingVerification,
  listingTrustBoost,
};
