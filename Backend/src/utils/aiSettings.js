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
  candidateModels,
  clearModelBlock,
  getAiSettings,
  invalidateAiSettings,
  isBlocked,
  markModelBlocked,
  quotaDay,
  recordUsage,
};
