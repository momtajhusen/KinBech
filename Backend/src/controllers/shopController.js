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
    const { status, isVerified } = req.query;
    const filter = {};

    if (status) {
      filter.status = status;
    }
    if (isVerified !== undefined) {
      filter.isVerified = isVerified === 'true';
    }

    const shops = await Shop.find(filter)
      .populate('owner', 'name avatarUrl phone')
      .sort({ createdAt: -1 })
      .limit(100);

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
      ...shop.toObject(),
      listingsCount: listingCountMap[shop._id.toString()] || 0
    }));

    res.json({ shops: shopsWithCounts });
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