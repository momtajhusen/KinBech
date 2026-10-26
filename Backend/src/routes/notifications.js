const { Router } = require('express');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearNotifications,
  createBroadcastNotification,
  deleteBroadcastNotification,
  getBroadcastNotifications,
} = require('../controllers/notificationController');
const { requireAuth, requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');

const router = Router();

// User routes — /read-all and /clear before /:id
router.get('/', requireAuth, getNotifications);
router.patch('/read-all', requireAuth, markAllAsRead);
router.post('/clear', requireAuth, clearNotifications);
router.patch('/:id/read', requireAuth, markAsRead);
router.delete('/:id', requireAuth, deleteNotification);

// Admin routes
router.post('/admin/broadcast', requireScope('notifications'), auditRoute('notifications.broadcast.create', { targetType: 'broadcast' }), createBroadcastNotification);
router.get('/admin/broadcasts', requireScope('notifications'), getBroadcastNotifications);
router.delete('/admin/broadcasts/:id', requireScope('notifications'), auditRoute('notifications.broadcasts.delete', { targetType: 'broadcast', param: 'id' }), deleteBroadcastNotification);

module.exports = router;
