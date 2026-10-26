const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { normalizePhone } = require('../utils/phone');

const isProduction = process.env.NODE_ENV === 'production';

const DEFAULT_ORIGINS = [
  'https://kinbech.codersalpha.com',
  'https://kinbech.app',
  'https://www.kinbech.app',
];

function configuredOrigins() {
  const raw = [process.env.CORS_ORIGINS, process.env.CLIENT_ORIGIN]
    .filter(Boolean)
    .join(',');
  const list = raw
    .split(',')
    .map((item) => item.trim().replace(/\/$/, ''))
    .filter((item) => item && item !== '*');
  return new Set([...DEFAULT_ORIGINS, ...list]);
}

const allowedOrigins = configuredOrigins();
const DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

function isAllowedOrigin(origin) {
  // Mobile app, curl and server-to-server calls send no Origin header.
  if (!origin) return true;
  const clean = origin.replace(/\/$/, '');
  if (allowedOrigins.has(clean)) return true;
  return !isProduction && DEV_ORIGIN.test(clean);
}

const corsOptions = {
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Token-Refresh'],
  credentials: true,
  maxAge: 600,
};

const securityHeaders = helmet({
  // Website (other origin) loads /uploads images from the API.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // JSON API: no HTML to protect with a CSP beyond the defaults.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      mediaSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  strictTransportSecurity: isProduction
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
});

function retryMessage(req) {
  const reset = req.rateLimit?.resetTime;
  const seconds = reset
    ? Math.max(1, Math.ceil((new Date(reset).getTime() - Date.now()) / 1000))
    : 60;
  if (seconds >= 120) {
    return { seconds, text: `Too many attempts. Please try again in ${Math.ceil(seconds / 60)} minutes.` };
  }
  return { seconds, text: `Too many requests. Please try again in ${seconds}s.` };
}

function friendlyHandler(req, res, _next, options) {
  const { seconds, text } = retryMessage(req);
  res.setHeader('Retry-After', String(seconds));
  res.status(options.statusCode).json({
    message: text,
    code: 'RATE_LIMITED',
    retryAfter: seconds,
  });
}

function ipKey(req) {
  return ipKeyGenerator(req.ip || '');
}

/** Signed user id from the bearer token, or null. Rejected tokens fall back to IP. */
function tokenUserId(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), process.env.JWT_SECRET).userId || null;
  } catch {
    return null;
  }
}

function limiter({ windowMinutes, limit, key = ipKey, skip }) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: key,
    handler: friendlyHandler,
    skip,
  });
}

const isHealth = (req) => req.path === '/health';

// Shared mobile networks (CGNAT) put many people behind one IP, so the IP cap stays high.
const globalLimiter = limiter({ windowMinutes: 5, limit: 3000, skip: isHealth });

const perUserLimiter = limiter({
  windowMinutes: 5,
  limit: 1500,
  key: (req) => {
    const userId = tokenUserId(req);
    return userId ? `user:${userId}` : `ip:${ipKey(req)}`;
  },
  skip: isHealth,
});

const phoneKey = (prefix) => (req) => {
  const phone = normalizePhone(req.body?.phone);
  return phone ? `${prefix}:${phone}` : `${prefix}-ip:${ipKey(req)}`;
};

const otpSendIpLimiter = limiter({ windowMinutes: 15, limit: 30 });
const otpSendPhoneLimiter = limiter({ windowMinutes: 15, limit: 5, key: phoneKey('otp-send') });
const otpVerifyLimiter = limiter({ windowMinutes: 15, limit: 10, key: phoneKey('otp-verify') });

const adminLoginLimiter = limiter({
  windowMinutes: 15,
  limit: 10,
  key: (req) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    return email ? `admin-login:${email}` : `admin-login-ip:${ipKey(req)}`;
  },
});

