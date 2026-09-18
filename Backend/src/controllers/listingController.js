const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const Report = require('../models/Report');
const Chat = require('../models/Chat');
const User = require('../models/User');
const { listingPayload, parsePrice, haversineDistanceKm, listingPoint } = require('../utils/listing');
const { parseVariantsFromBody } = require('../utils/listingVariants');
const { recordShopMetric } = require('../utils/shopAnalytics');

const SELLER_POPULATE = 'name phone avatarUrl soldCount boughtCount location bio preferences coordinates';
const SHOP_POPULATE = 'name logo ratingAverage reviewCount isVerified coordinates location';

function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(48, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

function paginateItems(items, page, limit) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    totalPages,
    hasMore: safePage < totalPages,
  };
}

function buildBaseFilter(req) {
  const {
    q,
    category,
    status = 'active',
    seller,
    sellerType,
    minPrice,
    maxPrice,
    condition,
  } = req.query;

  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (category && category !== 'All' && category !== 'More') {
    filter.category = category;
  }
  if (condition && condition !== 'All') filter.condition = condition;
  if (sellerType && sellerType !== 'all') filter.sellerType = sellerType;
  if (seller) filter.seller = seller;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (q) {
    const escaped = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { description: { $regex: escaped, $options: 'i' } },
      { location: { $regex: escaped, $options: 'i' } },
      { category: { $regex: escaped, $options: 'i' } },
    ];
  }
  return filter;
}

async function getListings(req, res, next) {
  try {
    const filter = buildBaseFilter(req);
    const {
      lat, lng, radius, sort,
    } = req.query;

    const userLat = lat != null && lat !== '' ? Number(lat) : null;
    const userLng = lng != null && lng !== '' ? Number(lng) : null;
    const radiusKm = radius && Number(radius) > 0 ? Number(radius) : null;
    const sortMode = String(sort || 'newest').toLowerCase();

    const mongoSort = {};
    if (sortMode === 'price-low') {
      mongoSort.price = 1;
    } else if (sortMode === 'price-high') {
      mongoSort.price = -1;
    } else {
      mongoSort.createdAt = -1;
    }

    const docs = await Listing.find(filter)
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE)
      .sort(mongoSort)
      .limit(300)
      .lean();

    const withDistance = docs.map((doc) => {
      const point = listingPoint(doc);
      if (userLat != null && userLng != null && point) {
        const km = haversineDistanceKm(userLat, userLng, point.lat, point.lng);
        return { doc, distance: km };
      }
      return { doc, distance: null };
    });

    const filteredByRadius = withDistance.filter(({ distance }) => {
      if (!radiusKm) return true;
      if (distance == null) return false;
      return distance <= radiusKm;
    });

    let final;
    if (sortMode === 'distance' && userLat != null && userLng != null) {
      final = filteredByRadius.slice().sort((a, b) => {
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        return da - db;
      });
    } else if (sortMode === 'price-low') {
      final = filteredByRadius.slice().sort((a, b) => a.doc.price - b.doc.price);
    } else if (sortMode === 'price-high') {
      final = filteredByRadius.slice().sort((a, b) => b.doc.price - a.doc.price);
    } else {
      final = filteredByRadius.slice().sort((a, b) => {
        const ta = new Date(a.doc.createdAt || 0).getTime();
        const tb = new Date(b.doc.createdAt || 0).getTime();
        return tb - ta;
      });
    }

    const { page, limit } = parsePagination(req);
    const paged = paginateItems(final, page, limit);

    res.json({
      listings: paged.items.map(({ doc, distance }) => listingPayload(doc, distance)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
      hasMore: paged.hasMore,
      appliedSort: sortMode,
    });
  } catch (error) {
    next(error);
  }
}

