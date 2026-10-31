const { Router } = require('express');
const { requireAuth, requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');
const subscriptions = require('../controllers/subscriptionController');
const esewa = require('../controllers/esewaController');

const router = Router();
// Approving a plan means checking a payment, so it stays with full admins.
const adminOnly = requireScope('settings');

router.get('/plans', requireAuth, subscriptions.listPlans);
router.get('/quota', requireAuth, subscriptions.getQuota);
router.get('/me', requireAuth, subscriptions.getMine);
router.post('/requests', requireAuth, subscriptions.createRequest);
router.post('/requests/:id/cancel', requireAuth, subscriptions.cancelRequest);
router.get('/payments', requireAuth, subscriptions.listPayments);

router.post('/esewa/start', requireAuth, esewa.startPayment);
router.post('/esewa/payments/:id/verify', requireAuth, esewa.verifyPayment);
// eSewa redirects the buyer's browser here, so no app token is sent.
router.get('/esewa/return/:id/:outcome', esewa.paymentReturn);
router.get('/esewa/intent-return/:id', esewa.intentReturn);
router.post('/esewa/intent-callback/:id', esewa.intentCallback);

router.get('/admin/plans', adminOnly, subscriptions.adminListPlans);
router.post('/admin/plans', adminOnly, auditRoute('subscription.plan.create', { targetType: 'settings' }), subscriptions.adminCreatePlan);
router.put('/admin/plans/:id', adminOnly, auditRoute('subscription.plan.update', { targetType: 'settings', param: 'id' }), subscriptions.adminUpdatePlan);
router.delete('/admin/plans/:id', adminOnly, auditRoute('subscription.plan.delete', { targetType: 'settings', param: 'id' }), subscriptions.adminDeletePlan);
router.put('/admin/payment', adminOnly, auditRoute('subscription.payment.update', { targetType: 'settings' }), subscriptions.adminSavePayment);
router.put('/admin/screen', adminOnly, auditRoute('subscription.screen.update', { targetType: 'settings' }), subscriptions.adminSaveScreen);
router.get('/admin/requests', adminOnly, subscriptions.adminListRequests);
router.post('/admin/requests/:id/approve', adminOnly, subscriptions.adminApprove);
router.post('/admin/requests/:id/reject', adminOnly, subscriptions.adminReject);

router.get('/admin/gateway/esewa', adminOnly, esewa.adminGetSettings);
router.put('/admin/gateway/esewa', adminOnly, esewa.adminSaveSettings);
router.post('/admin/gateway/esewa/sandbox-defaults', adminOnly, auditRoute('payment.esewa.sandbox_defaults', { targetType: 'settings' }), esewa.adminUseSandboxDefaults);
router.post('/admin/gateway/esewa/test', adminOnly, esewa.adminTestConnection);

module.exports = router;
