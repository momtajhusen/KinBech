const Shop = require('../models/Shop');
const Listing = require('../models/Listing');
const Review = require('../models/Review');
const { mapShopCategory } = require('../utils/shopCategory');
const { recordShopMetric } = require('../utils/shopAnalytics');
const { buildStorefrontPayload } = require('../utils/storefront');
const {
  normalizeTaxId,
  parseBusinessDocuments,
  markVerificationPending,
  shopPublicFields,
} = require('../utils/shopVerification');
const { evaluatePublicText, publicProhibitedBody } = require('../utils/listingModeration');
const { emitActivity } = require('../utils/realtime');
const { shopActivityEvent } = require('../utils/activityEvents');

function shopContentBag(shopLike) {
  return {
    shopName: shopLike.name,
    shopDescription: shopLike.description,
    shopTagline: shopLike.tagline,
    shopCategory: shopLike.category,
    shopAddress: [shopLike.address, shopLike.location].filter(Boolean).join(' '),
  };
}

function shopProhibitedBody(result) {
  const body = publicProhibitedBody(result);
  const fieldErrors = { ...body.fieldErrors };
  if (fieldErrors.shopName) fieldErrors.name = fieldErrors.shopName;
  if (fieldErrors.shopDescription) fieldErrors.description = fieldErrors.shopDescription;
  if (fieldErrors.shopTagline) fieldErrors.tagline = fieldErrors.shopTagline;
  if (fieldErrors.shopCategory) fieldErrors.category = fieldErrors.shopCategory;
  if (fieldErrors.shopAddress) {
    fieldErrors.address = fieldErrors.shopAddress;
    fieldErrors.location = fieldErrors.shopAddress;
  }
  return { ...body, fieldErrors };
}

const OPEN_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAYMENT_METHODS = ['Cash', 'eSewa', 'Khalti', 'Fonepay', 'Bank transfer', 'Card'];
const TEXT_LIMITS = {
  tagline: 80,
  whatsapp: 20,
  email: 120,
  website: 200,
  deliveryAreas: 200,
  returnPolicy: 300,
};
const SOCIAL_KEYS = ['facebook', 'instagram', 'tiktok', 'youtube'];

function cleanText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function applyProfileExtras(shop, body) {
  Object.entries(TEXT_LIMITS).forEach(([field, max]) => {
    if (body[field] !== undefined) shop[field] = cleanText(body[field], max);
  });
  if (body.coverImage !== undefined) shop.coverImage = cleanText(body.coverImage, 500);
  if (body.socialLinks && typeof body.socialLinks === 'object') {
    const next = { ...(shop.socialLinks?.toObject ? shop.socialLinks.toObject() : shop.socialLinks || {}) };
    SOCIAL_KEYS.forEach((key) => {
      if (body.socialLinks[key] !== undefined) next[key] = cleanText(body.socialLinks[key], 200);
    });
    shop.socialLinks = next;
  }
  if (Array.isArray(body.openDays)) {
    shop.openDays = OPEN_DAYS.filter((day) => body.openDays.includes(day));
  }
  if (Array.isArray(body.paymentMethods)) {
    shop.paymentMethods = PAYMENT_METHODS.filter((m) => body.paymentMethods.includes(m));
  }
  if (body.deliveryAvailable !== undefined) shop.deliveryAvailable = Boolean(body.deliveryAvailable);
  if (body.establishedYear !== undefined) {
    const year = Number(body.establishedYear);
    const max = new Date().getFullYear();
    shop.establishedYear = Number.isInteger(year) && year >= 1900 && year <= max ? year : null;
  }
}

