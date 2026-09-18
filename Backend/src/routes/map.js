const { Router } = require('express');
const { getNearbyMap } = require('../controllers/mapController');

const router = Router();

router.get('/nearby', getNearbyMap);

module.exports = router;
