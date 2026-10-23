const Review = require('../models/Review');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const { evaluatePublicText, publicProhibitedBody } = require('../utils/listingModeration');
const { emitActivity } = require('../utils/realtime');
const { reviewActivityEvent } = require('../utils/activityEvents');

async function createReview(req, res, next) {
  try {
    const { shopId, listingId, rating, review, tags } = req.body;

    if (!shopId || !listingId || !rating) {
      return res.status(400).json({ message: 'Shop ID, listing ID, and rating are required' });
    }

    // Verify shop exists
    const shop = await Shop.findById(shopId);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    // Verify listing exists and belongs to the shop
    const listing = await Listing.findById(listingId);
    if (!listing) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    // Critical business rule: Only shop listings can be reviewed
    if (listing.sellerType !== 'shop' || String(listing.shopId) !== String(shopId)) {
      return res.status(400).json({ message: 'Reviews are only allowed for shop listings' });
    }

    // Prevent shop owner from reviewing their own shop
    if (String(shop.owner) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot review your own shop' });
    }

    // Check if already reviewed this listing
    const existingReview = await Review.findOne({
      reviewer: req.user._id,
      listing: listingId,
    });

    if (existingReview) {
      return res.status(400).json({ message: 'You have already reviewed this listing' });
    }

    if (review) {
      const contentCheck = await evaluatePublicText({ review: String(review) }, 'review');
      if (!contentCheck.ok) {
        return res.status(contentCheck.httpStatus || 400).json(publicProhibitedBody(contentCheck));
      }
    }

    // Create review
    const newReview = await Review.create({
      reviewer: req.user._id,
      shopId: shopId,
      listing: listingId,
      rating: Number(rating),
      review: review || '',
      tags: tags || [],
    });
    emitActivity(reviewActivityEvent(newReview));

    // Update shop's average rating
    const allReviews = await Review.find({ shopId, status: 'approved' });
    const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0) + rating;
    const avgRating = (totalRating / (allReviews.length + 1)).toFixed(1);

    await Shop.findByIdAndUpdate(shopId, {
      ratingAverage: Number(avgRating),
      reviewCount: allReviews.length + 1,
    });

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
    const { userId } = req.params;
    // This endpoint is deprecated for individual users - now only works for shops
    // For backward compatibility, return empty array
    console.log('getUserReviews called - this endpoint is deprecated for individual users');
    res.json({ reviews: [] });
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

    // Update shop rating if status changed to/from approved
    if (oldStatus !== review.status && review.shopId) {
      const allReviews = await Review.find({ 
        shopId: review.shopId, 
        status: 'approved' 
      });
      
      const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
      const avgRating = allReviews.length > 0 
        ? (totalRating / allReviews.length).toFixed(1)
        : 0;

      await Shop.findByIdAndUpdate(review.shopId, {
        ratingAverage: Number(avgRating),
        reviewCount: allReviews.length,
      });
    }

    res.json({ 
      message: 'Review status updated successfully',
      review
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createReview,
  getShopReviews,
  getUserReviews,
  getMyReviews,
  getAllReviews,
  updateReviewStatus,
};