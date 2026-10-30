const mongoose = require('mongoose');
const Shop = require('../models/Shop');
const User = require('../models/User');
const Listing = require('../models/Listing');
const { haversineDistanceKm } = require('../utils/listing');
const { coordsForPlaceName } = require('../utils/nepalLocations');
const { mapShopCategory } = require('../utils/shopCategory');
const { scoreSeller, searchPhrases, sellerMatches } = require('../utils/searchMatch');
const { phoneVisible, sellerSignals } = require('../utils/token');
const { currentAudience, sameAudienceUser } = require('../utils/audience');

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

function hasUserPoint(lat, lng) {
  return lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function sellerPoint(entity, locationText) {
  const coords = readCoords(entity);
  if (Number.isFinite(coords.lat) && Number.isFinite(coords.lng)) return coords;
  return coordsForPlaceName(locationText);
}

function toShopSeller(shop, listings = [], userLat, userLng, showPhone = false) {
  const coords = sellerPoint(shop, shop.location || shop.address || '');
  const distance = coords && hasUserPoint(userLat, userLng)
    ? haversineDistanceKm(userLat, userLng, coords.lat, coords.lng)
    : null;
  return {
    _id: shop._id,
    id: shop._id,
    name: shop.name,
    avatarUrl: shop.logo || '',
    coverImage: shop.coverImage || '',
    tagline: shop.tagline || '',
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
    phone: showPhone ? shop.phone || '' : '',
    openingHours: shop.openingHours || '',
    coordinates: coords,
  };
}

function toIndividualSeller(user, listings = [], userLat, userLng) {
  const location = user.preferences?.showLocation === false ? '' : user.location || '';
  const coords = sellerPoint(user, user.location || '');
  const distance = coords && hasUserPoint(userLat, userLng)
    ? haversineDistanceKm(userLat, userLng, coords.lat, coords.lng)
    : null;
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
    location,
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

function matchesQuery(seller, phrases) {
  if (!phrases.length) return true;
  return phrases.some((phrase) => sellerMatches(seller, phrase));
}

async function collectSellers(req) {
  const { lat: userLat, lng: userLng } = parseLocation(req);
  const q = String(req.query.q || req.query.query || '').trim();
  const phrases = q ? searchPhrases(q, req.query.alt) : [];
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
    .select('seller sellerType shopId photos category location coordinates createdAt title')
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
      const withListings = [...byShop.keys()].filter((id) => mongoose.Types.ObjectId.isValid(id));
      shopQuery.$or = [{ category: mapShopCategory(category) }, { _id: { $in: withListings } }];
    }
    const shops = await Shop.find(shopQuery).lean();
    const owners = await User.find({ _id: { $in: shops.map((shop) => shop.owner).filter(Boolean) } })
      .select('preferences')
      .lean();
    const phoneOwners = new Set(owners.filter(phoneVisible).map((owner) => String(owner._id)));
    for (const shop of shops) {
      const shopListings = byShop.get(String(shop._id)) || [];
      if (category && shopListings.length === 0 && shop.category !== mapShopCategory(category)) {
        continue;
      }
      const card = toShopSeller(shop, shopListings, userLat, userLng, phoneOwners.has(String(shop.owner)));
      if (verifiedOnly && !card.verified) continue;
      if (topRated && card.rating < 4) continue;
      if (!matchesQuery(card, phrases)) continue;
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
        .select('name avatarUrl location coordinates phone bio')
        .lean();
      for (const user of users) {
        const userListings = byUser.get(String(user._id)) || [];
        const card = toIndividualSeller(user, userListings, userLat, userLng);
        if (topRated) continue;
        if (!matchesQuery(card, phrases)) continue;
        sellers.push(card);
      }
    }
  }

  const byDistance = (a, b) => {
    const da = a.distance == null ? 9999 : a.distance;
    const db = b.distance == null ? 9999 : b.distance;
    return da - db;
  };

  if (q) {
    const scores = new Map(sellers.map((seller) => [seller, Math.max(0, ...phrases.map((phrase) => scoreSeller(seller, phrase)))]));
    sellers.sort((a, b) => (scores.get(b) - scores.get(a)) || byDistance(a, b));
  } else if (nearbyFirst && userLat != null && userLng != null) {
    sellers.sort(byDistance);
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
      const shopOwnerSignals = await User.findById(shop.owner).select('trustTier replyMinutes dealsCompleted ratingAverage reviewCount lastActiveAt preferences').lean();
      const activeCount = listings.filter((l) => l.status === 'active').length;
      const soldCount = listings.filter((l) => l.status === 'sold').length;
      return res.json({
        seller: {
          ...toShopSeller(shop, listings, userLat, userLng, phoneVisible(shopOwnerSignals)),
          activeCount,
          soldCount,
          memberSince: shop.createdAt || null,
          signals: shopOwnerSignals ? sellerSignals(shopOwnerSignals) : null,
        },
      });
    }

    const user = await User.findById(sellerId)
      .select('name avatarUrl location coordinates phone status bio preferences createdAt soldCount deletionScheduledFor trustTier replyMinutes dealsCompleted ratingAverage reviewCount lastActiveAt isTester')
      .lean();
    if (!user || user.status === 'suspended' || user.deletionScheduledFor || !sameAudienceUser(user)) {
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
        signals: sellerSignals(user),
      },
    });
  } catch (error) {
    next(error);
  }
}

