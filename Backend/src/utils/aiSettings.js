const crypto = require('crypto');
const AiSettings = require('../models/AiSettings');
const AiUsageDaily = require('../models/AiUsageDaily');
const AiCallLog = require('../models/AiCallLog');
const { catalogEntry } = require('./aiCatalog');

// Free-tier quota is counted per model, so later entries keep AI working after
// the preferred model hits its daily limit. Ordered by how exactly each one names the product
// in a photo, then speed; limits are Google's free-tier requests per day.
// gemini-2.5-flash(-lite) are closed to new keys, and 3.5/3.7 Flash get no free quota.
const RECOMMENDED_MODELS = [
  { name: 'gemini-3-flash-preview', dailyLimit: 20 },
  { name: 'gemini-3.6-flash', dailyLimit: 20 },
  { name: 'gemini-3.1-flash-lite', dailyLimit: 500 },
  { name: 'gemini-3.8-flash', dailyLimit: 20 },
  { name: 'gemini-3.5-flash-lite', dailyLimit: 500 },
];

const DEFAULT_MODELS = [process.env.GEMINI_MODEL, ...RECOMMENDED_MODELS.map((model) => model.name)].filter(
  (model, index, all) => model && all.indexOf(model) === index
);

/** Google's free daily requests for a model we know; 20 (the usual Flash limit) otherwise. */
/** Google's free-tier calls a day for this model, from the rate-limit table; 20 when unknown. */
function defaultDailyLimit(name) {
  const rpd = catalogEntry(name)?.rpd;
  if (rpd > 0) return rpd;
  return RECOMMENDED_MODELS.find((model) => model.name === name)?.dailyLimit ?? 20;
}

function defaultLimitSource(name) {
  return catalogEntry(name)?.rpd > 0 ? 'catalog' : '';
}

/**
 * Keeps each model's daily limit equal to what Google gives for free. Limits learned from a
 * Google 429 ('google') or typed by an admin ('admin') are left alone.
 */
async function syncCatalogLimits(doc) {
  let changed = false;
  doc.models.forEach((model) => {
    if (!['', 'catalog'].includes(model.limitSource || '')) return;
    const rpd = catalogEntry(model.name)?.rpd;
    if (!(rpd > 0) || (model.dailyLimit === rpd && model.limitSource === 'catalog')) return;
    model.dailyLimit = rpd;
    model.limitSource = 'catalog';
    model.limitLearnedAt = null;
    changed = true;
  });
  if (changed) await doc.save();
}

const CACHE_MS = 15 * 1000;
let cached = null;
let cachedAt = 0;

function quotaDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

async function getAiSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  let doc = await AiSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await AiSettings.create({
      key: 'default',
      autoSwitch: true,
      models: DEFAULT_MODELS.map((name) => ({ name, dailyLimit: defaultDailyLimit(name), limitSource: defaultLimitSource(name) })),
    });
  }
  await syncCatalogLimits(doc).catch((err) => console.warn('[ai] could not sync free-tier limits:', err.message));
  cached = doc.toObject();
  cachedAt = Date.now();
  return cached;
}

function invalidateAiSettings() {
  cached = null;
}

function isBlocked(model, now = Date.now()) {
  return Boolean(model.blockedUntil && new Date(model.blockedUntil).getTime() > now);
}

/** Models to try, in order, for one request. */
function candidateModels(settings) {
  const enabled = (settings.models || []).filter((model) => model.enabled);
  if (!settings.autoSwitch) {
    const primary = enabled[0];
    return primary && !isBlocked(primary) ? [primary.name] : [];
  }
  return enabled.filter((model) => !isBlocked(model)).map((model) => model.name);
}

function maskKey(apiKey) {
  const value = String(apiKey || '');
  if (value.length < 8) return '••••';
  return `••••${value.slice(-4)}`;
}

function accountModelBlocked(account, modelName, now = Date.now()) {
  const block = (account.modelBlocks || []).find((item) => item.name === modelName);
  return Boolean(block?.blockedUntil && new Date(block.blockedUntil).getTime() > now);
}

/** Enabled accounts that can still take a request. Env key is used only when none are saved. */
function candidateAccounts(settings) {
  const saved = settings.accounts || [];
  const usable = saved.filter((account) => account.enabled && account.apiKey && !isBlocked(account));
  if (usable.length) return usable;
  if (saved.length) return [];
  const envKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!envKey) return [];
  return [{ id: 'env', label: 'Server key', apiKey: envKey, enabled: true, modelBlocks: [] }];
}