const userKey = (prefix) => (req) => {
  const userId = req.user?._id ? String(req.user._id) : tokenUserId(req);
  return userId ? `${prefix}:${userId}` : `${prefix}-ip:${ipKey(req)}`;
};

const aiLimiter = limiter({ windowMinutes: 1, limit: 20, key: userKey('ai') });
const uploadLimiter = limiter({ windowMinutes: 15, limit: 150, key: userKey('upload') });
const clientErrorLimiter = limiter({ windowMinutes: 5, limit: 60 });
const twoFactorLimiter = limiter({ windowMinutes: 15, limit: 15 });
const dataExportLimiter = limiter({ windowMinutes: 60, limit: 5, key: userKey('data-export') });

/** One device refreshes about every 15 min; keyed by session so shared mobile IPs don't collide. */
const refreshLimiter = limiter({
  windowMinutes: 15,
  limit: 30,
  key: (req) => {
    const sid = String(req.body?.refreshToken || '').split('.')[0].slice(0, 24);
    return sid ? `refresh:${sid}` : `refresh-ip:${ipKey(req)}`;
  },
});

function dailyLimitHandler(message) {
  return (req, res, _next, options) => {
    const { seconds } = retryMessage(req);
    res.setHeader('Retry-After', String(seconds));
    res.status(options.statusCode).json({ message, code: 'DAILY_LIMIT', retryAfter: seconds });
  };
}

/** Soft daily cap per user on top of the 15-minute burst limit. */
const uploadDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: Number(process.env.UPLOAD_DAILY_LIMIT) || 400,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: userKey('upload-day'),
  handler: dailyLimitHandler('Daily upload limit reached. Please try again tomorrow.'),
});

// Normal chats stay far below this; it only stops scripted spam.
const chatMessageLimiter = limiter({ windowMinutes: 1, limit: 40, key: userKey('chat-msg') });

/**
 * Behind Cloudflare -> nginx, req.ip is the Cloudflare edge. With TRUST_CLOUDFLARE=true
 * use CF-Connecting-IP instead. Only safe when the origin firewall accepts Cloudflare IPs only.
 */
function cloudflareClientIp(req, _res, next) {
  if (process.env.TRUST_CLOUDFLARE === 'true') {
    const real = String(req.headers['cf-connecting-ip'] || '').trim();
    if (real && /^[0-9a-f:.]+$/i.test(real)) {
      Object.defineProperty(req, 'ip', { value: real, configurable: true, enumerable: true });
    }
  }
  next();
}

function stripMongoOperators(value, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 12) return value;
  if (Array.isArray(value)) {
    value.forEach((item) => stripMongoOperators(item, depth + 1));
    return value;
  }
  for (const key of Object.keys(value)) {
    if (key.startsWith('$')) {
      delete value[key];
    } else {
      stripMongoOperators(value[key], depth + 1);
    }
  }
  return value;
}

/** Drop `$op` keys so bodies and query strings cannot inject Mongo operators. */
function sanitizeInput(req, _res, next) {
  if (req.body && typeof req.body === 'object') stripMongoOperators(req.body);
  // Express 5 re-parses req.query on every read, so pin the cleaned copy.
  const query = req.query;
  if (query && typeof query === 'object') {
    Object.defineProperty(req, 'query', {
      value: stripMongoOperators(query),
      writable: true,
      configurable: true,
      enumerable: true,
    });
  }
  next();
}

module.exports = {
  corsOptions,
  isAllowedOrigin,
  securityHeaders,
  globalLimiter,
  perUserLimiter,
  otpSendIpLimiter,
  otpSendPhoneLimiter,
  otpVerifyLimiter,
  adminLoginLimiter,
  aiLimiter,
  uploadLimiter,
  uploadDailyLimiter,
  chatMessageLimiter,
  clientErrorLimiter,
  twoFactorLimiter,
  refreshLimiter,
  dataExportLimiter,
  cloudflareClientIp,
  sanitizeInput,
};
