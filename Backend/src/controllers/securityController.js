const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const User = require('../models/User');
const { publicUser, signCallWatchToken } = require('../utils/token');
const { integrityEnabled, issueIntegrityNonce, verifyIntegrityToken } = require('../utils/deviceIntegrity');
const { noteAdminLoginFailure } = require('../utils/captcha');
const { recordAudit } = require('../utils/audit');
const { raiseAlert } = require('../utils/securityAlerts');
const {
  clientIp,
  startSession,
  rotateRefresh,
  listSessions,
  revokeSession,
  revokeAllSessions,
  isNewAdminIp,
} = require('../utils/sessions');
const {
  generateSecret,
  verifyTotp,
  otpauthUrl,
  encryptSecret,
  decryptSecret,
  generateBackupCodes,
  hashBackupCode,
} = require('../utils/totp');

const FREE_ATTEMPTS = 5;
const MAX_LOCK_MINUTES = 30;
const CHALLENGE_PURPOSE = 'admin-2fa';
const TWO_FACTOR_FIELDS = '+twoFactorSecret +twoFactorPendingSecret +twoFactorBackupCodes +twoFactorLastStep';

/** k-anonymity check against Have I Been Pwned. Fails open if the API is unreachable. */
async function passwordBreached(password) {
  const hash = crypto.createHash('sha1').update(String(password)).digest('hex').toUpperCase();
  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`, {
      headers: { 'Add-Padding': 'true' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const suffix = hash.slice(5);
    return (await res.text()).split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      return candidate === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

const BREACHED_MESSAGE = 'This password has appeared in a data breach. Please choose a different one.';

function lockMinutesLeft(user) {
  const until = user?.loginLockedUntil ? new Date(user.loginLockedUntil).getTime() : 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 60000) : 0;
}

function lockedResponse(res, user) {
  const minutes = lockMinutesLeft(user);
  res.setHeader('Retry-After', String(minutes * 60));
  return res.status(429).json({
    message: `Too many wrong attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    code: 'LOGIN_LOCKED',
    retryAfter: minutes * 60,
  });
}

/** 5 free tries, then 1, 2, 4 … up to 30 minutes of lockout per further miss. */
async function registerFailedLogin(req, user, reason) {
  noteAdminLoginFailure(req);
  user.failedLoginCount = (Number(user.failedLoginCount) || 0) + 1;
  const over = user.failedLoginCount - FREE_ATTEMPTS;
  if (over >= 0) {
    const minutes = Math.min(MAX_LOCK_MINUTES, 2 ** over);
    user.loginLockedUntil = new Date(Date.now() + minutes * 60000);
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginCount: user.failedLoginCount, loginLockedUntil: user.loginLockedUntil || null } }
  );
  recordAudit(
    { user, ip: req.ip },
    {
      action: 'admin.login_failed',
      targetType: 'admin',
      targetId: user._id,
      summary: reason,
      meta: { attempts: user.failedLoginCount },
    }
  );
}

async function clearFailedLogins(user) {
  if (!user.failedLoginCount && !user.loginLockedUntil) return;
  user.failedLoginCount = 0;
  user.loginLockedUntil = null;
  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, loginLockedUntil: null } });
}

function twoFactorChallenge(user) {
  return jwt.sign(
    { userId: String(user._id), purpose: CHALLENGE_PURPOSE, tv: Number(user.tokenVersion) || 0 },
    process.env.JWT_SECRET,
    { expiresIn: '5m' }
  );
}

