const { Router } = require('express');
const {
  getSellers,
  searchSellers,
  getFeaturedSellers,
  getPopularSellers,
  getNearbySellers,
  getSeller,
} = require('../controllers/sellerController');

const router = Router();

router.get('/', getSellers);
router.get('/search', searchSellers);
router.get('/featured', getFeaturedSellers);
router.get('/popular', getPopularSellers);
router.get('/nearby', getNearbySellers);
router.get('/:sellerId', getSeller);

module.exports = router;