function modelsForAccount(settings, account) {
  return candidateModels(settings).filter((name) => !accountModelBlocked(account, name));
}

function presentAccount(account) {
  const activeBlocks = (account.modelBlocks || []).filter(
    (item) => item.blockedUntil && new Date(item.blockedUntil).getTime() > Date.now()
  );
  return {
    id: account.id,
    label: account.label,
    enabled: account.enabled !== false,
    keyHint: maskKey(account.apiKey),
    blockedUntil: isBlocked(account) ? account.blockedUntil : null,
    lastError: account.lastError || '',
    lastErrorAt: account.lastErrorAt || null,
    lastErrorType: account.lastErrorType || '',
    blockedModels: activeBlocks.map((item) => item.name),
    modelBlocks: activeBlocks.map((item) => ({
      name: item.name,
      blockedUntil: item.blockedUntil,
      reason: item.reason || '',
      type: item.type || '',
    })),
  };
}

// ---------- In-memory model health ----------
// Gemini's "high demand" (503) hits a model for every key at once, so a short shared
// cooldown lets the next request skip it straight away instead of waiting on it again.

const modelHealth = new Map();
const STRIKE_WINDOW_MS = 2 * 60 * 1000;

function healthFor(name) {
  if (!modelHealth.has(name)) modelHealth.set(name, { cooldownUntil: 0, reason: '', type: '', strikes: [] });
  return modelHealth.get(name);
}

function coolModel(name, ms, reason = '', type = '') {
  const entry = healthFor(name);
  entry.cooldownUntil = Math.max(entry.cooldownUntil, Date.now() + ms);
  entry.reason = String(reason || '').slice(0, 200);
  entry.type = type;
}

/** Slow or 5xx answers count as strikes; two inside two minutes cool the model for a minute. */
function strikeModel(name, reason = '', type = '') {
  const entry = healthFor(name);
  const now = Date.now();
  entry.strikes = entry.strikes.filter((at) => now - at < STRIKE_WINDOW_MS);
  entry.strikes.push(now);
  if (entry.strikes.length >= 2) coolModel(name, 60 * 1000, reason, type);
}

function modelCooling(name, now = Date.now()) {
  const entry = modelHealth.get(name);
  return Boolean(entry && entry.cooldownUntil > now);
}

function noteModelOk(name) {
  const entry = modelHealth.get(name);
  if (entry) entry.strikes = [];
}

function clearModelCooldown(name) {
  modelHealth.delete(name);
}

function modelHealthList() {
  const now = Date.now();
  return [...modelHealth.entries()]
    .filter(([, entry]) => entry.cooldownUntil > now)
    .map(([name, entry]) => ({ name, until: new Date(entry.cooldownUntil), reason: entry.reason, type: entry.type }));
}

// ---------- Per-minute pacing ----------
// Google caps requests per minute for each project and model. Counting our own calls lets
// the engine skip a key+model that is already at that cap instead of spending a call on a 429.

const PACE_WINDOW_MS = 60 * 1000;
const pairCalls = new Map();
const learnedRpm = new Map();

function recentPairCalls(accountId, model, now = Date.now()) {
  const key = `${accountId}|${model}`;
  const list = (pairCalls.get(key) || []).filter((at) => now - at < PACE_WINDOW_MS);
  pairCalls.set(key, list);
  return list;
}

function notePairCall(accountId, model) {
  recentPairCalls(accountId, model).push(Date.now());
}

/** Requests per minute for a model: what Google last told us, else the free-tier table. */
function rpmFor(model) {
  return learnedRpm.get(model) ?? catalogEntry(model)?.rpm ?? null;
}

function learnRpm(model, value) {
  if (Number.isFinite(value) && value > 0) learnedRpm.set(model, value);
}

/**
 * 0 when the key+model can take a call now, else how long until its oldest call leaves the window.
 * `holdBack` slots per minute stay free for new sellers (only on models with 3+ per minute).
 */
