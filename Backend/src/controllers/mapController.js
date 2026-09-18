const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const { listingPoint } = require('../utils/listing');
const {
  parseGeoQuery,
  readCoords,
  distanceFrom,
  withinRadius,
  boundingDelta,
  ALLOWED_RADIUS_KM,
} = require('../utils/geo');

const SELLER_POPULATE = 'name avatarUrl location coordinates';
const SHOP_POPULATE = 'name logo ratingAverage reviewCount isVerified location coordinates category';

function mapListingMarker(doc, userLat, userLng) {
  const point = listingPoint(doc);
  if (!point) return null;

  const distanceKm = distanceFrom(userLat, userLng, point);
  if (distanceKm == null) return null;

  const shop = doc.shopId && typeof doc.shopId === 'object' ? doc.shopId : null;
  const seller = doc.seller && typeof doc.seller === 'object' ? doc.seller : null;

  return {
    id: `listing-${doc._id}`,
    markerType: 'product',
    listingId: String(doc._id),
    shopId: shop?._id ? String(shop._id) : doc.shopId ? String(doc.shopId) : null,
    sellerId: seller?._id ? String(seller._id) : doc.seller ? String(doc.seller) : null,
    sellerType: doc.sellerType || 'individual',
    title: doc.title,
    subtitle: doc.sellerType === 'shop' ? shop?.name || 'Shop' : seller?.name || 'Seller',
    price: Number(doc.price) || 0,
    currency: doc.currency || 'NPR',
    category: doc.category || '',
    photo: (doc.photos || [])[0] || '',
    lat: point.lat,
    lng: point.lng,
    distanceKm,
    status: doc.status,
  };
}

function mapShopMarker(shop, listingCount, userLat, userLng) {
  const point = readCoords(shop);
  if (!point) return null;

  const distanceKm = distanceFrom(userLat, userLng, point);
  if (distanceKm == null) return null;

  return {
    id: `shop-${shop._id}`,
    markerType: 'shop',
    shopId: String(shop._id),
    sellerId: String(shop._id),
    sellerType: 'shop',
    title: shop.name,
    subtitle: shop.category || 'Shop',
    photo: shop.logo || '',
    lat: point.lat,
    lng: point.lng,
    distanceKm,
    listingCount,
    verified: Boolean(shop.isVerified),
    rating: Number(shop.ratingAverage) || 0,
    reviewCount: Number(shop.reviewCount) || 0,
  };
}

async function getNearbyMap(req, res, next) {
  try {
    const { lat, lng, radiusKm } = parseGeoQuery(req.query);
    if (lat == null || lng == null) {
      return res.status(400).json({ message: 'lat and lng query parameters are required' });
    }

    const type = String(req.query.type || 'all').toLowerCase();
    const category =
      req.query.category && req.query.category !== 'All' && req.query.category !== 'More'
        ? String(req.query.category)
        : '';
    const limit = Math.min(120, Math.max(1, Number(req.query.limit) || 80));

    const listingFilter = { status: 'active' };
    if (category) listingFilter.category = category;

    const includeProducts = type === 'all' || type === 'products' || type === 'product';
    const includeShops = type === 'all' || type === 'shops' || type === 'shop' || type === 'stores';

    const markers = [];

    if (includeProducts) {
      const listings = await Listing.find(listingFilter)
        .populate('seller', SELLER_POPULATE)
        .populate('shopId', SHOP_POPULATE)
        .sort({ createdAt: -1 })
        .limit(400)
        .lean();

      for (const doc of listings) {
        const marker = mapListingMarker(doc, lat, lng);
        if (!marker) continue;
        if (!withinRadius(lat, lng, { lat: marker.lat, lng: marker.lng }, radiusKm)) continue;
        markers.push(marker);
      }
    }

    if (includeShops) {
      const shopQuery = { status: 'active' };
      if (category) shopQuery.category = category;

      const shops = await Shop.find(shopQuery).lean();
      const shopIds = shops.map((shop) => shop._id);
      const listingCounts = {};

      if (shopIds.length) {
        const rows = await Listing.aggregate([
          { $match: { shopId: { $in: shopIds }, status: 'active' } },
          { $group: { _id: '$shopId', count: { $sum: 1 } } },
        ]);
        for (const row of rows) {
          listingCounts[String(row._id)] = row.count;
        }
      }

      for (const shop of shops) {
        const marker = mapShopMarker(shop, listingCounts[String(shop._id)] || 0, lat, lng);
        if (!marker) continue;
        if (!withinRadius(lat, lng, { lat: marker.lat, lng: marker.lng }, radiusKm)) continue;
        if (category && marker.listingCount === 0 && shop.category !== category) continue;
        markers.push(marker);
      }
    }

    markers.sort((a, b) => a.distanceKm - b.distanceKm);

    const productMarkers = markers.filter((m) => m.markerType === 'product');
    const shopMarkers = markers.filter((m) => m.markerType === 'shop');
    const bounded = markers.slice(0, limit);
    const { latDelta, lngDelta } = boundingDelta(radiusKm, lat);

    res.json({
      center: { lat, lng },
      radiusKm,
      allowedRadiusKm: ALLOWED_RADIUS_KM,
      bounds: {
        north: lat + latDelta,
        south: lat - latDelta,
        east: lng + lngDelta,
        west: lng - lngDelta,
      },
      counts: {
        total: bounded.length,
        products: productMarkers.filter((m) => m.distanceKm <= radiusKm).length,
        shops: shopMarkers.filter((m) => m.distanceKm <= radiusKm).length,
      },
      markers: bounded,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNearbyMap,
};
