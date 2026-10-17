import { coordsForPlaceName, haversineKm } from './locations';
import { formatListingPrice } from './listingVariants';
import { getApiBaseUrlCandidates } from '../config/apiUrl';

const CATEGORY_ICONS = {
  Mobiles: 'phone-portrait-outline',
  Laptops: 'laptop-outline',
  Electronics: 'headset-outline',
  Furniture: 'file-tray-stacked-outline',
  Vehicles: 'car-outline',
  'Sports & Fitness': 'bicycle-outline',
  Fashion: 'shirt-outline',
};

export function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('file:') || trimmed.startsWith('content:')) {
    return trimmed;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/uploads/')) {
        const base = (
          process.env.EXPO_PUBLIC_API_URL ||
          getApiBaseUrlCandidates()?.[0] ||
          ''
        ).replace(/\/$/, '');
        return base ? `${base}${parsed.pathname}` : trimmed;
      }
    } catch {
      /* keep */
    }
    return trimmed;
  }
  const path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const base = (
    process.env.EXPO_PUBLIC_API_URL ||
    getApiBaseUrlCandidates()?.[0] ||
    ''
  ).replace(/\/$/, '');
  return base ? `${base}${path}` : path;
}

export function formatPrice(price) {
  const amount = Number(price) || 0;
  return `₹${amount.toLocaleString('en-IN')}`;
}

/** Fisher–Yates shuffle — returns a new array, does not mutate input. */
export function shuffleArray(items) {
  const arr = Array.isArray(items) ? [...items] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

export function timeAgo(dateValue) {
  if (!dateValue) return '';
  const then = new Date(dateValue).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `Posted ${days} day${days === 1 ? '' : 's'} ago`;
}

export function categoryIcon(category) {
  return CATEGORY_ICONS[category] || 'cube-outline';
}

export function formatDistanceLabel(km) {
  if (km == null || !Number.isFinite(km)) {
    return null;
  }
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

function readPoint(source) {
  if (!source || typeof source !== 'object') return null;
  const c = source.coordinates && typeof source.coordinates === 'object' ? source.coordinates : source;
  const lat = Number(c.lat != null ? c.lat : c.latitude);
  const lng = Number(c.lng != null ? c.lng : c.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
}

function distanceKmBetween(from, to) {
  if (from?.lat == null || from?.lng == null || !to) return null;
  const km = haversineKm(Number(from.lat), Number(from.lng), Number(to.lat), Number(to.lng));
  return Number.isFinite(km) ? km : null;
}

/**
 * Product pin is where the item was posted.
 * Saved GPS wins, then the shop pin, then the city written on the listing.
 * If the item has none of those, the seller's saved profile pin is used so other
 * people's items still show a distance.
 */
export function resolveListingCoords(listing) {
  if (!listing) return null;
  const own = readPoint(listing.coordinates);
  if (own) return own;
  const isShop = listing.sellerType === 'shop' || listing.shopId;
  if (isShop) {
    const shop = readPoint(listing.shopId);
    if (shop) return shop;
  }
  const named = coordsForPlaceName(listing.location);
  if (named) return named;
  const seller = listing.seller || null;
  return readPoint(seller) || coordsForPlaceName(seller?.location) || coordsForPlaceName(listing.shopId?.location);
}

/** Seller pin is where the profile or shop was saved, not where one of their items is. */
export function resolveSellerCoords(seller) {
  if (!seller) return null;
  return readPoint(seller.coordinates) || readPoint(seller) || coordsForPlaceName(seller.location);
}

export function attachDistanceToCard(cardItem, userCoords) {
  if (!cardItem) return cardItem;
  const coords = resolveListingCoords(cardItem.listing || cardItem);
  const distanceKm = distanceKmBetween(userCoords, coords);
  return {
    ...cardItem,
    coordinates: coords || cardItem.coordinates || null,
    distanceKm,
    distanceLabel: formatDistanceLabel(distanceKm),
  };
}

export function attachDistanceToSeller(seller, userCoords) {
  if (!seller) return seller;
  const coords = resolveSellerCoords(seller);
  const distanceKm = distanceKmBetween(userCoords, coords);
  return {
    ...seller,
    coordinates: coords || seller.coordinates || null,
    distance: distanceKm,
  };
}

export function coordinatesForPlace(pin, locationText) {
  const point = readPoint(pin);
  if (point) return point;
  return coordsForPlaceName(locationText);
}

export function toCardItem(listing) {
  if (!listing) return null;
  const coords = resolveListingCoords(listing);
  const seller = listing.seller || {};
  const shop = listing.shopId || {};
  return {
    id: listing.id,
    title: listing.title,
    price: formatListingPrice(listing, formatPrice),
    category: listing.category || '',
    location: listing.location || '',
    icon: categoryIcon(listing.category),
    imageColor: 'iconBackground',
    photo: resolveMediaUrl(listing.photos?.[0] || ''),
    views: Number(listing.views) || 0,
    distanceKm: null,
    distanceLabel: null,
    coordinates: coords,
    sellerId: seller.id,
    sellerType: listing.sellerType || 'individual',
    shopId: listing.shopId || null,
    sellerName: listing.sellerType === 'shop' ? (shop.name || 'Shop') : (seller.name || 'Seller'),
    verified: Boolean(listing.verified),
    verificationKind: listing.verificationKind || null,
    verificationLabel: listing.verificationLabel || null,
    isFeatured: Boolean(listing.isFeatured),
    featuredUntil: listing.featuredUntil || null,
    listing,
  };
}

export function toDetailItem(listing) {
  if (!listing) return null;
  const seller = listing.seller || {};
  const shop = listing.shopId && typeof listing.shopId === 'object' ? listing.shopId : {};
  return {
    id: listing.id,
    title: listing.title,
    price: formatListingPrice(listing, formatPrice),
    condition: listing.condition || 'Good',
    location: listing.location || '',
    posted: timeAgo(listing.createdAt),
    seller: seller.name || 'Seller',
    sellerId: seller.id,
    sellerData: seller
      ? {
          ...seller,
          avatarUrl: resolveMediaUrl(seller.avatarUrl || ''),
        }
      : seller,
    sellerType: listing.sellerType || 'individual',
    shopId: listing.shopId || null,
    rating:
      listing.sellerType === 'shop' && (shop.ratingAverage != null || shop.rating != null)
        ? `${shop.ratingAverage ?? shop.rating}`
        : '',
    description: listing.description || '',
    mapAddress: listing.location || '',
    photos: (listing.photos || []).map(resolveMediaUrl).filter(Boolean),
    listing,
  };
}

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function fullPhone(localDigits) {
  const digits = digitsOnly(localDigits).slice(-10);
  return digits ? `+977${digits}` : '';
}
