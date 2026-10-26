const crypto = require('crypto');
const mongoose = require('mongoose');
const Session = require('../models/Session');
const { signUserToken } = require('./token');

const TOUCH_EVERY_MS = 5 * 60 * 1000;
/** Two refreshes this close together are a client race (e.g. two tabs), not token theft. */
const REFRESH_RACE_MS = 30 * 1000;
const ADMIN_SESSION_MAX_MS = (Number(process.env.ADMIN_SESSION_MAX_HOURS) || 12) * 60 * 60 * 1000;

/** Clients that can refresh send `X-Token-Refresh: 1`; others keep long-lived tokens. */
function wantsRefresh(req) {
  return String(req.headers['x-token-refresh'] || '') === '1';
}

function hashSecret(secret) {
  return crypto.createHash('sha256').update(String(secret)).digest('hex');
}

function sameHash(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function newRefreshSecret() {
  return crypto.randomBytes(32).toString('base64url');
}

function issueTokens(user, session, secret) {
  return {
    token: signUserToken(user, session._id, { short: true }),
    refreshToken: `${session._id}.${secret}`,
  };
}

function clientIp(req) {
  return String(req.ip || '').replace(/^::ffff:/, '');
}

function describeDevice(req) {
  const header = (name, max) => String(req.headers[name] || '').trim().slice(0, max);
  let deviceName = header('x-device-name', 120);
  let platform = header('x-device-platform', 40).toLowerCase();
  const appVersion = header('x-app-version', 40);
  if (!deviceName || !platform) {
    const ua = String(req.headers['user-agent'] || '');
    const os = /Android/i.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/i.test(ua)
        ? 'iOS'
        : /Macintosh|Mac OS X/i.test(ua)
          ? 'macOS'
          : /Windows/i.test(ua)
            ? 'Windows'
            : /Linux/i.test(ua)
              ? 'Linux'
              : '';
    const browser = /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Safari\//.test(ua)
              ? 'Safari'
              : '';
    if (!platform) platform = browser ? 'web' : os.toLowerCase();
    if (!deviceName) deviceName = [browser, os].filter(Boolean).join(' on ') || 'Unknown device';
  }
  return { deviceName, platform, appVersion, installId: installIdOf(req) };
}

/** Random id the app keeps per install (X-Install-Id); used only to link accounts for fraud review. */
function installIdOf(req) {
  return String(req.headers['x-install-id'] || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64);
}

/** New device row + token bound to it (plus a refresh token for clients that support it). */
async function startSession(req, user, kind = 'app') {
  const ip = clientIp(req);
  const secret = wantsRefresh(req) ? newRefreshSecret() : null;
  const session = await Session.create({
    user: user._id,
    kind,
    ...describeDevice(req),
    ip,
    lastIp: ip,
    ...(secret ? { refreshHash: hashSecret(secret), refreshRotatedAt: new Date() } : {}),
  });
  if (secret) return { session, ...issueTokens(user, session, secret) };
  return { session, token: signUserToken(user, session._id) };
}

/** Give an existing device session a refresh token (client updated to a refresh-capable build). */
async function enableRefresh(user, sessionId) {
  const secret = newRefreshSecret();
  const session = await Session.findOneAndUpdate(
    { _id: sessionId, user: user._id, revokedAt: null },
    { $set: { refreshHash: hashSecret(secret), refreshPrevHash: null, refreshRotatedAt: new Date() } },
    { new: true }
  );
  return session ? issueTokens(user, session, secret) : {};
}

/** Fresh access token after profile changes; short when this device can refresh. */
function reissueToken(req, user) {
  return signUserToken(user, req.sessionId, { short: Boolean(req.sessionRefreshable) });
}

/**
 * Swap a refresh token for a new pair. Presenting an already-rotated token
 * (outside the race window) means it leaked, so the whole device session ends.
 */
async function rotateRefresh(req, rawToken) {
  const invalid = {
    status: 401,
    body: { message: 'Your session has expired. Please log in again.', code: 'REFRESH_INVALID' },
  };
  const [sid, secret] = String(rawToken || '').split('.');
  if (!sid || !secret || !mongoose.isValidObjectId(sid)) return invalid;

  const session = await Session.findById(sid).select('+refreshHash +refreshPrevHash');
  if (!session || session.revokedAt || !session.refreshHash) return invalid;

  const hash = hashSecret(secret);
  if (!sameHash(hash, session.refreshHash)) {
    const rotatedAgo = Date.now() - new Date(session.refreshRotatedAt || 0).getTime();
    if (sameHash(hash, session.refreshPrevHash) && rotatedAgo < REFRESH_RACE_MS) {
      return {
        status: 409,
        body: { message: 'Session was just refreshed. Retry with the latest token.', code: 'REFRESH_RACE' },
      };
    }
    session.revokedAt = new Date();
    await session.save();
    return {
      status: 401,
      body: { message: 'For your safety this device was signed out. Please log in again.', code: 'REFRESH_REUSED' },
      reusedSession: session,
    };
  }

  const User = require('../models/User');
  const user = await User.findById(session.user);
  if (!user) return invalid;
  if (user.status === 'suspended') {
    return { status: 403, body: { message: 'Your account is restricted.', code: 'ACCOUNT_SUSPENDED' } };
  }
  if (session.kind === 'admin' && Date.now() - new Date(session.createdAt).getTime() > ADMIN_SESSION_MAX_MS) {
    session.revokedAt = new Date();
    await session.save();
    return { status: 401, body: { message: 'Admin session ended. Please sign in again.', code: 'SESSION_EXPIRED' } };
  }

  const next = newRefreshSecret();
  session.refreshPrevHash = session.refreshHash;
  session.refreshHash = hashSecret(next);
  session.refreshRotatedAt = new Date();
  session.lastSeenAt = new Date();
  session.lastIp = clientIp(req);
  await session.save();
  return { user, session, ...issueTokens(user, session, next) };
}

/** Session row for a token's `sid`, or null when missing/revoked/not this user's. */
async function findLiveSession(sid, userId) {
  if (!sid || !mongoose.isValidObjectId(sid)) return null;
  const session = await Session.findById(sid).select('user revokedAt lastSeenAt lastIp installId +refreshHash').lean();
  if (!session || session.revokedAt || String(session.user) !== String(userId)) return null;
  return session;
}

function touchSession(session, req) {
  if (!session) return;
  const ip = clientIp(req);
  const stale = Date.now() - new Date(session.lastSeenAt || 0).getTime() > TOUCH_EVERY_MS;
  const installId = session.installId ? '' : installIdOf(req);
  if (!stale && session.lastIp === ip && !installId) return;
  const set = { lastSeenAt: new Date(), lastIp: ip };
  if (installId) set.installId = installId;
  Session.updateOne({ _id: session._id }, { $set: set }).catch(() => {});
}

function presentSession(session, currentId) {
  return {
    id: String(session._id),
    deviceName: session.deviceName || 'Unknown device',
    platform: session.platform || '',
    appVersion: session.appVersion || '',
    kind: session.kind,
    ip: session.lastIp || session.ip || '',
    signedInAt: session.createdAt,
    lastSeenAt: session.lastSeenAt,
    integrityLevel: session.integrityLevel || 'unevaluated',
    current: String(session._id) === String(currentId || ''),
  };
}

async function listSessions(userId, currentId) {
  const rows = await Session.find({ user: userId, revokedAt: null })
    .sort({ lastSeenAt: -1 })
    .limit(50)
    .lean();
  return rows.map((row) => presentSession(row, currentId));
}

async function revokeSession(userId, sessionId) {
  if (!mongoose.isValidObjectId(sessionId)) return false;
  const result = await Session.updateOne(
    { _id: sessionId, user: userId, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

async function revokeAllSessions(userId, exceptId = null) {
  const filter = { user: userId, revokedAt: null };
  if (exceptId && mongoose.isValidObjectId(exceptId)) filter._id = { $ne: exceptId };
  const result = await Session.updateMany(filter, { $set: { revokedAt: new Date() } });
  return result.modifiedCount || 0;
}

/** True when this admin signed in before but never from this IP. */
async function isNewAdminIp(userId, ip) {
  if (!ip) return false;
  const previous = await Session.find({ user: userId, kind: 'admin' }).select('ip lastIp').limit(50).lean();
  if (!previous.length) return false;
  return !previous.some((row) => row.ip === ip || row.lastIp === ip);
}

module.exports = {
  clientIp,
  describeDevice,
  installIdOf,
  wantsRefresh,
  startSession,
  enableRefresh,
  reissueToken,
  rotateRefresh,
  findLiveSession,
  touchSession,
  listSessions,
  presentSession,
  revokeSession,
  revokeAllSessions,
  isNewAdminIp,
};
