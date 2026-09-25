const { Router } = require('express');
const {
  reportClientError,
  listErrorsAdmin,
  getErrorAdmin,
  updateErrorAdmin,
} = require('../controllers/errorController');
const { requireAuth, requireAdmin, optionalAuth } = require('../middleware/auth');

const router = Router();

// Client crash/bug ingest (auth optional — anonymous crashes still useful)
router.post('/', optionalAuth, reportClientError);

router.get('/admin', requireAdmin, listErrorsAdmin);
router.get('/admin/:id', requireAdmin, getErrorAdmin);
router.patch('/admin/:id', requireAdmin, updateErrorAdmin);

module.exports = router;
