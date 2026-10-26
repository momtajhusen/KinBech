const Review = require('../models/Review');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const Chat = require('../models/Chat');
const { evaluatePublicText, publicProhibitedBody } = require('../utils/listingModeration');
const { emitActivity } = require('../utils/realtime');
const { reviewActivityEvent } = require('../utils/activityEvents');
const { sameAudienceUser } = require('../utils/audience');

/** Recomputes shop and seller averages from approved reviews only. */
async function refreshRatings({ shopId, seller }) {
  const summarize = async (filter) => {
    const [row] = await Review.aggregate([
      { $match: { ...filter, status: 'approved' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    return { ratingAverage: row ? Number(row.avg.toFixed(1)) : 0, reviewCount: row?.count || 0 };
  };
  if (shopId) await Shop.findByIdAndUpdate(shopId, await summarize({ shopId }));
  if (seller) await User.findByIdAndUpdate(seller, await summarize({ seller }));
}

/** Only the buyer of a completed deal can review it, once (individual and shop listings). */
async function createReview(req, res, next) {
  try {
    const { listingId, rating, review, tags } = req.body;
    const stars = Number(rating);
    if (!listingId || !Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ message: 'Listing and a rating from 1 to 5 are required' });
    }

    const listing = await Listing.findById(listingId).select('seller sellerType shopId title');
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }
    if (String(listing.seller) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot review your own listing' });
    }

    const chat = await Chat.findOne({
      listing: listing._id,
      buyer: req.user._id,
      'deal.state': 'completed',
    }).select('_id');
    if (!chat) {
      return res.status(403).json({
        message: 'You can review after your deal for this item is completed.',
        code: 'DEAL_REQUIRED',
      });
    }

    const existingReview = await Review.findOne({ reviewer: req.user._id, listing: listing._id });
    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this listing' });
    }

    if (review) {
      const contentCheck = await evaluatePublicText({ review: String(review) }, 'review');
      if (!contentCheck.ok) {
        return res.status(contentCheck.httpStatus || 400).json(publicProhibitedBody(contentCheck));
      }
    }

    const shopId = listing.sellerType === 'shop' && listing.shopId ? listing.shopId : null;
    const newReview = await Review.create({
      reviewer: req.user._id,
      shopId,
      seller: listing.seller,
      reviewedUser: listing.seller,
      chat: chat._id,
      listing: listing._id,
      rating: stars,
      review: String(review || '').slice(0, 500),
      tags: Array.isArray(tags) ? tags.slice(0, 10).map(String) : [],
      // Deal-verified reviews go live; admins can still reject them.
      status: 'approved',
    });
    emitActivity(reviewActivityEvent(newReview));
    await refreshRatings({ shopId, seller: listing.seller });

    res.status(201).json({
      message: 'Review submitted successfully',
      review: {
        id: newReview._id,
        rating: newReview.rating,
        review: newReview.review,
        tags: newReview.tags,
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getShopReviews(req, res, next) {
  try {
    const { shopId } = req.params;
    if (!(await Shop.exists({ _id: shopId }))) return res.json({ reviews: [] });
    const reviews = await Review.find({ shopId, status: 'approved' })
      .populate('reviewer', 'name avatarUrl')
      .populate('listing', 'title photos')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ reviews });
  } catch (error) {
    next(error);
  }
}

async function getUserReviews(req, res, next) {
  try {
    const seller = await User.findById(req.params.userId).select('isTester').lean();
    if (!seller || !sameAudienceUser(seller)) return res.json({ reviews: [] });
    const reviews = await Review.find({ seller: req.params.userId, status: 'approved' })
      .populate('reviewer', 'name avatarUrl')
      .populate('listing', 'title photos')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ reviews });
  } catch (error) {
    next(error);
  }
}

async function getMyReviews(req, res, next) {
  try {
    const reviews = await Review.find({ reviewer: req.user._id })
      .populate('shopId', 'name logo')
      .populate('listing', 'title photos')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ reviews });
  } catch (error) {
    next(error);
  }
}

async function getAllReviews(req, res, next) {
  try {
    const { status, q } = req.query;
    const filter = {};
    
    if (status) {
      filter.status = status;
    }

    const search = String(q || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.review = re;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, reviews] = await Promise.all([
      Review.countDocuments(filter),
      Review.find(filter)
        .populate('reviewer', 'name avatarUrl')
        .populate('shopId', 'name logo')
        .populate('listing', 'title photos')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
}

async function updateReviewStatus(req, res, next) {
  try {
    const { reviewId } = req.params;
    const { status } = req.body;

    const review = await Review.findById(reviewId);
    if (!review) {
      return res.status(404).json({ message: 'Review not found' });
    }

    const oldStatus = review.status;
    review.status = status || review.status;

    await review.save();

    if (oldStatus !== review.status) {
      await refreshRatings({ shopId: review.shopId, seller: review.seller });
    }

    res.json({ 
      message: 'Review status updated successfully',
      review
    });
  } catch (error) {
    next(error);
  }
}

/** Older shop reviews predate `seller`; fill it from the listing so seller ratings include them. */
async function backfillReviewSellers() {
  const rows = await Review.find({ seller: null }).select('listing shopId').limit(5000).lean();
  if (!rows.length) return;
  const listings = await Listing.find({ _id: { $in: rows.map((r) => r.listing) } }).select('seller').lean();
  const sellerOf = new Map(listings.map((l) => [String(l._id), l.seller]));
  const touched = new Set();
  for (const row of rows) {
    const seller = sellerOf.get(String(row.listing));
    if (!seller) continue;
    await Review.updateOne({ _id: row._id }, { $set: { seller } });
    touched.add(String(seller));
  }
  for (const seller of touched) await refreshRatings({ seller });
}

module.exports = {
  refreshRatings,
  backfillReviewSellers,
  createReview,
  getShopReviews,
  getUserReviews,
  getMyReviews,
  getAllReviews,
  updateReviewStatus,
};