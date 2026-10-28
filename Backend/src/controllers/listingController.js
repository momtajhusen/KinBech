const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const Report = require('../models/Report');
const Chat = require('../models/Chat');
const User = require('../models/User');
const Notification = require('../models/Notification');
const FlaggedMedia = require('../models/FlaggedMedia');
const { sendUserPush } = require('../utils/callPush');
const { listingPayload, parsePrice, haversineDistanceKm, listingPoint, listingTrustBoost, statusChange } = require('../utils/listing');
const { parseVariantsFromBody } = require('../utils/listingVariants');
const { recordShopMetric, recordShopSale } = require('../utils/shopAnalytics');
const listingQueryCache = require('../utils/listingQueryCache');
const {
  evaluateListingModeration,
  evaluatePublicText,
  listingFieldBag,
  publicProhibitedBody,
} = require('../utils/listingModeration');

async function prohibitedListingBody(listingLike) {
  const check = await evaluatePublicText(listingFieldBag(listingLike), 'listing');
  return check.ok ? null : publicProhibitedBody(check);
}
const { estimateForListing, priceReviewReason } = require('../utils/priceCheck');
const { assertListingNotSpam } = require('../utils/listingSpamGuard');
const { featureListingWithCredit } = require('../utils/referral');
const { coordsForPlaceName } = require('../utils/nepalLocations');
const { getPlatformSettings } = require('../utils/platformSettings');
const { resolveProductCategory } = require('../utils/productCategory');
const { emitActivity } = require('../utils/realtime');
const { listingActivityEvent } = require('../utils/activityEvents');
const { isAdminRole } = require('../utils/adminScopes');
const { onListingMarkedSold } = require('../utils/deals');
const { confirmAvailable } = require('../utils/listingTrust');
const { MODE_PAUSE_REASON, modeAllowsListing } = require('../utils/sellerMode');
const { duplicatePhotoReason } = require('../utils/imageHash');
const {
  interestScore,
  loadInterestProfile,
  rankForUser,
  recordInterestSoon,
  topInterestCategories,
} = require('../utils/userInterest');
const {
  normalize, searchTokens, queryFilter, scoreName, scoreListing, hasWordMatch,
} = require('../utils/searchMatch');

const SELLER_POPULATE = 'name phone avatarUrl soldCount boughtCount location bio preferences coordinates rankBoost trustTier replyMinutes dealsCompleted ratingAverage reviewCount lastActiveAt createdAt';
const SHOP_POPULATE = 'name logo coverImage tagline phone ratingAverage reviewCount isVerified coordinates location openDays openingHours';
const LISTING_PAGE_DEFAULT = 20;
const LISTING_PAGE_MAX = 50;
const HELD_NOTE = 'Held for manual review.';
const PHOTO_ISSUE_LABELS = {
  nudity: 'nudity or adult content',
  violence: 'violence',
  weapon: 'a weapon',
  drugs: 'drugs',
  other: 'content that breaks KinBech rules',
};

function sentence(text) {
  const value = String(text || '').trim();
  if (!value) return '';
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

/** `imageFlag` comes from the AI photo check on the sell form: { issue, reason }. */
function photoReviewReason(flag) {
  if (!flag || typeof flag !== 'object') return '';
  const label = PHOTO_ISSUE_LABELS[String(flag.issue || '').trim().toLowerCase()];
  if (!label) return '';
  const detail = sentence(String(flag.reason || '').slice(0, 200));
  return `Photo may show ${label}.${detail ? ` ${detail}` : ''}`;
}

/**
 * Every check that can send a listing to manual review: restricted words, category
 * pre-approval, an unsafe photo, and a price of 0 or far from similar items.
 */
const UPLOAD_ISSUE_LABELS = {
  NSFW_BLOCKED: 'nudity or adult content',
  ADULT_IMAGE_TEXT: 'adult text',
  WEAPON_IMAGE: 'a weapon',
  STOCK_OR_WATERMARK: 'a stock or watermarked photo',
  SUSPECT_WATERMARK: 'a watermarked or fake photo',
  FRAUD_IMAGE_TEXT: 'misleading text',
};

/** Photos the upload safety check flagged (they were stored, not rejected). */
async function flaggedPhotoReason(photos) {
  const filenames = (Array.isArray(photos) ? photos : [])
    .map((url) => String(url || '').split('?')[0].split('/').pop())
    .filter(Boolean);
  if (!filenames.length) return '';
  const flagged = await FlaggedMedia.find({ filename: { $in: filenames } }).select('code').lean();
  if (!flagged.length) return '';
  const labels = [...new Set(flagged.map((item) => UPLOAD_ISSUE_LABELS[item.code] || 'content that breaks KinBech rules'))];
  return `Photo may show ${labels.join(', ')}.`;
}

async function collectReviewReasons({ moderation, listingLike, price, excludeId, priceEstimate, imageFlag }) {
  const reasons = [];
  if (moderation.status === 'pending' && moderation.reason) reasons.push(sentence(moderation.reason));
  const photoReason = photoReviewReason(imageFlag);
  if (photoReason) reasons.push(photoReason);
  const uploadReason = await flaggedPhotoReason(listingLike.photos);
  if (uploadReason && uploadReason !== photoReason) reasons.push(uploadReason);
  const duplicateReason = await duplicatePhotoReason(listingLike.photos, listingLike.seller, {
    excludeListingId: excludeId || null,
    createdBefore: listingLike.createdAt || new Date(),
  });
  if (duplicateReason) reasons.push(duplicateReason);
  let priceHeld = false;
  if (!listingLike.hasVariants) {
    const estimate = await estimateForListing({
      title: listingLike.title,
      category: listingLike.category,
      excludeId,
      clientEstimate: priceEstimate,
    });
    const priceReason = priceReviewReason(price, estimate);
    if (priceReason) {
      reasons.push(sentence(priceReason));
      priceHeld = true;
    }
  }
  return { reasons, priceHeld, photoHeld: Boolean(photoReason || uploadReason) };
}

function normalizeSearchWords(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const words = [];
  value.forEach((raw) => {
    const word = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const key = word.toLowerCase();
    if (!word || seen.has(key) || words.length >= 20) return;
    seen.add(key);
    words.push(word);
  });
  return words;
}

function presentListings(payload, userLat, userLng) {
  if (!payload?.listings) return payload;
  let listings = payload.listings.map((listing) => {
    const point = listingPoint(listing);
    let distanceKm = null;
    if (point && userLat != null && userLng != null) {
      const km = haversineDistanceKm(userLat, userLng, point.lat, point.lng);
      distanceKm = Number.isFinite(km) ? Math.round(km * 10) / 10 : null;
    }
    return { ...listing, coordinates: point, distanceKm };
  });
  if (payload.appliedSort === 'distance' && userLat != null && userLng != null) {
    listings = [...listings].sort((a, b) => {
      const da = a.distanceKm == null ? Infinity : a.distanceKm;
      const db = b.distanceKm == null ? Infinity : b.distanceKm;
      return da - db;
    });
  }
  return { ...payload, listings };
}

/** Pagination is mandatory: always coerce page/limit (default 20, max 50). */
function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(
    LISTING_PAGE_MAX,
    Math.max(1, parseInt(req.query.limit, 10) || LISTING_PAGE_DEFAULT)
  );
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

function buildListResponse(listings, page, limit, total, appliedSort) {
  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  const safePage = Math.min(page, totalPages);
  return {
    listings,
    total,
    page: safePage,
    limit,
    totalPages,
    hasMore: safePage < totalPages,
    appliedSort,
  };
}

function attachDistances(docs, userLat, userLng) {
  return docs.map((doc) => {
    const point = listingPoint(doc);
    if (userLat != null && userLng != null && point) {
      const km = haversineDistanceKm(userLat, userLng, point.lat, point.lng);
      return { doc, distance: km };
    }
    return { doc, distance: null };
  });
}

const LISTING_TEXT_FIELDS = ['title', 'searchWords', 'category', 'description', 'location'];

function buildBaseFilter(req, { matchMode = 'all' } = {}) {
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
  if (req.query.shopId) filter.shopId = req.query.shopId;
  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice) filter.price.$gte = Number(minPrice);
    if (maxPrice) filter.price.$lte = Number(maxPrice);
  }
  if (q && String(q).trim()) {
    Object.assign(filter, queryFilter(q, LISTING_TEXT_FIELDS, matchMode));
  }
  return filter;
}