function pairWaitMs(accountId, model, now = Date.now(), holdBack = 0) {
  const rpm = rpmFor(model);
  if (!rpm) return 0;
  const cap = holdBack && rpm >= 3 ? rpm - holdBack : rpm;
  const list = recentPairCalls(accountId, model, now);
  if (list.length < cap) return 0;
  return Math.max(0, list[list.length - cap] + PACE_WINDOW_MS - now);
}

// ---------- Calls per key+model today ----------
// Seeded once a day from the call log, then counted in memory, so "left today" costs no
// database read per request. Only calls Google answered use quota: limit hits (429) and
// calls that never got an answer (timeout, network, status 0) are not counted.

function usesQuota({ quota = false, status = 0 }) {
  return !quota && Number(status) > 0;
}

const dayUsage = { day: '', counts: new Map(), loading: null };

function usageKey(accountId, model) {
  return `${accountId}|${model}`;
}

function bumpDayUsage(accountId, model, day) {
  if (dayUsage.day !== day) return;
  const key = usageKey(accountId, model);
  dayUsage.counts.set(key, (dayUsage.counts.get(key) || 0) + 1);
}

async function loadDayUsage() {
  const day = quotaDay();
  if (dayUsage.day === day && dayUsage.loading) return dayUsage.loading;
  dayUsage.day = day;
  dayUsage.counts = new Map();
  dayUsage.loading = AiCallLog.aggregate([
    { $match: { day, result: { $ne: 'limit' }, status: { $gt: 0 } } },
    { $group: { _id: { accountId: '$accountId', model: '$model' }, count: { $sum: 1 } } },
  ])
    .then((rows) => {
      rows.forEach(({ _id, count }) => {
        const key = usageKey(_id.accountId, _id.model);
        dayUsage.counts.set(key, (dayUsage.counts.get(key) || 0) + count);
      });
    })
    .catch((err) => {
      console.warn('[ai] could not load today usage:', err.message);
      dayUsage.loading = null;
    });
  return dayUsage.loading;
}

/** Calls this key made on this model today (Gemini quota day). Call loadDayUsage() first. */
function pairUsedToday(accountId, model) {
  return dayUsage.day === quotaDay() ? dayUsage.counts.get(usageKey(accountId, model)) || 0 : 0;
}

/** Free calls a day: what Google told us, else the free-tier table, else the admin's number. */
function freeDailyQuota(model) {
  if (model.limitSource === 'google') return model.dailyLimit ?? 20;
  return catalogEntry(model.name)?.rpd || model.dailyLimit || 20;
}

/** The busiest key's calls on this model in the last minute, against its per-minute cap. */
function modelPace(model, accountIds) {
  const used = Math.max(0, ...accountIds.map((id) => recentPairCalls(id, model).length));
  return { used, rpm: rpmFor(model) };
}

/** Google's 429 says the real daily cap; keep "left today" honest by saving it on the model. */
async function learnDailyLimit(name, value) {
  if (!Number.isFinite(value) || value <= 0) return;
  const doc = await loadSettingsDoc();
  const model = doc.models.find((item) => item.name === name);
  if (!model || model.dailyLimit === value) return;
  model.dailyLimit = value;
  model.limitSource = 'google';
  model.limitLearnedAt = new Date();
  await doc.save();
  invalidateAiSettings();
}

async function loadSettingsDoc() {
  let doc = await AiSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await AiSettings.create({
      key: 'default',
      autoSwitch: true,
      models: DEFAULT_MODELS.map((name) => ({ name, dailyLimit: defaultDailyLimit(name), limitSource: defaultLimitSource(name) })),
      accounts: [],
    });
  }
  return doc;
}

async function addAiAccount({ label, apiKey }) {
  const key = String(apiKey || '').trim();
  const name = String(label || '').trim();
  if (key.length < 20) {
    const error = new Error('Paste a full Gemini API key');
    error.status = 400;
    throw error;
  }
  if (!name) {
    const error = new Error('Account name is required');
    error.status = 400;
    throw error;
  }
  const doc = await loadSettingsDoc();
  if ((doc.accounts || []).some((account) => account.apiKey === key)) {
    const error = new Error('This API key is already added');
    error.status = 409;
    throw error;
  }
  doc.accounts.push({
    id: crypto.randomUUID(),
    label: name.slice(0, 60),
    apiKey: key,
    enabled: true,
    modelBlocks: [],
  });
  await doc.save();
  invalidateAiSettings();
}

