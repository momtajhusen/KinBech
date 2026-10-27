const crypto = require('crypto');
const CallSettings = require('../models/CallSettings');
const { sealField, openField } = require('./fieldCrypto');

const CACHE_MS = 15 * 1000;
const AGORA_HEX = /^[0-9a-f]{32}$/i;
// Two different people must hit an Agora rejection before an account is parked.
const FAILURE_WINDOW_MS = 30 * 60 * 1000;
const FAILURE_REPORTS_TO_BLOCK = 2;
const FAILURE_BLOCK_MS = 6 * 60 * 60 * 1000;
const ENV_ID = 'env';

let cached = null;
let cachedAt = 0;

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

/** Agora resets free minutes every calendar month (UTC). */
function usageMonth(date = new Date()) {
  return date.toISOString().slice(0, 7);
}

function nextMonthStart(date = new Date()) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function usedThisMonth(account) {
  return account.usageMonth === usageMonth() ? Number(account.usedMinutes) || 0 : 0;
}

function callsThisMonth(account) {
  return account.usageMonth === usageMonth() ? Number(account.callCount) || 0 : 0;
}

function isBlocked(account, now = Date.now()) {
  return Boolean(account.blockedUntil && new Date(account.blockedUntil).getTime() > now);
}

function overLimit(account) {
  const limit = Number(account.monthlyLimitMinutes) || 0;
  return limit > 0 && usedThisMonth(account) >= limit;
}

async function loadSettingsDoc() {
  let doc = await CallSettings.findOne({ key: 'default' });
  if (!doc) doc = await CallSettings.create({ key: 'default', autoSwitch: true, accounts: [] });
  return doc;
}

