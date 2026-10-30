const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const {
  accountModelBlocked,
  candidateAccounts,
  candidateModels,
  clearAccountModelBlock,
  coolModel,
  freeDailyQuota,
  getAiSettings,
  learnDailyLimit,
  learnRpm,
  loadDayUsage,
  markAccountBlocked,
  markAccountModelBlocked,
  modelCooling,
  nextQuotaReset,
  noteAccountSuccess,
  noteModelOk,
  notePairCall,
  pairUsedToday,
  pairWaitMs,
  recordUsage,
  strikeModel,
} = require('./aiSettings');
const { levelLimits } = require('./aiSellerLevel');
const { catalogEntry } = require('./aiCatalog');

// The phone waits 60 s for an AI fill, so every switch has to fit inside this budget.
const REQUEST_DEADLINE_MS = 50 * 1000;
const CALL_TIMEOUT_MS = 30 * 1000;
const MIN_CALL_MS = 4 * 1000;
const KEY_BLOCK_MS = 24 * 60 * 60 * 1000;
const MODEL_MISSING_BLOCK_MS = 12 * 60 * 60 * 1000;
const OVERLOAD_COOLDOWN_MS = 90 * 1000;
const TIMEOUT_COOLDOWN_MS = 2 * 60 * 1000;
const PACE_MAX_WAIT_MS = 15 * 1000;
const NEW_SELLER_PACE_WAIT_MS = 25 * 1000;
// Models with at least this many free calls a day count as "big quota" (the Lite models).
const BULK_DAILY_LIMIT = 100;

const LIMIT_TYPES = new Set(['quota_day', 'quota_minute', 'quota_zero', 'spend_limit']);
const GEMINI_BLOCK_REASONS = new Set(['SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_SAFETY']);

function retryDelayMs(payload) {
  const info = (payload?.error?.details || []).find((item) => item?.retryDelay);
  const fromDetails = info ? parseFloat(String(info.retryDelay)) : NaN;
  if (Number.isFinite(fromDetails)) return fromDetails * 1000;
  const match = String(payload?.error?.message || '').match(/retry in (?:(\d+)h)?(?:(\d+)m)?([\d.]+)s/i);
  if (match) {
    const [, h = 0, m = 0, sec = 0] = match;
    return ((Number(h) * 60 + Number(m)) * 60 + Number(sec)) * 1000;
  }
  return 0;
}

function quotaViolations(payload) {
  return (payload?.error?.details || [])
    .filter((item) => /QuotaFailure/i.test(String(item?.['@type'] || '')))
    .flatMap((item) => item.violations || []);
}