async function withPlatformWindow(filter, req) {
  const requested = req.query.status;
  const status = requested ? requested : 'active';
  if (status !== 'active') return filter;
  const settings = await getPlatformSettings();
  const days = Number(settings.listingExpiryDays) || 0;
  if (days > 0) {
    // Global expiry applies to individual items only; a seller confirmation restarts the clock.
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    filter.$and = [
      ...(filter.$and || []),
      { $or: [{ sellerType: 'shop' }, { createdAt: { $gte: cutoff } }, { availabilityConfirmedAt: { $gte: cutoff } }] },
    ];
  }
  return filter;
}

function parseListingKind(value) {
  const kind = String(value || '').trim().toLowerCase();
  return ['single', 'stock', 'always'].includes(kind) ? kind : '';
}

async function ownListing(req, res) {
  const listing = await Listing.findById(req.params.id);
  if (!listing) {
    res.status(404).json({ message: 'Listing not found' });
    return null;
  }
  if (String(listing.seller) !== String(req.user._id)) {
    res.status(403).json({ message: 'You can only update your own listing' });
    return null;
  }
  if (listing.status === 'hidden' && listing.autoHidden?.reason === 'account_suspended') {
    res.status(403).json({ message: 'This listing was hidden by KinBech and cannot be restored yet' });
    return null;
  }
  if (listing.status === 'hidden' && listing.autoHidden?.reason === MODE_PAUSE_REASON) {
    const mode = listing.sellerType === 'shop' ? 'Store or Both' : 'Individual or Both';
    res.status(403).json({ message: `Paused while you sell in another mode. Switch to ${mode} in Seller Preference to show it again.` });
    return null;
  }
  return listing;
}

/** "Still available" — one tap from a push, My Listings, or a hidden listing. Restores auto-hidden items. */
async function confirmListingAvailable(req, res, next) {
  try {
    const listing = await ownListing(req, res);
    if (!listing) return;
    const autoSold = listing.status === 'sold' && listing.trust?.autoSoldAt;
    if (!['active', 'hidden'].includes(listing.status) && !autoSold) {
      return res.status(400).json({ message: 'Only live, auto-hidden or auto-sold listings can be confirmed' });
    }
    const { restored } = await confirmAvailable(listing, { stock: req.body?.stock });
    const fresh = await Listing.findById(listing._id).populate('seller', SELLER_POPULATE).populate('shopId', SHOP_POPULATE);
    res.json({ restored, listing: listingPayload(fresh) });
  } catch (error) {
    next(error);
  }
}

/** One-tap stock for store items: { stock } sets it, { delta } adds or removes. */
async function updateListingStock(req, res, next) {
  try {
    const listing = await ownListing(req, res);
    if (!listing) return;
    if (listing.sellerType !== 'shop') {
      return res.status(400).json({ message: 'Stock applies to store listings only' });
    }
    if (listing.hasVariants) {
      return res.status(400).json({ message: 'Edit the listing to change stock per option' });
    }
    const current = Number(listing.stock) || 0;
    let nextStock = current;
    if (req.body?.stock !== undefined) nextStock = Number(req.body.stock);
    else if (req.body?.delta !== undefined) nextStock = current + Number(req.body.delta);
    if (!Number.isFinite(nextStock)) return res.status(400).json({ message: 'Stock must be a number' });
    nextStock = Math.max(0, Math.floor(nextStock));
    const wasHidden = listing.status === 'hidden';
    if (nextStock > 0 && (wasHidden || listing.status === 'active')) {
      await confirmAvailable(listing, { stock: nextStock });
    } else {
      await Listing.updateOne({ _id: listing._id }, { $set: { stock: nextStock, stockConfirmedAt: new Date() } });
    }
    listingQueryCache.invalidateAll();
    const fresh = await Listing.findById(listing._id).populate('seller', SELLER_POPULATE).populate('shopId', SHOP_POPULATE);
    res.json({ listing: listingPayload(fresh) });
  } catch (error) {
    next(error);
  }
}

