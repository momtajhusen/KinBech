import { apiUrl } from '../config';
import { formatListingPrice } from './listingVariants';

export function formatPrice(price, currency = 'NPR') {
  const amount = Number(price) || 0;
  const symbol = currency === 'NPR' ? 'Rs.' : currency;
  return `${symbol} ${amount.toLocaleString('en-IN')}`;
}

export function formatDistanceLabel(km) {
  if (km == null || !Number.isFinite(Number(km))) return null;
  const n = Number(km);
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1)} km`;
}

export function formatTimeAgo(dateInput) {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.startsWith('file://')) return null;
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return apiUrl(url.startsWith('/') ? url : `/${url}`);
}

export function getListingId(listing) {
  if (!listing) return null;
  return String(listing.id || listing._id || '');
}

export function getSellerIdFromListing(listing) {
  if (!listing) return null;
  if (listing.sellerType === 'shop') {
    const shop = listing.shopId;
    if (shop && typeof shop === 'object') return String(shop.id || shop._id || '');
    if (shop) return String(shop);
  }
  const seller = listing.seller;
  if (seller && typeof seller === 'object') return String(seller.id || seller._id || '');
  if (seller) return String(seller);
  return null;
}

export function toCardItem(listing) {
  if (!listing) return null;
  const seller = listing.seller || {};
  const shop = listing.shopId && typeof listing.shopId === 'object' ? listing.shopId : {};
  const id = getListingId(listing);
  if (!id) return null;
  return {
    id,
    title: listing.title,
    price: formatListingPrice(listing, formatPrice),
    rawPrice: listing.price,
    category: listing.category || '',
    condition: listing.condition || '',
    location: listing.location || '',
    photo: resolveMediaUrl(listing.photos?.[0]),
    photos: (listing.photos || []).map(resolveMediaUrl).filter(Boolean),
    distanceLabel: formatDistanceLabel(listing.distanceKm),
    sellerName: listing.sellerType === 'shop' ? shop.name || 'Shop' : seller.name || 'Seller',
    sellerType: listing.sellerType || 'individual',
    verified: Boolean(
      listing.verified ||
        shop.isVerified ||
        (listing.sellerType !== 'shop' && (seller.id || seller._id || seller.phone))
    ),
    verificationKind:
      listing.verificationKind ||
      (shop.isVerified ? 'business' : listing.sellerType !== 'shop' ? 'phone' : null),
    verificationLabel:
      listing.verificationLabel ||
      (shop.isVerified
        ? 'Business Verified'
        : listing.sellerType !== 'shop'
          ? 'Phone Verified'
          : null),
    views: listing.views || 0,
    description: listing.description || '',
    createdAt: listing.createdAt,
    timeAgo: formatTimeAgo(listing.createdAt),
    listing,
  };
}

export function toSellerCard(seller) {
  if (!seller) return null;
  const id = seller.id || seller._id;
  return {
    id,
    name: seller.name || 'Seller',
    avatar: resolveMediaUrl(seller.avatarUrl || seller.coverImage),
    cover: resolveMediaUrl(seller.coverImage || seller.avatarUrl),
    rating: Number(seller.rating) || 0,
    reviewsCount: seller.reviewsCount || 0,
    listingCount: seller.listingCount || 0,
    distanceLabel: formatDistanceLabel(seller.distance),
    location: seller.location || '',
    verified: Boolean(seller.verified),
    verificationKind: seller.verificationKind || (seller.verified ? (seller.sellerType === 'shop' ? 'business' : 'phone') : null),
    verificationLabel:
      seller.verificationLabel ||
      (seller.verified
        ? seller.sellerType === 'shop'
          ? 'Business Verified'
          : 'Phone Verified'
        : null),
    sellerType: seller.sellerType || 'individual',
    category: seller.category || '',
    description: seller.description || '',
    gallery: (seller.productGallery || []).map(resolveMediaUrl).filter(Boolean),
    openingHours: seller.openingHours || '',
    phone: seller.phone || '',
    shopId: seller.shopId || null,
    userId: seller.userId || null,
    raw: seller,
  };
}
