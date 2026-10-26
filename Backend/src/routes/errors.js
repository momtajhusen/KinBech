const { Router } = require('express');
const {
  reportClientError,
  listErrorsAdmin,
  getErrorAdmin,
  updateErrorAdmin,
} = require('../controllers/errorController');
const { requireAuth, requireScope, optionalAuth } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');
const { clientErrorLimiter } = require('../middleware/security');

const router = Router();

// Client crash/bug ingest (auth optional — anonymous crashes still useful)
router.post('/', clientErrorLimiter, optionalAuth, reportClientError);

router.get('/admin', requireScope('errors'), listErrorsAdmin);
router.get('/admin/:id', requireScope('errors'), getErrorAdmin);
router.patch('/admin/:id', requireScope('errors'), auditRoute('errors.update', { targetType: 'error', param: 'id' }), updateErrorAdmin);

module.exports = router;