/** "All stock is correct" for every store item at once. */
async function confirmAllStock(req, res, next) {
  try {
    const now = new Date();
    const result = await Listing.updateMany(
      { seller: req.user._id, sellerType: 'shop', status: 'active' },
      { $set: { stockConfirmedAt: now, availabilityConfirmedAt: now, 'trust.confirmBy': null } }
    );
    listingQueryCache.invalidateAll();
    res.json({ confirmed: result.modifiedCount || 0 });
  } catch (error) {
    next(error);
  }
}

async function minPriceError(parsedPrice) {
  const settings = await getPlatformSettings();
  const min = Number(settings.minListingPrice) || 0;
  if (min > 0 && parsedPrice < min) {
    return `Minimum listing price is ${min} ${settings.defaultCurrency || 'NPR'}`;
  }
  return '';
}

const PERSONAL_POOL = 300;

/** Default feed for a signed-in buyer: the newest pool ranked by their interest, then the rest by date. */
async function personalizedListings(req, filter, profile, { page, limit, userLat, userLng, radiusKm }) {
  const { page: _page, limit: _limit, sort: _sort, ...poolQuery } = req.query;
  const poolKey = listingQueryCache.buildListingCacheKey('listings-pool', poolQuery);
  let pool = listingQueryCache.get(poolKey);
  if (!pool) {
    const docs = await Listing.find(filter)
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE)
      .sort({ createdAt: -1 })
      .limit(PERSONAL_POOL)
      .lean();
    const full = docs.length >= PERSONAL_POOL && !radiusKm;
    pool = { docs, total: full ? await Listing.countDocuments(filter) : docs.length, full };
    listingQueryCache.set(poolKey, pool);
  }

  let entries = attachDistances(pool.docs, userLat, userLng);
  if (radiusKm) entries = entries.filter(({ distance }) => distance != null && distance <= radiusKm);
  const ranked = rankForUser(entries, profile, { userId: req.user._id, diversify: !req.query.category });
  const total = pool.full ? pool.total : ranked.length;
  const start = (page - 1) * limit;
  let items = ranked.slice(start, start + limit);

  if (pool.full && items.length < limit && start + items.length < total) {
    const rest = await Listing.find({ ...filter, _id: { $nin: pool.docs.map((doc) => doc._id) } })
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE)
      .sort({ createdAt: -1 })
      .skip(Math.max(0, start - ranked.length))
      .limit(limit - items.length)
      .lean();
    items = items.concat(attachDistances(rest, userLat, userLng));
  }

  const totalPages = Math.max(1, Math.ceil(total / limit) || 1);
  return presentListings(
    {
      listings: items.map(({ doc, distance }) => listingPayload(doc, distance)),
      total,
      page,
      limit,
      totalPages,
      hasMore: start + items.length < total,
      appliedSort: 'recommended',
      personalized: true,
    },
    userLat,
    userLng,
  );
}

async function getListings(req, res, next) {
  try {
    const filter = await withPlatformWindow(buildBaseFilter(req), req);
    const {
      lat, lng, radius, sort,
    } = req.query;

    const userLat = lat != null && lat !== '' ? Number(lat) : null;
    const userLng = lng != null && lng !== '' ? Number(lng) : null;
    const radiusKm = radius && Number(radius) > 0 ? Number(radius) : null;
    const sortMode = String(sort || 'newest').toLowerCase();
    const { page, limit, skip } = parsePagination(req);

    if (req.user && req.query.category && page === 1) {
      recordInterestSoon(req.user._id, { kind: 'category', category: req.query.category });
    }
    if (req.user && (!sort || sortMode === 'recommended')) {
      const profile = await loadInterestProfile(req.user._id);
      if (profile) {
        return res.json(await personalizedListings(req, filter, profile, { page, limit, userLat, userLng, radiusKm }));
      }
    }

    const cacheKey = listingQueryCache.buildListingCacheKey('listings-geo2', {
      ...req.query,
      page,
      limit,
    });
    const cached = listingQueryCache.get(cacheKey);
    if (cached) {
      return res.json(presentListings(cached, userLat, userLng));
    }

    const mongoSort = {};
    if (sortMode === 'price-low') {
      mongoSort.price = 1;
    } else if (sortMode === 'price-high') {
      mongoSort.price = -1;
    } else {
      mongoSort.createdAt = -1;
    }

    // Fast path: DB-level skip/limit when we don't need in-memory distance/radius sorting
    const needsMemoryPath = Boolean(radiusKm) || sortMode === 'distance';
    if (!needsMemoryPath) {
      const [total, docs] = await Promise.all([
        Listing.countDocuments(filter),
        Listing.find(filter)
          .populate('seller', SELLER_POPULATE)
          .populate('shopId', SHOP_POPULATE)
          .sort(mongoSort)
          .skip(skip)
          .limit(limit)
          .lean(),
      ]);

      const listings = attachDistances(docs, userLat, userLng).map(({ doc, distance }) =>
        listingPayload(doc, distance)
      );
      // Soft boost: verified sellers float up within the page for browse/newest
      if (sortMode !== 'price-low' && sortMode !== 'price-high') {
        listings.sort((a, b) => {
          const score = (item) =>
            item.verificationKind === 'business' ? 2 : item.verificationKind === 'phone' ? 1 : 0;
          const diff = score(b) - score(a);
          if (diff !== 0) return diff;
          return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
        });
      }
      const payload = buildListResponse(listings, page, limit, total, sortMode);
      listingQueryCache.set(cacheKey, payload);
      return res.json(presentListings(payload, userLat, userLng));
    }

    const docs = await Listing.find(filter)
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE)
      .sort(mongoSort)
      .limit(200)
      .lean();

    const withDistance = attachDistances(docs, userLat, userLng);

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
        const diff = da - db;
        if (Math.abs(diff) > 5) return diff;
        return listingTrustBoost(b.doc) - listingTrustBoost(a.doc);
      });
    } else if (sortMode === 'price-low') {
      final = filteredByRadius.slice().sort((a, b) => {
        const diff = a.doc.price - b.doc.price;
        if (diff !== 0) return diff;
        return listingTrustBoost(b.doc) - listingTrustBoost(a.doc);
      });
    } else if (sortMode === 'price-high') {
      final = filteredByRadius.slice().sort((a, b) => {
        const diff = b.doc.price - a.doc.price;
        if (diff !== 0) return diff;
        return listingTrustBoost(b.doc) - listingTrustBoost(a.doc);
      });
    } else {
      // newest — verified sellers slightly above peers of similar age
      final = filteredByRadius.slice().sort((a, b) => {
        const trustDiff = listingTrustBoost(b.doc) - listingTrustBoost(a.doc);
        if (trustDiff !== 0) return trustDiff;
        const ta = new Date(a.doc.createdAt || 0).getTime();
        const tb = new Date(b.doc.createdAt || 0).getTime();
        return tb - ta;
      });
    }

    const paged = paginateItems(final, page, limit);
    const payload = {
      listings: paged.items.map(({ doc, distance }) => listingPayload(doc, distance)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
      hasMore: paged.hasMore,
      appliedSort: sortMode,
    };
    listingQueryCache.set(cacheKey, payload);
    return res.json(presentListings(payload, userLat, userLng));
  } catch (error) {
    next(error);
  }
}

