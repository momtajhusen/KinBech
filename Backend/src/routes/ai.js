const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { suggestListingFromImage } = require('../utils/aiSuggest');

const router = express.Router();

/**
 * Analyse an uploaded product photo and suggest listing details.
 * Never returns a price — the seller always sets that themselves.
 */
router.post('/listing-suggest', requireAuth, async (req, res) => {
  try {
    let data = String(req.body?.image || req.body?.data || '');
    let mimeType = String(req.body?.mimeType || 'image/jpeg').toLowerCase();
    const categories = Array.isArray(req.body?.categories)
      ? req.body.categories.filter((c) => typeof c === 'string').slice(0, 40)
      : [];

    if (!data) {
      return res.status(400).json({ message: 'Missing image data' });
    }

    const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1].toLowerCase();
      data = dataUrlMatch[2];
    }
    data = data.replace(/\s/g, '');

    if (!data) {
      return res.status(400).json({ message: 'Invalid image data' });
    }
    if (data.length > 14 * 1024 * 1024) {
      return res.status(413).json({ message: 'Image too large for AI analysis' });
    }

    const suggestion = await suggestListingFromImage({ data, mimeType, categories });
    return res.json({ suggestion });
  } catch (error) {
    console.error('[ai] listing-suggest failed:', error.message || error);
    return res.status(502).json({ message: error.message || 'AI suggestion failed' });
  }
});

module.exports = router;
