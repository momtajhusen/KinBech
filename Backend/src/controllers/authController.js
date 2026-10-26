const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Otp = require('../models/Otp');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Report = require('../models/Report');
const Shop = require('../models/Shop');
const { normalizePhone } = require('../utils/phone');
const { publicUser } = require('../utils/token');
const { ensureReferralCode, applyReferralCode } = require('../utils/referral');
const { computeLiveMetrics, detectAndAlertAnomalies } = require('../utils/platformBI');
const { getPlatformSettings, savePlatformSettings } = require('../utils/platformSettings');
const listingQueryCache = require('../utils/listingQueryCache');
const PlatformAlert = require('../models/PlatformAlert');
const Message = require('../models/Message');
const Review = require('../models/Review');
const SupportTicket = require('../models/SupportTicket');
const ErrorEvent = require('../models/ErrorEvent');
const AuditLog = require('../models/AuditLog');
const { haversineDistanceKm } = require('../utils/listing');
const { evaluatePublicText, publicProhibitedBody } = require('../utils/listingModeration');
const { emitActivity } = require('../utils/realtime');
const { recordAudit } = require('../utils/audit');
const { ADMIN_ROLES, scopesForRole } = require('../utils/adminScopes');
const { SUSPENDED_MESSAGE } = require('../middleware/auth');
const { cancelDeletion } = require('../utils/accountDeletion');
const { sendOtpSms, smsConfigured } = require('../utils/sms');
const {
  startSession,
  revokeAllSessions,
  wantsRefresh,
  enableRefresh,
  reissueToken,
  clientIp,
  installIdOf,
} = require('../utils/sessions');
const OtpEvent = require('../models/OtpEvent');

function logOtpEvent(req, phone, event, user = null) {
  OtpEvent.create({
    phone,
    ip: clientIp(req),
    installId: installIdOf(req),
    event,
    user: user?._id || null,
  }).catch(() => {});
}
const {
  passwordBreached,
  BREACHED_MESSAGE,
  lockMinutesLeft,
  lockedResponse,
  registerFailedLogin,
  clearFailedLogins,
  twoFactorChallenge,
  finishAdminLogin,
} = require('./securityController');
const { noteAdminLoginFailure } = require('../utils/captcha');
const {
  LIVE_ACTIVITY_TYPES,
  userActivityEvent,
  listingActivityEvent,
  shopActivityEvent,
  reportActivityEvent,
  reviewActivityEvent,
  ticketActivityEvent,
  errorActivityEvent,
  alertActivityEvent,
} = require('../utils/activityEvents');

function otpExpiry() {
  const minutes = Number(process.env.OTP_EXPIRES_MINUTES || 5);
  return new Date(Date.now() + minutes * 60 * 1000);
}

const isProduction = () => process.env.NODE_ENV === 'production';

/** Phones (e.g. Play Store review account) that get OTP_TEST_CODE instead of an SMS in production. */
function isOtpTestPhone(phone) {
  const list = String(process.env.OTP_TEST_PHONES || '')
    .split(',')
    .map((p) => normalizePhone(p))
    .filter(Boolean);
  return Boolean(process.env.OTP_TEST_CODE) && list.includes(phone);
}

/** Production without an SMS gateway falls back to DEFAULT_OTP (1111) so login keeps working. */
const fixedOtpMode = () => !isProduction() || !smsConfigured();

function makeOtp(phone) {
  if (isProduction()) {
    if (isOtpTestPhone(phone)) return String(process.env.OTP_TEST_CODE).replace(/\D/g, '').padStart(4, '0').slice(-4);
    if (smsConfigured()) return String(crypto.randomInt(0, 10000)).padStart(4, '0');
  }
  // DEFAULT_OTP=1111 (default) for easy QA; DEFAULT_OTP=random for real codes.
  const fixed = String(process.env.DEFAULT_OTP || '1111').trim().toLowerCase();
  if (fixed && fixed !== 'random') {
    return fixed.replace(/\D/g, '').padStart(4, '0').slice(-4);
  }
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

/** Creates the OTP and texts it. `sent` is false only when production SMS delivery failed. */
async function issueOtp(req, phone, purpose, name = '') {
  const result = await createAndSendOtp(phone, purpose, name);
  logOtpEvent(req, phone, result.sent ? 'sent' : 'sms_failed');
  return result;
}

async function createAndSendOtp(phone, purpose, name) {
  const code = makeOtp(phone);
  const hashed = await bcrypt.hash(code, 10);

  await Otp.updateMany({ phone, consumed: false }, { consumed: true });
  const record = await Otp.create({
    phone,
    code: hashed,
    purpose,
    name,
    expiresAt: otpExpiry(),
  });

  const mustSend = fixedOtpMode()
    ? !isProduction() && process.env.SMS_SEND_IN_DEV === 'true'
    : !isOtpTestPhone(phone);
  if (!mustSend) return { code, sent: true };
  const sent = await sendOtpSms(phone, code);
  if (!sent && isProduction()) {
    record.consumed = true;
    await record.save();
  }
  return { code, sent: sent || !isProduction() };
}

function otpReply(res, status, payload, { code, sent }) {
  if (!sent) {
    return res.status(503).json({ message: 'We could not send the code right now. Please try again in a minute.', code: 'SMS_FAILED' });
  }
  return res.status(status).json(isProduction() ? payload : { ...payload, otp: code });
}

async function signup(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);
    const name = String(req.body.name || '').trim();

    if (!name) {
      return res.status(400).json({ message: 'Please enter your name to continue' });
    }

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit phone number' });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.status(409).json({ message: 'An account with this number already exists. Please log in instead.' });
    }

    const contentCheck = await evaluatePublicText({ name }, 'profile');
    if (!contentCheck.ok) {
      return res.status(contentCheck.httpStatus || 400).json(publicProhibitedBody(contentCheck));
    }

    const otp = await issueOtp(req, phone, 'signup', name);
    return otpReply(res, 201, { message: 'Verification code sent successfully', phone }, otp);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ message: 'Please enter a valid 10-digit phone number' });
    }

    const user = await User.findOne({ phone });
    
    // Auto-signup: if user doesn't exist, treat as signup without name
    if (!user) {
      const otp = await issueOtp(req, phone, 'signup', '');
      return otpReply(res, 201, { message: 'Verification code sent successfully', phone, isNewUser: true }, otp);
    }

    const otp = await issueOtp(req, phone, 'login', user.name);
    return otpReply(res, 200, { message: 'Verification code sent successfully', phone, isNewUser: false }, otp);
  } catch (error) {
    next(error);
  }
}

