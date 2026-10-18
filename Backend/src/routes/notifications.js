const { Router } = require('express');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  createBroadcastNotification,
  getBroadcastNotifications,
} = require('../controllers/notificationController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

// User routes — /read-all and /clear before /:id
router.get('/', requireAuth, getNotifications);
router.patch('/read-all', requireAuth, markAllAsRead);
router.post('/clear', requireAuth, clearNotifications);
router.patch('/:id/read', requireAuth, markAsRead);
router.delete('/:id', requireAuth, deleteNotification);

// Admin routes
router.post('/admin/broadcast', requireAdmin, createBroadcastNotification);
router.get('/admin/broadcasts', requireAdmin, getBroadcastNotifications);

module.exports = router;
