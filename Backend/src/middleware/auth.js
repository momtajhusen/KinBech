const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { touchLastActive } = require('../utils/platformBI');
const { isAdminRole, isPlatformAdminEmail, hasScope } = require('../utils/adminScopes');
const { findLiveSession, touchSession } = require('../utils/sessions');

const SUSPENDED_MESSAGE =
  'Your account is restricted. Contact KinBech support if you think this is a mistake.';

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

/**
 * Verify the JWT and load the user. Tokens without `tv` (issued before revocation
 * existed) count as version 0 so current sessions keep working.
 */
async function resolveSession(token) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    // TOKEN_EXPIRED tells refresh-capable clients to call /auth/refresh and retry.
    const code = error?.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
    return { status: 401, body: { message: 'Your session has expired. Please log in again.', code } };
  }

  const user = await User.findById(payload.userId);
  if (!user) {
    return { status: 401, body: { message: 'User not found', code: 'USER_NOT_FOUND' } };
  }

  const revoked = {
    status: 401,
    body: { message: 'You were logged out. Please log in again.', code: 'SESSION_REVOKED' },
  };
  if ((Number(payload.tv) || 0) !== (Number(user.tokenVersion) || 0)) return revoked;

  const scope = payload.scope || null;
  // Tokens from before device sessions have no `sid`; they stay valid until they expire.
  if (!payload.sid) return { user, session: null, scope };
  const session = await findLiveSession(payload.sid, user._id);
  if (!session) return revoked;
  return { user, session, scope };
}

/** The native call watcher's token works only for polling and acknowledging calls. */
const CALL_SCOPE_PATH = /^(?:\/v1)?\/chats\/(?:incoming-call|[a-f0-9]{24}\/call\/(?:delivered|end))(?:\?|$)/i;

const SCOPE_FORBIDDEN = {
  status: 401,
  body: { message: 'Your session has expired. Please log in again.', code: 'TOKEN_SCOPE' },
};

function attachSession(req, session) {
  req.user = session.user;
  req.sessionId = session.session ? String(session.session._id) : null;
  req.sessionRefreshable = Boolean(session.session?.refreshHash);
  touchSession(session.session, req);
}

function suspendedResponse(res) {
  return res.status(403).json({ message: SUSPENDED_MESSAGE, code: 'ACCOUNT_SUSPENDED' });
}

async function requireAuth(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    const session = await resolveSession(token);
    if (!session.user) return res.status(session.status).json(session.body);
    if (session.scope && !(session.scope === 'calls' && CALL_SCOPE_PATH.test(req.originalUrl))) {
      return res.status(SCOPE_FORBIDDEN.status).json(SCOPE_FORBIDDEN.body);
    }

    if (session.user.status === 'suspended') return suspendedResponse(res);

    touchLastActive(session.user);
    attachSession(req, session);
    req.tokenScope = session.scope;
    next();
  } catch (error) {
    next(error);
  }
}

const PASSWORD_CHANGE_PATHS = new Set(['/admin/change-password']);
const TWO_FACTOR_SETUP_PATHS = /^\/admin\/2fa(\/|$)|^\/admin\/change-password$/;

async function requireAdmin(req, res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      return res.status(401).json({ message: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    const session = await resolveSession(token);
    if (!session.user) return res.status(session.status).json(session.body);
    if (session.scope) return res.status(SCOPE_FORBIDDEN.status).json(SCOPE_FORBIDDEN.body);

    const { user } = session;
    if (!isAdminRole(user.role)) {
      return res.status(403).json({ message: 'Admin access required', code: 'ADMIN_REQUIRED' });
    }
    if (user.status === 'suspended') return suspendedResponse(res);

    if (user.mustChangePassword && !PASSWORD_CHANGE_PATHS.has(req.path)) {
      return res.status(403).json({
        message: 'Please set a new password to continue.',
        code: 'PASSWORD_CHANGE_REQUIRED',
      });
    }
    if (
      process.env.ADMIN_2FA_REQUIRED === 'true' &&
      !user.twoFactorEnabled &&
      // Google-only platform admins have no password to set up 2FA with; Google guards their sign-in.
      !(user.googleId && isPlatformAdminEmail(user.email)) &&
      !TWO_FACTOR_SETUP_PATHS.test(req.path)
    ) {
      return res.status(403).json({
        message: 'Turn on two-step verification to continue.',
        code: 'TWO_FACTOR_SETUP_REQUIRED',
      });
    }

    attachSession(req, session);
    next();
  } catch (error) {
    next(error);
  }
}

/** Admin route guard for one RBAC scope (see utils/adminScopes). */
function requireScope(scope) {
  return [
    requireAdmin,
    (req, res, next) => {
      if (hasScope(req.user.role, scope)) return next();
      return res.status(403).json({
        message: "Your admin role doesn't have access to this section.",
        code: 'SCOPE_FORBIDDEN',
      });
    },
  ];
}

async function optionalAuth(req, _res, next) {
  try {
    const token = bearerToken(req);
    if (!token) {
      req.user = null;
      return next();
    }
    const session = await resolveSession(token);
    req.user = session.user && !session.scope && session.user.status !== 'suspended' ? session.user : null;
    next();
  } catch {
    req.user = null;
    next();
  }
}

module.exports = { requireAuth, requireAdmin, requireScope, optionalAuth, resolveSession, SUSPENDED_MESSAGE };