async function searchListings(req, res, next) {
  try {
    const filter = await withPlatformWindow(buildBaseFilter(req), req);
    const {
      lat, lng, radius, sort,
    } = req.query;

    const userLat = lat != null && lat !== '' ? Number(lat) : null;
    const userLng = lng != null && lng !== '' ? Number(lng) : null;
    const radiusKm = radius && Number(radius) > 0 ? Number(radius) : null;
    const queryText = (req.query.q || '').toString().trim();
    const sortMode = String(sort || (queryText ? 'relevance' : 'distance')).toLowerCase();
    const { page, limit } = parsePagination(req);

    if (req.user && queryText && page === 1) {
      recordInterestSoon(req.user._id, { kind: 'search', query: queryText, category: req.query.category });
    }
    const wantsProfile = (queryText && sortMode === 'relevance') || sortMode === 'recommended';
    const profile = req.user && wantsProfile ? await loadInterestProfile(req.user._id) : null;

    const cacheKey = listingQueryCache.buildListingCacheKey('listings-search-geo3', {
      ...req.query,
      page,
      limit,
    });
    const cached = profile ? null : listingQueryCache.get(cacheKey);
    if (cached) {
      return res.json(presentListings(cached, userLat, userLng));
    }

    const fetchDocs = (query) => Listing.find(query)
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE)
      .sort({ createdAt: -1 })
      .limit(250)
      .lean();

    const tokens = searchTokens(queryText);
    const rankDocs = (docs) => docs.map((doc) => {
      const point = listingPoint(doc);
      let distance = null;
      if (userLat != null && userLng != null && point) {
        distance = haversineDistanceKm(userLat, userLng, point.lat, point.lng);
      }
      const trust = listingTrustBoost(doc);
      const personal = profile ? interestScore(doc, profile) * 20 : 0;
      const relevance = queryText ? scoreListing(doc, queryText, tokens) + trust + personal : trust;
      return { doc, distance, relevance, trust };
    }).filter(({ distance }) => {
      if (!radiusKm) return true;
      if (distance == null) return false;
      return distance <= radiusKm;
    });

    let matchMode = 'all';
    let sorted = rankDocs(await fetchDocs(filter));
    if (!sorted.length && tokens.length > 1) {
      matchMode = 'partial';
      const looseDocs = await fetchDocs(await withPlatformWindow(buildBaseFilter(req, { matchMode: 'any' }), req));
      sorted = rankDocs(looseDocs.filter((doc) => hasWordMatch(doc, tokens)));
    }

    if (sortMode === 'recommended') {
      if (profile) {
        sorted = rankForUser(sorted, profile, { userId: req.user._id, diversify: !req.query.category });
      } else {
        sorted.sort((a, b) => new Date(b.doc.createdAt || 0) - new Date(a.doc.createdAt || 0));
      }
    } else if (sortMode === 'relevance') {
      sorted.sort((a, b) => {
        const diff = b.relevance - a.relevance;
        if (diff !== 0) return diff;
        const trustDiff = b.trust - a.trust;
        if (trustDiff !== 0) return trustDiff;
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        return da - db;
      });
    } else if (sortMode === 'distance' && userLat != null && userLng != null) {
      sorted.sort((a, b) => {
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        const diff = da - db;
        if (Math.abs(diff) > 5) return diff;
        const trustDiff = b.trust - a.trust;
        if (trustDiff !== 0) return trustDiff;
        return b.relevance - a.relevance;
      });
    } else if (sortMode === 'price-low') {
      sorted.sort((a, b) => {
        const diff = a.doc.price - b.doc.price;
        if (diff !== 0) return diff;
        return b.trust - a.trust;
      });
    } else if (sortMode === 'price-high') {
      sorted.sort((a, b) => {
        const diff = b.doc.price - a.doc.price;
        if (diff !== 0) return diff;
        return b.trust - a.trust;
      });
    } else if (sortMode === 'newest') {
      sorted.sort((a, b) => {
        const trustDiff = b.trust - a.trust;
        if (trustDiff !== 0) return trustDiff;
        const ta = new Date(a.doc.createdAt || 0).getTime();
        const tb = new Date(b.doc.createdAt || 0).getTime();
        return tb - ta;
      });
    } else if (sortMode === 'trending') {
      sorted.sort((a, b) => {
        const viewDiff = (Number(b.doc.views) || 0) - (Number(a.doc.views) || 0);
        if (a.distance != null && b.distance != null && Math.abs(a.distance - b.distance) > 2) {
          return a.distance - b.distance;
        }
        if (viewDiff !== 0) return viewDiff;
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        return da - db;
      });
    } else {
      sorted.sort((a, b) => {
        const da = a.distance == null ? Infinity : a.distance;
        const db = b.distance == null ? Infinity : b.distance;
        const diff = da - db;
        if (Math.abs(diff) > 5) return diff;
        const trustDiff = b.trust - a.trust;
        if (trustDiff !== 0) return trustDiff;
        return b.relevance - a.relevance;
      });
    }

    const paged = paginateItems(sorted, page, limit);
    const payload = {
      listings: paged.items.map(({ doc, distance }) => listingPayload(doc, distance)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      totalPages: paged.totalPages,
      hasMore: paged.hasMore,
      appliedSort: sortMode,
      matchMode,
    };
    if (!profile) listingQueryCache.set(cacheKey, payload);
    return res.json(presentListings(payload, userLat, userLng));
  } catch (error) {
    next(error);
  }
}