async function verifyOtp(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);
    const code = String(req.body.otp || req.body.code || '').trim();

    if (!phone || !code) {
      return res.status(400).json({ message: 'Phone number and verification code are required' });
    }

    if (code.length !== 4) {
      return res.status(400).json({ message: 'Please enter the 4-digit verification code' });
    }

    const record = await Otp.findOne({
      phone,
      consumed: false,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 });

    if (!record) {
      return res.status(400).json({ message: 'This verification code has expired. Please request a new one.' });
    }

    const matches = await bcrypt.compare(code, record.code);
    if (!matches) {
      logOtpEvent(req, phone, 'failed');
      return res.status(400).json({ message: 'The verification code you entered is incorrect. Please try again.' });
    }

    record.consumed = true;
    await record.save();

    let user = await User.findOne({ phone });
    let isNewUser = false;

    // Auto-create user if this was a signup OTP (without name initially)
    if (!user && record.purpose === 'signup') {
      user = await User.create({
        phone,
        name: '',
        profileComplete: false,
      });
      isNewUser = true;
      await ensureReferralCode(user);
      emitActivity(userActivityEvent(user));
    }

    if (!user) {
      return res.json({
        isNewUser: true,
        phone,
      });
    }

    if (user.status === 'suspended') {
      logOtpEvent(req, phone, 'blocked_suspended', user);
      return res.status(403).json({ message: SUSPENDED_MESSAGE, code: 'ACCOUNT_SUSPENDED' });
    }
    logOtpEvent(req, phone, 'verified', user);

    await ensureReferralCode(user);

    // Optional referral on first OTP verify
    if (isNewUser && req.body.referralCode) {
      await applyReferralCode(user, req.body.referralCode);
    }

    const deletionCancelled = user.deletionScheduledFor ? await cancelDeletion(user._id) : false;
    if (deletionCancelled) {
      user.deletionRequestedAt = null;
      user.deletionScheduledFor = null;
    }

    user.lastActiveAt = new Date();
    await user.save();

    const { token, refreshToken } = await startSession(req, user, 'app');
    return res.json({
      token,
      ...(refreshToken ? { refreshToken } : {}),
      user: publicUser(user, { includePrivate: true }),
      isNewUser,
      ...(deletionCancelled ? { deletionCancelled: true } : {}),
    });
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    await ensureReferralCode(req.user);
    const payload = { user: publicUser(req.user, { includePrivate: true }) };
    // Older tokens have no device session; swap them for one so the device shows in Sessions.
    if (!req.sessionId) {
      const isAdmin = ADMIN_ROLES.includes(req.user.role) && Boolean(req.headers.origin);
      const { token, refreshToken } = await startSession(req, req.user, isAdmin ? 'admin' : 'app');
      Object.assign(payload, { token }, refreshToken ? { refreshToken } : {});
    } else if (wantsRefresh(req) && !req.sessionRefreshable) {
      Object.assign(payload, await enableRefresh(req.user, req.sessionId));
    }
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function getReferral(req, res, next) {
  try {
    const code = await ensureReferralCode(req.user);
    const invitedCount = await User.countDocuments({ referredBy: req.user._id });
    res.json({
      referralCode: code,
      featuredCredits: Math.max(0, Number(req.user.featuredCredits) || 0),
      invitedCount,
      reward: 'Invite a friend — you get 1 free boost (24 hours Featured) when they join.',
      shareMessage: `Join KinBech with my code ${code} and start buying & selling nearby. I get a free listing boost when you sign up!`,
    });
  } catch (error) {
    next(error);
  }
}