/** The request cap Google names in a 429 (per day or per minute); 0 when it does not say. */
function requestCap(violations, period) {
  const pattern = period === 'day' ? /PerDay/i : /PerMinute/i;
  const hit = violations.find((v) => /Requests/i.test(String(v.quotaId || '')) && pattern.test(String(v.quotaId || '')));
  const value = Number(hit?.quotaValue);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Sorts one failed Gemini call by cause and by how far the damage reaches:
 * 'account' = the whole key, 'pair' = this key on this model, 'model' = this model on every key,
 * 'call' = only this attempt.
 */
function classifyFailure({ status = 0, payload = null, error = null, ms = 0 }) {
  const message = payload?.error?.message || error?.message || (status ? `HTTP ${status}` : 'Network error');
  if (error) {
    const timedOut = error.name === 'AbortError' || error.name === 'TimeoutError' || /abort|timeout/i.test(error.message || '');
    return timedOut
      ? { type: 'timeout', scope: 'call', message: `No answer in ${Math.round(ms / 1000)}s` }
      : { type: 'network', scope: 'call', message };
  }

  const apiStatus = String(payload?.error?.status || '');
  if (status === 429 || apiStatus === 'RESOURCE_EXHAUSTED') {
    const violations = quotaViolations(payload);
    const ids = violations.map((v) => `${v.quotaId || ''} ${v.quotaMetric || ''}`).join(' ');
    const retry = retryDelayMs(payload);
    if (/spend/i.test(`${message} ${ids}`)) {
      return { type: 'spend_limit', scope: 'account', blockMs: Math.max(retry, 10 * 60 * 1000), retryMs: retry, message };
    }
    // "limit: 0" means this project gets no free requests on this model at all.
    if (/limit:\s*0\b/i.test(message) || violations.some((v) => String(v.quotaValue) === '0')) {
      return { type: 'quota_zero', scope: 'pair', until: nextQuotaReset(), retryMs: retry, message };
    }
    if (/PerDay|per_day|per day/i.test(`${ids} ${message}`)) {
      return { type: 'quota_day', scope: 'pair', until: nextQuotaReset(), retryMs: retry, cap: requestCap(violations, 'day'), message };
    }
    return {
      type: 'quota_minute',
      scope: 'pair',
      blockMs: retry > 0 ? retry + 1000 : 60 * 1000,
      retryMs: retry,
      cap: requestCap(violations, 'minute'),
      message,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    /api key not valid|api_key_invalid|api key expired|permission denied|unregistered callers|has been suspended|location is not supported/i.test(message)
  ) {
    return { type: 'key_invalid', scope: 'account', blockMs: KEY_BLOCK_MS, message };
  }
  if (status === 404 || /is not found for api version|not supported for generatecontent/i.test(message)) {
    return { type: 'model_missing', scope: 'pair', blockMs: MODEL_MISSING_BLOCK_MS, message };
  }
  if (status === 400) return { type: 'bad_request', scope: 'call', message };
  if (status === 503 || /overloaded|high demand/i.test(message)) {
    return { type: 'overloaded', scope: 'model', blockMs: OVERLOAD_COOLDOWN_MS, message };
  }
  if (status >= 500) return { type: 'server_error', scope: 'call', message };
  return { type: 'failed', scope: 'call', message };
}

/** Takes the account, the account+model, or the model out of rotation for as long as the error says. */
function applyFailure(failure, account, model) {
  const warn = (err) => console.warn('[ai] could not save block:', err.message);
  const id = account?.id;
  if (failure.type === 'quota_day' && failure.cap) learnDailyLimit(model, failure.cap).catch(warn);
  if (failure.type === 'quota_minute' && failure.cap) learnRpm(model, failure.cap);
  if (failure.scope === 'account' && id) {
    markAccountBlocked(id, Date.now() + failure.blockMs, failure.message, failure.type).catch(warn);
  } else if (failure.scope === 'pair' && id) {
    const until = failure.until || Date.now() + failure.blockMs;
    markAccountModelBlocked(id, model, until, failure.message, failure.type).catch(warn);
  } else if (failure.scope === 'model') {
    coolModel(model, failure.blockMs, failure.message, failure.type);
  } else if (failure.type === 'timeout') {
    // A hang is Google-side and hits every key on that model; the next request should not wait for it too.
    coolModel(model, TIMEOUT_COOLDOWN_MS, failure.message, failure.type);
  } else if (['server_error', 'network'].includes(failure.type)) {
    strikeModel(model, failure.message, failure.type);
  }
}

const CONDITIONS = ['New', 'Good', 'Fair'];
const SAFETY_ISSUES = ['nudity', 'violence', 'weapon', 'drugs', 'other'];

const SYSTEM_INSTRUCTION =
  'You analyse product photos for a classifieds marketplace and reply with valid JSON only.';

// Thinking tokens count towards maxOutputTokens, so it leaves room for a short "low" think.
const GENERATION_CONFIG = {
  temperature: 0.2,
  maxOutputTokens: 2048,
  responseMimeType: 'application/json',
};

function buildPrompt(categories, shop) {
  const list = (categories || []).filter(Boolean);
  const shopList = (shop?.categories || []).filter(Boolean);
  const lines = [
    'You are a listing assistant for KinBech, a Nepali buy-and-sell marketplace.',
    'Study the attached product photo carefully before answering.',
    'Read every visible clue: brand, model name or number printed on the item, colour,',
    'material, finish, size, ports and buttons, packaging, accessories in the frame, and',
    'any wear, scratches, dents or missing parts. Zoom into small text or labels when',
    'that helps you identify the exact model.',
    '',
    'Reply with JSON only, in exactly this shape:',
    '{"title": string, "description": string, "category": string, "condition": string, "priceNpr": number, "newPriceNpr": number, "safety": {"allowed": boolean, "issue": string, "reason": string}, "searchWords": string[]}',
    '',
    'Safety rules (check first):',
    '- KinBech is a family marketplace. Set safety.allowed to false when the photo shows nudity,',
    '  sexual or suggestive content, violence, blood or gore, injured people or animals,',
    '  weapons, ammunition, or drugs.',
    '- safety.issue: exactly one of "none", "nudity", "violence", "weapon", "drugs", "other".',
    '- safety.reason: one short plain English sentence saying what is wrong. Empty when allowed.',
    '- When safety.allowed is false, leave title, description and searchWords empty.',
    '',
    'Price rules:',
    '- priceNpr: a realistic selling price in Nepal, in Nepali rupees (NPR), for this exact item',
    '  in the condition you see. Think of current second-hand prices in Nepal for used items and',
    '  Nepal retail prices for new ones. Whole number only, no currency text. Use 0 only if unknown.',
    '- newPriceNpr: the current retail price in Nepal, in NPR, of this exact item bought brand new',
    '  today (same brand and model; nearest current model if it is discontinued). Whole number only.',
    '  Use 0 only if unknown.',
    '',
    'Title rules (most important):',
    '- Choose the single best search title a buyer would type into a search box.',
    '- The title must be exactly 5 words. Never fewer than 5, never more than 5.',
    '- Use only the 5 words that identify this item: brand, model, and the spec buyers search.',
    '- If a detail would make a 6th word, drop the least useful word and keep exactly 5.',
    '- Searchable plain words only. No emojis, no ALL CAPS, no punctuation except a model number.',
    '- Never add filler like "for sale", "urgent", "best price", "good condition", "used", "brand new".',
    '',
    'Description rules:',
    '- Do not stop at a general description. Describe this exact item, then list its features.',
    '- First write 1 or 2 short sentences: what it is, colour, and visible condition.',
    '- Then a line that says exactly "Features:" and 4 to 7 lines, each starting with "- ".',
    '- Every feature must belong to this item: brand, model, material, size, capacity, ports,',
    '  included accessories, and visible wear. Skip a feature you cannot see.',
    '- No price, currency, or "negotiable".',
    '',
    'Search word rules:',
    '- First name the exact item in the photo. searchWords must be names of that item only.',
    '- Do not copy words from any sample list. There is no fixed vocabulary.',
    '- For this item, give the names a buyer in Nepal would type, in four languages:',
    '  English, Hinglish (Roman Hindi), Nepali, and Maithili.',
    '- Nepali and Maithili each need the Roman spelling and the Devanagari spelling as separate strings.',
    '- A Roman word does not replace its Devanagari spelling. Keep both when people search either way.',
    '- Put the most popular local name first, then the other real names and spellings.',
    '- 12 to 20 short strings. One name per string. No language labels, brackets, notes, price, or sentences.',
    '- Skip a word only when it is the same spelling already listed.',
    '- If the photo shows a brand or model, include that exact text plus the local generic names for that kind of product.',
    '- After the names, add a colour or type only when it is visible on this item and buyers would search it.',
    '- condition: exactly one of "New", "Good", "Fair", judged from the visible wear.',
    '- If something is unclear, give your best reasonable guess instead of leaving it empty.',
  ];
  lines.push('');
  lines.push('Category rules (critical — buyers filter by this):');
  lines.push('- Put the same product type in the same category every time.');
  lines.push('- Use a product class, never a brand, model, colour, or condition.');
  lines.push('- Examples of wrong names: "Apple", "iPhone 13", "Gaming Laptop", "Red Sofa".');
  lines.push('- Phone, charger, and phone case or phone cover → Mobiles. MacBook and notebooks → Laptops.');
  lines.push('- Books, novels and textbooks → Books. A book cover is a book, never Mobiles.');
  lines.push('- TV, fan, SSD, power supply, headphones → Electronics.');
  if (shop?.type) {
    lines.push(`- This seller runs a "${shop.type}" store.`);
    if (shopList.length) {
      lines.push(`- Their store categories: ${shopList.map((c) => `"${c}"`).join(', ')}.`);
      lines.push('- Pick one of the store categories whenever the item fits one of them.');
    }
  }
  if (list.length) {
    lines.push(`- Prefer exactly one of: ${list.map((c) => `"${c}"`).join(', ')}.`);
    lines.push('- Invent a new name only if this item is a different product class not covered above.');
    lines.push('- A new name must be 1 to 3 Title Case words, usually plural, e.g. "Books", "Toys & Games".');
  } else {
    lines.push('- category: a short marketplace class name, 1 to 3 Title Case words.');
  }
  return lines.join('\n');
}

function parseSuggestion(rawText) {
  if (!rawText) return null;
  const cleaned = String(rawText)
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();

  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const safetyRaw = parsed.safety && typeof parsed.safety === 'object' ? parsed.safety : {};
  const issue = String(safetyRaw.issue || '').trim().toLowerCase();
  const safety = {
    allowed: safetyRaw.allowed !== false && !SAFETY_ISSUES.includes(issue),
    issue: SAFETY_ISSUES.includes(issue) ? issue : safetyRaw.allowed === false ? 'other' : 'none',
    reason: String(safetyRaw.reason || '').trim().slice(0, 240),
  };
  if (!safety.allowed) {
    return { title: '', description: '', category: null, condition: null, priceNpr: null, newPriceNpr: null, searchWords: [], safety };
  }

  const titleWords = String(parsed.title || '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean);
  const title = (titleWords.length > 5 ? titleWords.slice(0, 5) : titleWords).join(' ');
  const description = String(parsed.description || '').trim();
  if (!title && !description) return null;
  const priceNpr = Math.round(Number(parsed.priceNpr));
  const newPriceNpr = Math.round(Number(parsed.newPriceNpr));

  const conditionRaw = String(parsed.condition || '').trim().toLowerCase();
  const searchWords = Array.isArray(parsed.searchWords)
    ? parsed.searchWords
        .map((word) => String(word || '').trim().replace(/\s+/g, ' ').slice(0, 40))
        .filter(Boolean)
        .filter((word, index, all) => all.findIndex((item) => item.toLowerCase() === word.toLowerCase()) === index)
        .slice(0, 20)
    : [];
  return {
    title: title.slice(0, 120),
    description: description.slice(0, 1600),
    category: String(parsed.category || '').trim() || null,
    condition: CONDITIONS.find((c) => c.toLowerCase() === conditionRaw) || null,
    priceNpr: Number.isFinite(priceNpr) && priceNpr > 0 ? priceNpr : null,
    newPriceNpr: Number.isFinite(newPriceNpr) && newPriceNpr > 0 ? newPriceNpr : null,
    searchWords,
    safety,
  };
}

function buildBody(generationConfig, data, mimeType, categories, shop) {
  return {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data } },
          { text: buildPrompt(categories, shop) },
        ],
      },
    ],
    generationConfig,
  };
}

const SHOP_CATEGORY_INSTRUCTION =
  'You organise product categories for a classifieds marketplace and reply with valid JSON only.';

function buildShopCategoriesBody(generationConfig, { type, name, description, existing }) {
  const lines = [
    'KinBech is a Nepali local buy-and-sell marketplace.',
    `A seller runs a "${type}" store${name ? ` called "${name}"` : ''}.`,
  ];
  if (description) lines.push(`Store description: ${description}`);
  lines.push(
    '',
    'List the product categories buyers would browse in this store.',
    'Reply with JSON only, in exactly this shape: {"categories": string[]}',
    '- 6 to 10 categories, the most common first.',
    '- Only products this kind of store really sells.',
    '- Each one is a product class of 1 to 3 Title Case words, usually plural, e.g. "Phone Accessories".',
    '- Never a brand, model, colour, size, price or condition.',
  );
  if (existing?.length) {
    lines.push(`- When one of these fits, reuse its exact name: ${existing.map((c) => `"${c}"`).join(', ')}.`);
  }
  return {
    systemInstruction: { parts: [{ text: SHOP_CATEGORY_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: lines.join('\n') }] }],
    generationConfig: { ...generationConfig, maxOutputTokens: 1024 },
  };
}

function parseShopCategories(rawText) {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }
  }
  const list = Array.isArray(parsed?.categories) ? parsed.categories : [];
  const names = list
    .map((item) => String(item || '').trim().replace(/\s+/g, ' ').slice(0, 36))
    .filter(Boolean)
    .filter((item, index, all) => all.findIndex((other) => other.toLowerCase() === item.toLowerCase()) === index)
    .slice(0, 12);
  return names.length ? names : null;
}

