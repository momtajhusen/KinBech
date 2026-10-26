const { Router } = require('express');
const { 
  createShop, 
  getMyShop, 
  getMyShopCategories,
  getShopById, 
  updateShop, 
  getShopListings, 
  getShopReviews,
  getAllShops,
  updateShopStatus,
  getAllShopsAdmin,
  revealShopTaxIds,
} = require('../controllers/shopController');
const { requireAuth, requireScope, optionalAuth } = require('../middleware/auth');
const { getVerificationQueue, decideVerification } = require('../controllers/adminShopVerificationController');
const { auditRoute } = require('../utils/audit');
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
router.get('/mine/categories', requireAuth, getMyShopCategories);
router.get('/mine/analytics', requireAuth, getMyShopAnalytics);
router.get('/mine/storefront', requireAuth, getMyShopStorefront);
router.get('/mine/storefront/qr.png', requireAuth, downloadMyShopStorefrontQr);
router.get('/mine/storefront/banner.pdf', requireAuth, downloadMyShopStorefrontBannerPdf);
router.get('/admin/all', requireScope('shops'), getAllShopsAdmin);
router.get('/admin/:shopId/tax-ids', requireScope('shops'), revealShopTaxIds);
router.get('/admin/verification', requireScope('shops'), getVerificationQueue);
router.post('/admin/:shopId/verification', requireScope('shops'), decideVerification);

// Public routes
router.get('/', getAllShops);
router.put('/:shopId', requireAuth, updateShop);
router.get('/:shopId', optionalAuth, getShopById);
router.get('/:shopId/listings', optionalAuth, getShopListings);
router.get('/:shopId/reviews', getShopReviews);

// Admin routes
router.patch('/admin/:shopId/status', requireScope('shops'), auditRoute('shops.status.update', { targetType: 'shop', param: 'shopId' }), updateShopStatus);

module.exports = router;