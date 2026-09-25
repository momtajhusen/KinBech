const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const User = require('../models/User');
const Listing = require('../models/Listing');
const { haversineDistanceKm } = require('../utils/listing');
const { mapShopCategory } = require('../utils/shopCategory');

function readCoords(entity) {
  const c = entity?.coordinates || {};
  const lat = Number(c.lat != null ? c.lat : c.latitude);
  const lng = Number(c.lng != null ? c.lng : c.longitude);
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  return { lat: null, lng: null };
}

function galleryFromListings(listings = []) {
  const photos = [];
  for (const listing of listings) {
    for (const photo of listing.photos || []) {
      if (photo && !photos.includes(photo)) photos.push(photo);
      if (photos.length >= 4) return photos;
    }
  }
  return photos;
}

function toShopSeller(shop, listings = [], userLat, userLng) {
  const coords = readCoords(shop);
  const distance = haversineDistanceKm(userLat, userLng, coords.lat, coords.lng);
  return {
    _id: shop._id,
    id: shop._id,
    name: shop.name,
    avatarUrl: shop.logo || '',
    coverImage: shop.logo || '',
    rating: Number(shop.ratingAverage) || 0,
    reviewsCount: Number(shop.reviewCount) || 0,
    listingCount: listings.length,
    distance: distance == null ? null : Math.round(distance * 10) / 10,
    location: shop.location || shop.address || '',
    verified: Boolean(shop.isVerified),
    verificationKind: shop.isVerified ? 'business' : null,
    verificationLabel: shop.isVerified ? 'Business Verified' : null,
    productGallery: galleryFromListings(listings),
    sellerType: 'shop',
    category: shop.category || 'Other',
    shopId: shop._id,
    userId: shop.owner,
    description: shop.description || '',
    phone: shop.phone || '',
    openingHours: shop.openingHours || '',
    coordinates: coords,
  };
}

function toIndividualSeller(user, listings = [], userLat, userLng) {
  const coords = readCoords(user);
  const distance = haversineDistanceKm(userLat, userLng, coords.lat, coords.lng);
  const primaryCategory = listings.find((l) => l.category)?.category || 'General';
  return {
    _id: user._id,
    id: user._id,
    name: user.name || 'Seller',
    avatarUrl: user.avatarUrl || '',
    coverImage: user.avatarUrl || '',
    rating: 0,
    reviewsCount: 0,
    listingCount: listings.length,
    distance: distance == null ? null : Math.round(distance * 10) / 10,
    location: user.preferences?.showLocation === false ? '' : user.location || '',
    verified: Boolean(user.phone),
    verificationKind: user.phone ? 'phone' : null,
    verificationLabel: user.phone ? 'Phone Verified' : null,
    productGallery: galleryFromListings(listings),
    sellerType: 'individual',
    category: primaryCategory,
    shopId: null,
    userId: user._id,
    description: user.bio || '',
    phone: user.preferences?.showPhone ? user.phone || '' : '',
    coordinates: coords,
  };
}