async function searchListings(req, res, next) {
  try {
    const filter = buildBaseFilter(req);
    const {
      lat, lng, radius, sort,
    } = req.query;

    const userLat = lat != null && lat !== '' ? Number(lat) : null;
    const userLng = lng != null && lng !== '' ? Number(lng) : null;
    const radiusKm = radius && Number(radius) > 0 ? Number(radius) : null;
    const sortMode = String(sort || 'distance').toLowerCase();

    const docs = await Listing.find(filter)
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE)
      .limit(500)
      .lean();

    const ranked = docs.map((doc) => {
      const point = listingPoint(doc);
      let distance = null;
      if (userLat != null && userLng != null && point) {
        distance = haversineDistanceKm(userLat, userLng, point.lat, point.lng);
      }

      let relevanceScore = 0;
      const q = (req.query.q || '').toString().trim().toLowerCase();
      if (q) {
        const title = (doc.title || '').toLowerCase();
        const desc = (doc.description || '').toLowerCase();
        const loc = (doc.location || '').toLowerCase();
        const cat = (doc.category || '').toLowerCase();
        if (title === q) relevanceScore += 50;
        if (title.startsWith(q)) relevanceScore += 20;
        if (title.includes(q)) relevanceScore += 10;
        if (cat.includes(q)) relevanceScore += 15;
        if (loc.includes(q)) relevanceScore += 8;
        if (desc.includes(q)) relevanceScore += 4;
      }
      return { doc, distance, relevance: relevanceScore };
    });

    const filtered = ranked.filter(({ distance }) => {
      if (!radiusKm) return true;
      if (distance == null) return false;
      return distance <= radiusKm;
    });

    let sorted = filtered.slice();
    if (sortMode === 'distance' && userLat != null && userLng != null) {
      sorted.sort((a, b) => {
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        const diff = da - db;
        if (Math.abs(diff) > 5) return diff;
        return b.relevance - a.relevance;
      });
    } else if (sortMode === 'relevance') {
      sorted.sort((a, b) => {
        const diff = b.relevance - a.relevance;
        if (diff !== 0) return diff;
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        return da - db;
      });
    } else if (sortMode === 'price-low') {
      sorted.sort((a, b) => a.doc.price - b.doc.price);
    } else if (sortMode === 'price-high') {
      sorted.sort((a, b) => b.doc.price - a.doc.price);
    } else if (sortMode === 'newest') {
      sorted.sort((a, b) => {
        const ta = new Date(a.doc.createdAt || 0).getTime();
        const tb = new Date(b.doc.createdAt || 0).getTime();
        return tb - ta;
      });
    } else {
      sorted.sort((a, b) => {
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        const diff = da - db;
        if (Math.abs(diff) > 5) return diff;
        return b.relevance - a.relevance;
      });
    }

    const { page, limit } = parsePagination(req);
    const paged = paginateItems(sorted, page, limit);

    res.json({
      listings: paged.items.map(({ doc, distance }) => listingPayload(doc, distance)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
      hasMore: paged.hasMore,
      appliedSort: sortMode,
    });
  } catch (error) {
    next(error);
  }
}

async function getMyListings(req, res, next) {
  try {
    const listings = await Listing.find({ seller: req.user._id })
      .populate('seller', 'name phone avatarUrl soldCount boughtCount location bio preferences')
      .populate('shopId', 'name logo ratingAverage reviewCount')
      .sort({ createdAt: -1 });

    const listingIds = listings.map((l) => l._id);
    let chatCountMap = {};
    if (listingIds.length) {
      const chatCounts = await Chat.aggregate([
        { $match: { listing: { $in: listingIds } } },
        { $group: { _id: '$listing', count: { $sum: 1 } } },
      ]);
      chatCountMap = Object.fromEntries(
        chatCounts.map((row) => [String(row._id), row.count]),
      );
    }

    res.json({
      listings: listings.map((listing) =>
        listingPayload(listing, null, {
          chats: chatCountMap[String(listing._id)] || 0,
        }),
      ),
    });
  } catch (error) {
    next(error);
  }
}

async function getMyPurchases(req, res, next) {
  try {
    const chats = await Chat.find({ participants: req.user._id })
      .populate({
        path: 'listing',
        populate: [
          { path: 'seller', select: 'name phone avatarUrl soldCount boughtCount' },
          { path: 'shopId', select: 'name logo ratingAverage reviewCount isVerified' },
        ],
      })
      .sort({ lastMessageAt: -1 })
      .lean();

    const seen = new Set();
    const listings = [];
    for (const chat of chats) {
      const listing = chat.listing;
      if (!listing) continue;
      const listingId = String(listing._id);
      if (seen.has(listingId)) continue;
      const sellerId = listing.seller?._id || listing.seller;
      if (String(sellerId) === String(req.user._id)) continue;
      if (listing.status !== 'sold' && !chat.meetupConfirmed) continue;
      seen.add(listingId);
      listings.push(listingPayload(listing));
    }

    res.json({ listings });
  } catch (error) {
    next(error);
  }
}

