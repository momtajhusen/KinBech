const express = require('express');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { listAvailableModels, suggestListingFromImage, testModel } = require('../utils/aiSuggest');
const {
  candidateModels,
  clearModelBlock,
  getAiSettings,
  invalidateAiSettings,
  isBlocked,
  quotaDay,
} = require('../utils/aiSettings');
const AiSettings = require('../models/AiSettings');
const AiUsageDaily = require('../models/AiUsageDaily');

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

    const { suggestion, model } = await suggestListingFromImage({ data, mimeType, categories });
    return res.json({ suggestion, model });
  } catch (error) {
    const status = error.status === 429 || error.status === 503 ? error.status : 502;
    if (status === 502) console.error('[ai] listing-suggest failed:', error.message || error);
    else console.warn('[ai] listing-suggest:', error.message);
    return res.status(status).json({ message: error.message || 'AI suggestion failed' });
  }
});

// ---------- Admin: model management & usage tracking ----------

let availableCache = { at: 0, models: [], error: '' };

async function availableModels() {
  if (Date.now() - availableCache.at < 60 * 60 * 1000 && availableCache.models.length) {
    return availableCache;
  }
  try {
    availableCache = { at: Date.now(), models: await listAvailableModels(), error: '' };
  } catch (error) {
    availableCache = { at: 0, models: [], error: error.message };
  }
  return availableCache;
}

function lastDays(count) {
  const days = [];
  for (let i = 0; i < count; i += 1) {
    days.push(quotaDay(new Date(Date.now() - i * 24 * 60 * 60 * 1000)));
  }
  return days;
}

async function adminOverview() {
  const settings = await getAiSettings({ fresh: true });
  const today = quotaDay();
  const days = lastDays(7);
  const usage = await AiUsageDaily.find({ day: { $in: days } }).lean();
  const todayByModel = new Map(usage.filter((row) => row.day === today).map((row) => [row.model, row]));

  const history = days.map((day) => {
    const rows = usage.filter((row) => row.day === day);
    return {
      day,
      success: rows.reduce((sum, row) => sum + (row.success || 0), 0),
      failed: rows.reduce((sum, row) => sum + (row.failed || 0), 0),
      quotaHits: rows.reduce((sum, row) => sum + (row.quotaHits || 0), 0),
    };
  });

  const { models: available, error: availableError } = await availableModels();
  const activeModel = candidateModels(settings)[0] || null;

  return {
    autoSwitch: settings.autoSwitch,
    activeModel,
    keyConfigured: Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
    quotaDay: today,
    models: (settings.models || []).map((model) => {
      const row = todayByModel.get(model.name) || {};
      return {
        name: model.name,
        enabled: model.enabled,
        dailyLimit: model.dailyLimit ?? 20,
        blockedUntil: isBlocked(model) ? model.blockedUntil : null,
        today: {
          success: row.success || 0,
          failed: row.failed || 0,
          quotaHits: row.quotaHits || 0,
          lastError: row.lastError || '',
          lastErrorAt: row.lastErrorAt || null,
          lastUsedAt: row.lastUsedAt || null,
        },
      };
    }),
    history,
    available,
    availableError,
  };
}

router.get('/admin/models', requireAdmin, async (req, res, next) => {
  try {
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.put('/admin/models', requireAdmin, async (req, res, next) => {
  try {
    const current = await getAiSettings({ fresh: true });
    const previous = new Map((current.models || []).map((model) => [model.name, model]));
    const update = {};

    if (typeof req.body?.autoSwitch === 'boolean') update.autoSwitch = req.body.autoSwitch;

    if (Array.isArray(req.body?.models)) {
      const seen = new Set();
      const models = [];
      req.body.models.forEach((item) => {
        const name = String(item?.name || '').trim().replace(/^models\//, '');
        if (!name || seen.has(name) || !/^[\w.-]+$/.test(name)) return;
        seen.add(name);
        const limit = Number(item.dailyLimit);
        models.push({
          name,
          enabled: item.enabled !== false,
          dailyLimit: Number.isFinite(limit) && limit >= 0 ? Math.round(limit) : 20,
          blockedUntil: previous.get(name)?.blockedUntil || null,
        });
      });
      update.models = models;
    }

    await AiSettings.updateOne({ key: 'default' }, { $set: update }, { upsert: true });
    invalidateAiSettings();
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/models/:name/clear-limit', requireAdmin, async (req, res, next) => {
  try {
    await clearModelBlock(req.params.name);
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/models/:name/test', requireAdmin, async (req, res, next) => {
  try {
    const result = await testModel(req.params.name);
    res.json({ result, overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