function parseLocation(req) {
  const lat = req.query.lat != null && req.query.lat !== '' ? Number(req.query.lat) : null;
  const lng = req.query.lng != null && req.query.lng !== '' ? Number(req.query.lng) : null;
  return {
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

function matchesQuery(seller, q) {
  if (!q) return true;
  const needle = String(q).toLowerCase();
  return (
    String(seller.name || '').toLowerCase().includes(needle) ||
    String(seller.location || '').toLowerCase().includes(needle) ||
    String(seller.category || '').toLowerCase().includes(needle)
  );
}

async function collectSellers(req) {
  const { lat: userLat, lng: userLng } = parseLocation(req);
  const q = String(req.query.q || req.query.query || '').trim();
  const type = String(req.query.type || 'all').toLowerCase();
  const rawCategory = String(req.query.category || '').trim();
  const category =
    rawCategory && rawCategory !== 'All' && rawCategory !== 'More' ? rawCategory : '';
  const verifiedOnly = req.query.verified === 'true' || req.query.verified === '1';
  const topRated = req.query.topRated === 'true' || req.query.topRated === '1';
  const nearbyFirst = req.query.nearby === 'true' || req.query.nearby === '1';

  const listingFilter = { status: 'active' };
  if (category) listingFilter.category = category;

  const listings = await Listing.find(listingFilter)
    .select('seller sellerType shopId photos category location coordinates createdAt')
    .sort({ createdAt: -1 })
    .lean();

  const byShop = new Map();
  const byUser = new Map();
  for (const listing of listings) {
    if (listing.sellerType === 'shop' && listing.shopId) {
      const key = String(listing.shopId);
      if (!byShop.has(key)) byShop.set(key, []);
      byShop.get(key).push(listing);
    } else if (listing.seller) {
      const key = String(listing.seller);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key).push(listing);
    }
  }

  const sellers = [];

  const includeShops = type === 'all' || type === 'stores' || type === 'shop' || type === 'shops';
  const includeIndividuals =
    type === 'all' || type === 'sellers' || type === 'individual' || type === 'seller';

  if (includeShops) {
    const shopQuery = { status: 'active' };
    if (category) {
      shopQuery.category = mapShopCategory(category);
    }
    const shops = await Shop.find(shopQuery).lean();
    for (const shop of shops) {
      const shopListings = byShop.get(String(shop._id)) || [];
      if (category && shopListings.length === 0 && shop.category !== mapShopCategory(category)) {
        continue;
      }
      const card = toShopSeller(shop, shopListings, userLat, userLng);
      if (verifiedOnly && !card.verified) continue;
      if (topRated && card.rating < 4) continue;
      if (!matchesQuery(card, q)) continue;
      sellers.push(card);
    }
  }

  if (includeIndividuals && !verifiedOnly) {
    const userIds = [...byUser.keys()].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (userIds.length) {
      const users = await User.find({
        _id: { $in: userIds },
        status: { $ne: 'suspended' },
      })
        .select('name avatarUrl location coordinates phone')
        .lean();
      for (const user of users) {
        const userListings = byUser.get(String(user._id)) || [];
        const card = toIndividualSeller(user, userListings, userLat, userLng);
        if (topRated) continue;
        if (!matchesQuery(card, q)) continue;
        sellers.push(card);
      }
    }
  }

  if (nearbyFirst && userLat != null && userLng != null) {
    sellers.sort((a, b) => {
      const da = a.distance == null ? 9999 : a.distance;
      const db = b.distance == null ? 9999 : b.distance;
      return da - db;
    });
  }

  return sellers;
}

function sortFeatured(sellers) {
  return [...sellers].sort((a, b) => {
    if (Boolean(b.verified) !== Boolean(a.verified)) return Number(b.verified) - Number(a.verified);
    if (b.rating !== a.rating) return b.rating - a.rating;
    return b.listingCount - a.listingCount;
  });
}

function sortPopular(sellers) {
  return [...sellers].sort((a, b) => {
    if (b.listingCount !== a.listingCount) return b.listingCount - a.listingCount;
    return b.rating - a.rating;
  });
}

function sortNearby(sellers) {
  return [...sellers].sort((a, b) => {
    const da = a.distance == null ? 9999 : a.distance;
    const db = b.distance == null ? 9999 : b.distance;
    return da - db;
  });
}

async function getSellers(req, res, next) {
  try {
    const sellers = await collectSellers(req);
    res.json({ sellers, total: sellers.length });
  } catch (error) {
    next(error);
  }
}

async function searchSellers(req, res, next) {
  try {
    const sellers = await collectSellers(req);
    res.json({ sellers, total: sellers.length });
  } catch (error) {
    next(error);
  }
}

async function getFeaturedSellers(req, res, next) {
  try {
    const sellers = sortFeatured(await collectSellers(req)).slice(0, 12);
    res.json({ sellers, total: sellers.length });
  } catch (error) {
    next(error);
  }
}

async function getPopularSellers(req, res, next) {
  try {
    const sellers = sortPopular(await collectSellers(req)).slice(0, 12);
    res.json({ sellers, total: sellers.length });
  } catch (error) {
    next(error);
  }
}

async function getNearbySellers(req, res, next) {
  try {
    const sellers = sortNearby(await collectSellers(req)).slice(0, 12);
    res.json({ sellers, total: sellers.length });
  } catch (error) {
    next(error);
  }
}

async function getSeller(req, res, next) {
  try {
    const { sellerId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      return res.status(400).json({ message: 'Invalid seller id' });
    }

    const { lat: userLat, lng: userLng } = parseLocation(req);

    const shop = await Shop.findOne({ _id: sellerId, status: 'active' }).lean();
    if (shop) {
      const listings = await Listing.find({
        shopId: shop._id,
        status: { $in: ['active', 'sold'] },
      })
        .select('photos category location coordinates createdAt status price title')
        .sort({ createdAt: -1 })
        .lean();
      const activeCount = listings.filter((l) => l.status === 'active').length;
      const soldCount = listings.filter((l) => l.status === 'sold').length;
      return res.json({
        seller: {
          ...toShopSeller(shop, listings, userLat, userLng),
          activeCount,
          soldCount,
          memberSince: shop.createdAt || null,
        },
      });
    }

    const user = await User.findById(sellerId)
      .select('name avatarUrl location coordinates phone status bio preferences createdAt soldCount')
      .lean();
    if (!user || user.status === 'suspended') {
      return res.status(404).json({ message: 'Seller not found' });
    }

    const listings = await Listing.find({
      seller: user._id,
      sellerType: 'individual',
      status: { $in: ['active', 'sold'] },
    })
      .select('photos category location coordinates createdAt status price title')
      .sort({ createdAt: -1 })
      .lean();

    const activeCount = listings.filter((l) => l.status === 'active').length;
    const soldCount = listings.filter((l) => l.status === 'sold').length;

    return res.json({
      seller: {
        ...toIndividualSeller(user, listings, userLat, userLng),
        activeCount,
        soldCount,
        memberSince: user.createdAt || null,
        soldCountTotal: user.soldCount || soldCount,
      },
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSellers,
  searchSellers,
  getFeaturedSellers,
  getPopularSellers,
  getNearbySellers,
  getSeller,
};
