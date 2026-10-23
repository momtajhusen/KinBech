const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const {
  listKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  testKeyword,
} = require('../controllers/moderationController');

const router = express.Router();

router.get('/keywords/admin', requireAdmin, listKeywords);
router.post('/keywords/admin', requireAdmin, createKeyword);
router.post('/keywords/admin/test', requireAdmin, testKeyword);
router.patch('/keywords/admin/:id', requireAdmin, updateKeyword);
router.delete('/keywords/admin/:id', requireAdmin, deleteKeyword);

module.exports = router;
