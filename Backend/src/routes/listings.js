const { Router } = require('express');
const {
  getListings,
  searchListings,
  getSearchSuggestions,
  getRelatedListings,
  getCategoryCounts,
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
} = require('../controllers/listingController');
const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');

const router = Router();

// Public routes. optionalAuth keeps the request user available for owner checks on detail.
router.get('/', optionalAuth, getListings);
router.get('/search', optionalAuth, searchListings);
router.get('/suggestions', getSearchSuggestions);
router.get('/category-counts', optionalAuth, getCategoryCounts);
router.get('/related', optionalAuth, getRelatedListings);

// Named routes MUST be registered before /:id
router.get('/mine', requireAuth, getMyListings);
router.get('/purchases', requireAuth, getMyPurchases);
router.get('/admin/all', requireAdmin, getAllListingsAdmin);

router.get('/:id', optionalAuth, getListing);
router.post('/:id/view', optionalAuth, incrementView);
router.post('/:id/feature', requireAuth, featureListing);

// Protected routes
router.post('/', requireAuth, createListing);
router.put('/:id', requireAuth, updateListing);
router.delete('/:id', requireAuth, deleteListing);

// Admin routes
router.patch('/admin/:listingId/status', requireAdmin, updateListingStatusAdmin);

module.exports = router;
