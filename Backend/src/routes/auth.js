const { Router } = require('express');
const { signup, login, verifyOtp, googleLogin, me, updateMe, saveDeviceToken, completeSignup, updatePreferences, getBlockedUsers, getReferral, applyMyReferral, adminLogin, getAllAdmins, createAdmin, updateAdmin, deleteAdmin, getPlatformSettingsAdmin, updatePlatformSettingsAdmin, getPlatformAlerts, getDashboardStats, updatePlatformAlert, getAllUsers, updateUserStatus, getLiveActivity, pinStore, unpinStore, recordPinnedView, getPinnedStores, changeAdminPassword, logoutAllDevices, getAuditLogs } = require('../controllers/authController');
const {
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethods,
  createPaymentMethod,
  updatePaymentMethod,
  deletePaymentMethod,
  getWallet,
  createSupportTicket,
  getMySupportTickets,
  requestAccountDeletion,
  exportMyData,
} = require('../controllers/accountController');
const {
  adminLoginTwoFactor,
  twoFactorStatus,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
  regenerateBackupCodes,
  resetAdminTwoFactor,
  getMySessions,
  revokeMySession,
  logoutCurrent,
  refreshTokens,
  callWatchToken,
  integrityNonce,
  integrityVerify,
} = require('../controllers/securityController');
const {
  getSupportTickets,
  updateSupportTicket,
  getDeletionRequests,
  cancelDeletionRequest,
  getUserDetail,
  moderateUser,
} = require('../controllers/adminUserController');
const { getTesters, makeTester, deleteTester, restoreTester } = require('../controllers/adminTesterController');
const { getNavCounts } = require('../controllers/adminNavController');
const { requireAuth, requireAdmin, requireScope } = require('../middleware/auth');
const {
  otpSendIpLimiter,
  otpSendPhoneLimiter,
  otpVerifyLimiter,
  adminLoginLimiter,
  twoFactorLimiter,
  refreshLimiter,
  dataExportLimiter,
} = require('../middleware/security');

const { captchaOnRisk, captchaConfig, verifyTicket } = require('../utils/captcha');

const router = Router();

// Public routes
router.post('/signup', otpSendIpLimiter, otpSendPhoneLimiter, captchaOnRisk('otp'), signup);
router.post('/login', otpSendIpLimiter, otpSendPhoneLimiter, captchaOnRisk('otp'), login);
router.post('/admin/login', adminLoginLimiter, captchaOnRisk('admin-login', { countAttempts: false }), adminLogin);
router.get('/captcha/config', captchaConfig);
router.post('/captcha/verify', twoFactorLimiter, verifyTicket);
router.post('/admin/login/2fa', twoFactorLimiter, adminLoginTwoFactor);
router.post('/otp', otpVerifyLimiter, verifyOtp);
router.post('/google', otpVerifyLimiter, googleLogin);
router.post('/refresh', refreshLimiter, refreshTokens);

// Protected routes
router.post('/complete-signup', requireAuth, completeSignup);
router.get('/me', requireAuth, me);
router.post('/logout-all', requireAuth, logoutAllDevices);
router.post('/logout', requireAuth, logoutCurrent);
router.get('/call-watch-token', requireAuth, callWatchToken);
router.post('/integrity/nonce', requireAuth, twoFactorLimiter, integrityNonce);
router.post('/integrity/verify', requireAuth, twoFactorLimiter, integrityVerify);
router.get('/sessions', requireAuth, getMySessions);
router.delete('/sessions/:sessionId', requireAuth, revokeMySession);
router.patch('/me', requireAuth, updateMe);
router.get('/me/export', requireAuth, dataExportLimiter, exportMyData);
router.post('/me/delete', requireAuth, twoFactorLimiter, requestAccountDeletion);
router.post('/device-token', requireAuth, saveDeviceToken);
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
router.patch('/payment-methods/:id', requireAuth, updatePaymentMethod);
router.delete('/payment-methods/:id', requireAuth, deletePaymentMethod);
router.get('/wallet', requireAuth, getWallet);
router.get('/support', requireAuth, getMySupportTickets);
router.post('/support', requireAuth, createSupportTicket);

// Pinned stores routes
router.post('/pinned-stores', requireAuth, pinStore);
router.post('/pinned-stores/:storeId/view', requireAuth, recordPinnedView);
router.delete('/pinned-stores/:storeId', requireAuth, unpinStore);
router.get('/pinned-stores', requireAuth, getPinnedStores);

// Admin routes
router.post('/admin/change-password', requireAdmin, changeAdminPassword);
router.get('/admin/2fa', requireAdmin, twoFactorStatus);
router.post('/admin/2fa/setup', requireAdmin, twoFactorSetup);
router.post('/admin/2fa/enable', requireAdmin, twoFactorLimiter, twoFactorEnable);
router.post('/admin/2fa/disable', requireAdmin, twoFactorLimiter, twoFactorDisable);
router.post('/admin/2fa/backup-codes', requireAdmin, twoFactorLimiter, regenerateBackupCodes);
router.post('/admin/:adminId/reset-2fa', requireScope('admins'), resetAdminTwoFactor);
router.get('/admin/all', requireScope('settings'), getAllAdmins);
router.get('/admin/audit', requireScope('audit'), getAuditLogs);
router.post('/admin/create', requireScope('admins'), createAdmin);
router.get('/admin/settings', requireScope('settings'), getPlatformSettingsAdmin);
router.put('/admin/settings', requireScope('settings'), updatePlatformSettingsAdmin);
router.get('/admin/platform-alerts', requireScope('dashboard'), getPlatformAlerts);
router.patch('/admin/:adminId', requireScope('admins'), updateAdmin);
router.delete('/admin/:adminId', requireScope('admins'), deleteAdmin);
router.get('/admin/dashboard-stats', requireScope('dashboard'), getDashboardStats);
router.get('/admin/nav-counts', requireAdmin, getNavCounts);
router.get('/admin/live-activity', requireScope('dashboard'), getLiveActivity);
router.patch('/admin/platform-alerts/:id', requireScope('dashboard'), updatePlatformAlert);
router.get('/admin/users', requireScope('users'), getAllUsers);
router.patch('/admin/users/:userId/status', requireScope('users'), updateUserStatus);
router.get('/admin/users/:userId', requireScope('users'), getUserDetail);
router.post('/admin/users/:userId/moderate', requireScope('users'), moderateUser);
router.get('/admin/support-tickets', requireScope('users'), getSupportTickets);
router.patch('/admin/support-tickets/:ticketId', requireScope('users'), updateSupportTicket);
router.get('/admin/deletions', requireScope('users'), getDeletionRequests);
router.post('/admin/deletions/:userId/cancel', requireScope('users'), cancelDeletionRequest);
router.get('/admin/testers', requireScope('settings'), getTesters);
router.post('/admin/testers/:userId', requireScope('settings'), makeTester);
router.post('/admin/testers/:userId/restore', requireScope('settings'), restoreTester);
router.delete('/admin/testers/:userId', requireScope('settings'), deleteTester);

module.exports = router;