async function getListing(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const userLat = lat != null && lat !== '' ? Number(lat) : null;
    const userLng = lng != null && lng !== '' ? Number(lng) : null;

    const doc = await Listing.findById(req.params.id)
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE);

    if (!doc) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    try {
      doc.views = (Number(doc.views) || 0) + 1;
      await doc.save();
      if (doc.shopId?._id || doc.shopId) {
        const shopId = doc.shopId._id || doc.shopId;
        const isOwner = req.user && String(doc.seller?._id || doc.seller) === String(req.user._id);
        if (!isOwner) {
          recordShopMetric(shopId, 'listingViews').catch(() => {});
        }
      }
    } catch (e) {
      // Ignore increment failures
    }

    let distance = null;
    const point = listingPoint(doc);
    if (userLat != null && userLng != null && point) {
      distance = haversineDistanceKm(userLat, userLng, point.lat, point.lng);
    }

    res.json({ listing: listingPayload(doc, distance) });
  } catch (error) {
    next(error);
  }
}

async function incrementView(req, res, next) {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: 'Listing id required' });
    }
    const listing = await Listing.findById(id).select('shopId seller').lean();
    await Listing.updateOne({ _id: id }, { $inc: { views: 1 } }).exec();
    if (listing?.shopId) {
      const isOwner = req.user && String(listing.seller) === String(req.user._id);
      if (!isOwner) {
        recordShopMetric(listing.shopId, 'listingViews').catch(() => {});
      }
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function createListing(req, res, next) {
  try {
    const {
      title,
      description,
      price,
      category,
      condition,
      photos,
      location,
      coordinates,
      meetupOption,
      sellerType = 'individual',
      shopId,
      // Shop-specific fields
      stock,
      brand,
      sku,
      originalPrice,
      isOnSale,
      hasVariants,
      variantOptions,
      variants,
    } = req.body;

    const parsedPrice = parsePrice(price);
    if (!title || Number.isNaN(parsedPrice) || !category) {
      return res.status(400).json({ message: 'Title, price, and category are required' });
    }

    const variantResult = parseVariantsFromBody(
      { hasVariants, variantOptions, variants },
      parsedPrice,
      sellerType,
    );
    if (!variantResult.ok) {
      return res.status(400).json({ message: variantResult.message });
    }

    // Validate seller type
    if (!['individual', 'shop'].includes(sellerType)) {
      return res.status(400).json({ message: 'Invalid seller type' });
    }

    let shopRecord = null;
    if (sellerType === 'shop') {
      if (!shopId) {
        return res.status(400).json({ message: 'Shop ID is required for shop listings' });
      }

      shopRecord = await Shop.findById(shopId);
      if (!shopRecord) {
        return res.status(404).json({ message: 'Shop not found' });
      }

      if (String(shopRecord.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'You can only create listings for your own shop' });
      }
    }

    let resolvedLocation = location || '';
    let resolvedCoordinates =
      coordinates && (coordinates.lat != null || coordinates.lng != null)
        ? { lat: Number(coordinates.lat) || null, lng: Number(coordinates.lng) || null }
        : { lat: null, lng: null };

    if (shopRecord) {
      if (!resolvedLocation && shopRecord.location) {
        resolvedLocation = shopRecord.location;
      }
      if (
        resolvedCoordinates.lat == null &&
        resolvedCoordinates.lng == null &&
        shopRecord.coordinates
      ) {
        resolvedCoordinates = shopRecord.coordinates;
      }
    }

    const listingData = {
      seller: req.user._id,
      sellerType,
      title: String(title).trim(),
      description: description || '',
      price: parsedPrice,
      category,
      condition: condition || 'Good',
      photos: Array.isArray(photos) ? photos : [],
      location: resolvedLocation,
      coordinates: resolvedCoordinates,
      meetupOption: meetupOption || 'Public place',
    };

    // Add shop-specific fields
    if (sellerType === 'shop') {
      listingData.shopId = shopId;
      listingData.brand = brand || '';
      listingData.sku = sku || '';
      listingData.originalPrice = originalPrice || null;
      listingData.isOnSale = isOnSale || false;
      listingData.hasVariants = variantResult.hasVariants;
      listingData.variantOptions = variantResult.variantOptions;
      listingData.variants = variantResult.variants;
      listingData.stock = variantResult.hasVariants
        ? variantResult.stock
        : Math.max(0, Number(stock) || 1);
    }

    const listing = await Listing.create(listingData);

    await listing.populate('seller', 'name phone avatarUrl soldCount boughtCount location bio preferences');
    if (listing.shopId) {
      await listing.populate('shopId', 'name logo ratingAverage reviewCount');
    }

    res.status(201).json({ listing: listingPayload(listing) });
  } catch (error) {
    next(error);
  }
}