/** Issue the admin session after password (and 2FA when on) passed. */
async function finishAdminLogin(req, res, user, { twoFactor = false } = {}) {
  const ip = clientIp(req);
  const newIp = await isNewAdminIp(user._id, ip);
  const { token, refreshToken } = await startSession(req, user, 'admin');
  req.user = user;
  recordAudit(req, {
    action: 'admin.login',
    targetType: 'admin',
    targetId: user._id,
    summary: twoFactor ? 'Signed in with two-step verification' : 'Signed in',
  });
  if (newIp) {
    recordAudit(req, {
      action: 'admin.login_new_ip',
      targetType: 'admin',
      targetId: user._id,
      summary: `Signed in from a new IP ${ip}`,
      meta: { ip },
    });
    raiseAlert({
      type: 'admin_new_ip',
      key: `admin_new_ip:${user._id}:${ip}`,
      title: 'Admin sign-in from new IP',
      message: `${user.email || user.name} signed in from ${ip} for the first time.`,
    });
  }
  return res.json({
    token,
    ...(refreshToken ? { refreshToken } : {}),
    user: publicUser(user, { includePrivate: true }),
    mustChangePassword: Boolean(user.mustChangePassword),
  });
}

/** Play Integrity challenge for this device session (soft signal, see utils/deviceIntegrity). */
async function integrityNonce(req, res, next) {
  try {
    if (!integrityEnabled() || !req.sessionId) return res.json({ enabled: false });
    res.json({ enabled: true, nonce: await issueIntegrityNonce(req.sessionId) });
  } catch (error) {
    next(error);
  }
}

async function integrityVerify(req, res, next) {
  try {
    if (!req.sessionId) return res.json({ level: 'unevaluated', enforced: false });
    res.json(await verifyIntegrityToken(req.sessionId, req.body?.token));
  } catch (error) {
    next(error);
  }
}

/** Token for the native Android call watcher (call endpoints only, survives app sleep). */
async function callWatchToken(req, res) {
  if (req.tokenScope) {
    return res.status(403).json({ message: 'Not allowed with this token', code: 'TOKEN_SCOPE' });
  }
  res.json({ token: signCallWatchToken(req.user, req.sessionId) });
}

/** Rotate the refresh token. Reuse of an old one signs that device out. */
async function refreshTokens(req, res, next) {
  try {
    const result = await rotateRefresh(req, req.body?.refreshToken);
    if (result.reusedSession) {
      const reused = result.reusedSession;
      if (reused.kind === 'admin') {
        recordAudit(
          { user: { _id: reused.user }, ip: req.ip },
          {
            action: 'session.refresh_reuse',
            targetType: 'session',
            targetId: reused._id,
            summary: 'Old refresh token reused; device signed out',
            meta: { ip: clientIp(req) },
          }
        );
        raiseAlert({
          type: 'token_reuse',
          key: `token_reuse:${reused._id}`,
          title: 'Admin refresh token reused',
          message: `An old admin refresh token was used from ${clientIp(req)}. That device was signed out.`,
        });
      }
    }
    if (!result.token) return res.status(result.status).json(result.body);
    res.json({ token: result.token, refreshToken: result.refreshToken });
  } catch (error) {
    next(error);
  }
}

/** Accepts a 6-digit authenticator code or an unused backup code. */
async function checkSecondFactor(user, code) {
  const secret = decryptSecret(user.twoFactorSecret);
  const step = verifyTotp(secret, code, Number(user.twoFactorLastStep) || 0);
  if (step) {
    await User.updateOne({ _id: user._id }, { $set: { twoFactorLastStep: step } });
    return 'totp';
  }
  const hashed = hashBackupCode(code);
  if (String(code || '').replace(/[^a-z0-9]/gi, '').length === 10 && (user.twoFactorBackupCodes || []).includes(hashed)) {
    await User.updateOne({ _id: user._id }, { $pull: { twoFactorBackupCodes: hashed } });
    return 'backup';
  }
  return null;
}

