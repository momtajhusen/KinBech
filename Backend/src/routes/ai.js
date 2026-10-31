const express = require('express');
const { requireAuth, requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');
const { aiLimiter } = require('../middleware/security');
const {
  ENGINE,
  benchmarkModel,
  listAvailableModels,
  suggestListingFromImage,
  testModel,
  VOICE_SEARCHING_TEXT,
  voiceAskText,
  voiceGreetingText,
  voiceNudgeText,
  voiceGoodbyeText,
  voiceResultLine,
  voiceSearchQuery,
  voiceSearchTurn,
} = require('../utils/aiSuggest');
const { openLiveSpeech, pipeSpeech, waitSpeechReady } = require('../utils/voiceLive');
const { searchSummary } = require('../controllers/listingController');
const { CATALOG, catalogEntry } = require('../utils/aiCatalog');
const { LEVELS, levelLimits, sellerLevel } = require('../utils/aiSellerLevel');
const { listProductCategoryNames, resolveProductCategory } = require('../utils/productCategory');
const { rememberSearch } = require('../utils/searchUnderstanding');
const { findSellerByName } = require('../utils/searchLogic');
const {
  addAiAccount,
  candidateAccounts,
  candidateModels,
  clearAccountBlock,
  clearModelBlock,
  defaultDailyLimit,
  defaultLimitSource,
  freeDailyQuota,
  getAccountKey,
  getAiSettings,
  invalidateAiSettings,
  isBlocked,
  loadDayUsage,
  pairUsedToday,
  modelCooling,
  modelHealthList,
  modelPace,
  modelsForAccount,
  nextQuotaReset,
  presentAccount,
  quotaDay,
  RECOMMENDED_MODELS,
  replaceAccountKey,
  updateAiAccounts,
} = require('../utils/aiSettings');
const AiSettings = require('../models/AiSettings');
const Shop = require('../models/Shop');
const User = require('../models/User');
const { categoriesForShop, linkCategoryToShop } = require('../utils/shopProductCategories');
const AiUsageDaily = require('../models/AiUsageDaily');
const AiCallLog = require('../models/AiCallLog');
const { evaluateListingModeration } = require('../utils/listingModeration');
const { nepalDay, reserveAiCall, refundAiCall, usedToday } = require('../utils/aiQuota');
const { blendEstimate, marketPriceFor, roundPrice } = require('../utils/priceCheck');

const router = express.Router();

/** Individual sellers sell used items: AI price is this share of the brand-new Nepal price. */
const USED_PRICE_SHARE = { Good: 0.5, Fair: 0.25 };

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

    // Counted before this call is reserved, so a first-time seller is still "new" here.
    const { level } = await sellerLevel(req.user._id, await getAiSettings());
    quota = await reserveAiCall(req.user._id, { level });
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
      userId: String(req.user._id),
      level,
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
      if (!resolved) suggestion.category = '';
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

    const individual = req.body?.forShop !== true;
    if (individual) {
      suggestion.condition = suggestion.condition === 'Fair' ? 'Fair' : 'Good';
    }

    if (!suggestion.contentBlocked) {
      const usedShare = USED_PRICE_SHARE[suggestion.condition];
      if (individual && usedShare && suggestion.newPriceNpr) {
        suggestion.price = roundPrice(suggestion.newPriceNpr * usedShare);
        suggestion.newPrice = roundPrice(suggestion.newPriceNpr);
        suggestion.priceSource = 'new_price';
      } else {
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
    }
    delete suggestion.priceNpr;
    delete suggestion.newPriceNpr;
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

const VOICE_TURNS_PER_DAY = 150;
// Natural (Live) voice per buyer a day; past it the app speaks with the phone's own voice.
const VOICE_SPEECH_PER_DAY = 120;
const voiceTurns = new Map();

function takeVoiceTurn(userId, kind = 'turn', max = VOICE_TURNS_PER_DAY) {
  const day = nepalDay();
  const key = `${kind}:${userId}:${day}`;
  const used = voiceTurns.get(key) || 0;
  if (used >= max) return false;
  if (!voiceTurns.has(key)) {
    for (const old of voiceTurns.keys()) if (!old.endsWith(`:${day}`)) voiceTurns.delete(old);
  }
  voiceTurns.set(key, used + 1);
  return true;
}

/** Resolves once the reply's natural voice has started, so the app knows whether to stream it or use the phone's voice. */
router.get('/voice-ready/:id', requireAuth, async (req, res) => {
  res.json({ ok: await waitSpeechReady(req.params.id) });
});

// No login header: media players cannot send one. The id is a random, short-lived UUID.
// `?full=1` waits for the whole clip and sends a normal WAV, for saving on the phone.
router.get('/voice-audio/:id', (req, res) => {
  if (!pipeSpeech(req.params.id, res, { full: req.query.full === '1' })) res.status(404).end();
});

/**
 * Lines the voice helper says on its own, already being spoken: `kind` "ask" (Nepali: where voice search
 * looks, for the search `area`, and what to say) or "searching" (once the buyer has spoken); older app
 * builds' voice chat also asks for "greeting", "nudge" and "goodbye" (in `lang`, with the buyer's name).
 */
router.post('/voice-greeting', requireAuth, async (req, res) => {
  const userId = String(req.user._id);
  const kind = ['nudge', 'goodbye', 'ask', 'searching'].includes(req.body?.kind) ? req.body.kind : 'greeting';
  let lang = ['nudge', 'goodbye'].includes(kind) && ['ne', 'hi', 'en'].includes(req.body?.lang) ? req.body.lang : 'ne';
  let text;
  if (kind === 'ask' || kind === 'searching') {
    lang = 'ne';
    text = kind === 'ask' ? voiceAskText(String(req.body?.area || '')) : VOICE_SEARCHING_TEXT;
  } else if (kind === 'nudge') {
    text = voiceNudgeText(req.user.name, lang);
  } else {
    text = kind === 'goodbye' ? voiceGoodbyeText(req.user.name, lang) : voiceGreetingText(req.user.name);
  }
  const speech = takeVoiceTurn(userId, 'speech', VOICE_SPEECH_PER_DAY) ? openLiveSpeech({ userId }) : null;
  res.json({ text, lang, speechId: speech ? speech.say(text) : null });
});

/** Voice search: the buyer's spoken words in, one search out (words, category, price range, condition, sort). */
router.post('/voice-query', requireAuth, aiLimiter, async (req, res) => {
  try {
    const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return res.status(400).json({ message: 'Say something to search' });
    const userId = String(req.user._id);
    if (!takeVoiceTurn(userId)) {
      return res.status(429).json({ message: 'Voice search limit reached for today. Please type to search.' });
    }
    const categories = (await listProductCategoryNames()).slice(0, 80);
    const area = String(req.body?.area || 'explore');
    const search = await voiceSearchQuery({ text, categories, userId, area, places: req.body?.places });
    // Opening someone by name: the app gets which seller or shop it is (or none found).
    if (search?.act?.do === 'open' && search.act.name) {
      search.act.target = await findSellerByName(search.act.name).catch(() => null);
    }
    // Explore and search results search all listings with these words, so they reuse this answer.
    if ((area === 'explore' || area === 'search-results') && (!search?.act || search.act.do === 'search')) {
      rememberSearch(text, search);
      // The app searches with the AI's English phrase, so that is kept too.
      rememberSearch(search?.english, search);
    }
    return res.json({ search });
  } catch (error) {
    const status = error.status === 429 || error.status === 503 ? error.status : 502;
    if (status === 502) console.error('[ai] voice-query failed:', error.message || error);
    else console.warn('[ai] voice-query:', error.message);
    return res.status(status).json({ message: status === 502 ? 'Voice search could not understand. Please try again.' : error.message });
  }
});

/** One turn of the Explore voice chat (older app builds): the buyer's words and screen in, a spoken reply and what the app should do out. */
router.post('/voice-search', requireAuth, aiLimiter, async (req, res) => {
  try {
    const text = String(req.body?.text || '').replace(/\s+/g, ' ').trim();
    if (!text) return res.status(400).json({ message: 'Say something to search' });
    if (!takeVoiceTurn(String(req.user._id))) {
      return res.status(429).json({ message: 'Voice search limit reached for today. Please type to search.' });
    }
    const userId = String(req.user._id);
    // The voice session opens while the AI thinks, so speaking starts right after the reply is ready.
    const speech = req.body?.speak !== false && takeVoiceTurn(userId, 'speech', VOICE_SPEECH_PER_DAY)
      ? openLiveSpeech({ userId })
      : null;
    res.on('close', () => {
      if (!res.writableFinished) speech?.cancel();
    });
    const categories = (await listProductCategoryNames()).slice(0, 80);
    let turn;
    try {
      turn = await voiceSearchTurn({
        text,
        history: req.body?.history,
        current: req.body?.current,
        screen: req.body?.screen,
        lang: req.body?.lang,
        categories,
        userId,
        userName: req.user.name,
      });
    } catch (error) {
      speech?.cancel();
      throw error;
    }
    let reply = turn.reply;
    if (turn.action === 'search' && !turn.ownBox) {
      const { query, alts, minPrice, maxPrice, condition, category } = turn.search;
      const summary = await searchSummary({
        q: query || category || '',
        alt: query ? alts.join(',') : '',
        minPrice: minPrice || '',
        maxPrice: maxPrice || '',
        condition: condition || '',
      }).catch(() => null);
      const line = voiceResultLine(turn.lang, summary);
      if (line) reply = `${reply} ${line}`;
    }
    return res.json({
      reply,
      speechId: speech ? speech.say(reply) : null,
      lang: turn.lang,
      action: turn.action,
      search: turn.search,
      view: turn.view,
      pick: turn.pick,
      screen: turn.screen,
      command: turn.command,
      where: turn.where,
    });
  } catch (error) {
    const status = error.status === 429 || error.status === 503 ? error.status : 502;
    if (status === 502) console.error('[ai] voice-search failed:', error.message || error);
    else console.warn('[ai] voice-search:', error.message);
    const message = status === 502 ? 'Voice helper could not answer. Please try again.' : error.message;
    return res.status(status).json({ message });
  }
});

// ---------- Admin: model management & usage tracking ----------

let availableCache = { at: 0, models: [], all: [], error: '' };

async function availableModels() {
  const age = Date.now() - availableCache.at;
  if (availableCache.models.length ? age < 60 * 60 * 1000 : age < 5 * 60 * 1000) return availableCache;
  try {
    const { usable, all } = await listAvailableModels();
    availableCache = { at: Date.now(), models: usable, all, error: '' };
  } catch (error) {
    availableCache = { at: Date.now(), models: [], all: [], error: error.message };
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

/** When a model's short rest after Google errors ends, or null if it is not resting. */
function coolingUntil(name) {
  return modelHealthList().find((row) => row.name === name)?.until || null;
}

const PURPOSE_LABELS = {
  listing: 'Listing photo fill',
  'shop-categories': 'Shop categories',
  voice: 'Voice helper',
  'category-fix': 'Daily category check',
  related: 'Related items',
  'voice-tts': 'Voice helper speech',
  test: 'Admin test',
  benchmark: 'Photo accuracy check',
};
const ADMIN_PURPOSES = ['test', 'benchmark'];

/** Groups calls that served one app request, oldest attempt first, so the admin sees each switch. */
function groupRequests(calls) {
  const groups = new Map();
  calls.forEach((call) => {
    const key = call.requestId || String(call._id);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(call);
  });
  return [...groups.entries()].map(([id, list]) => {
    const attempts = [...list].sort((a, b) => new Date(a.at) - new Date(b.at) || (a.attempt || 0) - (b.attempt || 0));
    const first = attempts[0];
    const last = attempts[attempts.length - 1];
    const winner = attempts.find((call) => call.result === 'ok');
    const result = winner ? 'ok' : attempts.every((call) => call.result === 'limit') ? 'limit' : 'failed';
    const lead = winner || last;
    return {
      id,
      at: first.at,
      endedAt: last.at,
      purposeKey: first.purpose || '',
      purpose: PURPOSE_LABELS[first.purpose] || first.purpose || 'AI request',
      userId: first.userId || '',
      level: first.level || '',
      result,
      accountId: lead.accountId || '',
      accountLabel: lead.accountLabel || 'Unknown account',
      model: lead.model,
      totalMs: attempts.reduce((sum, call) => sum + (call.ms || 0), 0),
      switches: Math.max(0, attempts.length - 1),
      attempts: attempts.map((call) => ({
        id: String(call._id),
        at: call.at,
        attempt: call.attempt || 1,
        accountId: call.accountId,
        accountLabel: call.accountLabel || 'Unknown account',
        model: call.model,
        result: call.result,
        errorType: call.errorType || '',
        status: call.status || 0,
        retryMs: call.retryMs || 0,
        ms: call.ms || 0,
        error: call.error || '',
      })),
    };
  });
}

async function attachUsers(requests) {
  const ids = [...new Set(requests.map((row) => row.userId).filter((id) => /^[a-f\d]{24}$/i.test(id)))];
  if (!ids.length) return requests;
  const users = await User.find({ _id: { $in: ids } }).select('name phone').lean();
  const byId = new Map(users.map((user) => [String(user._id), user]));
  return requests.map((row) => {
    const user = byId.get(row.userId);
    return user ? { ...row, user: { id: row.userId, name: user.name || '', phone: user.phone || '' } } : row;
  });
}

/** Newest app requests with every attempt inside; filters match the request's final result or any attempt. */
async function requestLog({ limit = 25, before = null, result = '', accountId = '', purpose = '', errorType = '', level = '' } = {}) {
  const match = {};
  if (before && !Number.isNaN(new Date(before).getTime())) match.at = { $lt: new Date(before) };
  const calls = await AiCallLog.find(match).sort({ at: -1 }).limit(2000).lean();
  const filtered = groupRequests(calls)
    .sort((a, b) => new Date(b.at) - new Date(a.at))
    .filter((row) => !result || row.result === result)
    .filter((row) => !purpose || row.purposeKey === purpose)
    .filter((row) => !level || row.level === level)
    .filter((row) => !accountId || row.attempts.some((call) => call.accountId === accountId))
    .filter((row) => !errorType || row.attempts.some((call) => call.errorType === errorType));
  const page = filtered.slice(0, limit);
  const scannedAll = calls.length < 2000;
  let nextBefore = null;
  if (filtered.length > limit) nextBefore = page[page.length - 1].at;
  else if (!scannedAll) nextBefore = calls[calls.length - 1].at;
  return {
    requests: await attachUsers(page),
    hasMore: Boolean(nextBefore),
    nextBefore,
  };
}

/** Today's app requests (tests excluded): how many worked, and how many worked only after a switch. */
async function todayRequestStats(day) {
  const rows = await AiCallLog.aggregate([
    { $match: { day, purpose: { $nin: ADMIN_PURPOSES } } },
    {
      $group: {
        _id: { $cond: [{ $gt: ['$requestId', ''] }, '$requestId', { $toString: '$_id' }] },
        calls: { $sum: 1 },
        ok: { $max: { $cond: [{ $eq: ['$result', 'ok'] }, 1, 0] } },
        ms: { $sum: '$ms' },
      },
    },
    {
      $group: {
        _id: null,
        requests: { $sum: 1 },
        ok: { $sum: '$ok' },
        calls: { $sum: '$calls' },
        rescued: { $sum: { $cond: [{ $and: [{ $eq: ['$ok', 1] }, { $gt: ['$calls', 1] }] }, 1, 0] } },
        okMs: { $sum: { $cond: [{ $eq: ['$ok', 1] }, '$ms', 0] } },
      },
    },
  ]);
  const row = rows[0] || {};
  const requests = row.requests || 0;
  const ok = row.ok || 0;
  return {
    requests,
    ok,
    failed: requests - ok,
    calls: row.calls || 0,
    rescued: row.rescued || 0,
    avgMs: ok ? Math.round((row.okMs || 0) / ok) : 0,
    successRate: requests ? Math.round((ok / requests) * 100) : null,
  };
}

/** Today's listing fills by seller level: how many, how many worked, how fast, and which model answered. */
async function todayLevelStats(day) {
  const rows = await AiCallLog.aggregate([
    { $match: { day, purpose: 'listing' } },
    {
      $group: {
        _id: { $cond: [{ $gt: ['$requestId', ''] }, '$requestId', { $toString: '$_id' }] },
        level: { $max: '$level' },
        ok: { $max: { $cond: [{ $eq: ['$result', 'ok'] }, 1, 0] } },
        winner: { $max: { $cond: [{ $eq: ['$result', 'ok'] }, '$model', ''] } },
        ms: { $sum: '$ms' },
      },
    },
    {
      $group: {
        _id: '$level',
        requests: { $sum: 1 },
        ok: { $sum: '$ok' },
        okMs: { $sum: { $cond: [{ $eq: ['$ok', 1] }, '$ms', 0] } },
        winners: { $push: '$winner' },
      },
    },
  ]);
  const stats = {};
  LEVELS.forEach((level) => {
    const row = rows.find((item) => item._id === level) || {};
    const byModel = {};
    (row.winners || []).filter(Boolean).forEach((name) => {
      byModel[name] = (byModel[name] || 0) + 1;
    });
    const requests = row.requests || 0;
    const ok = row.ok || 0;
    stats[level] = {
      requests,
      ok,
      failed: requests - ok,
      successRate: requests ? Math.round((ok / requests) * 100) : null,
      avgMs: ok ? Math.round((row.okMs || 0) / ok) : 0,
      models: Object.entries(byModel)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count })),
    };
  });
  return stats;
}

/** Per-account calls from the call log: today by model, last 7 days, and recent requests. */
async function accountUsageReport(settings, days) {
  const today = days[0];
  const [groups, recent] = await Promise.all([
    AiCallLog.aggregate([
      { $match: { day: { $in: days } } },
      {
        $group: {
          _id: { day: '$day', accountId: '$accountId', model: '$model', result: '$result' },
          count: { $sum: 1 },
          // Calls Google answered; timeouts and network errors (status 0) do not use quota.
          answered: { $sum: { $cond: [{ $gt: ['$status', 0] }, 1, 0] } },
          ms: { $sum: '$ms' },
          label: { $last: '$accountLabel' },
          lastAt: { $max: '$at' },
        },
      },
    ]),
    requestLog({ limit: 20 }),
  ]);

  const byAccount = new Map();
  const entryFor = (id, label) => {
    if (!byAccount.has(id)) {
      byAccount.set(id, {
        id,
        label,
        lastUsedAt: null,
        lastOkAt: null,
        lastFailAt: null,
        okMs: 0,
        week: new Map(days.map((day) => [day, { ok: 0, failed: 0, limit: 0 }])),
        todayByModel: new Map(),
      });
    }
    return byAccount.get(id);
  };

  groups.forEach((group) => {
    const { day, accountId, model, result } = group._id;
    const entry = entryFor(accountId || 'unknown', group.label || 'Unknown account');
    const dayRow = entry.week.get(day);
    if (dayRow) dayRow[result] += group.count;
    if (day === today) {
      const modelRow = entry.todayByModel.get(model) || { ok: 0, failed: 0, limit: 0, quotaUsed: 0 };
      modelRow[result] += group.count;
      if (result !== 'limit') modelRow.quotaUsed += group.answered || 0;
      entry.todayByModel.set(model, modelRow);
      if (result === 'ok') entry.okMs += group.ms || 0;
    }
    if (!entry.lastUsedAt || group.lastAt > entry.lastUsedAt) entry.lastUsedAt = group.lastAt;
    const key = result === 'ok' ? 'lastOkAt' : 'lastFailAt';
    if (!entry[key] || group.lastAt > entry[key]) entry[key] = group.lastAt;
  });

  const enabledModels = (settings.models || []).filter((model) => model.enabled);
  const quotaModels = settings.autoSwitch ? enabledModels : enabledModels.slice(0, 1);
  const now = Date.now();

  const usageFor = (account) => {
    const entry = byAccount.get(account.id) || entryFor(account.id, account.label);
    const week = days.map((day) => ({ day, ...entry.week.get(day) }));
    const todayRow = week[0];
    const models = quotaModels.map((model) => {
      const row = entry.todayByModel.get(model.name) || { ok: 0, failed: 0, limit: 0, quotaUsed: 0 };
      const block = (account.modelBlocks || []).find(
        (item) => item.name === model.name && item.blockedUntil && new Date(item.blockedUntil).getTime() > now
      );
      const limit = model.dailyLimit ?? 20;
      const used = row.quotaUsed;
      return {
        name: model.name,
        used,
        ok: row.ok,
        failed: row.failed,
        limit,
        limitSource: model.limitSource || '',
        limitHits: row.limit,
        blockedUntil: block ? block.blockedUntil : null,
        blockType: block?.type || '',
        blockReason: block?.reason || '',
        cooling: coolingUntil(model.name),
        remaining: block || account.blockedUntil ? 0 : Math.max(0, limit - used),
      };
    });
    const quotaLimit = models.reduce((sum, model) => sum + model.limit, 0);
    const quotaUsed = models.reduce((sum, model) => sum + model.used, 0);
    const attempts = todayRow.ok + todayRow.failed + todayRow.limit;
    return {
      today: {
        ok: todayRow.ok,
        failed: todayRow.failed,
        limitHits: todayRow.limit,
        avgMs: todayRow.ok ? Math.round(entry.okMs / todayRow.ok) : 0,
        successRate: attempts ? Math.round((todayRow.ok / attempts) * 100) : null,
      },
      lastUsedAt: entry.lastUsedAt,
      lastOkAt: entry.lastOkAt,
      lastFailAt: entry.lastFailAt,
      week,
      models,
      quota: {
        limit: quotaLimit,
        used: quotaUsed,
        remaining: account.enabled === false ? 0 : models.reduce((sum, model) => sum + model.remaining, 0),
      },
    };
  };

  return {
    usageFor,
    historyAccounts: [...byAccount.values()]
      .filter((entry) => [...entry.week.values()].some((row) => row.ok + row.failed + row.limit > 0))
      .map((entry) => ({
        id: entry.id,
        label: entry.label,
        byDay: Object.fromEntries([...entry.week.entries()].map(([day, row]) => [day, row.ok + row.failed])),
      })),
    recent,
  };
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

  const [{ models: available, all: onKey, error: availableError }, report, requestsToday, levelsToday] = await Promise.all([
    availableModels(),
    accountUsageReport(settings, days),
    todayRequestStats(today),
    todayLevelStats(today),
  ]);
  const levels = levelLimits(settings);
  const accounts = (settings.accounts || []).map((account) => ({
    ...presentAccount(account),
    usage: report.usageFor(presentAccount(account)),
  }));

  // Same order the engine uses: best model on every account first, used-up pairs skipped, cooling models last.
  const usableAccounts = candidateAccounts(settings);
  await loadDayUsage();
  const limitOf = new Map((settings.models || []).map((model) => [model.name, model.dailyLimit ?? 20]));
  const hasRoom = (account, model) => !(limitOf.get(model) > 0) || pairUsedToday(account.id, model) < limitOf.get(model);
  let active = null;
  for (const preferCool of [false, true]) {
    for (const model of candidateModels(settings)) {
      if (!preferCool && modelCooling(model)) continue;
      const account = usableAccounts.find((item) => modelsForAccount(settings, item).includes(model) && hasRoom(item, model));
      if (account) {
        active = { account, model };
        break;
      }
    }
    if (active) break;
  }
  const paceAccounts = usableAccounts.map((account) => account.id);
  const inSettings = new Set((settings.models || []).map((model) => model.name));

  return {
    autoSwitch: settings.autoSwitch,
    userDailyLimit: settings.userDailyLimit ?? 15,
    globalDailyCap: settings.globalDailyCap ?? 500,
    usedToday: await usedToday(),
    activeModel: active?.model || null,
    activeAccount: active ? active.account.label : null,
    activeAccountId: active ? active.account.id : null,
    keyConfigured: accounts.length > 0 || Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
    accounts,
    quotaDay: today,
    quotaResetAt: nextQuotaReset(),
    serverTime: new Date(),
    engine: ENGINE,
    requestsToday,
    cooling: modelHealthList(),
    historyAccounts: report.historyAccounts,
    recentRequests: report.recent.requests,
    recentHasMore: report.recent.hasMore,
    recentNextBefore: report.recent.nextBefore,
    models: (settings.models || []).map((model) => {
      const row = todayByModel.get(model.name) || {};
      return {
        name: model.name,
        enabled: model.enabled,
        dailyLimit: model.dailyLimit ?? 20,
        blockedUntil: isBlocked(model) ? model.blockedUntil : null,
        blockReason: isBlocked(model) ? model.blockReason || '' : '',
        cooling: coolingUntil(model.name),
        pace: modelPace(model.name, paceAccounts),
        limitSource: model.limitSource || '',
        limitLearnedAt: model.limitLearnedAt || null,
        reservedForNew: (model.dailyLimit ?? 20) > levels.reserve ? levels.reserve : 0,
        bulk: freeDailyQuota(model) >= ENGINE.bulkDailyLimit,
        freeTierLimit: catalogEntry(model.name)?.rpd ?? null,
        catalogStatus: catalogEntry(model.name)?.status || '',
        catalogNote: catalogEntry(model.name)?.use || '',
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
    recommendedModels: RECOMMENDED_MODELS,
    sellerLevels: { ...levels, today: levelsToday },
    catalog: CATALOG.map((entry) => ({
      ...entry,
      onKey: entry.name && onKey.length ? onKey.includes(entry.name) : null,
      inUse: Boolean(entry.name && inSettings.has(entry.name)),
    })),
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
    ['userDailyLimit', 'globalDailyCap', 'newSellerReserve'].forEach((field) => {
      if (req.body?.[field] === undefined) return;
      const value = Number(req.body[field]);
      if (Number.isFinite(value) && value >= 0) update[field] = Math.min(100000, Math.round(value));
    });
    if (req.body?.newSellerListings !== undefined || req.body?.heavySellerListings !== undefined) {
      const newUpTo = Math.round(Number(req.body.newSellerListings ?? current.newSellerListings ?? 3));
      const heavyFrom = Math.round(Number(req.body.heavySellerListings ?? current.heavySellerListings ?? 20));
      if (!Number.isFinite(newUpTo) || !Number.isFinite(heavyFrom) || newUpTo < 1 || heavyFrom <= newUpTo) {
        return res.status(400).json({ message: 'Heavy sellers must start above the new-seller count (new ≥ 1).' });
      }
      update.newSellerListings = Math.min(1000, newUpTo);
      update.heavySellerListings = Math.min(10000, heavyFrom);
    }

    if (Array.isArray(req.body?.models)) {
      const seen = new Set();
      const models = [];
      req.body.models.forEach((item) => {
        const name = String(item?.name || '').trim().replace(/^models\//, '');
        if (!name || seen.has(name) || !/^[\w.-]+$/.test(name)) return;
        seen.add(name);
        const limit = Number(item.dailyLimit);
        const old = previous.get(name);
        const typed = item.dailyLimit != null && Number.isFinite(limit) && limit >= 0 ? Math.round(limit) : null;
        // No number = use Google's free limit (a limit learned from a Google 429 wins over the table).
        let dailyLimit = old?.limitSource === 'google' ? old.dailyLimit : defaultDailyLimit(name);
        let limitSource = old?.limitSource === 'google' ? 'google' : defaultLimitSource(name);
        let limitLearnedAt = old?.limitSource === 'google' ? old.limitLearnedAt : null;
        if (typed !== null && old && typed === old.dailyLimit) {
          dailyLimit = typed;
          limitSource = old.limitSource || '';
          limitLearnedAt = old.limitLearnedAt || null;
        } else if (typed !== null && typed !== dailyLimit) {
          dailyLimit = typed;
          limitSource = 'admin';
          limitLearnedAt = null;
        }
        models.push({
          name,
          enabled: item.enabled !== false,
          dailyLimit,
          blockedUntil: old?.blockedUntil || null,
          blockReason: old?.blockReason || '',
          limitSource,
          limitLearnedAt,
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

/** The model a test should use for this account: the first one it could serve, else the first turned on. */
function testModelFor(settings, account) {
  return modelsForAccount(settings, account)[0] || candidateModels(settings)[0] || null;
}

router.post('/admin/accounts/:id/test', requireScope('ai'), auditRoute('ai.accounts.test.create', { targetType: 'ai', param: 'id' }), async (req, res, next) => {
  try {
    const account = await getAccountKey(req.params.id);
    if (!account) return res.status(404).json({ message: 'Account not found' });
    const settings = await getAiSettings({ fresh: true });
    const model = String(req.body?.model || '').trim() || testModelFor(settings, account);
    if (!model) return res.status(400).json({ message: 'Turn on at least one model before testing' });
    const result = await testModel(model, account.apiKey, account.id, account.label, String(req.user?._id || ''));
    res.json({ result, overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/accounts/test-all', requireScope('ai'), auditRoute('ai.accounts.test-all.create', { targetType: 'ai' }), async (req, res, next) => {
  try {
    const settings = await getAiSettings({ fresh: true });
    const accounts = (settings.accounts || []).filter((account) => account.enabled && account.apiKey);
    // One at a time: each result may save a block on the same settings document.
    const results = [];
    for (const account of accounts) {
      const model = testModelFor(settings, account);
      if (!model) {
        results.push({ id: account.id, label: account.label, ok: false, message: 'No model is turned on' });
        continue;
      }
      const result = await testModel(model, account.apiKey, account.id, account.label, String(req.user?._id || ''));
      results.push({ id: account.id, label: account.label, ...result });
    }
    res.json({ results, overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

router.get('/admin/logs', requireScope('ai'), async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 25));
    const pick = (value, allowed) => (allowed.includes(String(value || '')) ? String(value) : '');
    res.json(
      await requestLog({
        limit,
        before: req.query.before || null,
        result: pick(req.query.result, ['ok', 'failed', 'limit']),
        purpose: pick(req.query.purpose, Object.keys(PURPOSE_LABELS)),
        level: pick(req.query.level, LEVELS),
        accountId: String(req.query.accountId || '').slice(0, 80),
        errorType: String(req.query.errorType || '').replace(/[^a-z_]/g, '').slice(0, 40),
      })
    );
  } catch (error) {
    next(error);
  }
});

router.post('/admin/models/benchmark', requireScope('ai'), auditRoute('ai.models.benchmark.create', { targetType: 'ai' }), async (req, res, next) => {
  try {
    const settings = await getAiSettings({ fresh: true });
    const accounts = candidateAccounts(settings);
    const models = (settings.models || []).filter((model) => model.enabled);
    if (!accounts.length) return res.status(400).json({ message: 'No account can take a request right now' });
    if (!models.length) return res.status(400).json({ message: 'Turn on at least one model first' });
    const userId = String(req.user?._id || '');
    // Each model runs on its own quota, so all of them go at once and the slowest sets the wait.
    const results = await Promise.all(
      models.map(async (model) => {
        if (isBlocked(model)) {
          return { model: model.name, ok: false, correct: false, skipped: true, type: 'quota_day', message: 'Paused until its limit resets' };
        }
        const account = accounts.find((item) => !presentAccount(item).blockedModels.includes(model.name));
        if (!account) {
          return { model: model.name, ok: false, correct: false, skipped: true, type: 'quota_day', message: 'Used up on every account today' };
        }
        try {
          return await benchmarkModel(model.name, account, userId);
        } catch (error) {
          return { model: model.name, account: account.label, ok: false, correct: false, type: 'failed', message: error.message };
        }
      })
    );
    res.json({ results, overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

router.post('/admin/models/:name/test', requireScope('ai'), auditRoute('ai.models.test.create', { targetType: 'ai', param: 'name' }), async (req, res, next) => {
  try {
    const result = await testModel(req.params.name, null, null, '', String(req.user?._id || ''));
    res.json({ result, overview: await adminOverview() });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