async function createShop(req, res, next) {
  try {
    const { name, category, description, phone, address, location, openingHours, logo } = req.body;

    if (!name || !category) {
      return res.status(400).json({ message: 'Shop name and category are required' });
    }

    // Check if user already has an active shop
    const existingShop = await Shop.findOne({ 
      owner: req.user._id, 
      status: 'active' 
    });

    if (existingShop) {
      return res.status(400).json({ message: 'You already have an active shop' });
    }

    const contentCheck = await evaluatePublicText(
      shopContentBag({
        name: name.trim(),
        description: description?.trim() || '',
        tagline: req.body.tagline,
        category,
        address,
        location,
      }),
      'shop'
    );
    if (!contentCheck.ok) {
      return res.status(contentCheck.httpStatus || 400).json(shopProhibitedBody(contentCheck));
    }

    const panNumber = normalizeTaxId(req.body.panNumber);
    const vatNumber = normalizeTaxId(req.body.vatNumber);
    const businessDocuments = parseBusinessDocuments(req.body.businessDocuments) || [];

    const shop = new Shop({
      owner: req.user._id,
      name: name.trim(),
      category: mapShopCategory(category),
      description: description?.trim() || '',
      phone: phone?.trim() || '',
      address: address?.trim() || '',
      location: location?.trim() || '',
      openingHours: openingHours || '9:00 AM - 8:00 PM',
      logo: logo || '',
      coordinates: {
        lat: req.body.coordinates?.lat != null ? Number(req.body.coordinates.lat) : null,
        lng: req.body.coordinates?.lng != null ? Number(req.body.coordinates.lng) : null,
      },
      panNumber,
      vatNumber,
      businessDocuments,
      isVerified: false,
      verificationStatus: 'none',
      ratingAverage: 0,
      reviewCount: 0,
      followersCount: 0,
      status: 'active'
    });

    markVerificationPending(shop);
    await shop.save();
    emitActivity(shopActivityEvent(shop));

    res.status(201).json({ 
      message: 'Shop created successfully',
      shop: shopPublicFields(shop),
    });
  } catch (error) {
    next(error);
  }
}