async function updateAiAccounts(list) {
  const doc = await loadSettingsDoc();
  const byId = new Map((doc.accounts || []).map((account) => [account.id, account]));
  const next = [];
  (list || []).forEach((item) => {
    const current = byId.get(String(item?.id || ''));
    if (!current) return;
    current.label = String(item.label || current.label).trim().slice(0, 60) || current.label;
    current.enabled = item.enabled !== false;
    next.push(current);
  });
  doc.accounts = next;
  await doc.save();
  invalidateAiSettings();
}

async function replaceAccountKey(id, apiKey) {
  const key = String(apiKey || '').trim();
  if (key.length < 20) {
    const error = new Error('Paste a full Gemini API key');
    error.status = 400;
    throw error;
  }
  const doc = await loadSettingsDoc();
  const account = (doc.accounts || []).find((item) => item.id === id);
  if (!account) {
    const error = new Error('Account not found');
    error.status = 404;
    throw error;
  }
  account.apiKey = key;
  account.blockedUntil = null;
  account.lastError = '';
  account.modelBlocks = [];
  await doc.save();
  invalidateAiSettings();
}

async function markAccountBlocked(id, until, errorMessage, type = '') {
  if (id === 'env') return;
  await AiSettings.updateOne(
    { key: 'default', 'accounts.id': id },
    {
      $set: {
        'accounts.$.blockedUntil': new Date(until),
        'accounts.$.lastError': String(errorMessage || '').slice(0, 300),
        'accounts.$.lastErrorAt': new Date(),
        'accounts.$.lastErrorType': type,
      },
    }
  );
  invalidateAiSettings();
}

/** Remembers an error on the account card without taking the account out of rotation. */
async function noteAccountError(id, errorMessage, type = '') {
  if (!id || id === 'env') return;
  await AiSettings.updateOne(
    { key: 'default', 'accounts.id': id },
    {
      $set: {
        'accounts.$.lastError': String(errorMessage || '').slice(0, 300),
        'accounts.$.lastErrorAt': new Date(),
        'accounts.$.lastErrorType': type,
      },
    }
  ).catch((err) => console.warn('[ai] could not note account error:', err.message));
  invalidateAiSettings();
}

/** A working answer clears the old error banner, so the card shows the account is healthy again. */
async function noteAccountSuccess(account) {
  if (!account?.id || account.id === 'env' || !account.lastError) return;
  await AiSettings.updateOne(
    { key: 'default', 'accounts.id': account.id },
    { $set: { 'accounts.$.lastError': '', 'accounts.$.lastErrorType': '' } }
  ).catch(() => {});
  invalidateAiSettings();
}

async function markAccountModelBlocked(id, modelName, until, errorMessage, type = '') {
  if (id === 'env') {
    await markModelBlocked(modelName, until, errorMessage);
    return;
  }
  const doc = await loadSettingsDoc();
  const account = (doc.accounts || []).find((item) => item.id === id);
  if (!account) return;
  const blocks = account.modelBlocks || [];
  const existing = blocks.find((item) => item.name === modelName);
  const reason = String(errorMessage || '').slice(0, 200);
  if (existing) Object.assign(existing, { blockedUntil: new Date(until), reason, type });
  else blocks.push({ name: modelName, blockedUntil: new Date(until), reason, type });
  account.modelBlocks = blocks;
  account.lastError = String(errorMessage || '').slice(0, 300);
  account.lastErrorAt = new Date();
  account.lastErrorType = type;
  const enabled = (doc.models || []).filter((model) => model.enabled).map((model) => model.name);
  const names = doc.autoSwitch ? enabled : enabled.slice(0, 1);
  const now = Date.now();
  const allBlocked = names.length > 0 && names.every((name) => {
    const block = blocks.find((item) => item.name === name);
    return block && new Date(block.blockedUntil).getTime() > now;
  });
  if (allBlocked) account.blockedUntil = new Date(until);
  await doc.save();
  invalidateAiSettings();
}

async function clearAccountBlock(id) {
  const doc = await loadSettingsDoc();
  const account = (doc.accounts || []).find((item) => item.id === id);
  if (!account) return;
  account.blockedUntil = null;
  account.lastError = '';
  account.lastErrorType = '';
  account.modelBlocks = [];
  await doc.save();
  invalidateAiSettings();
}

