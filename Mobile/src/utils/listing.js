import { NEPAL_LOCATIONS, haversineKm } from './locations';
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

export function resolveListingCoords(listing) {
  if (!listing) return null;
  const sources = [
    listing.coordinates,
    listing,
    listing.shopId,
    listing.shopId?.coordinates,
    listing.seller,
    listing.seller?.coordinates,
  ];
  for (const source of sources) {
    if (!source) continue;
    const lat = Number(source.lat != null ? source.lat : source.latitude);
    const lng = Number(source.lng != null ? source.lng : source.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  }
  const locName = (listing.location || '').toString().toLowerCase().trim();
  if (locName && NEPAL_LOCATIONS.length) {
    let best = null;
    let bestScore = -1;
    for (const loc of NEPAL_LOCATIONS) {
      const n = loc.name.toLowerCase();
      let score = 0;
      if (n === locName) score = 1000;
      else if (n.startsWith(locName)) score = 500;
      else if (locName.startsWith(n.split(',')[0])) score = 300;
      else if (n.includes(locName)) score = 100;
      else {
        const tokens = locName.split(/[,\s]+/).filter(Boolean);
        for (const t of tokens) {
          if (t.length >= 3 && n.includes(t)) score += 20;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        best = loc;
      }
    }
    if (best && bestScore > 0) {
      return { lat: best.lat, lng: best.lng, fromFallback: true };
    }
  }
  return null;
}

export function attachDistanceToCard(cardItem, userCoords, currentUserId) {
  if (!cardItem) return cardItem;
  
  // Don't show distance for own items
  if (currentUserId && cardItem.sellerId && String(cardItem.sellerId) === String(currentUserId)) {
    return {
      ...cardItem,
      distanceKm: null,
      distanceLabel: null,
    };
  }
  
  if (cardItem.distanceKm != null && Number.isFinite(Number(cardItem.distanceKm))) {
    return {
      ...cardItem,
      distanceLabel: formatDistanceLabel(Number(cardItem.distanceKm)),
    };
  }
  const coords = resolveListingCoords(cardItem.listing || cardItem);
  if (userCoords?.lat != null && userCoords?.lng != null && coords) {
    const d = haversineKm(
      Number(userCoords.lat),
      Number(userCoords.lng),
      Number(coords.lat),
      Number(coords.lng)
    );
    return {
      ...cardItem,
      distanceKm: d,
      distanceLabel: formatDistanceLabel(d),
      coordinates: coords,
    };
  }
  return cardItem;
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
    distanceKm: listing.distanceKm != null ? Number(listing.distanceKm) : null,
    distanceLabel: formatDistanceLabel(listing.distanceKm),
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