async function getMyShop(req, res, next) {
  try {
    const shop = await Shop.findOne({ 
      owner: req.user._id, 
      status: 'active' 
    });

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    res.json({
      shop: {
        ...shop.toObject(),
        storefront: buildStorefrontPayload(shop),
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getShopById(req, res, next) {
  try {
    const { shopId } = req.params;
    const shop = await Shop.findById(shopId);

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    if (shop.status !== 'active') {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const isOwner = req.user && String(shop.owner) === String(req.user._id);
    if (!isOwner) {
      recordShopMetric(shop._id, 'profileViews').catch(() => {});
    }

    res.json({ shop });
  } catch (error) {
    next(error);
  }
}

async function updateShop(req, res, next) {
  try {
    const { shopId } = req.params;
    const shop = await Shop.findById(shopId);

    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Authorization check
    if (String(shop.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only edit your own shop' });
    }

    const allowedUpdates = ['name', 'description', 'phone', 'address', 'location', 'openingHours', 'logo'];
    allowedUpdates.forEach(field => {
      if (req.body[field] !== undefined) {
        shop[field] = req.body[field];
      }
    });
    if (req.body.category !== undefined) {
      shop.category = mapShopCategory(req.body.category);
    }
    applyProfileExtras(shop, req.body);
    if (req.body.coordinates) {
      shop.coordinates = {
        lat: req.body.coordinates.lat != null ? Number(req.body.coordinates.lat) : shop.coordinates?.lat,
        lng: req.body.coordinates.lng != null ? Number(req.body.coordinates.lng) : shop.coordinates?.lng,
      };
    }

    let taxOrDocsTouched = false;
    if (req.body.panNumber !== undefined) {
      shop.panNumber = normalizeTaxId(req.body.panNumber);
      taxOrDocsTouched = true;
    }
    if (req.body.vatNumber !== undefined) {
      shop.vatNumber = normalizeTaxId(req.body.vatNumber);
      taxOrDocsTouched = true;
    }
    if (req.body.businessDocuments !== undefined) {
      const docs = parseBusinessDocuments(req.body.businessDocuments);
      if (docs) {
        shop.businessDocuments = docs;
        taxOrDocsTouched = true;
      }
    }

    const contentCheck = await evaluatePublicText(shopContentBag(shop), 'shop');
    if (!contentCheck.ok) {
      return res.status(contentCheck.httpStatus || 400).json(shopProhibitedBody(contentCheck));
    }

    if (taxOrDocsTouched) {
      // New tax/docs material after approval → re-review and hide badge until approved again
      if (shop.verificationStatus === 'approved' || shop.isVerified) {
        shop.verificationStatus = 'pending';
        shop.verificationSubmittedAt = new Date();
        shop.isVerified = false;
      } else {
        markVerificationPending(shop);
      }
    }

    await shop.save();

    res.json({ 
      message: 'Shop updated successfully',
      shop: shopPublicFields(shop),
    });
  } catch (error) {
    next(error);
  }
}

async function getShopListings(req, res, next) {
  try {
    const { shopId } = req.params;
    const { status = 'active' } = req.query;

    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const listings = await Listing.find({ 
      shopId, 
      sellerType: 'shop',
      status 
    })
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({ listings });
  } catch (error) {
    next(error);
  }
}

async function getShopReviews(req, res, next) {
  try {
    const { shopId } = req.params;

    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const reviews = await Review.find({ 
      shopId, 
      status: 'approved' 
    })
    .populate('reviewer', 'name avatarUrl')
    .populate('listing', 'title photos')
    .sort({ createdAt: -1 })
    .limit(50);

    res.json({ reviews });
  } catch (error) {
    next(error);
  }
}

async function getAllShops(req, res, next) {
  try {
    const { category, status = 'active' } = req.query;
    const filter = { status };

    if (category) {
      filter.category = category;
    }

    const shops = await Shop.find(filter)
      .populate('owner', 'name avatarUrl')
      .sort({ ratingAverage: -1, reviewCount: -1 })
      .limit(50);

    res.json({ shops });
  } catch (error) {
    next(error);
  }
}

async function updateShopStatus(req, res, next) {
  try {
    const { shopId } = req.params;
    const { status, isVerified, verificationNotes } = req.body;

    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    if (status !== undefined) {
      shop.status = status;
    }
    if (isVerified !== undefined) {
      shop.isVerified = Boolean(isVerified);
      if (shop.isVerified) {
        shop.verificationStatus = 'approved';
      } else if (shop.verificationStatus === 'approved') {
        shop.verificationStatus = 'rejected';
      }
    }
    if (verificationNotes !== undefined) {
      shop.verificationNotes = String(verificationNotes || '').trim();
    }
    if (req.body.verificationStatus !== undefined) {
      const next = String(req.body.verificationStatus);
      if (['none', 'pending', 'approved', 'rejected'].includes(next)) {
        shop.verificationStatus = next;
        if (next === 'approved') shop.isVerified = true;
        if (next === 'rejected' || next === 'none') shop.isVerified = false;
      }
    }

    await shop.save();

    res.json({ 
      message: 'Shop status updated successfully',
      shop: shopPublicFields(shop),
    });
  } catch (error) {
    next(error);
  }
}

async function getAllShopsAdmin(req, res, next) {
  try {
    const { status, isVerified, q } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }
    if (isVerified !== undefined) {
      filter.isVerified = isVerified === 'true';
    }

    const search = String(q || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { location: re }, { category: re }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, shops] = await Promise.all([
      Shop.countDocuments(filter),
      Shop.find(filter)
        .populate('owner', 'name avatarUrl phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // Add listing counts
    const shopIds = shops.map(s => s._id);
    const listingCounts = await Listing.aggregate([
      { $match: { shopId: { $in: shopIds }, status: 'active' } },
      { $group: { _id: '$shopId', count: { $sum: 1 } } }
    ]);

    const listingCountMap = {};
    listingCounts.forEach(item => {
      listingCountMap[item._id.toString()] = item.count;
    });

    const shopsWithCounts = shops.map(shop => ({
      ...shop,
      listingsCount: listingCountMap[shop._id.toString()] || 0
    }));

    res.json({
      shops: shopsWithCounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createShop,
  getMyShop,
  getShopById,
  updateShop,
  getShopListings,
  getShopReviews,
  getAllShops,
  updateShopStatus,
  getAllShopsAdmin
};