/** One HTTP call with its own timeout. Never throws: network errors come back as `error`. */
async function callModel(model, body, apiKey, { timeoutMs = CALL_TIMEOUT_MS } = {}) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await res.json().catch(() => null);
    return { res, payload, ms: Date.now() - started };
  } catch (error) {
    return { error, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

function geminiBlockReason(payload) {
  const reason = payload?.promptFeedback?.blockReason;
  if (reason) return String(reason);
  const finish = String(payload?.candidates?.[0]?.finishReason || '');
  return GEMINI_BLOCK_REASONS.has(finish) ? finish : '';
}

function answerText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

// Gemini 3+ takes a `thinkingLevel` ("low" reads model names on labels more reliably than no
// thinking, for ~1 s more); Gemini 2.x takes `thinkingBudget`, and some models reject one or
// the other with a 400. A rejected setting is remembered so later requests skip that call.
// "minimal" is for quick chat turns (voice), where answer speed matters more than reading labels.
const THINKING = { minimal: { thinkingLevel: 'minimal' }, level: { thinkingLevel: 'low' }, budget: { thinkingBudget: 0 } };
const rejectedThinking = new Map();

function configsFor(model, quick = false) {
  let order = /^gemini-[3-9]/.test(model) ? ['level', 'budget'] : ['budget', 'level'];
  if (quick && order[0] === 'level') order = ['minimal', ...order];
  const rejected = rejectedThinking.get(model) || new Set();
  return [
    ...order
      .filter((kind) => !rejected.has(kind))
      .map((kind) => ({ kind, generationConfig: { ...GENERATION_CONFIG, thinkingConfig: THINKING[kind] } })),
    { kind: null, generationConfig: GENERATION_CONFIG },
  ];
}

function rejectThinking(model, kind) {
  if (!rejectedThinking.has(model)) rejectedThinking.set(model, new Set());
  rejectedThinking.get(model).add(kind);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function finalError(failures, requestId) {
  const types = failures.map((item) => item.type);
  let error;
  if (types.length && types.every((type) => type === 'quota_minute')) {
    error = new Error('AI is busy right now. Please try again in a minute or fill the details yourself.');
    error.status = 503;
  } else if (types.length && types.every((type) => LIMIT_TYPES.has(type))) {
    error = quotaError();
  } else if (types.length && types.every((type) => type === 'key_invalid')) {
    error = new Error('AI accounts need attention. Please fill the details yourself for now.');
    error.status = 503;
  } else if (types.filter((type) => type === 'bad_request').length >= 2) {
    error = new Error('AI could not read this photo. Try another photo or fill the details yourself.');
    error.status = 503;
  } else {
    error = new Error('AI is busy right now. Please try again in a minute or fill the details yourself.');
    error.status = 503;
  }
  error.requestId = requestId;
  error.failures = failures;
  return error;
}

/**
 * Runs `makeBody` until `parse` returns a value. The best model is tried on every account
 * before a weaker model, and each failure takes out only what it affects:
 * a dead key skips the account, a used-up quota skips that account+model,
 * and "high demand" skips the model on every account for a short cooldown.
 * `onBlocked(reason)` turns a Gemini safety block into a result instead of an error.
 */
async function runGemini(makeBody, parse, {
  purpose = '',
  userId = '',
  level = 'regular',
  preferBulk = false,
  deadlineMs = REQUEST_DEADLINE_MS,
  models: onlyModels = null,
  quick = false,
  onBlocked = null,
} = {}) {
  const settings = await getAiSettings();
  if (!(settings.models || []).some((model) => model.enabled)) {
    const error = new Error('AI is turned off right now. Please fill the details yourself.');
    error.status = 503;
    throw error;
  }
  const accounts = candidateAccounts(settings);
  if (!accounts.length) {
    const error = new Error('No AI account is available. Add a Gemini key in the admin panel.');
    error.status = 503;
    throw error;
  }

  const requestId = crypto.randomUUID();
  const started = Date.now();
  const deadline = started + deadlineMs;
  await loadDayUsage();
  const isNew = level === 'new';
  const { reserve } = levelLimits(settings);
  // Special models (speech) are not in the admin model list: no new-seller reserve, catalog limits.
  const holdBack = isNew || onlyModels ? 0 : 1;
  const dailyLimitOf = new Map((settings.models || []).map((model) => [model.name, model.dailyLimit ?? 20]));
  const freeQuotaOf = new Map((settings.models || []).map((model) => [model.name, freeDailyQuota(model)]));
  const limitOf = (model) => (dailyLimitOf.has(model) ? dailyLimitOf.get(model) : catalogEntry(model)?.rpd || 0);
  let models = onlyModels || candidateModels(settings);
  if (level === 'heavy' || preferBulk) {
    // Heavy sellers start on the big-quota models so the fast small-quota ones last for newer sellers.
    const bulk = (name) => freeQuotaOf.get(name) >= BULK_DAILY_LIMIT;
    models = [...models.filter(bulk), ...models.filter((name) => !bulk(name))];
  }
  const pairs = [];
  models.forEach((model) => {
    accounts.forEach((account) => {
      if (accountModelBlocked(account, model)) return;
      const limit = limitOf(model);
      const used = pairUsedToday(account.id, model);
      // Used up by our own count: switch now instead of spending a call on Google's 429.
      if (limit > 0 && used >= limit) return;
      // The last `reserve` calls of each key+model today are kept for new sellers.
      if (!isNew && !onlyModels && reserve && limit > reserve && limit - used <= reserve) return;
      pairs.push({ account, model });
    });
  });
  // Models still cooling down from "high demand" stay in the list, but only as a last resort.
  const ordered = [...pairs.filter((pair) => !modelCooling(pair.model)), ...pairs.filter((pair) => modelCooling(pair.model))];
  if (!ordered.length) {
    const error = quotaError();
    error.requestId = requestId;
    throw error;
  }

  const deadAccounts = new Set();
  const deadModels = new Set();
  const failures = [];
  const secondChance = [];
  let attempt = 0;

  const tryPair = async ({ account, model }) => {
    let failure = null;
    for (const { kind, generationConfig } of configsFor(model, quick)) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_CALL_MS) return { outOfTime: true };
      attempt += 1;
      notePairCall(account.id, model);
      const call = await callModel(model, makeBody(generationConfig), account.apiKey, {
        timeoutMs: Math.min(CALL_TIMEOUT_MS, remaining),
      });
      const meta = {
        account: { id: account.id, label: account.label },
        purpose,
        requestId,
        attempt,
        userId,
        level,
        ms: call.ms,
        status: call.res?.status || 0,
      };

      if (call.res?.ok) {
        const blockReason = geminiBlockReason(call.payload);
        const result = blockReason && onBlocked ? onBlocked(blockReason) : parse(answerText(call.payload), call.payload);
        if (result) {
          recordUsage(model, { ...meta, ok: true });
          noteModelOk(model);
          noteAccountSuccess(account);
          return { done: { result, model, account: account.label, requestId, attempts: attempt, ms: Date.now() - started, level } };
        }
        const finish = call.payload?.candidates?.[0]?.finishReason;
        failure = {
          type: 'bad_response',
          scope: 'call',
          message: blockReason
            ? `Gemini blocked the request (${blockReason})`
            : finish && finish !== 'STOP'
              ? `Answer was cut off (${finish})`
              : 'Gemini returned an unreadable answer',
        };
        recordUsage(model, { ...meta, errorType: failure.type, error: failure.message });
        return { failure };
      }

      failure = classifyFailure({ status: call.res?.status, payload: call.payload, error: call.error, ms: call.ms });
      recordUsage(model, {
        ...meta,
        quota: LIMIT_TYPES.has(failure.type),
        errorType: failure.type,
        error: failure.message,
        retryMs: failure.retryMs || 0,
      });
      if (failure.type === 'bad_request' && kind) {
        rejectThinking(model, kind);
        continue;
      }
      return { failure };
    }
    return { failure };
  };

  const handle = (pair, outcome) => {
    const { failure } = outcome;
    if (!failure) return;
    failures.push({ type: failure.type, account: pair.account.label, model: pair.model, message: failure.message });
    applyFailure(failure, pair.account, pair.model);
    if (failure.scope === 'account') deadAccounts.add(pair.account.id);
    if (failure.scope === 'model' || failure.type === 'timeout') deadModels.add(pair.model);
    if (failure.scope === 'model' || ['server_error', 'network', 'bad_response'].includes(failure.type)) {
      secondChance.push(pair);
    }
    console.warn(`[ai] ${requestId.slice(0, 8)} ${pair.account.label} / ${pair.model}: ${failure.type}, switching`);
  };

  const paced = [];
  for (const pair of ordered) {
    if (deadAccounts.has(pair.account.id) || deadModels.has(pair.model)) continue;
    if (failures.filter((item) => item.type === 'bad_request').length >= 2) break;
    if (pairWaitMs(pair.account.id, pair.model, Date.now(), holdBack) > 0) {
      paced.push(pair);
      continue;
    }
    const outcome = await tryPair(pair);
    if (outcome.done) return outcome.done;
    if (outcome.outOfTime) break;
    handle(pair, outcome);
  }

  // Everything usable was at its per-minute cap: wait for the first free slot if it is close.
  const waits = paced
    .filter((pair) => !deadAccounts.has(pair.account.id) && !deadModels.has(pair.model))
    .map((pair) => ({ pair, wait: pairWaitMs(pair.account.id, pair.model, Date.now(), holdBack) }))
    .sort((a, b) => a.wait - b.wait);
  const maxWait = isNew ? NEW_SELLER_PACE_WAIT_MS : PACE_MAX_WAIT_MS;
  if (waits.length && waits[0].wait <= maxWait && deadline - Date.now() - waits[0].wait > MIN_CALL_MS) {
    console.warn(`[ai] ${requestId.slice(0, 8)} every key is at its per-minute cap, waiting ${waits[0].wait} ms`);
    await sleep(waits[0].wait + 200);
    const outcome = await tryPair(waits[0].pair);
    if (outcome.done) return outcome.done;
    handle(waits[0].pair, outcome);
  }

  // "High demand" and timeouts often clear within a second; give the best two a short retry.
  for (const pair of secondChance.slice(0, isNew ? 3 : 2)) {
    if (deadAccounts.has(pair.account.id) || deadline - Date.now() < MIN_CALL_MS + 1000) break;
    await sleep(800);
    const outcome = await tryPair(pair);
    if (outcome.done) return outcome.done;
    if (outcome.outOfTime) break;
    handle(pair, outcome);
  }

  console.warn(`[ai] ${requestId.slice(0, 8)} failed after ${attempt} calls in ${Date.now() - started} ms`);
  throw finalError(failures, requestId);
}

/**
 * Analyse a product photo with Gemini vision and return listing details,
 * an NPR price guess, and a safety verdict for the photo.
 * `shop` ({ type, categories }) steers the category towards the seller's store.
 */
async function suggestListingFromImage({ data, mimeType = 'image/jpeg', categories = [], shop = null, userId = '', level = 'regular' }) {
  const { result, model, account, requestId, attempts, ms } = await runGemini(
    (generationConfig) => buildBody(generationConfig, data, mimeType, categories, shop),
    parseSuggestion,
    {
      purpose: 'listing',
      userId,
      level,
      onBlocked: () => ({
        title: '',
        description: '',
        category: null,
        condition: null,
        priceNpr: null,
        newPriceNpr: null,
        searchWords: [],
        safety: { allowed: false, issue: 'other', reason: 'This photo cannot be used on KinBech.' },
      }),
    }
  );
  return { suggestion: result, model, account, requestId, attempts, ms };
}

/** Product category names a store of this type would sell. */
async function suggestShopCategories({ type, name = '', description = '', existing = [], userId = '' }) {
  const { result, model } = await runGemini(
    (generationConfig) => buildShopCategoriesBody(generationConfig, { type, name, description, existing }),
    parseShopCategories,
    // Opening a shop happens once, so it gets the same care as a seller's first listing.
    { purpose: 'shop-categories', userId, level: 'new' }
  );
  return { categories: result, model };
}

const VOICE_SORTS = ['relevance', 'price-low', 'price-high', 'nearby', 'newest', 'popular'];
const VOICE_ACTIONS = ['search', 'browse', 'open_item', 'open_seller', 'go', 'do', 'clear', 'chat', 'stop'];
const VOICE_LANGS = ['ne', 'hi', 'en'];
const VOICE_CONDITIONS = ['New', 'Good', 'Fair'];
const VOICE_TABS = ['products', 'sellers'];
const VOICE_SCREENS = {
  explore: 'Explore (search and browse all items and sellers)',
  back: 'Back to the previous screen',
  home: 'Home feed',
  saved: 'Saved items (wishlist)',
  chats: 'Chats with buyers and sellers',
  notifications: 'Notifications',
  sell: 'Post a new item to sell',
  profile: 'My profile and account',
  'my-listings': 'My listings (items I am selling)',
  purchases: 'My purchases',
  'recently-viewed': 'Recently viewed items',
  settings: 'Settings',
  help: 'Help and support',
  'all-categories': 'All categories (browse every product and store category)',
  'edit-profile': 'Edit my profile (name, photo, bio)',
  privacy: 'Privacy settings',
  language: 'App language',
  addresses: 'Saved addresses',
  'payment-methods': 'Saved payment methods (eSewa, Khalti, IME, bank)',
  wallet: 'Wallet and boost credits',
  plan: 'My plan / subscription',
  'payment-history': 'Payment history',
  invite: 'Invite friends (referral code)',
  contact: 'Contact KinBech',
  legal: 'Terms and policies',
  'shop-dashboard': 'My shop dashboard (shop sellers)',
};

// Said instead of the model's reply when it wanted to open a screen that is not in the list.
const VOICE_UNKNOWN_SCREEN = {
  en: 'Sorry, I could not tell which screen you mean. Please say its name once more.',
  hi: 'माफ़ कीजिए, कौन सी स्क्रीन खोलनी है, मैं समझ नहीं पाया। उसका नाम एक बार फिर बताइए।',
  ne: 'माफ गर्नुहोस्, कुन स्क्रिन खोल्ने हो बुझिनँ। त्यसको नाम फेरि एकपटक भन्नुहोस्।',
};

const VOICE_INSTRUCTION = [
  'You are the voice helper inside KinBech, a Nepali local buy-and-sell app. You can search AND drive the whole app.',
  'Buyers can talk to you from any screen ("Screen now" says which); the app does what you choose, shows it live and',
  'speaks your reply aloud. Work with what is on that screen.',
  'People speak Nepali, Hindi, Hinglish or English, often mixed, and speech-to-text can mishear words.',
  '',
  'Search lives on the Explore screen. It has:',
  '- Two tabs: "products" (listings) and "sellers" (shops and individual sellers).',
  '- A category sidebar. Products tab uses the product categories; sellers tab uses the seller/store categories.',
  '- A search box, filters (price, condition, nearby) and sort.',
  'A search, browse or clear works from any screen: the app opens Explore and does it there.',
  'Some screens have their own search box ("Search box on this screen" below: what it searches and what is typed in it now).',
  'There a "search" or "clear" fills THAT box (set "where": "here"), so the buyer sees it on the same screen.',
  'Use "where": "explore" only when they clearly want all of KinBech ("sabai KinBech ma", "explore me dhundo") or that box cannot',
  'hold it (e.g. a product asked on the help screen). With no such box, "where" is "explore".',
  '',
  'About the current screen (given below when the screen has them):',
  '- "Items on screen now" / "Sellers on screen now": a numbered list of what the buyer sees (results, home feed, related',
  '  items, chats...), so they can say "open the first one" or "the cheapest one".',
  '- "About this screen": facts about what is open (e.g. the item: title, price, seller). Answer questions about it from these.',
  '- "Things you can do here": actions of this screen (message the seller, save the item...), each with a key.',
  `Other screens you can open: ${Object.entries(VOICE_SCREENS).map(([key, label]) => `"${key}" (${label})`).join(', ')}.`,
  '',
  'Reply with JSON only, in exactly this shape:',
  '{"reply": string, "lang": "ne"|"hi"|"en",',
  ' "action": "search"|"browse"|"open_item"|"open_seller"|"go"|"do"|"clear"|"chat"|"stop",',
  ' "search": {"query": string, "alts": [string], "category": string|null, "minPrice": number|null, "maxPrice": number|null,',
  '  "condition": "New"|"Good"|"Fair"|null, "nearby": boolean, "sort": "relevance"|"price-low"|"price-high"|"nearby"|"newest"|"popular"},',
  ' "view": {"tab": "products"|"sellers", "category": string|null},',
  ' "pick": number|null, "screen": string|null, "command": string|null, "where": "here"|"explore"}',
  '',
  'Pick "action":',
  '- "search": find or change the items shown (words, price, condition, nearby, sort). Fill "search".',
  '- "browse": switch tab and/or select a sidebar category without a search ("sellers dikhao", "show shops", "Furniture category kholo",',
  '  "mobile shops dikhao"). Fill "view" with the tab and an exact category name from that tab\'s list (null = All).',
  '- "open_item": open one entry from the numbered items on screen. "pick" = its number. Choose it from the list',
  '  (first, second, cheapest, nearest, the iPhone one). Only when such a list is given.',
  '- "open_seller": open one seller or shop from the numbered sellers on screen. "pick" = its number.',
  '- "do": one of the "Things you can do here" ("seller ko message karo", "save gara", "location dekhau"). "command" = its key,',
  '  only a key from that list. When the buyer asks for something this screen cannot do, say so or use another action.',
  '- "go": open another screen. "screen" = one key from the screen list above ("back" = go back).',
  '  When the buyer wants a screen that is not in the list, or you cannot tell which one, do not guess: use "chat" and',
  '  briefly say you could not tell which screen they mean.',
  '- "clear": start over / show everything / remove filters.',
  '- "chat": greeting, thanks, a question (about KinBech or about what is on screen), or nothing to do.',
  '- "stop": they say bye, stop, band karo, बस, pugyo.',
  'Always also return "search" and "view" equal to the current ones when you do not change them.',
  '',
  'Rules for "search" (always the FULL search to show, built on the current one):',
  '- "query": 1 to 4 English keywords the way sellers title items (brand, model, product), e.g. "iphone 13", "honda dio", "study table".',
  '  In a screen\'s own box ("where": "here"): the words that box needs, e.g. a help topic ("payment", "account delete") or a',
  '  category ("pharmacy"); price, condition and sort only matter when that box searches all listings.',
  '  Translate Nepali/Hindi words: गाडी/कार -> "car", स्कुटी -> "scooter", कुर्सी -> "chair", फ्रिज -> "fridge".',
  '  Fix obvious mishearings ("I phone" -> "iphone"). Never put price, condition or place words in the query.',
  '  With a brand or model, drop generic words: "samsung ka phone" -> "samsung", "apple laptop" -> "macbook".',
  '- "alts": the same item as Nepali/Hindi sellers may title it, so every listing is found whatever language it is in:',
  '  Roman spelling, Devanagari, and a common English synonym. 2 to 5 short entries, the same thing only (not other items).',
  '  "chair" -> ["kursi", "कुर्सी", "मेच"]; "fridge" -> ["refrigerator", "फ्रिज"]; "scooter" -> ["scooty", "स्कुटी", "स्कुटर"];',
  '  "study table" -> ["padhne table", "टेबल", "desk"]; brand or model names -> [] unless written differently ("iphone" -> ["आइफोन"]).',
  '  Empty [] when "query" is "".',
  '- "category": one exact product category name when it clearly fits, else null.',
  '- When the buyer only names a kind of item that IS a category (mobile/phone -> Mobiles, laptop -> Laptops), set "query" to "" and use "category".',
  '  A narrower kind inside a category stays in "query" (bike or scooter inside Vehicles, sofa inside Furniture).',
  '- Prices are NPR. हजार/hazar = 1000, लाख/lakh = 100000. "under/below X" -> maxPrice X; "above X" -> minPrice X;',
  '  "around X" -> minPrice 0.8X, maxPrice 1.2X; "cheaper" -> lower maxPrice or sort "price-low".',
  '- "condition": "New" for new/naya/नयाँ/brand new; "Good" for used/second hand/purano; else keep the current one.',
  '- "nearby": true when they ask for near me / najik / नजिक / पास.',
  '- Follow-ups ("cheaper one", "only new", "show bikes instead") change only what they ask; keep the rest.',
  '',
  'Rules for "reply" (it is spoken aloud):',
  '- Write the reply in the "Reply language" given with the request (already worked out from the buyer\'s words):',
  '  Nepali -> Nepali in Devanagari; Hindi -> Hindi in Devanagari; English -> English. Set "lang" to it.',
  '- One or two short, warm, natural sentences, at most 22 words. No emojis, markdown, lists or URLs.',
  '- You ARE the KinBech app talking, in first person. Weave the name in naturally about every second reply',
  '  ("किनबेच पर बीस हज़ार तक के फ़ोन मिल गए", "KinBech मा नजिकै राम्रा स्कुटी छन्"), never twice in one reply.',
  '  In Hindi or Nepali replies write the name as "किनबेच"; in English as "KinBech".',
  '- When the buyer\'s name is given, use it in every "search" reply and often in others, so it feels personal:',
  '  "<name> जी" in Hindi or Nepali, just "<name>" in English, written exactly as given (do not translate or transliterate it).',
  '  Vary where it goes (Hindi: "अच्छा Ram जी, किनबेच पर कुर्सियाँ देख रहा हूँ।", "किनबेच पर लैपटॉप देखे Ram जी।";',
  '  Nepali: "हुन्छ Ram जी, नजिकैका कुर्सी हेर्दै छु।"; English: "Sure Ram, looking for iPhones on KinBech."). The name never',
  '  changes the reply language. No name given: use none.',
  '- Talk like a friendly person, not a robot: vary your wording, and sometimes start with a small natural word',
  '  (हाँ जी, अच्छा, ठीक है / हुन्छ, ल, ठिक छ / Sure, Alright).',
  '- Show you understood: name exactly what they asked for in their own terms (the item, brand, price, place), never a vague',
  '  "let me check". Say what you are doing ("ठीक छ, २० हजार भन्दा सस्तो फोन हेर्दै छु।", "पहला वाला खोल रहा हूँ।", "सेलर्स दिखा रहा हूँ।").',
  '- For "search": ONE short sentence, at most 12 words, e.g. "अच्छा, किनबेच पर बीस हज़ार तक के लैपटॉप देखे।",',
  '  "हुन्छ, नजिकैका पुराना कुर्सी हेर्दै छु।", "Sure, looking for iPhones under 50,000 on KinBech.". Do not say you found anything:',
  '  the app then says the real count',
  '  and cheapest price from the database, so never invent counts or prices. For items on screen you may use the given titles and prices.',
  '- For a search in the screen\'s own box: say where you are looking ("आपकी सेव की गई चीज़ों में कुर्सी देख रहा हूँ।", "Looking in help for payments.").',
  '- For "do", "go", "open_item" and "open_seller": say what you are opening or doing ("सेलरलाई म्यासेज खोल्दै छु।", "Saving it for you.").',
  '- KinBech facts: buyers chat with the seller and meet nearby to buy; there is no delivery or online payment in the app.',
  '- If something is unclear, do the most sensible thing and ask one short question.',
  '- Never help with weapons, drugs, adult content or anything illegal; politely say it is not allowed on KinBech and use action "chat".',
].join('\n');

const VOICE_LANG_NAMES = { ne: 'Nepali', hi: 'Hindi', en: 'English' };
// Small words that tell the languages apart, in Devanagari and Roman spelling. The lite models
// often answer in the microphone language, so the reply language is decided here instead.
const LANG_WORDS = {
  hi: new Set(('है हैं हो मुझे मुझको चाहिए दिखाओ दिखाइए दिखा का की के में से पर कितना कितने सस्ता सस्ती पास करो कीजिए वाला वाली नहीं और भी '
    + 'क्या कोई कुछ दो चाहता चाहती hai hain mujhe chahiye chaiye chahie dikhao dikha dikhaiye dikhado ka ki ke mein se kitna kitne '
    + 'sasta sasti paas karo kijiye wala wali vala nahi aur bhi kya koi kuch chahta chahti batao dhundo dhundho dhoondo sab').split(' ')),
  ne: new Set(('छ छु छन् छैन मलाई चाहियो चाहिन्छ देखाउ देखाउनुस् देखाउनुहोस् देखाऊ भन्दा को मा गर्नु हुन्छ सस्तो नजिक नजिकै कति पर्छ दिनुस् '
    + 'खोज्नुस् हेर्नु ल्याउ खोलिदिनु खोल्नुस् कस्तो एउटा cha chha chhu malai chahiyo chaincha chahincha dekhau dekhaunus dekhaideu bhanda '
    + 'ko ma garnu huncha hunchha sasto najik najikai kati parcha dinus khojnus hernu khola kasto euta').split(' ')),
  en: new Set(('show me find want need the a an under below above please cheap near nearby open i looking for is what how any some '
    + 'with and or of to my get give buy second used new').split(' ')),
};

/** Reply language from the buyer's own words; the microphone language decides a tie. */
function detectVoiceLang(text, micLang = 'ne') {
  const words = String(text || '').toLowerCase().split(/[^\p{L}\p{M}]+/u).filter(Boolean);
  const count = (lang) => words.filter((word) => LANG_WORDS[lang].has(word)).length;
  const hi = count('hi');
  const ne = count('ne');
  const latin = words.filter((word) => /^[a-z]+$/.test(word)).length;
  if (latin === words.length && count('en') > hi + ne) return 'en';
  if (hi > ne) return 'hi';
  if (ne > hi) return 'ne';
  return VOICE_LANGS.includes(micLang) ? micLang : 'ne';
}

function cleanVoiceText(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function voicePrice(value) {
  const num = Math.round(Number(value));
  return Number.isFinite(num) && num > 0 && num < 1e9 ? num : null;
}

function matchName(list, value) {
  const wanted = String(value || '').trim().toLowerCase();
  return wanted ? list.find((name) => name.toLowerCase() === wanted) || null : null;
}

function voiceNames(list, max = 60) {
  return [...new Set((Array.isArray(list) ? list : []).map((name) => cleanVoiceText(name, 40)).filter(Boolean))].slice(0, max);
}

const voiceQueryText = (value, max) => cleanVoiceText(value, max).replace(/[^\p{L}\p{M}\p{N}\s.+&'-]/gu, '').trim();

/** Other spellings/languages for the query, used as "any of these" by listing search. */
function voiceAlts(list, query) {
  const seen = new Set([query.toLowerCase()]);
  return (Array.isArray(list) ? list : [])
    .map((alt) => voiceQueryText(alt, 30).replace(/,/g, ' '))
    .filter((alt) => {
      const key = alt.toLowerCase();
      if (!alt || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
}

function normalizeVoiceSearch(search, categories = []) {
  const value = search && typeof search === 'object' ? search : {};
  const query = voiceQueryText(value.query, 60);
  let minPrice = voicePrice(value.minPrice);
  let maxPrice = voicePrice(value.maxPrice);
  if (minPrice && maxPrice && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  return {
    query,
    alts: query ? voiceAlts(value.alts, query) : [],
    category: matchName(categories, value.category),
    minPrice,
    maxPrice,
    condition: VOICE_CONDITIONS.includes(value.condition) ? value.condition : null,
    nearby: value.nearby === true,
    sort: VOICE_SORTS.includes(value.sort) ? value.sort : 'relevance',
  };
}

/** What the buyer sees on the current screen, sent by the app; trimmed so the prompt stays small. */
function normalizeVoiceScreen(screen, productCategories) {
  const value = screen && typeof screen === 'object' ? screen : {};
  const page = cleanVoiceText(value.page, 40).replace(/[^\w -]/g, '') || 'Explore';
  const about = (Array.isArray(value.about) ? value.about : []).slice(0, 8)
    .map((line) => cleanVoiceText(line, 200))
    .filter(Boolean);
  const commands = (Array.isArray(value.commands) ? value.commands : []).slice(0, 10)
    .map((command) => ({ key: String(command?.key || '').trim(), label: cleanVoiceText(command?.label, 80) }))
    .filter((command) => /^[a-z][a-z_]{1,29}$/.test(command.key) && command.label);
  const searchBox = cleanVoiceText(value.searchBox, 80);
  const tab = VOICE_TABS.includes(value.tab) ? value.tab : 'products';
  const shopCategories = voiceNames(value.shopCategories);
  const tabCategories = tab === 'sellers' ? shopCategories : productCategories;
  const items = (Array.isArray(value.items) ? value.items : []).slice(0, 8).map((item, index) => ({
    n: index + 1,
    title: cleanVoiceText(item?.title, 80),
    price: voicePrice(item?.price),
    km: Number.isFinite(Number(item?.km)) ? Math.round(Number(item.km) * 10) / 10 : null,
    condition: VOICE_CONDITIONS.includes(item?.condition) ? item.condition : null,
  })).filter((item) => item.title);
  const sellers = (Array.isArray(value.sellers) ? value.sellers : []).slice(0, 8).map((seller, index) => ({
    n: index + 1,
    name: cleanVoiceText(seller?.name, 60),
    category: cleanVoiceText(seller?.category, 40),
    shop: seller?.shop === true,
    km: Number.isFinite(Number(seller?.km)) ? Math.round(Number(seller.km) * 10) / 10 : null,
  })).filter((seller) => seller.name);
  return {
    page,
    about,
    commands,
    searchBox,
    searchText: searchBox ? cleanVoiceText(value.searchText, 60) : '',
    searchAll: Boolean(searchBox) && value.searchAll === true,
    tab,
    category: matchName(tabCategories, value.category),
    shopCategories,
    items: tab === 'products' ? items : [],
    sellers: tab === 'sellers' ? sellers : [],
  };
}

function normalizeVoiceView(view, screen, productCategories) {
  const value = view && typeof view === 'object' ? view : {};
  const tab = VOICE_TABS.includes(value.tab) ? value.tab : screen.tab;
  const list = tab === 'sellers' ? screen.shopCategories : productCategories;
  return { tab, category: matchName(list, value.category) };
}

function buildVoiceBody(generationConfig, { text, history, current, screen, lang, categories, name }) {
  const lines = [
    `Buyer's name: ${name || '(not known)'}`,
    `Product categories: ${categories.length ? categories.map((name) => `"${name}"`).join(', ') : '(none)'}`,
    `Seller/store categories: ${screen.shopCategories.length ? screen.shopCategories.map((name) => `"${name}"`).join(', ') : '(none)'}`,
    `Current search on Explore: ${JSON.stringify(current)}`,
    `Screen now: ${screen.page}`,
  ];
  if (screen.page === 'Explore') lines.push(`Open tab: ${screen.tab}; selected category: ${screen.category || 'All'}`);
  if (screen.searchBox) {
    lines.push(`Search box on this screen: ${screen.searchBox}${screen.searchAll ? ' (searches all KinBech listings)' : ''}; typed now: "${screen.searchText}"`);
  }
  if (screen.about.length) {
    lines.push('About this screen:');
    screen.about.forEach((line) => lines.push(`- ${line}`));
  }
  lines.push(`Things you can do here: ${screen.commands.length
    ? screen.commands.map((command) => `"${command.key}" (${command.label})`).join(', ')
    : '(none)'}`);
  if (screen.items.length) {
    lines.push('Items on screen now:');
    screen.items.forEach((item) => lines.push(
      `${item.n}. ${item.title}${item.price ? ` - Rs ${item.price}` : ''}${item.condition ? ` - ${item.condition}` : ''}${item.km != null ? ` - ${item.km} km` : ''}`
    ));
  } else if (screen.sellers.length) {
    lines.push('Sellers on screen now:');
    screen.sellers.forEach((seller) => lines.push(
      `${seller.n}. ${seller.name}${seller.shop ? ' (shop)' : ''}${seller.category ? ` - ${seller.category}` : ''}${seller.km != null ? ` - ${seller.km} km` : ''}`
    ));
  } else {
    lines.push('Nothing is listed on screen right now.');
  }
  lines.push(`Reply language: ${VOICE_LANG_NAMES[lang]}`);
  if (history.length) {
    lines.push('', 'Conversation so far (oldest first):');
    history.forEach((turn) => lines.push(`${turn.role === 'assistant' ? 'Helper' : 'Buyer'}: ${turn.text}`));
  }
  lines.push('', `Buyer just said: "${text}"`);
  return {
    systemInstruction: { parts: [{ text: VOICE_INSTRUCTION }] },
    contents: [{ role: 'user', parts: [{ text: lines.join('\n') }] }],
    generationConfig: { ...generationConfig, temperature: 0.4, maxOutputTokens: 1024 },
  };
}

function parseVoiceTurn(rawText, { categories, screen }) {
  const cleaned = String(rawText || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  let parsed = null;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    try {
      parsed = match ? JSON.parse(match[0]) : null;
    } catch {
      parsed = null;
    }
  }
  const reply = cleanVoiceText(
    String(parsed?.reply || '').replace(/[^\p{Script=Devanagari}\p{Script=Latin}\p{M}\p{N}\s.,!?।'"()%:-]/gu, ''),
    280
  );
  if (!reply) return null;
  let action = VOICE_ACTIONS.includes(parsed.action) ? parsed.action : 'search';
  const pickNum = Math.round(Number(parsed.pick));
  const listSize = action === 'open_seller' ? screen.sellers.length : screen.items.length;
  const pick = Number.isFinite(pickNum) && pickNum >= 1 && pickNum <= listSize ? pickNum : null;
  const screenKey = Object.hasOwn(VOICE_SCREENS, parsed.screen) ? parsed.screen : null;
  const command = screen.commands.some((item) => item.key === parsed.command) ? parsed.command : null;
  if ((action === 'open_item' || action === 'open_seller') && !pick) action = 'chat';
  const unknownScreen = action === 'go' && !screenKey;
  if (unknownScreen) action = 'chat';
  if (action === 'do' && !command) action = 'chat';
  // A box over all listings does what Explore would; "clear" there empties that box.
  const here = screen.searchBox && (screen.searchAll || action === 'clear' || parsed.where !== 'explore');
  const where = here ? 'here' : 'explore';
  return {
    reply,
    lang: VOICE_LANGS.includes(parsed.lang) ? parsed.lang : 'en',
    action,
    unknownScreen,
    search: normalizeVoiceSearch(parsed.search, categories),
    view: normalizeVoiceView(parsed.view, screen, categories),
    pick,
    screen: screenKey,
    command: action === 'do' ? command : null,
    where: action === 'search' || action === 'clear' ? where : null,
  };
}

/**
 * One turn of the app-wide voice chat: what the buyer said becomes a spoken reply plus what the
 * app should do (search, switch tab/category, open an item or seller, go to a screen, a screen action).
 * Runs on the big-quota models first so photo fills keep the fast ones.
 */
async function voiceSearchTurn({
  text, history = [], current = {}, screen = {}, lang = 'ne', categories = [], userId = '', userName = '',
}) {
  const safeHistory = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((turn) => ({ role: turn?.role === 'assistant' ? 'assistant' : 'user', text: cleanVoiceText(turn?.text, 300) }))
    .filter((turn) => turn.text);
  const safeScreen = normalizeVoiceScreen(screen, categories);
  const input = {
    text: cleanVoiceText(text, 400),
    history: safeHistory,
    current: normalizeVoiceSearch(current, categories),
    screen: safeScreen,
    lang: detectVoiceLang(text, lang),
    categories,
    name: speakableName(userName),
  };
  const { result, model, requestId, ms } = await runGemini(
    (generationConfig) => buildVoiceBody(generationConfig, input),
    (raw) => parseVoiceTurn(raw, { categories, screen: safeScreen }),
    {
      purpose: 'voice',
      userId,
      level: '',
      preferBulk: true,
      quick: true,
      deadlineMs: 20 * 1000,
      onBlocked: () => ({
        reply: input.lang === 'en' ? 'Sorry, I cannot help with that on KinBech.' : 'माफ गर्नुहोस्, यो KinBech मा मिल्दैन।',
        lang: input.lang,
        action: 'chat',
        search: input.current,
        view: { tab: safeScreen.tab, category: safeScreen.category },
        pick: null,
        screen: null,
        command: null,
        where: null,
      }),
    }
  );
  result.lang = input.lang;
  if (result.unknownScreen) result.reply = VOICE_UNKNOWN_SCREEN[result.lang] || VOICE_UNKNOWN_SCREEN.en;
  // A search answer always greets the buyer by name; add it when the model left it out.
  const { name } = input;
  if (name && result.action === 'search' && !result.reply.toLowerCase().includes(name.toLowerCase())) {
    result.reply = `${name}${result.lang === 'en' ? '' : ' जी'}, ${result.reply}`;
  }
  // A search in a screen's own box (saved items, help...) is not a marketplace search, so it gets no result count.
  const ownBox = result.where === 'here' && !safeScreen.searchAll;
  return { ...result, ownBox, model, requestId, ms };
}

/** The spoken result line after a search reply, from what the database really has. */
function voiceResultLine(lang, summary) {
  if (!summary) return '';
  const { count, cheapest } = summary;
  const many = count >= 40;
  if (lang === 'ne') {
    if (!count) return 'तर अहिले यस्तो सामान भेटिएन, अर्को केही भन्नुहोस्।';
    if (count === 1) return `एउटा भेटियो${cheapest ? `, रु ${cheapest} को` : ''}।`;
    return `${many ? 'धेरै' : `${count} वटा`} भेटियो${cheapest ? `, सबैभन्दा सस्तो रु ${cheapest} को` : ''}।`;
  }
  if (lang === 'hi') {
    if (!count) return 'पर अभी ऐसा कुछ नहीं मिला, कुछ और बोलिए।';
    if (count === 1) return `एक चीज़ मिली${cheapest ? `, रु ${cheapest} की` : ''}।`;
    return `${many ? 'बहुत सारी' : count} चीज़ें मिलीं${cheapest ? `, सबसे सस्ती रु ${cheapest} की` : ''}।`;
  }
  if (!count) return 'But nothing like that right now. Try something else.';
  if (count === 1) return `Found one${cheapest ? `, Rs ${cheapest}` : ''}.`;
  return `Found ${many ? 'lots of' : count} items${cheapest ? `, cheapest Rs ${cheapest}` : ''}.`;
}

// Nepal time of day for the greeting.
function nepalHour(now = new Date()) {
  return new Date(now.getTime() + (5 * 60 + 45) * 60 * 1000).getUTCHours();
}

/** First name worth saying aloud; phone numbers, emails and "User" are skipped. */
function speakableName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  if (!first || first.length > 20 || /[\d@]/.test(first) || /^(user|guest|kinbech)$/i.test(first)) return '';
  return first;
}

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

/**
 * The Nepali hello said the moment voice chat opens, different each time: a time-of-day greeting,
 * the buyer's name and the app name in varied places, then a question about what to find.
 */
function voiceGreetingText(name, now = new Date()) {
  const who = speakableName(name);
  const hour = nepalHour(now);
  const daypart = hour < 11 ? 'शुभ प्रभात' : hour >= 17 ? 'शुभ साँझ' : 'नमस्ते';
  const call = who ? `${who} जी` : 'हजुर';
  const openers = [
    `${daypart} ${call}!`,
    `नमस्कार ${call}!`,
    `आउनुस् ${call}!`,
    `${call}, स्वागत छ!`,
    `हेलो ${call}!`,
  ];
  const middles = [
    'किनबेचमा आज के खोज्दै हुनुहुन्छ?',
    'म किनबेच, भन्नुहोस् न, आज के किन्ने मन छ?',
    'किनबेच तयार छ, फोन, बाइक, फर्निचर, जे चाहिन्छ भन्नुहोस्।',
    'आज किनबेचमा तपाईंलाई के चाहिएको छ? म नजिकै खोजिदिन्छु।',
    'किनबेचमा नजिकै के हेरौं, भन्नुहोस् त।',
    'के खोज्ने हो? किनबेचमा म तुरुन्त देखाइदिन्छु।',
    'किनबेचमा आज केही राम्रो सामान खोजौं? के चाहिन्छ भन्नुहोस्।',
  ];
  return `${pickOne(openers)} ${pickOne(middles)}`;
}

/** Said when the buyer has been quiet a while, so they know voice chat is still on. Random each time. */
function voiceNudgeText(name, lang = 'ne') {
  const who = speakableName(name);
  if (lang === 'en') {
    const call = who || 'there';
    return pickOne([
      `${call}, I'm still here. What else shall we look for on KinBech?`,
      `Anything else, ${call}? KinBech is listening, just say it.`,
      `${call}, phones, bikes or furniture? I can find anything on KinBech.`,
      `Still with you, ${call}. Tell me what you need on KinBech.`,
    ]);
  }
  if (lang === 'hi') {
    const call = who ? `${who} जी` : 'जी';
    return pickOne([
      `${call}, मैं अभी भी यहीं हूँ। किनबेच पर और क्या देखें?`,
      `कुछ और ढूँढना है ${call}? किनबेच सुन रहा है, बस बोलिए।`,
      `${call}, फ़ोन, बाइक या फ़र्नीचर? किनबेच पर कुछ भी ढूँढ दूँ।`,
      `${call}, कोई चीज़ पसंद आई? किनबेच पर और भी बहुत कुछ है, बताइए।`,
    ]);
  }
  const call = who ? `${who} जी` : 'हजुर';
  return pickOne([
    `${call}, म अझै यहीँ छु। किनबेचमा अरू के हेरौं?`,
    `${call}, केही चाहिएमा भन्नुहोस् है, किनबेच सुनिरहेको छ।`,
    `अरू केही खोज्ने हो ${call}? किनबेचमा धेरै राम्रा सामान छन्।`,
    `${call}, फोन, बाइक कि फर्निचर? किनबेचमा जे पनि खोजिदिन्छु।`,
  ]);
}

/** Said when the buyer stays quiet after the nudges; the voice chat then closes. Warm, random each time. */
function voiceGoodbyeText(name, lang = 'ne') {
  const who = speakableName(name);
  if (lang === 'en') {
    const call = who || 'there';
    return pickOne([
      `Alright ${call}, looks like you're not searching right now. No worries, we'll talk later. Just call me anytime on KinBech.`,
      `Okay ${call}, I'll let you be for now. Whenever you need something, KinBech is right here. Talk soon!`,
      `No problem ${call}, seems like it's not the time to search. Tap the voice button whenever you like, and we'll chat again.`,
    ]);
  }
  if (lang === 'hi') {
    const call = who ? `${who} जी` : 'जी';
    return pickOne([
      `ठीक है ${call}, लगता है अभी आप कुछ ढूँढ नहीं रहे। कोई बात नहीं, हम बाद में बात करते हैं। जब मन हो, किनबेच पर फिर बुला लीजिए।`,
      `अच्छा ${call}, अभी शायद कुछ नहीं चाहिए। कोई बात नहीं, जब भी ज़रूरत हो, किनबेच यहीं है। फिर मिलते हैं!`,
      `ठीक है ${call}, अभी आराम कीजिए। जब कुछ ढूँढना हो, बस वॉइस बटन दबाइए, हम फिर बात करेंगे।`,
    ]);
  }
  const call = who ? `${who} जी` : 'हजुर';
  return pickOne([
    `ठिक छ ${call}, अहिले केही खोज्नुभएन जस्तो छ। कुनै कुरा छैन, पछि कुरा गरौंला। मन लागेको बेला किनबेचमा फेरि बोलाउनुस् है।`,
    `हुन्छ ${call}, अहिलेलाई बिदा लिन्छु। केही चाहिएमा किनबेच यहीँ छ, फेरि भेटौंला!`,
    `ठिक छ ${call}, अहिले आराम गर्नुस्। केही खोज्नु पर्दा भ्वाइस बटन थिच्नुस्, अनि फेरि कुरा गरौंला।`,
  ]);
}

function quotaError() {
  const error = new Error("Today's AI limit is used up. Please fill the details yourself.");
  error.status = 429;
  return error;
}

/**
 * Models this API key can see (used by the admin panel). `usable` = Gemini text/photo models
 * that answer generateContent; `all` = every model id, for the catalog's "on your key" column.
 */
async function listAvailableModels(apiKey) {
  const settings = await getAiSettings();
  const key = apiKey || candidateAccounts(settings)[0]?.apiKey;
  if (!key) return { usable: [], all: [] };
  const url = `${GEMINI_BASE}?pageSize=200&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error?.message || `Could not list models (${res.status})`);
  const models = payload?.models || [];
  const id = (model) => String(model.name || '').replace(/^models\//, '');
  return {
    all: models.map(id),
    usable: models
      .filter((model) => (model.supportedGenerationMethods || []).includes('generateContent'))
      .map(id)
      .filter((name) => /^gemini/i.test(name) && !/(tts|image|embedding|audio|live)/i.test(name)),
  };
}

/**
 * Sends a one-word prompt to check that a model answers (uses one request of its quota).
 * A pass lifts the account's old block on that model; a failure is classified like a real request.
 */
async function testModel(model, apiKey, accountId, accountLabel = '', userId = '') {
  const settings = await getAiSettings();
  const fallback = candidateAccounts(settings)[0];
  const key = apiKey || fallback?.apiKey;
  if (!key) {
    return { ok: false, status: 503, ms: 0, model, message: 'No AI account is configured' };
  }
  const account = apiKey ? { id: accountId || '', label: accountLabel } : { id: fallback.id, label: fallback.label };
  const requestId = crypto.randomUUID();
  notePairCall(account.id, model);
  const call = await callModel(
    model,
    {
      contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }],
      generationConfig: { maxOutputTokens: 5, temperature: 0 },
    },
    key,
    { timeoutMs: 20000 }
  );
  const meta = { account, purpose: 'test', requestId, userId, ms: call.ms, status: call.res?.status || 0 };

  if (call.res?.ok) {
    recordUsage(model, { ...meta, ok: true });
    noteModelOk(model);
    if (account.id && account.id !== 'env') await clearAccountModelBlock(account.id, model);
    return { ok: true, status: call.res.status, ms: call.ms, model, message: 'Model answered' };
  }

  const failure = classifyFailure({ status: call.res?.status, payload: call.payload, error: call.error, ms: call.ms });
  recordUsage(model, {
    ...meta,
    quota: LIMIT_TYPES.has(failure.type),
    errorType: failure.type,
    error: failure.message,
    retryMs: failure.retryMs || 0,
  });
  applyFailure(failure, account, model);
  return { ok: false, status: call.res?.status || 0, ms: call.ms, model, type: failure.type, message: failure.message };
}

// A known product photo (a midnight MacBook Air with a notch) checks that a model names the
// exact item, the way the listing auto-fill needs it.
const BENCHMARK = {
  file: path.join(__dirname, '../../assets/ai-benchmark/laptop.jpg'),
  expect: ['macbook', 'air'],
  category: 'Laptops',
  categories: ['Mobiles', 'Laptops', 'Electronics', 'Furniture', 'Vehicles', 'Fashion', 'Books', 'Home & Kitchen'],
};
const BENCHMARK_TIMEOUT_MS = 40 * 1000;
let benchmarkPhoto = null;

/**
 * Runs the real listing prompt on the benchmark photo with one model and one key (one request
 * of that model's quota). `correct` = it named the exact product and picked the right category.
 */
async function benchmarkModel(model, account, userId = '') {
  if (!benchmarkPhoto) benchmarkPhoto = (await fs.promises.readFile(BENCHMARK.file)).toString('base64');
  const requestId = crypto.randomUUID();
  let failure = null;
  let attempt = 0;
  let ms = 0;
  for (const { kind, generationConfig } of configsFor(model)) {
    attempt += 1;
    notePairCall(account.id, model);
    const call = await callModel(model, buildBody(generationConfig, benchmarkPhoto, 'image/jpeg', BENCHMARK.categories, null), account.apiKey, {
      timeoutMs: BENCHMARK_TIMEOUT_MS,
    });
    ms += call.ms;
    const meta = { account: { id: account.id, label: account.label }, purpose: 'benchmark', requestId, attempt, userId, ms: call.ms, status: call.res?.status || 0 };
    if (call.res?.ok) {
      const suggestion = parseSuggestion(answerText(call.payload));
      if (!suggestion) {
        failure = { type: 'bad_response', message: 'Gemini returned an unreadable answer' };
        recordUsage(model, { ...meta, errorType: failure.type, error: failure.message });
        break;
      }
      recordUsage(model, { ...meta, ok: true });
      noteModelOk(model);
      const title = suggestion.title.toLowerCase();
      return {
        model,
        account: account.label,
        ok: true,
        correct: BENCHMARK.expect.every((word) => title.includes(word)) && suggestion.category === BENCHMARK.category,
        title: suggestion.title,
        category: suggestion.category,
        price: suggestion.priceNpr,
        ms,
      };
    }
    failure = classifyFailure({ status: call.res?.status, payload: call.payload, error: call.error, ms: call.ms });
    recordUsage(model, {
      ...meta,
      quota: LIMIT_TYPES.has(failure.type),
      errorType: failure.type,
      error: failure.message,
      retryMs: failure.retryMs || 0,
    });
    if (failure.type === 'bad_request' && kind) {
      rejectThinking(model, kind);
      continue;
    }
    applyFailure(failure, account, model);
    break;
  }
  return { model, account: account.label, ok: false, correct: false, ms, type: failure?.type || 'failed', message: failure?.message || 'No answer' };
}

const ENGINE = {
  deadlineSec: REQUEST_DEADLINE_MS / 1000,
  callTimeoutSec: CALL_TIMEOUT_MS / 1000,
  overloadCooldownSec: OVERLOAD_COOLDOWN_MS / 1000,
  timeoutCooldownSec: TIMEOUT_COOLDOWN_MS / 1000,
  paceWaitSec: PACE_MAX_WAIT_MS / 1000,
  newSellerPaceWaitSec: NEW_SELLER_PACE_WAIT_MS / 1000,
  bulkDailyLimit: BULK_DAILY_LIMIT,
};

module.exports = {
  ENGINE,
  benchmarkModel,
  classifyFailure,
  listAvailableModels,
  suggestListingFromImage,
  suggestShopCategories,
  testModel,
  voiceGreetingText,
  voiceNudgeText,
  voiceGoodbyeText,
  voiceResultLine,
  voiceSearchTurn,
};