/** Lifts one model's block on one account (after a passing test). */
async function clearAccountModelBlock(id, modelName) {
  const doc = await loadSettingsDoc();
  const account = (doc.accounts || []).find((item) => item.id === id);
  if (!account) return;
  account.modelBlocks = (account.modelBlocks || []).filter((item) => item.name !== modelName);
  account.blockedUntil = null;
  account.lastError = '';
  account.lastErrorType = '';
  await doc.save();
  invalidateAiSettings();
}

async function getAccountKey(id) {
  const settings = await getAiSettings({ fresh: true });
  return (settings.accounts || []).find((account) => account.id === id) || null;
}

async function markModelBlocked(name, until, reason = '') {
  await AiSettings.updateOne(
    { key: 'default', 'models.name': name },
    { $set: { 'models.$.blockedUntil': new Date(until), 'models.$.blockReason': String(reason || '').slice(0, 200) } }
  );
  invalidateAiSettings();
}

async function clearModelBlock(name) {
  await AiSettings.updateOne(
    { key: 'default', 'models.name': name },
    { $set: { 'models.$.blockedUntil': null, 'models.$.blockReason': '' } }
  );
  clearModelCooldown(name);
  invalidateAiSettings();
}

/** Counts every HTTP call to Gemini; failures here must never break a request. */
function recordUsage(
  model,
  {
    ok = false,
    quota = false,
    error = '',
    account = null,
    purpose = '',
    ms = 0,
    requestId = '',
    attempt = 1,
    status = 0,
    errorType = '',
    retryMs = 0,
    userId = '',
    level = '',
  } = {}
) {
  const now = new Date();
  if (usesQuota({ quota, status })) bumpDayUsage(account?.id || '', model, quotaDay(now));
  const inc = ok ? { success: 1 } : quota ? { quotaHits: 1 } : { failed: 1 };
  const set = { lastUsedAt: now };
  if (!ok) {
    set.lastError = String(error || '').slice(0, 300);
    set.lastErrorAt = now;
  }
  AiUsageDaily.updateOne({ day: quotaDay(now), model }, { $inc: inc, $set: set }, { upsert: true })
    .exec()
    .catch((err) => console.warn('[ai] could not record usage:', err.message));
  AiCallLog.create({
    at: now,
    day: quotaDay(now),
    requestId,
    attempt,
    accountId: account?.id || '',
    accountLabel: account?.label || '',
    model,
    result: ok ? 'ok' : quota ? 'limit' : 'failed',
    errorType: ok ? '' : errorType,
    status: Number(status) || 0,
    retryMs: Math.max(0, Math.round(retryMs) || 0),
    purpose,
    userId: userId ? String(userId) : '',
    level,
    ms: Math.max(0, Math.round(ms) || 0),
    error: ok ? '' : String(error || '').slice(0, 600),
  }).catch((err) => console.warn('[ai] could not log call:', err.message));
}

/** Next Gemini daily quota reset (midnight Pacific time). */
function nextQuotaReset(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(now);
  const get = (type) => Number(parts.find((part) => part.type === type)?.value || 0);
  const elapsedMs = (get('hour') * 3600 + get('minute') * 60 + get('second')) * 1000 + now.getMilliseconds();
  return new Date(now.getTime() - elapsedMs + 24 * 60 * 60 * 1000);
}

module.exports = {
  DEFAULT_MODELS,
  RECOMMENDED_MODELS,
  defaultDailyLimit,
  defaultLimitSource,
  learnDailyLimit,
  freeDailyQuota,
  learnRpm,
  loadDayUsage,
  modelPace,
  notePairCall,
  pairUsedToday,
  pairWaitMs,
  rpmFor,
  accountModelBlocked,
  addAiAccount,
  candidateAccounts,
  candidateModels,
  clearAccountBlock,
  clearAccountModelBlock,
  clearModelBlock,
  clearModelCooldown,
  coolModel,
  getAccountKey,
  getAiSettings,
  invalidateAiSettings,
  isBlocked,
  markAccountBlocked,
  markAccountModelBlocked,
  markModelBlocked,
  modelCooling,
  modelHealthList,
  modelsForAccount,
  nextQuotaReset,
  noteAccountError,
  noteAccountSuccess,
  noteModelOk,
  presentAccount,
  quotaDay,
  recordUsage,
  replaceAccountKey,
  strikeModel,
  updateAiAccounts,
};
