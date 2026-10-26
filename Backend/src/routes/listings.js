const { Router } = require('express');
const {
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
} = require('../controllers/listingController');
const { requireAuth, requireScope, optionalAuth } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');

const router = Router();

// Public routes. optionalAuth keeps the request user available for owner checks on detail.
router.get('/', optionalAuth, getListings);
router.get('/search', optionalAuth, searchListings);
router.get('/suggestions', getSearchSuggestions);
router.get('/category-counts', optionalAuth, getCategoryCounts);
router.get('/related', optionalAuth, getRelatedListings);

// Named routes MUST be registered before /:id
router.get('/mine/categories', requireAuth, getMyCategoryUsage);
router.get('/mine/interests', requireAuth, getMyInterests);
router.get('/mine', requireAuth, getMyListings);
router.post('/mine/confirm-stock', requireAuth, confirmAllStock);
router.get('/purchases', requireAuth, getMyPurchases);
router.get('/admin/all', requireScope('listings'), getAllListingsAdmin);

router.get('/:id', optionalAuth, getListing);
router.post('/:id/view', optionalAuth, incrementView);
router.post('/:id/feature', requireAuth, featureListing);
router.post('/:id/still-available', requireAuth, confirmListingAvailable);
router.post('/:id/stock', requireAuth, updateListingStock);

// Protected routes
router.post('/', requireAuth, createListing);
router.put('/:id', requireAuth, updateListing);
router.delete('/:id', requireAuth, deleteListing);

// Admin routes
router.patch('/admin/:listingId/status', requireScope('listings'), auditRoute('listings.status.update', { targetType: 'listing', param: 'listingId' }), updateListingStatusAdmin);

module.exports = router;