async function getCallSettings({ fresh = false } = {}) {
  if (!fresh && cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const doc = await loadSettingsDoc();
  cached = doc.toObject();
  cachedAt = Date.now();
  return cached;
}

function invalidateCallSettings() {
  cached = null;
}

function envAccount() {
  const appId = String(process.env.AGORA_APP_ID || '').trim();
  const appCertificate = String(process.env.AGORA_APP_CERTIFICATE || '').trim();
  if (!appId || !appCertificate) return null;
  return { id: ENV_ID, label: 'Server key', appId, appCertificate, enabled: true };
}

function withSecret(account) {
  if (!account) return null;
  if (account.id === ENV_ID) return account;
  const appCertificate = openField(account.appCertificate);
  return appCertificate ? { ...account, appCertificate } : null;
}

/** Accounts that can take a new call, best first. The env key is used only when none are saved. */
function candidateAccounts(settings) {
  const saved = settings.accounts || [];
  if (!saved.length) {
    const env = envAccount();
    return env ? [env] : [];
  }
  const enabled = saved.filter((account) => account.enabled && account.appId && account.appCertificate);
  const pool = settings.autoSwitch ? enabled : enabled.slice(0, 1);
  return pool.filter((account) => !isBlocked(account) && !overLimit(account));
}

/** Account for a new call. Throws 503 when none is configured or all are used up. */
async function pickCallAccount() {
  const settings = await getCallSettings();
  const account = withSecret(candidateAccounts(settings)[0]);
  if (account) return account;
  const configured = (settings.accounts || []).length > 0 || Boolean(envAccount());
  if (configured) console.warn('[calls] every Agora account is off, blocked, or at its monthly limit');
  throw httpError(503, configured
    ? 'Voice calls are busy right now. Please try again later.'
    : 'Voice calls are not configured');
}

/** The account a running call was placed on, so both people join the same Agora project. */
async function accountById(id) {
  if (!id) return null;
  if (id === ENV_ID) return envAccount();
  const settings = await getCallSettings();
  return withSecret((settings.accounts || []).find((account) => account.id === id));
}

/** Adds billable minutes to the account a call used; failures here never break a call. */
async function recordCallMinutes(id, minutes) {
  if (!id || id === ENV_ID || !(minutes > 0)) return;
  const month = usageMonth();
  try {
    await CallSettings.updateOne(
      { key: 'default', accounts: { $elemMatch: { id, usageMonth: { $ne: month } } } },
      { $set: { 'accounts.$.usageMonth': month, 'accounts.$.usedMinutes': 0, 'accounts.$.callCount': 0 } }
    );
    await CallSettings.updateOne(
      { key: 'default', 'accounts.id': id },
      { $inc: { 'accounts.$.usedMinutes': Math.ceil(minutes), 'accounts.$.callCount': 1 } }
    );
    invalidateCallSettings();
  } catch (error) {
    console.warn('[calls] could not record minutes:', error.message);
  }
}

/** A client saw Agora reject this account. Parks it once two different people report it. */
async function reportAccountFailure(id, userId, reason) {
  if (!id || id === ENV_ID) return false;
  const doc = await loadSettingsDoc();
  const account = (doc.accounts || []).find((item) => item.id === id);
  if (!account || isBlocked(account)) return false;
  const since = Date.now() - FAILURE_WINDOW_MS;
  const recent = (account.failureReports || []).filter(
    (report) => new Date(report.at).getTime() > since && report.user !== String(userId)
  );
  recent.push({ user: String(userId), at: new Date(), reason: String(reason || '').slice(0, 80) });
  account.failureReports = recent.slice(-10);
  const blocked = new Set(recent.map((report) => report.user)).size >= FAILURE_REPORTS_TO_BLOCK;
  if (blocked) {
    account.blockedUntil = new Date(Date.now() + FAILURE_BLOCK_MS);
    account.lastError = `Agora rejected calls (${reason || 'unknown'}). Paused for 6 hours.`;
    account.failureReports = [];
    console.warn(`[calls] Agora account "${account.label}" paused: ${reason}`);
  }
  await doc.save();
  invalidateCallSettings();
  return blocked;
}

function hint(value) {
  const text = String(value || '');
  return text.length > 8 ? `${text.slice(0, 4)}••••${text.slice(-4)}` : '••••';
}

function presentAccount(account) {
  const limit = Number(account.monthlyLimitMinutes) || 0;
  return {
    id: account.id,
    label: account.label,
    enabled: account.enabled !== false,
    appIdHint: hint(account.appId),
    monthlyLimitMinutes: limit,
    usedMinutes: usedThisMonth(account),
    calls: callsThisMonth(account),
    overLimit: overLimit(account),
    blockedUntil: isBlocked(account) ? account.blockedUntil : null,
    resetsAt: nextMonthStart(),
    lastError: account.lastError || '',
  };
}

function cleanCredentials({ appId, appCertificate }) {
  const id = String(appId || '').trim();
  const cert = String(appCertificate || '').trim();
  if (!AGORA_HEX.test(id)) throw httpError(400, 'App ID must be the 32-character ID from the Agora console');
  if (!AGORA_HEX.test(cert)) throw httpError(400, 'App Certificate must be the 32-character primary certificate');
  return { appId: id, appCertificate: cert };
}

function cleanLimit(value, fallback = 10000) {
  const limit = Number(value);
  return Number.isFinite(limit) && limit >= 0 ? Math.min(10000000, Math.round(limit)) : fallback;
}

async function addCallAccount({ label, appId, appCertificate, monthlyLimitMinutes }) {
  const name = String(label || '').trim();
  if (!name) throw httpError(400, 'Account name is required');
  const creds = cleanCredentials({ appId, appCertificate });
  const doc = await loadSettingsDoc();
  if ((doc.accounts || []).some((account) => account.appId.toLowerCase() === creds.appId.toLowerCase())) {
    throw httpError(409, 'This App ID is already added');
  }
  doc.accounts.push({
    id: crypto.randomUUID(),
    label: name.slice(0, 60),
    appId: creds.appId,
    appCertificate: sealField(creds.appCertificate),
    enabled: true,
    monthlyLimitMinutes: cleanLimit(monthlyLimitMinutes),
  });
  await doc.save();
  invalidateCallSettings();
}

/** Saves order, names, on/off and limits. Accounts left out of the list are removed. */
async function updateCallAccounts(list) {
  const doc = await loadSettingsDoc();
  const byId = new Map((doc.accounts || []).map((account) => [account.id, account]));
  const next = [];
  (list || []).forEach((item) => {
    const current = byId.get(String(item?.id || ''));
    if (!current) return;
    current.label = String(item.label || current.label).trim().slice(0, 60) || current.label;
    current.enabled = item.enabled !== false;
    if (item.monthlyLimitMinutes !== undefined) {
      current.monthlyLimitMinutes = cleanLimit(item.monthlyLimitMinutes, current.monthlyLimitMinutes);
    }
    next.push(current);
    byId.delete(current.id);
  });
  doc.accounts = next;
  await doc.save();
  invalidateCallSettings();
}

async function replaceCallCredentials(id, { appId, appCertificate }) {
  const creds = cleanCredentials({ appId, appCertificate });
  const doc = await loadSettingsDoc();
  const account = (doc.accounts || []).find((item) => item.id === id);
  if (!account) throw httpError(404, 'Account not found');
  account.appId = creds.appId;
  account.appCertificate = sealField(creds.appCertificate);
  account.blockedUntil = null;
  account.lastError = '';
  account.failureReports = [];
  await doc.save();
  invalidateCallSettings();
}

async function clearCallAccountBlock(id, { resetUsage = false } = {}) {
  const doc = await loadSettingsDoc();
  const account = (doc.accounts || []).find((item) => item.id === id);
  if (!account) throw httpError(404, 'Account not found');
  account.blockedUntil = null;
  account.lastError = '';
  account.failureReports = [];
  if (resetUsage) {
    account.usageMonth = usageMonth();
    account.usedMinutes = 0;
    account.callCount = 0;
  }
  await doc.save();
  invalidateCallSettings();
}

async function setCallSettings({ autoSwitch, dailyUserMinutes } = {}) {
  const update = {};
  if (autoSwitch !== undefined) update.autoSwitch = Boolean(autoSwitch);
  if (dailyUserMinutes !== undefined) {
    const minutes = Number(dailyUserMinutes);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
      throw httpError(400, 'Daily minutes must be between 0 and 1440');
    }
    update.dailyUserMinutes = Math.round(minutes);
  }
  if (!Object.keys(update).length) return;
  await CallSettings.updateOne({ key: 'default' }, { $set: update }, { upsert: true });
  invalidateCallSettings();
}

async function callAdminOverview() {
  const settings = await getCallSettings({ fresh: true });
  const accounts = (settings.accounts || []).map(presentAccount);
  const active = candidateAccounts(settings)[0] || null;
  return {
    autoSwitch: settings.autoSwitch !== false,
    dailyUserMinutes: Number.isFinite(settings.dailyUserMinutes) ? settings.dailyUserMinutes : 10,
    month: usageMonth(),
    resetsAt: nextMonthStart(),
    envConfigured: Boolean(envAccount()),
    activeAccount: active ? active.label : null,
    accounts,
    totals: {
      minutes: accounts.reduce((sum, account) => sum + account.usedMinutes, 0),
      calls: accounts.reduce((sum, account) => sum + account.calls, 0),
      limit: accounts.filter((a) => a.enabled).reduce((sum, account) => sum + account.monthlyLimitMinutes, 0),
    },
  };
}

module.exports = {
  accountById,
  addCallAccount,
  callAdminOverview,
  clearCallAccountBlock,
  getCallSettings,
  pickCallAccount,
  recordCallMinutes,
  replaceCallCredentials,
  reportAccountFailure,
  setCallSettings,
  updateCallAccounts,
};
