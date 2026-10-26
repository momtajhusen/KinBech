const crypto = require('crypto');
const AiSettings = require('../models/AiSettings');
const AiUsageDaily = require('../models/AiUsageDaily');

// Free-tier quota is counted per model, so later entries keep AI working after
// the preferred model hits its daily limit.
const DEFAULT_MODELS = [
  process.env.GEMINI_MODEL,
  'gemini-3.6-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash',
].filter((model, index, all) => model && all.indexOf(model) === index);

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
      models: DEFAULT_MODELS.map((name) => ({ name })),
    });
  }
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
  return {
    id: account.id,
    label: account.label,
    enabled: account.enabled !== false,
    keyHint: maskKey(account.apiKey),
    blockedUntil: isBlocked(account) ? account.blockedUntil : null,
    lastError: account.lastError || '',
    blockedModels: (account.modelBlocks || [])
      .filter((item) => item.blockedUntil && new Date(item.blockedUntil).getTime() > Date.now())
      .map((item) => item.name),
  };
}

async function loadSettingsDoc() {
  let doc = await AiSettings.findOne({ key: 'default' });
  if (!doc) {
    doc = await AiSettings.create({
      key: 'default',
      autoSwitch: true,
      models: DEFAULT_MODELS.map((name) => ({ name })),
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

async function markAccountBlocked(id, until, errorMessage) {
  if (id === 'env') return;
  await AiSettings.updateOne(
    { key: 'default', 'accounts.id': id },
    {
      $set: {
        'accounts.$.blockedUntil': new Date(until),
        'accounts.$.lastError': String(errorMessage || '').slice(0, 300),
      },
    }
  );
  invalidateAiSettings();
}

async function markAccountModelBlocked(id, modelName, until, errorMessage) {
  if (id === 'env') {
    await markModelBlocked(modelName, until);
    return;
  }
  const doc = await loadSettingsDoc();
  const account = (doc.accounts || []).find((item) => item.id === id);
  if (!account) return;
  const blocks = account.modelBlocks || [];
  const existing = blocks.find((item) => item.name === modelName);
  if (existing) existing.blockedUntil = new Date(until);
  else blocks.push({ name: modelName, blockedUntil: new Date(until) });
  account.modelBlocks = blocks;
  account.lastError = String(errorMessage || '').slice(0, 300);
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
  account.modelBlocks = [];
  await doc.save();
  invalidateAiSettings();
}

async function getAccountKey(id) {
  const settings = await getAiSettings({ fresh: true });
  return (settings.accounts || []).find((account) => account.id === id) || null;
}

async function markModelBlocked(name, until) {
  await AiSettings.updateOne(
    { key: 'default', 'models.name': name },
    { $set: { 'models.$.blockedUntil': new Date(until) } }
  );
  invalidateAiSettings();
}

async function clearModelBlock(name) {
  await AiSettings.updateOne(
    { key: 'default', 'models.name': name },
    { $set: { 'models.$.blockedUntil': null } }
  );
  invalidateAiSettings();
}

/** Counts every HTTP call to Gemini; failures here must never break a request. */
function recordUsage(model, { ok = false, quota = false, error = '' } = {}) {
  const now = new Date();
  const inc = ok ? { success: 1 } : quota ? { quotaHits: 1 } : { failed: 1 };
  const set = { lastUsedAt: now };
  if (!ok) {
    set.lastError = String(error || '').slice(0, 300);
    set.lastErrorAt = now;
  }
  AiUsageDaily.updateOne({ day: quotaDay(now), model }, { $inc: inc, $set: set }, { upsert: true })
    .exec()
    .catch((err) => console.warn('[ai] could not record usage:', err.message));
}

module.exports = {
  DEFAULT_MODELS,
  addAiAccount,
  candidateAccounts,
  candidateModels,
  clearAccountBlock,
  clearModelBlock,
  getAccountKey,
  getAiSettings,
  invalidateAiSettings,
  isBlocked,
  markAccountBlocked,
  markAccountModelBlocked,
  markModelBlocked,
  modelsForAccount,
  presentAccount,
  quotaDay,
  recordUsage,
  replaceAccountKey,
  updateAiAccounts,
};