const COUNTS_TTL_MS = 60 * 1000;
const FACES_PER_CATEGORY = 3;
const countsCache = new Map();

/** Sellers per listing category (same rules as collectSellers), shops per store type, and totals. */
async function getSellerCategoryCounts(req, res, next) {
  try {
    const audience = currentAudience();
    const cached = countsCache.get(audience);
    if (cached && Date.now() - cached.at < COUNTS_TTL_MS) {
      return res.json(cached.payload);
    }

    const [rows, shops] = await Promise.all([
      Listing.aggregate([
        { $match: { status: 'active', category: { $nin: [null, ''] } } },
        {
          $group: {
            _id: {
              category: '$category',
              shop: {
                $cond: [{ $and: [{ $eq: ['$sellerType', 'shop'] }, { $ne: ['$shopId', null] }] }, '$shopId', null],
              },
              seller: '$seller',
            },
            items: { $sum: 1 },
          },
        },
      ]),
      Shop.find({ status: 'active' }).select('name logo category isVerified').lean(),
    ]);

    const shopById = new Map(shops.map((shop) => [String(shop._id), shop]));
    const userIds = [
      ...new Set(rows.filter((row) => !row._id.shop && row._id.seller).map((row) => String(row._id.seller))),
    ].filter((id) => mongoose.Types.ObjectId.isValid(id));
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds }, status: { $ne: 'suspended' } }).select('name avatarUrl').lean()
      : [];
    const userById = new Map(users.map((user) => [String(user._id), user]));

    const byCategory = new Map();
    const individuals = new Set();
    for (const row of rows) {
      const { category, shop: shopId, seller } = row._id;
      let face;
      if (shopId) {
        const shop = shopById.get(String(shopId));
        if (!shop) continue;
        face = { key: `s${shopId}`, name: shop.name || 'Shop', avatarUrl: shop.logo || '', type: 'shop' };
      } else {
        const user = userById.get(String(seller));
        if (!user) continue;
        individuals.add(String(user._id));
        face = { key: `u${user._id}`, name: user.name || 'Seller', avatarUrl: user.avatarUrl || '', type: 'individual' };
      }
      if (!byCategory.has(category)) byCategory.set(category, new Map());
      const sellers = byCategory.get(category);
      const prev = sellers.get(face.key);
      sellers.set(face.key, { ...face, items: (prev?.items || 0) + row.items });
    }

    const categories = {};
    for (const [category, sellers] of byCategory) {
      const list = [...sellers.values()].sort((a, b) => b.items - a.items);
      const shopCount = list.filter((s) => s.type === 'shop').length;
      categories[category] = {
        sellers: list.length,
        shops: shopCount,
        individuals: list.length - shopCount,
        faces: list.slice(0, FACES_PER_CATEGORY).map(({ name, avatarUrl, type }) => ({ name, avatarUrl, type })),
      };
    }

    const storeTypes = {};
    for (const shop of shops) {
      const type = shop.category || 'Other';
      storeTypes[type] = (storeTypes[type] || 0) + 1;
    }

    const payload = {
      categories,
      storeTypes,
      totals: {
        sellers: shops.length + individuals.size,
        shops: shops.length,
        individuals: individuals.size,
        verified: shops.filter((shop) => shop.isVerified).length,
      },
    };
    countsCache.set(audience, { at: Date.now(), payload });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSellerCategoryCounts,
  getSellers,
  searchSellers,
  getFeaturedSellers,
  getPopularSellers,
  getNearbySellers,
  getSeller,
};