async function adminLoginTwoFactor(req, res, next) {
  try {
    const challenge = String(req.body.challenge || '');
    const code = String(req.body.code || '').trim();
    let payload;
    try {
      payload = jwt.verify(challenge, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Sign-in timed out. Please enter your password again.', code: 'CHALLENGE_EXPIRED' });
    }
    if (payload.purpose !== CHALLENGE_PURPOSE) {
      return res.status(401).json({ message: 'Sign-in timed out. Please enter your password again.', code: 'CHALLENGE_EXPIRED' });
    }

    const user = await User.findById(payload.userId).select(TWO_FACTOR_FIELDS);
    if (!user || !user.twoFactorEnabled || (Number(payload.tv) || 0) !== (Number(user.tokenVersion) || 0)) {
      return res.status(401).json({ message: 'Sign-in timed out. Please enter your password again.', code: 'CHALLENGE_EXPIRED' });
    }
    if (lockMinutesLeft(user)) return lockedResponse(res, user);
    if (!code) return res.status(400).json({ message: 'Enter the 6-digit code from your authenticator app' });

    const method = await checkSecondFactor(user, code);
    if (!method) {
      await registerFailedLogin(req, user, 'Wrong two-step code');
      if (lockMinutesLeft(user)) return lockedResponse(res, user);
      return res.status(401).json({ message: 'That code is not correct. Try the latest code from your app.', code: 'TWO_FACTOR_INVALID' });
    }
    await clearFailedLogins(user);
    if (method === 'backup') {
      req.user = user;
      recordAudit(req, { action: 'admin.2fa.backup_used', targetType: 'admin', targetId: user._id, summary: 'Used a backup code' });
    }
    return finishAdminLogin(req, res, user, { twoFactor: true });
  } catch (error) {
    next(error);
  }
}

async function twoFactorStatus(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select('+twoFactorBackupCodes');
    res.json({
      enabled: Boolean(user.twoFactorEnabled),
      backupCodesLeft: (user.twoFactorBackupCodes || []).length,
      required: process.env.ADMIN_2FA_REQUIRED === 'true',
    });
  } catch (error) {
    next(error);
  }
}

async function twoFactorSetup(req, res, next) {
  try {
    if (req.user.twoFactorEnabled) {
      return res.status(400).json({ message: 'Two-step verification is already on' });
    }
    const secret = generateSecret();
    await User.updateOne({ _id: req.user._id }, { $set: { twoFactorPendingSecret: encryptSecret(secret) } });
    const url = otpauthUrl({ secret, account: req.user.email || req.user.name || 'admin' });
    const qrDataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 });
    res.json({ secret, otpauthUrl: url, qrDataUrl });
  } catch (error) {
    next(error);
  }
}

async function twoFactorEnable(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select(TWO_FACTOR_FIELDS);
    const pending = decryptSecret(user.twoFactorPendingSecret);
    if (!pending) return res.status(400).json({ message: 'Start setup again to get a new QR code' });
    const step = verifyTotp(pending, req.body.code);
    if (!step) return res.status(400).json({ message: 'That code is not correct. Try the latest code from your app.' });

    const { codes, hashes } = generateBackupCodes();
    user.twoFactorEnabled = true;
    user.twoFactorSecret = encryptSecret(pending);
    user.twoFactorPendingSecret = '';
    user.twoFactorBackupCodes = hashes;
    user.twoFactorLastStep = step;
    await user.save();
    recordAudit(req, { action: 'admin.2fa.enable', targetType: 'admin', targetId: user._id, summary: 'Turned on two-step verification' });
    res.json({ enabled: true, backupCodes: codes, user: publicUser(user, { includePrivate: true }) });
  } catch (error) {
    next(error);
  }
}

async function twoFactorDisable(req, res, next) {
  try {
    if (process.env.ADMIN_2FA_REQUIRED === 'true') {
      return res.status(400).json({ message: 'Two-step verification is required for admin accounts' });
    }
    const user = await User.findById(req.user._id).select(`+password ${TWO_FACTOR_FIELDS}`);
    const passwordOk = user.password ? await bcrypt.compare(String(req.body.password || ''), user.password) : false;
    if (!passwordOk) return res.status(400).json({ message: 'Password is incorrect' });
    if (!(await checkSecondFactor(user, req.body.code))) {
      return res.status(400).json({ message: 'That code is not correct. Try the latest code from your app.' });
    }
    user.twoFactorEnabled = false;
    user.twoFactorSecret = '';
    user.twoFactorPendingSecret = '';
    user.twoFactorBackupCodes = [];
    await user.save();
    recordAudit(req, { action: 'admin.2fa.disable', targetType: 'admin', targetId: user._id, summary: 'Turned off two-step verification' });
    res.json({ enabled: false, user: publicUser(user, { includePrivate: true }) });
  } catch (error) {
    next(error);
  }
}

