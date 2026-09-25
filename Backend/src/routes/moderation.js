const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const {
  listKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
} = require('../controllers/moderationController');

const router = express.Router();

router.get('/keywords/admin', requireAdmin, listKeywords);
router.post('/keywords/admin', requireAdmin, createKeyword);
router.patch('/keywords/admin/:id', requireAdmin, updateKeyword);
router.delete('/keywords/admin/:id', requireAdmin, deleteKeyword);

module.exports = router;
