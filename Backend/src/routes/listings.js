const { Router } = require('express');
const {
  getListings,
  searchListings,
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

// Public routes
router.get('/', getListings);
router.get('/search', searchListings);
router.get('/category-counts', getCategoryCounts);

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
