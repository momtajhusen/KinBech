const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const Session = require('../models/Session');

/**
 * Google Play Integrity (Android) — soft signal only. A failed or missing verdict never
 * blocks the user (old phones, custom ROMs); it lowers `session.integrityLevel` so risky
 * actions can ask for more checks later.
 *
 * Env: PLAY_INTEGRITY_ENABLED=true, PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON (falls back to
 * FIREBASE_SERVICE_ACCOUNT_JSON; the account needs Play Integrity API access),
 * ANDROID_PACKAGE_NAME (default com.codersalpha.kinbech).
 */

const PACKAGE_NAME = process.env.ANDROID_PACKAGE_NAME || 'com.codersalpha.kinbech';
const NONCE_TTL_MS = 5 * 60 * 1000;
const VERDICT_MAX_AGE_MS = 5 * 60 * 1000;
const SCOPE = 'https://www.googleapis.com/auth/playintegrity';

let cachedAccess = { token: null, expiresAt: 0 };

function serviceAccount() {
  const raw = process.env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    return null;
  }
}

function integrityEnabled() {
  return process.env.PLAY_INTEGRITY_ENABLED === 'true' && Boolean(serviceAccount());
}

async function googleAccessToken() {
  if (cachedAccess.token && cachedAccess.expiresAt - 60000 > Date.now()) return cachedAccess.token;
  const account = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: account.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    account.private_key,
    { algorithm: 'RS256' }
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Google OAuth failed (${res.status})`);
  const data = await res.json();
  cachedAccess = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 };
  return cachedAccess.token;
}

/** One-time challenge the app passes as requestHash (standard API) or nonce (classic API). */
async function issueIntegrityNonce(sessionId) {
  const nonce = crypto.randomBytes(24).toString('base64url');
  await Session.updateOne(
    { _id: sessionId },
    { $set: { integrityNonce: nonce, integrityNonceExpires: new Date(Date.now() + NONCE_TTL_MS) } }
  );
  return nonce;
}

function levelFromVerdict(payload) {
  const app = payload.appIntegrity?.appRecognitionVerdict;
  const device = payload.deviceIntegrity?.deviceRecognitionVerdict || [];
  if (app !== 'PLAY_RECOGNIZED') return app === 'UNEVALUATED' ? 'unevaluated' : 'failed';
  if (device.includes('MEETS_STRONG_INTEGRITY')) return 'strong';
  if (device.includes('MEETS_DEVICE_INTEGRITY')) return 'device';
  if (device.includes('MEETS_BASIC_INTEGRITY')) return 'basic';
  return 'failed';
}

/** Decode the Play token with Google and store the trust level on the device session. */
async function verifyIntegrityToken(sessionId, integrityToken) {
  if (!integrityEnabled()) return { level: 'unevaluated', enforced: false };

  const session = await Session.findById(sessionId).select('+integrityNonce');
  const nonce = session?.integrityNonce;
  if (!nonce || new Date(session.integrityNonceExpires || 0).getTime() < Date.now()) {
    return { level: 'unevaluated', enforced: false, reason: 'challenge_expired' };
  }

  let level = 'unevaluated';
  let reason = '';
  try {
    const res = await fetch(
      `https://playintegrity.googleapis.com/v1/${encodeURIComponent(PACKAGE_NAME)}:decodeIntegrityToken`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${await googleAccessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrity_token: String(integrityToken || '') }),
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) throw new Error(`decode failed (${res.status})`);
    const payload = (await res.json()).tokenPayloadExternal || {};
    const details = payload.requestDetails || {};
    const challengeOk =
      details.requestHash === nonce || details.nonce === nonce || details.nonce === Buffer.from(nonce).toString('base64');
    const fresh = Date.now() - Number(details.timestampMillis || 0) < VERDICT_MAX_AGE_MS;
    if (details.requestPackageName !== PACKAGE_NAME || !challengeOk || !fresh) {
      level = 'failed';
      reason = 'request_mismatch';
    } else {
      level = levelFromVerdict(payload);
    }
  } catch (error) {
    // Google/API trouble is not the user's fault: stay unevaluated, never block.
    reason = error.message;
  }

  await Session.updateOne(
    { _id: sessionId },
    { $set: { integrityLevel: level, integrityCheckedAt: new Date() }, $unset: { integrityNonce: 1, integrityNonceExpires: 1 } }
  );
  return { level, enforced: false, ...(reason ? { reason } : {}) };
}

module.exports = { integrityEnabled, issueIntegrityNonce, verifyIntegrityToken, levelFromVerdict };
