const express = require('express');
const { requireAuth, requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');
const { aiLimiter } = require('../middleware/security');
const { listAvailableModels, suggestListingFromImage, testModel } = require('../utils/aiSuggest');
const { listProductCategoryNames, resolveProductCategory } = require('../utils/productCategory');
const {
  addAiAccount,
  candidateAccounts,
  candidateModels,
  clearAccountBlock,
  clearModelBlock,
  getAccountKey,
  getAiSettings,
  invalidateAiSettings,
  isBlocked,
  modelsForAccount,
  presentAccount,
  quotaDay,
  replaceAccountKey,
  updateAiAccounts,
} = require('../utils/aiSettings');
const AiSettings = require('../models/AiSettings');
const Shop = require('../models/Shop');
const { categoriesForShop, linkCategoryToShop } = require('../utils/shopProductCategories');
const AiUsageDaily = require('../models/AiUsageDaily');
const { evaluateListingModeration } = require('../utils/listingModeration');
const { reserveAiCall, refundAiCall, usedToday } = require('../utils/aiQuota');
const { blendEstimate, marketPriceFor } = require('../utils/priceCheck');

const router = express.Router();

/**
 * Analyse an uploaded product photo and suggest listing details plus an NPR price
 * (similar listings first, AI guess as fallback). Unsafe photos come back as `imageBlocked`.
 */
router.post('/listing-suggest', requireAuth, aiLimiter, async (req, res) => {
  let quota = null;
  try {
    let data = String(req.body?.image || req.body?.data || '');
    let mimeType = String(req.body?.mimeType || 'image/jpeg').toLowerCase();
    const fromClient = Array.isArray(req.body?.categories)
      ? req.body.categories.filter((c) => typeof c === 'string')
      : [];
    const fromDb = await listProductCategoryNames();
    let shop = null;
    let shopCategoryNames = [];
    if (req.body?.forShop === true) {
      shop = await Shop.findOne({ owner: req.user._id, status: 'active' }).select('category').lean();
      if (shop) {
        const { categories: linked } = await categoriesForShop(shop, { allowAi: false });
        shopCategoryNames = linked.map((doc) => doc.name);
      }
    }
    const categories = [...new Set([...shopCategoryNames, ...fromDb, ...fromClient])].slice(0, 60);

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

    quota = await reserveAiCall(req.user._id);
    if (!quota.ok) {
      res.setHeader('Retry-After', String(quota.body.retryAfter));
      return res.status(quota.status).json(quota.body);
    }
    const aiUsage = { used: quota.used, limit: quota.limit };

    const { suggestion, model } = await suggestListingFromImage({
      data,
      mimeType,
      categories,
      shop: shop ? { type: shop.category, categories: shopCategoryNames } : null,
    });
    if (suggestion.safety && !suggestion.safety.allowed) {
      return res.json({
        suggestion: {
          imageBlocked: true,
          blockIssue: suggestion.safety.issue,
          blockReason: suggestion.safety.reason || 'This photo is not suitable for KinBech.',
        },
        model,
        aiUsage,
      });
    }
    const resolved = await resolveProductCategory({
      name: suggestion.category,
      title: suggestion.title,
      description: suggestion.description,
      createIfMissing: true,
    });
    const moderation = await evaluateListingModeration({
      title: suggestion.title,
      description: suggestion.description,
      category: suggestion.category,
      searchWords: suggestion.searchWords,
    });
    if (moderation.prohibited) {
      suggestion.title = '';
      suggestion.description = '';
      suggestion.searchWords = [];
      suggestion.contentBlocked = true;
      suggestion.blockMessage = moderation.message;
    }

    if (resolved?.name) {
      suggestion.category = resolved.name;
      suggestion.categoryCreated = Boolean(resolved.created);
      suggestion.categoryRecord = {
        id: resolved.id,
        name: resolved.name,
        icon: resolved.icon,
        color: resolved.color,
        type: 'product',
      };
      if (shop && !suggestion.contentBlocked) {
        await linkCategoryToShop(resolved.id, shop).catch(() => {});
      }
    }

    if (!suggestion.contentBlocked) {
      const market = await marketPriceFor({
        title: suggestion.title,
        category: suggestion.category,
      }).catch(() => ({ count: 0 }));
      const price = blendEstimate(market, suggestion.priceNpr);
      if (price > 0) {
        suggestion.price = price;
        suggestion.priceSource = market?.median ? 'market' : 'ai';
        suggestion.priceComparables = market?.count || 0;
      }
    }
    delete suggestion.priceNpr;
    delete suggestion.safety;
    return res.json({ suggestion, model, aiUsage });
  } catch (error) {
    if (quota?.ok) refundAiCall(req.user._id, quota.day);
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
  const accounts = (settings.accounts || []).map(presentAccount);
  const activeAccount = candidateAccounts(settings)[0] || null;
  const activeModel = activeAccount ? (modelsForAccount(settings, activeAccount)[0] || null) : (candidateModels(settings)[0] || null);

  return {
    autoSwitch: settings.autoSwitch,
    userDailyLimit: settings.userDailyLimit ?? 15,
    globalDailyCap: settings.globalDailyCap ?? 500,
    usedToday: await usedToday(),
    activeModel,
    activeAccount: activeAccount ? activeAccount.label : null,
    keyConfigured: accounts.length > 0 || Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
    accounts,
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

router.get('/admin/models', requireScope('ai'), async (req, res, next) => {
  try {
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.put('/admin/models', requireScope('ai'), auditRoute('ai.models.update', { targetType: 'ai' }), async (req, res, next) => {
  try {
    const current = await getAiSettings({ fresh: true });
    const previous = new Map((current.models || []).map((model) => [model.name, model]));
    const update = {};

    if (typeof req.body?.autoSwitch === 'boolean') update.autoSwitch = req.body.autoSwitch;
    ['userDailyLimit', 'globalDailyCap'].forEach((field) => {
      if (req.body?.[field] === undefined) return;
      const value = Number(req.body[field]);
      if (Number.isFinite(value) && value >= 0) update[field] = Math.min(100000, Math.round(value));
    });

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

router.post('/admin/models/:name/clear-limit', requireScope('ai'), auditRoute('ai.models.clear-limit.create', { targetType: 'ai', param: 'name' }), async (req, res, next) => {
  try {
    await clearModelBlock(req.params.name);
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/accounts', requireScope('ai'), auditRoute('ai.accounts.create', { targetType: 'ai' }), async (req, res, next) => {
  try {
    await addAiAccount({ label: req.body?.label, apiKey: req.body?.apiKey });
    res.status(201).json(await adminOverview());
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
});

router.put('/admin/accounts', requireScope('ai'), auditRoute('ai.accounts.update', { targetType: 'ai' }), async (req, res, next) => {
  try {
    await updateAiAccounts(req.body?.accounts);
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.put('/admin/accounts/:id/key', requireScope('ai'), auditRoute('ai.accounts.key.update', { targetType: 'ai', param: 'id' }), async (req, res, next) => {
  try {
    await replaceAccountKey(req.params.id, req.body?.apiKey);
    res.json(await adminOverview());
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    next(error);
  }
});

router.post('/admin/accounts/:id/clear-limit', requireScope('ai'), auditRoute('ai.accounts.clear-limit.create', { targetType: 'ai', param: 'id' }), async (req, res, next) => {
  try {
    await clearAccountBlock(req.params.id);
    res.json(await adminOverview());
  } catch (error) {
    next(error);
  }
});

router.post('/admin/accounts/:id/test', requireScope('ai'), auditRoute('ai.accounts.test.create', { targetType: 'ai', param: 'id' }), async (req, res, next) => {
  try {
    const account = await getAccountKey(req.params.id);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    const settings = await getAiSettings({ fresh: true });
    const model = candidateModels(settings)[0];
    if (!model) return res.status(400).json({ message: 'Turn on at least one model before testing' });
    const result = await testModel(model, account.apiKey, account.id);
    res.json({ result, overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/models/:name/test', requireScope('ai'), auditRoute('ai.models.test.create', { targetType: 'ai', param: 'name' }), async (req, res, next) => {
  try {
    const result = await testModel(req.params.name);
    res.json({ result, overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
