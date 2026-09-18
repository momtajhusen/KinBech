import { STOREFRONT_BASE_URL } from '../config/storefront';
import { BRAND_TAGLINE } from '../content/brand';
import { formatPrice } from './listing';

export const SHARE_CARD_WIDTH = 1080;
export const SHARE_CARD_HEIGHT = 1920;
export const SHARE_CARD_PREVIEW_WIDTH = 270;
export const SHARE_CARD_PREVIEW_HEIGHT = 480;

export function buildListingShareUrl(listingId) {
  if (!listingId) return STOREFRONT_BASE_URL;
  return `${STOREFRONT_BASE_URL}/listing/${String(listingId)}?source=share`;
}

export function formatSharePrice(price) {
  const amount = Number(String(price ?? '').replace(/[^\d]/g, '')) || 0;
  return formatPrice(amount);
}

export function buildShareMessage(listing) {
  if (!listing) return `Check this out on KinBech — ${BRAND_TAGLINE}`;
  const url = buildListingShareUrl(listing.id);
  const priceLabel = formatSharePrice(listing.price);
  const lines = [
    listing.title || 'New listing on KinBech',
    priceLabel,
    listing.location ? `📍 ${listing.location}` : null,
    listing.condition ? `Condition: ${listing.condition}` : null,
    '',
    `Buy & sell local on KinBech — ${BRAND_TAGLINE}`,
    url,
  ].filter(Boolean);
  return lines.join('\n');
}

export function normalizeListingForShare(listing) {
  if (!listing) return null;
  return {
    id: listing.id || listing._id,
    title: listing.title || 'Listing',
    price: listing.price,
    imageUrl: listing.imageUrl || listing.photos?.[0] || listing.photo || '',
    location: listing.location || '',
    condition: listing.condition || 'Good',
    category: listing.category || '',
  };
}
