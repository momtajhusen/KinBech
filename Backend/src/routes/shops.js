const { Router } = require('express');
const { 
  createShop, 
  getMyShop, 
  getShopById, 
  updateShop, 
  getShopListings, 
  getShopReviews,
  getAllShops,
  updateShopStatus,
  getAllShopsAdmin
} = require('../controllers/shopController');
const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');
const { getMyShopAnalytics } = require('../controllers/shopAnalyticsController');
const {
  getMyShopStorefront,
  downloadMyShopStorefrontQr,
  downloadMyShopStorefrontBannerPdf,
} = require('../controllers/shopStorefrontController');

const router = Router();

// Protected / named routes before /:shopId
router.post('/', requireAuth, createShop);
router.get('/mine', requireAuth, getMyShop);
router.get('/mine/analytics', requireAuth, getMyShopAnalytics);
router.get('/mine/storefront', requireAuth, getMyShopStorefront);
router.get('/mine/storefront/qr.png', requireAuth, downloadMyShopStorefrontQr);
router.get('/mine/storefront/banner.pdf', requireAuth, downloadMyShopStorefrontBannerPdf);
router.get('/admin/all', requireAdmin, getAllShopsAdmin);

// Public routes
router.get('/', getAllShops);
router.put('/:shopId', requireAuth, updateShop);
router.get('/:shopId', optionalAuth, getShopById);
router.get('/:shopId/listings', getShopListings);
router.get('/:shopId/reviews', getShopReviews);

// Admin routes
router.patch('/admin/:shopId/status', requireAdmin, updateShopStatus);

module.exports = router;