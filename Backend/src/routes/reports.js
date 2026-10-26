const { Router } = require('express');
const { createReport, blockUser, unblockUser, getMyReports, getAllReports, updateReportStatus } = require('../controllers/reportController');
const { requireAuth, requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');

const router = Router();

// User routes
router.post('/', requireAuth, createReport);
router.get('/my', requireAuth, getMyReports);
router.post('/users/:userId/block', requireAuth, blockUser);
router.delete('/users/:userId/block', requireAuth, unblockUser);

// Admin routes
router.get('/admin/all', requireScope('reports'), getAllReports);
router.patch('/admin/:reportId/status', requireScope('reports'), auditRoute('reports.status.update', { targetType: 'report', param: 'reportId' }), updateReportStatus);

module.exports = router;