async function regenerateBackupCodes(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select(TWO_FACTOR_FIELDS);
    if (!user.twoFactorEnabled) return res.status(400).json({ message: 'Turn on two-step verification first' });
    const secret = decryptSecret(user.twoFactorSecret);
    const step = verifyTotp(secret, req.body.code, Number(user.twoFactorLastStep) || 0);
    if (!step) return res.status(400).json({ message: 'That code is not correct. Try the latest code from your app.' });
    const { codes, hashes } = generateBackupCodes();
    user.twoFactorBackupCodes = hashes;
    user.twoFactorLastStep = step;
    await user.save();
    recordAudit(req, { action: 'admin.2fa.backup_codes', targetType: 'admin', targetId: user._id, summary: 'Created new backup codes' });
    res.json({ backupCodes: codes });
  } catch (error) {
    next(error);
  }
}

/** Super admin: clear 2FA for an admin who lost their phone. Signs them out everywhere. */
async function resetAdminTwoFactor(req, res, next) {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Only a super admin can reset two-step verification' });
    }
    const admin = await User.findById(req.params.adminId);
    if (!admin || admin.role === 'user') return res.status(404).json({ message: 'Admin not found' });
    admin.twoFactorEnabled = false;
    admin.twoFactorSecret = '';
    admin.twoFactorPendingSecret = '';
    admin.twoFactorBackupCodes = [];
    admin.tokenVersion = (Number(admin.tokenVersion) || 0) + 1;
    await admin.save();
    await revokeAllSessions(admin._id);
    recordAudit(req, {
      action: 'admin.2fa.reset',
      targetType: 'admin',
      targetId: admin._id,
      summary: `Reset two-step verification for ${admin.email || admin.name}`,
    });
    res.json({ message: 'Two-step verification reset. They will set it up again at next sign-in.' });
  } catch (error) {
    next(error);
  }
}

async function getMySessions(req, res, next) {
  try {
    res.json({
      sessions: await listSessions(req.user._id, req.sessionId),
      currentId: req.sessionId || null,
    });
  } catch (error) {
    next(error);
  }
}

async function revokeMySession(req, res, next) {
  try {
    const ok = await revokeSession(req.user._id, req.params.sessionId);
    if (!ok) return res.status(404).json({ message: 'That device is already signed out' });
    if (req.user.role !== 'user') {
      recordAudit(req, { action: 'session.revoke', targetType: 'session', targetId: req.params.sessionId, summary: 'Signed out a device' });
    }
    res.json({ message: 'Device signed out', current: req.params.sessionId === req.sessionId });
  } catch (error) {
    next(error);
  }
}

/** An expired access token still names its session, so signing out never needs a refresh first. */
function sessionFromHeader(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET, { ignoreExpiration: true });
  } catch {
    return null;
  }
}

/** Sign out this device only. Open route: the app may call it after the access token expired. */
async function logoutCurrent(req, res, next) {
  try {
    const payload = sessionFromHeader(req);
    if (payload?.userId && payload.sid) await revokeSession(payload.userId, payload.sid);
    const deviceToken = String(req.body?.deviceToken || '').trim().slice(0, 4096);
    // Holding the FCM token means this is that phone, so no account keeps ringing it after sign-out.
    if (deviceToken) await User.updateMany({ fcmToken: deviceToken }, { $set: { fcmToken: '' } });
    res.json({ message: 'Signed out' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  passwordBreached,
  BREACHED_MESSAGE,
  lockMinutesLeft,
  lockedResponse,
  registerFailedLogin,
  clearFailedLogins,
  twoFactorChallenge,
  finishAdminLogin,
  adminLoginTwoFactor,
  twoFactorStatus,
  twoFactorSetup,
  twoFactorEnable,
  twoFactorDisable,
  regenerateBackupCodes,
  resetAdminTwoFactor,
  getMySessions,
  revokeMySession,
  logoutCurrent,
  refreshTokens,
  callWatchToken,
  integrityNonce,
  integrityVerify,
};
