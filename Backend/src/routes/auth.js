const { Router } = require('express');
const { signup, login, verifyOtp, me, updateMe, completeSignup, updatePreferences, getBlockedUsers, getReferral, applyMyReferral, adminLogin, getAllAdmins, createAdmin, deleteAdmin, getDashboardStats, updatePlatformAlert, getAllUsers, updateUserStatus } = require('../controllers/authController');
const {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethods,
  createPaymentMethod,
  deletePaymentMethod,
  getWallet,
  createSupportTicket,
  getMySupportTickets,
} = require('../controllers/accountController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

// Public routes
router.post('/signup', signup);
router.post('/login', login);
router.post('/admin/login', adminLogin);
router.post('/otp', verifyOtp);
router.post('/complete-signup', completeSignup);

// Protected routes
router.get('/me', requireAuth, me);
router.patch('/me', requireAuth, updateMe);
router.patch('/preferences', requireAuth, updatePreferences);
router.get('/referral', requireAuth, getReferral);
router.post('/referral/apply', requireAuth, applyMyReferral);
router.get('/blocked', requireAuth, getBlockedUsers);
router.get('/addresses', requireAuth, getAddresses);
router.post('/addresses', requireAuth, createAddress);
router.patch('/addresses/:id', requireAuth, updateAddress);
router.delete('/addresses/:id', requireAuth, deleteAddress);
router.get('/payment-methods', requireAuth, getPaymentMethods);
router.post('/payment-methods', requireAuth, createPaymentMethod);
router.delete('/payment-methods/:id', requireAuth, deletePaymentMethod);
router.get('/wallet', requireAuth, getWallet);
router.get('/support', requireAuth, getMySupportTickets);
router.post('/support', requireAuth, createSupportTicket);

// Admin routes
router.get('/admin/all', requireAdmin, getAllAdmins);
router.post('/admin/create', requireAdmin, createAdmin);
router.delete('/admin/:adminId', requireAdmin, deleteAdmin);
router.get('/admin/dashboard-stats', requireAdmin, getDashboardStats);
router.patch('/admin/platform-alerts/:id', requireAdmin, updatePlatformAlert);
router.get('/admin/users', requireAdmin, getAllUsers);
router.patch('/admin/users/:userId/status', requireAdmin, updateUserStatus);

module.exports = router;