const SUGGESTION_LIMIT = 8;

async function getSearchSuggestions(req, res, next) {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    const tokens = searchTokens(q);
    if (!q) return res.json({ suggestions: [], categories: [], stores: [] });

    const cacheKey = listingQueryCache.buildListingCacheKey('listings-suggest', { q: normalize(q) });
    const cached = listingQueryCache.get(cacheKey);
    if (cached) return res.json(cached);

    const nameFilter = queryFilter(q, ['name'], 'all');
    const [docs, shops] = await Promise.all([
      Listing.find({ status: 'active', ...queryFilter(q, ['title', 'searchWords', 'category'], 'all') })
        .select('title searchWords category photos')
        .sort({ createdAt: -1 })
        .limit(120)
        .lean(),
      Shop.find({ status: 'active', ...nameFilter })
        .select('name logo category isVerified')
        .limit(12)
        .lean(),
    ]);

    const phrases = new Map();
    const addPhrase = (text, type, photo) => {
      const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 70);
      const score = scoreName(clean, q, tokens);
      if (!clean || score <= 0) return;
      const key = clean.toLowerCase();
      const prev = phrases.get(key);
      if (prev) {
        prev.count += 1;
        if (!prev.photo && photo) prev.photo = photo;
        return;
      }
      phrases.set(key, { text: clean, type, photo: photo || '', count: 1, score });
    };

    const categoryCounts = new Map();
    docs.forEach((doc) => {
      addPhrase(doc.title, 'listing', doc.photos?.[0]);
      (doc.searchWords || []).forEach((word) => addPhrase(word, 'keyword'));
      if (doc.category && scoreName(doc.category, q, tokens) > 0) {
        categoryCounts.set(doc.category, (categoryCounts.get(doc.category) || 0) + 1);
      }
    });

    const suggestions = [...phrases.values()]
      .sort((a, b) => (b.score - a.score) || (b.count - a.count) || (a.text.length - b.text.length))
      .slice(0, SUGGESTION_LIMIT)
      .map(({ text, type, photo, count }) => ({ text, type, photo, count }));

    const categories = [...categoryCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));

    const stores = shops
      .map((shop) => ({ shop, score: scoreName(shop.name, q, tokens) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(({ shop }) => ({
        id: shop._id,
        name: shop.name,
        logo: shop.logo || '',
        category: shop.category || '',
        isVerified: Boolean(shop.isVerified),
      }));

    const payload = { suggestions, categories, stores };
    listingQueryCache.set(cacheKey, payload);
    return res.json(payload);
  } catch (error) {
    return next(error);
  }
}

/** Categories this buyer browses most, strongest first (used to order category chips). */
async function getMyInterests(req, res, next) {
  try {
    res.json({ categories: await topInterestCategories(req.user._id) });
  } catch (error) {
    next(error);
  }
}

async function getMyCategoryUsage(req, res, next) {
  try {
    const rows = await Listing.aggregate([
      {
        $match: {
          seller: req.user._id,
          status: { $in: ['active', 'pending', 'sold'] },
        },
      },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
    ]);
    res.json({
      categories: rows
        .filter((row) => row._id)
        .map((row) => ({ name: row._id, count: row.count })),
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
      .sort({ createdAt: -1 })
      .lean();

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
    const chats = await Chat.find({ participants: req.user._id, listing: { $ne: null } })
      .select('listing meetupConfirmed lastMessageAt')
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

/** Pending/removed listings: only the seller, admins, and buyers already chatting about it. */
async function canViewListing(doc, user) {
  if (doc.status === 'active' || doc.status === 'sold') return true;
  if (!user) return false;
  if (String(doc.seller?._id || doc.seller) === String(user._id) || isAdminRole(user.role)) return true;
  return Boolean(await Chat.exists({ listing: doc._id, participants: user._id }));
}

async function getListing(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const userLat = lat != null && lat !== '' ? Number(lat) : null;
    const userLng = lng != null && lng !== '' ? Number(lng) : null;

    const doc = await Listing.findById(req.params.id)
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE);

    if (!doc || !(await canViewListing(doc, req.user))) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    if (req.user && String(doc.seller?._id || doc.seller) !== String(req.user._id)) {
      recordInterestSoon(req.user._id, { kind: 'view', listing: doc });
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

    const presented = presentListings({ listings: [listingPayload(doc, distance)] }, userLat, userLng);
    res.json({ listing: presented.listings[0] });
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
    const priceError = await minPriceError(parsedPrice);
    if (priceError) {
      return res.status(400).json({ message: priceError });
    }
    const platform = await getPlatformSettings();

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
    if (!modeAllowsListing(req.user, sellerType)) {
      return res.status(403).json({
        code: 'seller_mode',
        message: sellerType === 'shop'
          ? 'Switch to Store or Both in Seller Preference to post store products.'
          : 'Switch to Individual or Both in Seller Preference to post personal items.',
      });
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

    if (
      (resolvedCoordinates.lat == null || resolvedCoordinates.lng == null) &&
      resolvedLocation
    ) {
      const named = coordsForPlaceName(resolvedLocation);
      if (named) resolvedCoordinates = named;
    }

    const spamCheck = await assertListingNotSpam(req.user, {
      title,
      price: parsedPrice,
      sellerType,
      shop: shopRecord,
    });
    if (!spamCheck.ok) {
      return res.status(spamCheck.httpStatus || 400).json({
        message: spamCheck.message,
        code: spamCheck.code,
        ...(spamCheck.meta || {}),
      });
    }

    const prohibited = await prohibitedListingBody({
      title,
      description,
      category,
      brand,
      sku,
      location: resolvedLocation,
      searchWords: normalizeSearchWords(req.body.searchWords),
      variantOptions: variantResult.variantOptions,
      variants: variantResult.variants,
    });
    if (prohibited) {
      return res.status(400).json(prohibited);
    }

    const resolvedCategory = await resolveProductCategory({
      name: category,
      title,
      description,
      createIfMissing: true,
    });

    const listingData = {
      seller: req.user._id,
      isTest: Boolean(req.user.isTester),
      sellerType,
      title: String(title).trim(),
      description: description || '',
      price: parsedPrice,
      currency: req.body.currency || platform.defaultCurrency || 'NPR',
      category: resolvedCategory?.name || String(category).trim(),
      condition: condition || 'Good',
      photos: Array.isArray(photos) ? photos : [],
      location: resolvedLocation,
      coordinates: resolvedCoordinates,
      meetupOption: meetupOption || 'Public place',
      searchWords: normalizeSearchWords(req.body.searchWords),
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
      listingData.listingKind = parseListingKind(req.body.listingKind) || 'stock';
      if (req.body.lowStockLimit !== undefined) listingData.lowStockLimit = Math.max(0, Math.floor(Number(req.body.lowStockLimit) || 0));
      listingData.stockConfirmedAt = new Date();
    } else {
      listingData.listingKind = 'single';
    }

    const moderation = await evaluateListingModeration(listingData);
    if (!moderation.ok) {
      return res.status(moderation.httpStatus || 400).json(publicProhibitedBody(moderation));
    }
    const { reasons, priceHeld, photoHeld } = await collectReviewReasons({
      moderation,
      listingLike: listingData,
      price: parsedPrice,
      priceEstimate: req.body.priceEstimate,
      imageFlag: req.body.imageFlag,
    });
    if (req.user.trustTier === 'restricted') {
      reasons.push('New listings from this account are checked by our team first.');
    }
    if (reasons.length) {
      moderation.status = 'pending';
      moderation.reason = `${reasons.join(' ')} ${HELD_NOTE}`;
    }

    listingData.status = moderation.status;
    listingData.statusChange = moderation.status === 'active'
      ? statusChange('active', 'seller', 'posted')
      : statusChange(moderation.status, 'auto', moderation.status === 'pending' ? 'review' : 'blocked');
    listingData.moderationReason = moderation.reason || '';
    listingData.matchedKeywords = moderation.matchedKeywords || [];
    listingData.heldAt = moderation.status === 'pending' ? new Date() : null;

    const listing = await Listing.create(listingData);
    emitActivity(listingActivityEvent(listing));

    await listing.populate('seller', 'name phone avatarUrl soldCount boughtCount location bio preferences');
    if (listing.shopId) {
      await listing.populate('shopId', 'name logo ratingAverage reviewCount');
    }

    listingQueryCache.invalidateAll();
    res.status(201).json({
      listing: listingPayload(listing),
      moderation: {
        status: moderation.status,
        reason: moderation.reason || '',
        matchedKeywords: moderation.matchedKeywords || [],
        requiresPreApproval: moderation.requiresPreApproval,
        priceReview: priceHeld,
        photoReview: photoHeld,
      },
    });
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

    const previousStatus = listing.status;
    const wasSold = listing.status === 'sold';
    const wasRejected = listing.status === 'removed';
    const wasPending = listing.status === 'pending';
    const previousReason = listing.moderationReason || '';

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
      // Shop-specific fields
      'brand',
      'sku',
      'originalPrice',
      'isOnSale',
    ];

    const markingSoldOnly = Boolean(req.body.markSold || req.body.status === 'sold');
    if (!markingSoldOnly) {
      const pick = (key) => (req.body[key] !== undefined ? req.body[key] : listing[key]);
      const prohibited = await prohibitedListingBody({
        title: pick('title'),
        description: pick('description'),
        category: pick('category'),
        brand: pick('brand'),
        sku: pick('sku'),
        location: pick('location'),
        searchWords:
          req.body.searchWords !== undefined
            ? normalizeSearchWords(req.body.searchWords)
            : listing.searchWords,
        variantOptions: pick('variantOptions'),
        variants: pick('variants'),
      });
      if (prohibited) {
        return res.status(400).json(prohibited);
      }
    }

    for (const field of fields) {
      if (req.body[field] === undefined) continue;
      if (field === 'category') {
        const resolvedCategory = await resolveProductCategory({
          name: req.body.category,
          title: req.body.title || listing.title,
          description: req.body.description || listing.description,
          createIfMissing: true,
        });
        listing.category = resolvedCategory?.name || String(req.body.category).trim();
        continue;
      }
      listing[field] = req.body[field];
    }

    if (req.body.searchWords !== undefined) {
      listing.searchWords = normalizeSearchWords(req.body.searchWords);
    }

    // Sellers may only mark sold — not self-publish past moderation
    if (req.body.markSold || req.body.status === 'sold') {
      listing.status = 'sold';
    }

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
      const kind = parseListingKind(req.body.listingKind);
      if (kind) listing.listingKind = kind;
      if (req.body.lowStockLimit !== undefined) listing.lowStockLimit = Math.max(0, Math.floor(Number(req.body.lowStockLimit) || 0));
    }

    // Any edit by the seller counts as "still available / stock checked".
    listing.availabilityConfirmedAt = new Date();
    listing.stockConfirmedAt = new Date();
    listing.set('trust.soldWordAt', null);
    listing.set('trust.promptedAt', null);
    listing.set('trust.confirmBy', null);
    listing.set('trust.rankPenalty', 0);

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
      const priceError = await minPriceError(parsedPrice);
      if (priceError) {
        return res.status(400).json({ message: priceError });
      }
      listing.price = parsedPrice;
    }

    if (req.body.markSold) {
      listing.status = 'sold';
    }

    if (listing.status !== 'sold') {
      const moderation = await evaluateListingModeration(
        {
          title: listing.title,
          description: listing.description,
          brand: listing.brand,
          sku: listing.sku,
          location: listing.location,
          category: listing.category,
          searchWords: listing.searchWords,
          variantOptions: listing.variantOptions,
          variants: listing.variants,
        },
        { currentStatus: listing.status }
      );
      if (!moderation.ok) {
        return res.status(moderation.httpStatus || 400).json(publicProhibitedBody(moderation));
      }
      const { reasons } = await collectReviewReasons({
        moderation,
        listingLike: listing,
        price: listing.price,
        excludeId: listing._id,
        priceEstimate: req.body.priceEstimate,
        imageFlag: req.body.imageFlag,
      });
      if (reasons.length) {
        moderation.status = 'pending';
        moderation.reason = `${reasons.join(' ')} ${HELD_NOTE}`;
      } else if (wasRejected) {
        moderation.status = 'pending';
        moderation.reason = `Edited after rejection. ${HELD_NOTE}`;
      } else if (wasPending) {
        // Only an admin can publish a held listing; editing it never self-publishes.
        moderation.status = 'pending';
        moderation.reason = previousReason || `Edited while in review. ${HELD_NOTE}`;
      }
      listing.status = moderation.status;
      listing.moderationReason = moderation.reason || '';
      listing.matchedKeywords = moderation.matchedKeywords || [];
      listing.heldAt = moderation.status === 'pending' ? listing.heldAt || new Date() : null;
    }

    if (previousStatus === 'hidden' && listing.autoHidden?.reason === MODE_PAUSE_REASON && listing.status === 'active') {
      // Editing never brings back a listing paused by a seller-mode switch; switching back does.
      listing.status = 'hidden';
    }
    if (!wasSold && listing.status === 'sold' && !listing.soldAt) {
      listing.soldAt = new Date();
    }
    if (listing.status !== previousStatus) {
      listing.statusChange = listing.status === 'pending'
        ? statusChange('pending', 'auto', 'review')
        : statusChange(listing.status, 'seller', listing.status === 'sold' ? 'marked_sold' : 'edited');
    }

    await listing.save();
    if (!wasSold && listing.status === 'sold') {
      onListingMarkedSold(listing);
      await User.findByIdAndUpdate(listing.seller, { $inc: { soldCount: 1 } });
      if (listing.sellerType === 'shop' && listing.shopId) {
        recordShopSale(listing.shopId, listing.price).catch(() => {});
      }
    }
    await listing.populate('seller', 'name phone avatarUrl rating soldCount boughtCount location bio preferences');
    listingQueryCache.invalidateAll();
    res.json({
      listing: listingPayload(listing),
      moderation: {
        status: listing.status,
        reason: listing.moderationReason || '',
        matchedKeywords: listing.matchedKeywords || [],
      },
    });
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
    listingQueryCache.invalidateAll();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function getCategoryCounts(req, res, next) {
  try {
    const filter = await withPlatformWindow(buildBaseFilter(req), req);
    const cacheKey = listingQueryCache.buildListingCacheKey('category-counts', {
      ...req.query,
    });
    const cached = listingQueryCache.get(cacheKey);
    if (cached) {
      return res.json(cached);
    }

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

    const payload = { counts, total };
    listingQueryCache.set(cacheKey, payload);
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function getAllListingsAdmin(req, res, next) {
  try {
    const { status, q } = req.query;
    const filter = {};

    if (status && status !== 'all') {
      if (status === 'reported') {
        const reportedIds = await Report.distinct('reportedListing', {
          reportedListing: { $ne: null },
        });
        filter._id = { $in: reportedIds };
      } else {
        filter.status = status;
      }
    }

    const search = String(q || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: re },
        { description: re },
        { category: re },
        { location: re },
        { brand: re },
        { sku: re },
      ];
    }

    const { page, limit, skip } = parsePagination(req);

    const [total, listings] = await Promise.all([
      Listing.countDocuments(filter),
      Listing.find(filter)
        .populate('seller', 'name phone avatarUrl location bio preferences')
        .populate('shopId', 'name logo')
        .sort(req.query.sort === 'oldest' ? { heldAt: 1, createdAt: 1 } : { createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

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

    res.json({
      listings: listingsWithReports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
}

async function notifyReviewResult(listing) {
  const approved = listing.status === 'active';
  const note = await Notification.create({
    user: listing.seller,
    type: 'listing',
    title: approved ? 'Listing approved' : 'Listing rejected',
    body: approved
      ? `"${listing.title}" passed review and is now live.`
      : `"${listing.title}" was not approved. Reason: ${listing.moderationReason || 'Did not meet KinBech rules.'}`,
    icon: approved ? 'checkmark-circle-outline' : 'close-circle-outline',
    route: 'MyListings',
    params: { listingTitle: listing.title, listingImage: listing.photos?.[0] || '' },
    relatedListing: listing._id,
  });
  sendUserPush({
    userId: note.user,
    title: note.title,
    body: note.body,
    data: {
      type: note.type,
      notificationId: String(note._id),
      route: note.route,
      listingTitle: listing.title,
      listingImage: listing.photos?.[0] || '',
    },
  }).catch(() => {});
}

async function updateListingStatusAdmin(req, res, next) {
  try {
    const { listingId } = req.params;
    const { status } = req.body;

    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    let nextStatus = status || listing.status;
    if (nextStatus === 'rejected') nextStatus = 'removed';
    if (!['active', 'pending', 'sold', 'removed'].includes(nextStatus)) {
      return res.status(400).json({
        message: 'Status must be active, pending, sold, or removed',
      });
    }

    const wasPending = listing.status === 'pending';
    if (listing.status !== nextStatus) {
      const reasons = { active: wasPending ? 'approved' : 'restored', pending: 'held', sold: 'marked_sold', removed: 'rejected' };
      listing.statusChange = statusChange(nextStatus, 'admin', reasons[nextStatus]);
    }
    listing.status = nextStatus;
    if (nextStatus === 'active') {
      listing.moderationReason = '';
      listing.matchedKeywords = [];
      listing.heldAt = null;
    } else if (nextStatus === 'pending' || nextStatus === 'removed') {
      if (!listing.heldAt) listing.heldAt = new Date();
      const reason = String(req.body.reason || '').trim();
      const heldReason = String(listing.moderationReason || '').replace(/\s*Held for manual review\.?\s*$/i, '').trim();
      if (reason) listing.moderationReason = reason;
      else if (nextStatus === 'removed') {
        listing.moderationReason =
          heldReason || (status === 'rejected' ? 'Rejected by admin' : 'Removed by admin');
      }
    }

    await listing.save();
    listingQueryCache.invalidateAll();

    if (nextStatus === 'active') {
      // An admin has seen these photos; later edits should not hold the listing for them again.
      const filenames = (listing.photos || []).map((url) => String(url || '').split('?')[0].split('/').pop()).filter(Boolean);
      if (filenames.length) await FlaggedMedia.deleteMany({ filename: { $in: filenames } }).catch(() => {});
    }

    if (wasPending && (nextStatus === 'active' || nextStatus === 'removed')) {
      notifyReviewResult(listing).catch(() => {});
    }

    res.json({ 
      message: 'Listing status updated successfully',
      listing: listingPayload(listing)
    });
  } catch (error) {
    next(error);
  }
}

async function featureListing(req, res, next) {
  try {
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    if (req.user.trustTier === 'restricted') {
      return res.status(403).json({ message: 'Featuring is not available for this account right now.', code: 'TRUST_RESTRICTED' });
    }

    const result = await featureListingWithCredit(req.user, listing);
    if (!result.ok) {
      return res.status(result.httpStatus || 400).json({
        message: result.message,
        code: result.code,
        featuredUntil: result.featuredUntil || null,
      });
    }

    listingQueryCache.invalidateAll();
    await listing.populate('seller', SELLER_POPULATE);
    if (listing.shopId) {
      await listing.populate('shopId', SHOP_POPULATE);
    }

    res.json({
      message: result.message,
      featuredUntil: result.featuredUntil,
      featuredCredits: result.featuredCredits,
      listing: listingPayload(listing),
    });
  } catch (error) {
    next(error);
  }
}

const RELATED_TITLE_STOP = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'to', 'of', 'in', 'on', 'at', 'by',
  'from', 'is', 'it', 'this', 'that', 'sale', 'item',
]);

// Colours and materials are shared by unrelated products (a blue chair and a
// blue dustbin), so they only break ties between items of the same type.
const RELATED_COLOR_WORDS = new Set([
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple', 'orange',
  'brown', 'grey', 'gray', 'silver', 'gold', 'golden', 'navy', 'maroon', 'beige',
  'cream', 'dark', 'light', 'multicolor', 'multicolour', 'colour', 'color', 'midnight',
]);
const RELATED_DESCRIPTOR_WORDS = new Set([
  'plastic', 'wooden', 'wood', 'metal', 'steel', 'iron', 'fabric', 'leather', 'glass',
  'cotton', 'solid', 'material', 'new', 'used', 'old', 'small', 'big', 'large', 'mini',
  'portable', 'single', 'double', 'set', 'pack', 'piece', 'pcs', 'with', 'without',
]);

function relatedTokenWeight(token) {
  if (RELATED_COLOR_WORDS.has(token)) return 0.25;
  if (RELATED_DESCRIPTOR_WORDS.has(token)) return 0.5;
  return 3;
}

function titleMatchTokens(title) {
  const words = String(title || '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 && !RELATED_TITLE_STOP.has(word));
  return [...new Set(words)].slice(0, 16);
}

async function getRelatedListings(req, res, next) {
  try {
    const tokens = titleMatchTokens(req.query.title);
    const exclude = String(req.query.exclude || '');
    const category = String(req.query.category || '');
    const limit = Math.min(12, Math.max(1, parseInt(req.query.limit, 10) || 8));
    if (!tokens.length) {
      return res.json({ listings: [] });
    }

    const or = tokens.flatMap((token) => {
      const pattern = { $regex: token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
      return relatedTokenWeight(token) >= 3
        ? [{ title: pattern }, { searchWords: pattern }]
        : [{ title: pattern }];
    });
    const docs = await Listing.find({ status: 'active', $or: or })
      .populate('seller', SELLER_POPULATE)
      .populate('shopId', SHOP_POPULATE)
      .limit(150)
      .lean();

    const ranked = docs
      .filter((doc) => String(doc._id) !== exclude)
      .map((doc) => {
        const title = String(doc.title || '').toLowerCase();
        const titleWords = new Set(titleMatchTokens(doc.title));
        const words = (doc.searchWords || []).map((word) => String(word || '').toLowerCase());
        let score = 0;
        let typeMatch = false;
        tokens.forEach((token) => {
          const weight = relatedTokenWeight(token);
          const hit = weight >= 3 ? title.includes(token) : titleWords.has(token);
          if (hit) {
            score += weight;
            if (weight >= 3) typeMatch = true;
          } else if (weight >= 3 && words.some((word) => word.includes(token))) {
            score += 1;
            typeMatch = true;
          }
        });
        return {
          doc,
          score,
          typeMatch,
          sameCategory: Boolean(category) && doc.category === category,
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (a.typeMatch !== b.typeMatch) return a.typeMatch ? -1 : 1;
        if (b.score !== a.score) return b.score - a.score;
        if (a.sameCategory !== b.sameCategory) return a.sameCategory ? -1 : 1;
        const ta = new Date(a.doc.createdAt || 0).getTime();
        const tb = new Date(b.doc.createdAt || 0).getTime();
        return tb - ta;
      })
      .slice(0, limit);

    return res.json({
      listings: ranked.map(({ doc }) => listingPayload(doc)),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getListings,
  searchListings,
  getSearchSuggestions,
  getRelatedListings,
  getCategoryCounts,
  getMyCategoryUsage,
  getMyInterests,
  getMyListings,
  getMyPurchases,
  getListing,
  incrementView,
  createListing,
  updateListing,
  deleteListing,
  featureListing,
  getAllListingsAdmin,
  updateListingStatusAdmin,
  confirmListingAvailable,
  updateListingStock,
  confirmAllStock,
};