async function applyMyReferral(req, res, next) {
  try {
    const result = await applyReferralCode(req.user, req.body.code || req.body.referralCode);
    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }
    res.json({
      message: result.message,
      user: publicUser(req.user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Finish signup for an account that already passed OTP (requireAuth).
 * Never creates users: accounts only come from verifyOtp.
 */
async function completeSignup(req, res, next) {
  try {
    const user = req.user;
    const phone = normalizePhone(req.body.phone);
    const name = String(req.body.name || '').trim();

    if (!name) {
      return res.status(400).json({ message: 'Please enter your name to continue' });
    }

    if (phone && phone !== user.phone) {
      return res.status(403).json({ message: 'This number does not match your verified account.' });
    }

    const contentCheck = await evaluatePublicText({ name }, 'profile');
    if (!contentCheck.ok) {
      return res.status(contentCheck.httpStatus || 400).json(publicProhibitedBody(contentCheck));
    }

    user.name = name;
    await ensureReferralCode(user);
    if (req.body.referralCode && !user.referredBy) {
      await applyReferralCode(user, req.body.referralCode);
    }
    await user.save();

    const token = reissueToken(req, user);
    return res.json({
      token,
      user: publicUser(user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function updateMe(req, res, next) {
  try {
    if (req.body.name !== undefined) {
      req.user.name = String(req.body.name).trim();
    }
    if (req.body.bio !== undefined) {
      req.user.bio = String(req.body.bio).trim().slice(0, 200);
    }
    if (req.body.avatarUrl !== undefined) {
      req.user.avatarUrl = String(req.body.avatarUrl).trim();
    }
    if (req.body.location !== undefined) {
      req.user.location = String(req.body.location).trim();
    }
    if (req.body.coordinates !== undefined) {
      req.user.coordinates = {
        latitude: Number(req.body.coordinates.latitude),
        longitude: Number(req.body.coordinates.longitude),
      };
    }
    if (req.body.profileComplete !== undefined) {
      req.user.profileComplete = Boolean(req.body.profileComplete);
    }
    if (req.body.sellerTypePreference !== undefined) {
      req.user.sellerTypePreference = String(req.body.sellerTypePreference);
    }

    if (req.body.name !== undefined || req.body.bio !== undefined) {
      const contentCheck = await evaluatePublicText(
        { name: req.user.name, bio: req.user.bio },
        'profile'
      );
      if (!contentCheck.ok) {
        return res.status(contentCheck.httpStatus || 400).json(publicProhibitedBody(contentCheck));
      }
    }

    await ensureReferralCode(req.user);
    if (req.body.referralCode) {
      await applyReferralCode(req.user, req.body.referralCode);
    }

    await req.user.save();
    const token = reissueToken(req, req.user);
    return res.json({
      token,
      user: publicUser(req.user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function updatePreferences(req, res, next) {
  try {
    if (req.body.notifications !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.notifications = Boolean(req.body.notifications);
    }
    if (req.body.language !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.language = String(req.body.language);
    }
    if (req.body.currency !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.currency = String(req.body.currency);
    }
    if (req.body.showPhone !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.showPhone = Boolean(req.body.showPhone);
    }
    if (req.body.showLocation !== undefined) {
      req.user.preferences = req.user.preferences || {};
      req.user.preferences.showLocation = Boolean(req.body.showLocation);
    }
    req.user.markModified('preferences');

    await req.user.save();
    const token = reissueToken(req, req.user);
    return res.json({
      token,
      user: publicUser(req.user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function getBlockedUsers(req, res, next) {
  try {
    const ids = Array.isArray(req.user.blockedUserIds) ? req.user.blockedUserIds : [];
    const users = ids.length
      ? await User.find({ _id: { $in: ids } }, 'name avatarUrl phone')
      : [];
    res.json({
      users: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        avatarUrl: u.avatarUrl,
        phone: u.phone,
      })),
    });
  } catch (error) {
    next(error);
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WEAK_PASSWORD_WORDS = ['admin123', 'password', 'kinbech', '12345678', 'qwerty'];

/** Returns a user-facing problem with the password, or null when it is acceptable. */
function adminPasswordProblem(password, email = '') {
  const value = String(password || '');
  if (value.length < 10) return 'Use at least 10 characters.';
  if (!/[a-z]/i.test(value) || !/\d/.test(value)) return 'Use both letters and numbers.';
  const lower = value.toLowerCase();
  if (WEAK_PASSWORD_WORDS.some((word) => lower.includes(word))) {
    return 'This password is too easy to guess.';
  }
  const local = String(email).split('@')[0].toLowerCase();
  if (local.length >= 4 && lower.includes(local)) return "Don't use your email in the password.";
  return null;
}

function generateTempPassword() {
  for (;;) {
    const candidate = crypto.randomBytes(12).toString('base64url');
    if (!adminPasswordProblem(candidate)) return candidate;
  }
}

async function adminLogin(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({
      email: new RegExp(`^${escapeRegex(email)}$`, 'i'),
      role: { $in: ADMIN_ROLES },
    });

    if (user && lockMinutesLeft(user)) return lockedResponse(res, user);

    const isPasswordValid = user?.password ? await bcrypt.compare(password, user.password) : false;
    if (!user || !isPasswordValid) {
      if (user) {
        await registerFailedLogin(req, user, 'Wrong password');
        if (lockMinutesLeft(user)) return lockedResponse(res, user);
      } else {
        noteAdminLoginFailure(req);
      }
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ message: SUSPENDED_MESSAGE, code: 'ACCOUNT_SUSPENDED' });
    }

    // Old seeded/default passwords (e.g. admin123) must be replaced before the panel opens.
    if (!user.mustChangePassword && adminPasswordProblem(password, user.email)) {
      user.mustChangePassword = true;
      await user.save();
    }

    if (user.twoFactorEnabled) {
      // Wrong codes still count toward the lockout, so keep the counter until the code step.
      return res.json({
        twoFactorRequired: true,
        challenge: twoFactorChallenge(user),
        message: 'Enter the 6-digit code from your authenticator app',
      });
    }

    await clearFailedLogins(user);
    return finishAdminLogin(req, res, user);
  } catch (error) {
    next(error);
  }
}

async function changeAdminPassword(req, res, next) {
  try {
    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');
    const user = req.user;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Enter your current and new password' });
    }

    const matches = user.password ? await bcrypt.compare(currentPassword, user.password) : false;
    if (!matches) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    if (currentPassword === newPassword) {
      return res.status(400).json({ message: 'New password must be different from the current one' });
    }

    const problem = adminPasswordProblem(newPassword, user.email);
    if (problem) {
      return res.status(400).json({ message: problem });
    }
    if (await passwordBreached(newPassword)) {
      return res.status(400).json({ message: BREACHED_MESSAGE });
    }

    user.password = await bcrypt.hash(newPassword, 12);
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    // Signs out every other session that used the old password.
    user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
    await user.save();
    await revokeAllSessions(user._id, req.sessionId);

    recordAudit(req, { action: 'admin.password_change', targetType: 'admin', targetId: user._id, summary: 'Changed password' });

    const fresh = req.sessionId ? { token: reissueToken(req, user) } : await startSession(req, user, 'admin');
    return res.json({
      message: 'Password updated',
      token: fresh.token,
      ...(fresh.refreshToken ? { refreshToken: fresh.refreshToken } : {}),
      user: publicUser(user, { includePrivate: true }),
    });
  } catch (error) {
    next(error);
  }
}

async function getAuditLogs(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const filter = {};
    const action = String(req.query.action || '').trim();
    // "listings" matches every listings.* action; a full name matches exactly.
    if (action) filter.action = action.includes('.') ? action : new RegExp(`^${escapeRegex(action)}\\.`);
    if (req.query.targetType) filter.targetType = String(req.query.targetType);
    if (req.query.targetId) filter.targetId = String(req.query.targetId);
    if (req.query.actor) filter.actor = String(req.query.actor);
    const q = String(req.query.q || '').trim().slice(0, 80);
    if (q) {
      const re = new RegExp(escapeRegex(q), 'i');
      filter.$or = [{ summary: re }, { actorName: re }, { action: re }, { targetId: re }, { ip: re }];
    }
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    if ((from && !Number.isNaN(from.getTime())) || (to && !Number.isNaN(to.getTime()))) {
      filter.createdAt = {};
      if (from && !Number.isNaN(from.getTime())) filter.createdAt.$gte = from;
      if (to && !Number.isNaN(to.getTime())) filter.createdAt.$lte = to;
    }

    const [total, logs, actions] = await Promise.all([
      AuditLog.countDocuments(filter),
      AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.distinct('action'),
    ]);

    res.json({
      logs: logs.map((log) => ({
        id: String(log._id),
        actorId: log.actor ? String(log.actor) : null,
        actorName: log.actorName,
        actorRole: log.actorRole,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        summary: log.summary,
        meta: log.meta || {},
        ip: log.ip || '',
        createdAt: log.createdAt,
      })),
      actionGroups: [...new Set(actions.map((name) => String(name).split('.')[0]))].sort(),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
}

/** Revoke every token for this account, including the current one. */
async function logoutAllDevices(req, res, next) {
  try {
    req.user.tokenVersion = (Number(req.user.tokenVersion) || 0) + 1;
    await req.user.save();
    await revokeAllSessions(req.user._id);
    return res.json({ message: 'Logged out from all devices' });
  } catch (error) {
    next(error);
  }
}

async function getAllAdmins(req, res, next) {
  try {
    const filter = { role: { $in: ['admin', 'super_admin', 'moderator', 'support'] } };

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, admins] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('name email role createdAt twoFactorEnabled')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    const adminsWithAccess = admins.map(admin => ({
      id: admin._id,
      name: admin.name,
      email: admin.email,
      role: admin.role,
      access: admin.role === 'super_admin' ? ['all'] : scopesForRole(admin.role),
      twoFactorEnabled: Boolean(admin.twoFactorEnabled),
      createdAt: admin.createdAt,
    }));

    res.json({
      admins: adminsWithAccess,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
}

async function createAdmin(req, res, next) {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const name = String(req.body.name || '').trim();
    const { role } = req.body;

    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only a super admin can create admins' });
    }

    if (!email || !role || !name) {
      return res.status(400).json({ message: 'Name, email and role are required' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address' });
    }
    if (!ADMIN_ROLES.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const existingAdmin = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') });
    if (existingAdmin) {
      return res.status(409).json({ message: 'User with this email already exists' });
    }

    const typedPassword = req.body.password ? String(req.body.password) : '';
    if (typedPassword) {
      const problem = adminPasswordProblem(typedPassword, email);
      if (problem) return res.status(400).json({ message: problem });
      if (await passwordBreached(typedPassword)) return res.status(400).json({ message: BREACHED_MESSAGE });
    }
    const temporaryPassword = typedPassword || generateTempPassword();

    const admin = await User.create({
      email,
      password: await bcrypt.hash(temporaryPassword, 12),
      name,
      role,
      mustChangePassword: true,
    });

    recordAudit(req, {
      action: 'admin.create',
      targetType: 'admin',
      targetId: admin._id,
      summary: `Created ${role} ${email}`,
      meta: { role, email },
    });

    res.status(201).json({
      message: 'Admin created successfully',
      // Shown once so the super admin can hand it over; it must be changed on first login.
      temporaryPassword: typedPassword ? undefined : temporaryPassword,
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        createdAt: admin.createdAt,
      }
    });
  } catch (error) {
    next(error);
  }
}

function isSuperAdmin(user) {
  return user?.role === 'super_admin';
}

function isFullAdmin(user) {
  return user && ['super_admin', 'admin'].includes(user.role);
}

async function updateAdmin(req, res, next) {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only a super admin can edit admin roles' });
    }

    const { role, name } = req.body || {};
    const allowed = ['super_admin', 'admin', 'moderator', 'support'];
    const admin = await User.findById(req.params.adminId);
    if (!admin || !allowed.includes(admin.role)) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    if (role && !allowed.includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (admin.role === 'super_admin' && role && role !== 'super_admin') {
      const others = await User.countDocuments({
        _id: { $ne: admin._id },
        role: 'super_admin',
      });
      if (!others) {
        return res.status(400).json({ message: 'Keep at least one super admin' });
      }
    }

    const previousRole = admin.role;
    if (name !== undefined) admin.name = String(name).trim() || admin.name;
    if (role && role !== admin.role) {
      admin.role = role;
      // Old tokens must not keep the previous role's access.
      admin.tokenVersion = (Number(admin.tokenVersion) || 0) + 1;
    }
    await admin.save();

    recordAudit(req, {
      action: 'admin.update',
      targetType: 'admin',
      targetId: admin._id,
      summary: previousRole !== admin.role
        ? `Changed ${admin.email} from ${previousRole} to ${admin.role}`
        : `Updated ${admin.email}`,
      meta: { previousRole, role: admin.role, name: admin.name },
    });

    res.json({
      message: 'Admin updated',
      admin: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getPlatformSettingsAdmin(req, res, next) {
  try {
    const settings = await getPlatformSettings();
    res.json({ settings });
  } catch (error) {
    next(error);
  }
}

async function updatePlatformSettingsAdmin(req, res, next) {
  try {
    if (!isFullAdmin(req.user)) {
      return res.status(403).json({ message: 'Only a super admin can change platform settings' });
    }
    const settings = await savePlatformSettings(req.body || {});
    listingQueryCache.invalidateAll();
    recordAudit(req, {
      action: 'settings.update',
      targetType: 'settings',
      summary: 'Updated platform settings',
      meta: { fields: Object.keys(req.body || {}) },
    });
    res.json({ message: 'Platform settings saved', settings });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    next(error);
  }
}

async function getPlatformAlerts(req, res, next) {
  try {
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit, 10) || 8));
    const alerts = await PlatformAlert.find({ status: { $in: ['open', 'acknowledged'] } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({
      alerts: alerts.map((alert) => ({
        id: String(alert._id),
        title: alert.title,
        message: alert.message,
        status: alert.status,
        createdAt: alert.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteAdmin(req, res, next) {
  try {
    const { adminId } = req.params;

    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only a super admin can remove admins' });
    }

    if (String(adminId) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot delete yourself' });
    }

    const admin = await User.findById(adminId);
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    if (admin.role === 'super_admin') {
      return res.status(403).json({ message: 'Cannot delete super admin' });
    }

    if (!ADMIN_ROLES.includes(admin.role)) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    await User.findByIdAndDelete(adminId);
    recordAudit(req, {
      action: 'admin.delete',
      targetType: 'admin',
      targetId: adminId,
      summary: `Removed ${admin.role} ${admin.email || admin.name}`,
      meta: { role: admin.role, email: admin.email },
    });

    res.json({ message: 'Admin deleted successfully' });
  } catch (error) {
    next(error);
  }
}

async function getDashboardStats(req, res, next) {
  try {
    const pendingReports = await Report.countDocuments({ status: 'pending' });
    const pendingShops = await Shop.countDocuments({ isVerified: false, status: 'active' });

    const live = await computeLiveMetrics();
    let anomalies = [];
    try {
      anomalies = await detectAndAlertAnomalies(live);
    } catch (anomalyErr) {
      console.error('[BI] anomaly check failed', anomalyErr?.message || anomalyErr);
    }

    // Get weekly listing data
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const weeklyListings = await Listing.aggregate([
      {
        $match: {
          createdAt: { $gte: weekAgo },
          status: { $in: ['active', 'sold', 'pending'] },
        },
      },
      {
        $group: {
          _id: { $dayOfWeek: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Convert to day names
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weeklyData = dayNames.map((day, index) => {
      const dayData = weeklyListings.find((d) => d._id === index + 1);
      return { day, listings: dayData ? dayData.count : 0 };
    });

    const pendingReportDocs = await Report.find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();
    const pendingShopDocs = await Shop.find({ isVerified: false, status: 'active' })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name createdAt')
      .lean();
    const latestListings = await Listing.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('title createdAt status')
      .lean();

    const recentActivity = [
      ...anomalies.slice(0, 3).map((a) => ({
        id: `anomaly-${a.id}`,
        type: 'system',
        message: a.title,
        time: a.createdAt,
      })),
      ...pendingReportDocs.map((r) => ({
        id: String(r._id),
        type: 'report',
        message: `New report: ${r.reason || 'user report'}`,
        time: r.createdAt,
      })),
      ...pendingShopDocs.map((s) => ({
        id: String(s._id),
        type: 'verification',
        message: `Shop pending verification: ${s.name}`,
        time: s.createdAt,
      })),
      ...latestListings.map((l) => ({
        id: String(l._id),
        type: 'system',
        message: `Listing ${l.status}: ${l.title}`,
        time: l.createdAt,
      })),
    ]
      .sort((a, b) => new Date(b.time) - new Date(a.time))
      .slice(0, 10)
      .map((item) => ({
        ...item,
        time: item.time ? new Date(item.time).toLocaleString() : '',
      }));

    const attentionItems = [
      ...anomalies.slice(0, 5).map((a) => ({
        id: a.id,
        priority: String(a.type).includes('crash') ? 'High' : 'Medium',
        title: a.title,
        description: a.message,
        time: a.createdAt ? new Date(a.createdAt).toLocaleString() : '',
        kind: 'anomaly',
        link: '/admin/dashboard',
      })),
      ...pendingReportDocs.slice(0, 3).map((r) => ({
        id: String(r._id),
        priority: 'High',
        title: 'Pending report',
        description: r.reason || 'A user report needs review',
        time: r.createdAt ? new Date(r.createdAt).toLocaleString() : '',
        kind: 'report',
        link: '/admin/reports',
      })),
      ...pendingShopDocs.slice(0, 3).map((s) => ({
        id: String(s._id),
        priority: 'Medium',
        title: 'Shop verification',
        description: `${s.name} is waiting for verification`,
        time: s.createdAt ? new Date(s.createdAt).toLocaleString() : '',
        kind: 'shop',
        link: '/admin/shops',
      })),
    ];

    res.json({
      stats: {
        totalUsers: live.totalUsers,
        activeListings: live.activeListings,
        pendingReports,
        pendingShops,
        dau: live.dau,
        signupsToday: live.signupsToday,
        transactionsToday: live.transactionsToday,
        newListingsToday: live.newListingsToday,
        signupsChangePct: live.signupsChangePct,
        transactionsChangePct: live.transactionsChangePct,
      },
      live,
      topCategories: live.topCategories,
      anomalies,
      weeklyData,
      recentActivity,
      attentionItems,
      refreshedAt: live.generatedAt,
    });
  } catch (error) {
    next(error);
  }
}

async function updatePlatformAlert(req, res, next) {
  try {
    const alert = await PlatformAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ message: 'Alert not found' });
    const { status } = req.body;
    if (status && ['open', 'acknowledged', 'resolved'].includes(status)) {
      alert.status = status;
      await alert.save();
    }
    res.json({ alert });
  } catch (error) {
    next(error);
  }
}

async function getAllUsers(req, res, next) {
  try {
    const { status, q } = req.query;
    const filter = { role: 'user' };

    if (status === 'suspended') {
      filter.status = 'suspended';
    } else if (status === 'verified') {
      filter.status = { $ne: 'suspended' };
      filter.profileComplete = true;
    } else if (status === 'unverified') {
      filter.status = { $ne: 'suspended' };
      filter.profileComplete = { $ne: true };
    }

    const search = String(q || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ name: re }, { email: re }, { phone: re }];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('name email phone avatarUrl profileComplete soldCount boughtCount createdAt status suspendedUntil chatRestrictedUntil deletionScheduledFor strikes lastActiveAt isTester')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    // Add listing counts
    const userIds = users.map(u => u._id);
    const listingCounts = await Listing.aggregate([
      { $match: { seller: { $in: userIds }, status: 'active' } },
      { $group: { _id: '$seller', count: { $sum: 1 } } }
    ]);

    const listingCountMap = {};
    listingCounts.forEach(item => {
      listingCountMap[item._id.toString()] = item.count;
    });
    const shopOwners = new Set(
      (await Shop.distinct('owner', { owner: { $in: userIds } })).map(String)
    );
    const now = Date.now();

    const usersWithCounts = users.map(user => {
      const listingsCount = listingCountMap[user._id.toString()] || 0;
      const hasShop = shopOwners.has(String(user._id));
      const sells = listingsCount > 0 || user.soldCount > 0;
      return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        avatarUrl: user.avatarUrl || '',
        sellerType: hasShop && sells ? 'both' : hasShop ? 'shop' : sells ? 'individual' : 'buyer',
        joinDate: user.createdAt,
        lastActiveAt: user.lastActiveAt || null,
        listingsCount,
        profileComplete: Boolean(user.profileComplete),
        status: user.status === 'suspended' ? 'suspended' : (user.profileComplete ? 'verified' : 'unverified'),
        suspendedUntil: user.suspendedUntil || null,
        chatRestricted: Boolean(user.chatRestrictedUntil && new Date(user.chatRestrictedUntil).getTime() > now),
        deletionScheduledFor: user.deletionScheduledFor || null,
        strikes: (user.strikes || []).length,
        isTester: Boolean(user.isTester),
      };
    });

    res.json({
      users: usersWithCounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const { userId } = req.params;
    const { action } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!['suspend', 'reinstate'].includes(action)) {
      return res.status(400).json({ message: 'Unknown action' });
    }
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot change your own status' });
    }
    if (ADMIN_ROLES.includes(user.role) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only a super admin can change another admin\'s status' });
    }

    const previousStatus = user.status;
    if (action === 'suspend') {
      user.status = 'suspended';
      // Kick every signed-in device right away.
      user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
    } else {
      user.status = 'active';
    }

    await user.save();
    if (action === 'suspend') await revokeAllSessions(user._id);
    recordAudit(req, {
      action: `user.${action}`,
      targetType: 'user',
      targetId: user._id,
      summary: `${action === 'suspend' ? 'Suspended' : 'Reinstated'} ${user.name || user.phone || user.email || 'user'}`,
      meta: { previousStatus, status: user.status },
    });

    res.json({ 
      message: 'User status updated successfully',
      user: publicUser(user, { includePrivate: true })
    });
  } catch (error) {
    next(error);
  }
}

async function saveDeviceToken(req, res, next) {
  try {
    const token = String(req.body.token || '').trim();
    if (!token) {
      return res.status(400).json({ message: 'token is required' });
    }
    req.user.fcmToken = token;
    await req.user.save();
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function pinStore(req, res, next) {
  try {
    const { storeId, storeType } = req.body;

    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' });
    }

    if (!storeType || !['shop', 'individual'].includes(storeType)) {
      return res.status(400).json({ message: 'storeType must be shop or individual' });
    }

    // Check if store exists
    if (storeType === 'shop') {
      const shop = await Shop.findOne({ _id: storeId, status: 'active' });
      if (!shop) {
        return res.status(404).json({ message: 'Store not found' });
      }
    } else {
      const user = await User.findOne({ _id: storeId, status: { $ne: 'suspended' } });
      if (!user) {
        return res.status(404).json({ message: 'Seller not found' });
      }
    }

    // Check if already pinned
    const existingPin = req.user.pinnedStores?.find(
      p => String(p.storeId) === String(storeId)
    );

    if (existingPin) {
      return res.json({ ok: true, message: 'Store already pinned' });
    }

    // Add to pinned stores
    if (!req.user.pinnedStores) {
      req.user.pinnedStores = [];
    }

    req.user.pinnedStores.push({
      storeId,
      storeType,
      pinnedAt: new Date(),
    });

    await req.user.save();

    res.json({ ok: true, message: 'Store pinned successfully' });
  } catch (error) {
    next(error);
  }
}

async function recordPinnedView(req, res, next) {
  try {
    const { storeId } = req.params;
    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' });
    }

    const pin = (req.user.pinnedStores || []).find((p) => String(p.storeId) === String(storeId));
    if (!pin) {
      return res.json({ ok: true, counted: false });
    }

    pin.viewCount = (Number(pin.viewCount) || 0) + 1;
    req.user.markModified('pinnedStores');
    await req.user.save();

    res.json({ ok: true, counted: true, viewCount: pin.viewCount });
  } catch (error) {
    next(error);
  }
}

async function unpinStore(req, res, next) {
  try {
    const { storeId } = req.params;

    if (!storeId) {
      return res.status(400).json({ message: 'storeId is required' });
    }

    if (!req.user.pinnedStores || req.user.pinnedStores.length === 0) {
      return res.json({ ok: true, message: 'No pinned stores' });
    }

    req.user.pinnedStores = req.user.pinnedStores.filter(
      p => String(p.storeId) !== String(storeId)
    );

    await req.user.save();

    res.json({ ok: true, message: 'Store unpinned successfully' });
  } catch (error) {
    next(error);
  }
}

async function getPinnedStores(req, res, next) {
  try {
    const { lat, lng } = req.query;
    const userLat = lat != null && lat !== '' ? Number(lat) : null;
    const userLng = lng != null && lng !== '' ? Number(lng) : null;

    const pinnedStoreIds = (req.user.pinnedStores || []).map(p => p.storeId);
    const pinned = [];

    // Fetch shops
    const shopIds = pinnedStoreIds.filter(id => {
      const pin = req.user.pinnedStores.find(p => String(p.storeId) === String(id));
      return pin && pin.storeType === 'shop';
    });

    if (shopIds.length > 0) {
      const shops = await Shop.find({ _id: { $in: shopIds }, status: 'active' }).lean();
      for (const shop of shops) {
        const listings = await Listing.find({
          shopId: shop._id,
          status: 'active',
        })
          .select('photos category location coordinates createdAt')
          .limit(10)
          .lean();

        const coords = shop.coordinates || {};
        const distance = userLat != null && userLng != null && coords.lat != null && coords.lng != null
          ? haversineDistanceKm(userLat, userLng, coords.lat, coords.lng)
          : null;

        pinned.push({
          _id: shop._id,
          id: shop._id,
          name: shop.name,
          avatarUrl: shop.logo || '',
          coverImage: shop.coverImage || '',
          tagline: shop.tagline || '',
          rating: Number(shop.ratingAverage) || 0,
          reviewsCount: Number(shop.reviewCount) || 0,
          listingCount: listings.length,
          distance: distance == null ? null : Math.round(distance * 10) / 10,
          location: shop.location || shop.address || '',
          verified: Boolean(shop.isVerified),
          verificationKind: shop.isVerified ? 'business' : null,
          verificationLabel: shop.isVerified ? 'Business Verified' : null,
          productGallery: listings.slice(0, 4).map(l => l.photos?.[0]).filter(Boolean),
          sellerType: 'shop',
          category: shop.category || 'Other',
          shopId: shop._id,
          userId: shop.owner,
          description: shop.description || '',
          phone: shop.phone || '',
          openingHours: shop.openingHours || '',
          coordinates: coords,
        });
      }
    }

    // Fetch individual sellers
    const userIds = pinnedStoreIds.filter(id => {
      const pin = req.user.pinnedStores.find(p => String(p.storeId) === String(id));
      return pin && pin.storeType === 'individual';
    });

    if (userIds.length > 0) {
      const users = await User.find({
        _id: { $in: userIds },
        status: { $ne: 'suspended' },
      })
        .select('name avatarUrl location coordinates phone bio')
        .lean();

      for (const user of users) {
        const listings = await Listing.find({
          seller: user._id,
          sellerType: 'individual',
          status: 'active',
        })
          .select('photos category location coordinates createdAt')
          .limit(10)
          .lean();

        const coords = user.coordinates || {};
        const distance = userLat != null && userLng != null && coords.latitude != null && coords.longitude != null
          ? haversineDistanceKm(userLat, userLng, coords.latitude, coords.longitude)
          : null;

        const location = user.preferences?.showLocation === false ? '' : user.location || '';

        pinned.push({
          _id: user._id,
          id: user._id,
          name: user.name || 'Seller',
          avatarUrl: user.avatarUrl || '',
          coverImage: user.avatarUrl || '',
          rating: 0,
          reviewsCount: 0,
          listingCount: listings.length,
          distance: distance == null ? null : Math.round(distance * 10) / 10,
          location,
          verified: Boolean(user.phone),
          verificationKind: user.phone ? 'phone' : null,
          verificationLabel: user.phone ? 'Phone Verified' : null,
          productGallery: listings.slice(0, 4).map(l => l.photos?.[0]).filter(Boolean),
          sellerType: 'individual',
          category: listings[0]?.category || 'General',
          shopId: null,
          userId: user._id,
          description: user.bio || '',
          phone: user.preferences?.showPhone ? user.phone || '' : '',
          coordinates: coords,
        });
      }
    }

    const pinnedWithTime = pinned.map(store => {
      const pin = req.user.pinnedStores.find(p => String(p.storeId) === String(store._id));
      return {
        ...store,
        pinnedAt: pin?.pinnedAt,
        viewCount: Number(pin?.viewCount) || 0,
      };
    });

    pinnedWithTime.sort((a, b) => {
      const views = (b.viewCount || 0) - (a.viewCount || 0);
      if (views !== 0) return views;
      return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
    });

    res.json({ stores: pinnedWithTime });
  } catch (error) {
    next(error);
  }
}

const PER_SOURCE_LIMIT = 25;

/**
 * Live platform activity for the admin "Live Activity" page.
 * Returns a live pulse (counters) plus a merged, newest-first event feed
 * built from signups, listings, shops, reports, reviews, tickets, errors and alerts.
 */
async function getLiveActivity(req, res, next) {
  try {
    const type = String(req.query.type || 'all').toLowerCase();
    const requested = parseInt(req.query.limit, 10) || 40;
    const limit = Math.min(100, Math.max(10, requested));

    const now = Date.now();
    const hourAgo = new Date(now - 60 * 60 * 1000);
    const fifteenMinAgo = new Date(now - 15 * 60 * 1000);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [
      onlineNow,
      activeToday,
      signupsToday,
      listingsToday,
      soldToday,
      messagesLastHour,
      errorsLastHour,
      pendingReports,
      pendingShops,
      pendingReviews,
      openTickets,
      openAlerts,
    ] = await Promise.all([
      User.countDocuments({ role: 'user', lastActiveAt: { $gte: fifteenMinAgo } }),
      User.countDocuments({ role: 'user', lastActiveAt: { $gte: startOfDay } }),
      User.countDocuments({ role: 'user', createdAt: { $gte: startOfDay } }),
      Listing.countDocuments({ createdAt: { $gte: startOfDay } }),
      Listing.countDocuments({ status: 'sold', updatedAt: { $gte: startOfDay } }),
      Message.countDocuments({ createdAt: { $gte: hourAgo } }),
      ErrorEvent.countDocuments({ createdAt: { $gte: hourAgo }, severity: { $in: ['error', 'fatal'] } }),
      Report.countDocuments({ status: 'pending' }),
      Shop.countDocuments({ isVerified: false, status: 'active' }),
      Review.countDocuments({ status: 'pending' }),
      SupportTicket.countDocuments({ status: 'open' }),
      PlatformAlert.countDocuments({ status: 'open' }),
    ]);

    const [userDocs, listingDocs, shopDocs, reportDocs, reviewDocs, ticketDocs, errorDocs, alertDocs] =
      await Promise.all([
        User.find({ role: 'user' })
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('name phone location profileComplete createdAt')
          .lean(),
        Listing.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('title category price status sellerType seller shopId createdAt')
          .lean(),
        Shop.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('name owner isVerified status category location createdAt')
          .lean(),
        Report.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('reporter reportedUser reportedListing reason details status createdAt')
          .lean(),
        Review.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('reviewer shopId listing rating review tags status createdAt')
          .lean(),
        SupportTicket.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('user name phone subject message status createdAt')
          .lean(),
        ErrorEvent.find({ status: { $in: ['open', 'acknowledged'] } })
          .sort({ lastSeenAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('name message source path severity status statusCode occurrenceCount userLabel lastSeenAt createdAt')
          .lean(),
        PlatformAlert.find()
          .sort({ createdAt: -1 })
          .limit(PER_SOURCE_LIMIT)
          .select('type title message metricValue baselineValue changePct status createdAt')
          .lean(),
      ]);

    const events = [
      ...userDocs.map(userActivityEvent),
      ...listingDocs.map(listingActivityEvent),
      ...shopDocs.map(shopActivityEvent),
      ...reportDocs.map(reportActivityEvent),
      ...reviewDocs.map(reviewActivityEvent),
      ...ticketDocs.map(ticketActivityEvent),
      ...errorDocs.map(errorActivityEvent),
      ...alertDocs.map(alertActivityEvent),
    ];

    const actorIds = [...new Set(events.map((e) => e.actorId).filter(Boolean).map(String))];
    if (actorIds.length) {
      const actors = await User.find({ _id: { $in: actorIds } })
        .select('name phone')
        .lean();
      const nameById = new Map(actors.map((a) => [String(a._id), a.name || a.phone || 'User']));
      events.forEach((e) => {
        if (e.actorId) e.actor = nameById.get(String(e.actorId)) || e.actor || 'User';
        delete e.actorId;
      });
    }

    events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    const counts = { all: events.length };
    LIVE_ACTIVITY_TYPES.forEach((t) => {
      counts[t] = events.filter((e) => e.type === t).length;
    });

    const filtered = type === 'all' ? events : events.filter((e) => e.type === type);

    res.json({
      pulse: {
        onlineNow,
        activeToday,
        signupsToday,
        listingsToday,
        soldToday,
        messagesLastHour,
        errorsLastHour,
        pendingReports,
        pendingShops,
        pendingReviews,
        openTickets,
        openAlerts,
      },
      events: filtered.slice(0, limit),
      counts,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAuditLogs,
  changeAdminPassword,
  logoutAllDevices,
  signup,
  login,
  verifyOtp,
  me,
  updateMe,
  saveDeviceToken,
  completeSignup,
  updatePreferences,
  getBlockedUsers,
  getReferral,
  applyMyReferral,
  adminLogin,
  getAllAdmins,
  createAdmin,
  deleteAdmin,
  updateAdmin,
  getPlatformSettingsAdmin,
  updatePlatformSettingsAdmin,
  getPlatformAlerts,
  getDashboardStats,
  updatePlatformAlert,
  getAllUsers,
  updateUserStatus,
  getLiveActivity,
  pinStore,
  unpinStore,
  recordPinnedView,
  getPinnedStores,
};
