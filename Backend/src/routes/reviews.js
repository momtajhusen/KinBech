const { Router } = require('express');
const { createReview, getShopReviews, getUserReviews, getMyReviews, getAllReviews, updateReviewStatus } = require('../controllers/reviewController');
const { requireAuth, requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');

const router = Router();

// User routes
router.post('/', requireAuth, createReview);
router.get('/my', requireAuth, getMyReviews);
router.get('/shop/:shopId', getShopReviews);
router.get('/user/:userId', getUserReviews);

// Admin routes
router.get('/admin/all', requireScope('reviews'), getAllReviews);
router.patch('/admin/:reviewId/status', requireScope('reviews'), auditRoute('reviews.status.update', { targetType: 'review', param: 'reviewId' }), updateReviewStatus);

module.exports = router;