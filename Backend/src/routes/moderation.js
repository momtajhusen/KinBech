const express = require('express');
const { requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');
const {
  listKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  importKeywords,
  testKeyword,
} = require('../controllers/moderationController');
const trust = require('../controllers/trustController');
const safety = require('../controllers/adminSafetyController');

const router = express.Router();

router.get('/keywords/admin', requireScope('moderation'), listKeywords);
router.post('/keywords/admin', requireScope('moderation'), auditRoute('moderation.keywords.create', { targetType: 'keyword' }), createKeyword);
router.post('/keywords/admin/import', requireScope('moderation'), auditRoute('moderation.keywords.import', { targetType: 'keyword' }), importKeywords);
router.post('/keywords/admin/test', requireScope('moderation'), auditRoute('moderation.keywords.test.create', { targetType: 'keyword' }), testKeyword);
router.patch('/keywords/admin/:id', requireScope('moderation'), auditRoute('moderation.keywords.update', { targetType: 'keyword', param: 'id' }), updateKeyword);
router.delete('/keywords/admin/:id', requireScope('moderation'), auditRoute('moderation.keywords.delete', { targetType: 'keyword', param: 'id' }), deleteKeyword);


// Trust: seller scores, strikes, auto-hide and stock oversight, thresholds
router.get('/trust/settings', requireScope('moderation'), trust.getSettings);
router.put('/trust/settings', requireScope('settings'), auditRoute('trust.settings.save', { targetType: 'settings' }), trust.saveSettings);
router.get('/trust/sellers', requireScope('moderation'), trust.listSellers);
router.patch('/trust/sellers/:userId/override', requireScope('moderation'), trust.overrideScore);
router.post('/trust/sellers/:userId/strike', requireScope('users'), trust.addStrike);
router.post('/trust/sellers/:userId/recompute', requireScope('moderation'), trust.recompute);
router.post('/trust/recompute', requireScope('settings'), auditRoute('trust.recompute', { targetType: 'settings' }), trust.recompute);
router.get('/trust/stock', requireScope('moderation'), trust.stockView);
router.get('/trust/auto-hides', requireScope('moderation'), trust.autoHideReport);
router.get('/trust/clusters', requireScope('users'), trust.fraudClusters);

// Scam monitor (flagged chat messages only) and fraud signals
router.get('/scam', requireScope('moderation'), safety.getScamFlags);
router.patch('/scam/:messageId', requireScope('moderation'), safety.reviewScamFlag);
router.post('/scam/:messageId/action', requireScope('moderation'), safety.actOnScamFlag);
router.get('/fraud/signals', requireScope('users'), safety.getFraudSignals);

module.exports = router;