async function updateListing(req, res, next) {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    if (String(listing.seller) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only edit your own listing' });
    }

    const wasSold = listing.status === 'sold';

    // For shop listings, ensure user still owns the shop
    if (listing.sellerType === 'shop' && listing.shopId) {
      const shop = await Shop.findById(listing.shopId);
      if (!shop || String(shop.owner) !== String(req.user._id)) {
        return res.status(403).json({ message: 'You can only edit listings for your own shop' });
      }
    }

    const fields = [
      'title',
      'description',
      'category',
      'condition',
      'photos',
      'location',
      'meetupOption',
      'status',
      // Shop-specific fields
      'brand',
      'sku',
      'originalPrice',
      'isOnSale',
    ];

    fields.forEach((field) => {
      if (req.body[field] !== undefined) {
        listing[field] = req.body[field];
      }
    });

    if (listing.sellerType === 'shop') {
      const nextPrice =
        req.body.price !== undefined ? parsePrice(req.body.price) : listing.price;
      const variantTouched =
        req.body.hasVariants !== undefined ||
        req.body.variantOptions !== undefined ||
        req.body.variants !== undefined;

      if (variantTouched) {
        const variantResult = parseVariantsFromBody(req.body, nextPrice, listing.sellerType);
        if (!variantResult.ok) {
          return res.status(400).json({ message: variantResult.message });
        }
        listing.hasVariants = variantResult.hasVariants;
        listing.variantOptions = variantResult.variantOptions;
        listing.variants = variantResult.variants;
        listing.stock = variantResult.hasVariants
          ? variantResult.stock
          : Math.max(0, Number(req.body.stock ?? listing.stock) || 0);
      } else if (req.body.stock !== undefined && !listing.hasVariants) {
        listing.stock = Math.max(0, Number(req.body.stock) || 0);
      }
    }

    if (req.body.coordinates) {
      const c = req.body.coordinates;
      listing.coordinates = {
        lat: c.lat != null ? Number(c.lat) || null : listing.coordinates?.lat,
        lng: c.lng != null ? Number(c.lng) || null : listing.coordinates?.lng,
      };
    }

    if (req.body.price !== undefined) {
      const parsedPrice = parsePrice(req.body.price);
      if (Number.isNaN(parsedPrice)) {
        return res.status(400).json({ message: 'Invalid price' });
      }
      listing.price = parsedPrice;
    }

    if (req.body.markSold) {
      listing.status = 'sold';
    }

    await listing.save();
    if (!wasSold && listing.status === 'sold') {
      await User.findByIdAndUpdate(listing.seller, { $inc: { soldCount: 1 } });
    }
    await listing.populate('seller', 'name phone avatarUrl rating soldCount boughtCount location bio preferences');
    res.json({ listing: listingPayload(listing) });
  } catch (error) {
    next(error);
  }
}

async function deleteListing(req, res, next) {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    if (String(listing.seller) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only delete your own listing' });
    }
    await listing.deleteOne();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function getCategoryCounts(req, res, next) {
  try {
    const filter = buildBaseFilter(req);
    const rows = await Listing.aggregate([
      { $match: filter },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const counts = {};
    let total = 0;
    for (const row of rows) {
      const key = row._id || 'Other';
      counts[key] = row.count;
      total += row.count;
    }

    res.json({ counts, total });
  } catch (error) {
    next(error);
  }
}

async function getAllListingsAdmin(req, res, next) {
  try {
    const { status } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    const listings = await Listing.find(filter)
      .populate('seller', 'name phone avatarUrl location bio preferences')
      .populate('shopId', 'name logo')
      .sort({ createdAt: -1 })
      .limit(100);

    // Add report counts
    const listingIds = listings.map(l => l._id);
    const reportCounts = await Report.aggregate([
      { $match: { reportedListing: { $in: listingIds } } },
      { $group: { _id: '$reportedListing', count: { $sum: 1 } } }
    ]);

    const reportCountMap = {};
    reportCounts.forEach(item => {
      reportCountMap[item._id.toString()] = item.count;
    });

    const listingsWithReports = listings.map(listing => ({
      ...listingPayload(listing),
      reportsCount: reportCountMap[listing._id.toString()] || 0
    }));

    res.json({ listings: listingsWithReports });
  } catch (error) {
    next(error);
  }
}

async function updateListingStatusAdmin(req, res, next) {
  try {
    const { listingId } = req.params;
    const { status } = req.body;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    listing.status = status || listing.status;
    await listing.save();

    res.json({ 
      message: 'Listing status updated successfully',
      listing: listingPayload(listing)
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getListings,
  searchListings,
  getCategoryCounts,
  getMyListings,
  getMyPurchases,
  getListing,
  incrementView,
  createListing,
  updateListing,
  deleteListing,
  getAllListingsAdmin,
  updateListingStatusAdmin,
};
