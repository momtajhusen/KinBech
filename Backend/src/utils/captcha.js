const crypto = require('crypto');
const CaptchaTicket = require('../models/CaptchaTicket');
const { getStorefrontBaseUrl } = require('./storefront');

/**
 * Cloudflare Turnstile, shown only when traffic looks risky (UX rule: 99% never see it).
 * Off unless TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY are both set.
 *
 * Risk signals (in memory, per process):
 * - admin login: 3+ failed attempts from the IP or for the email in 15 min
 * - OTP send: 3+ requests for the phone, or 15+ from the IP (shared mobile IPs), in 1 hour
 */

const TICKET_TTL_MS = 10 * 60 * 1000;
const RULES = {
  'admin-login': { windowMs: 15 * 60 * 1000, limits: { ip: 3, subject: 3 } },
  otp: { windowMs: 60 * 60 * 1000, limits: { ip: 15, subject: 3 } },
};

const hits = new Map();

function captchaEnabled() {
  return Boolean(process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY);
}

function bucketKey(purpose, kind, value) {
  return `${purpose}:${kind}:${value}`;
}

function countHits(key, windowMs) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((at) => now - at < windowMs);
  hits.set(key, list);
  return list.length;
}

function noteHit(purpose, kind, value) {
  if (!value) return;
  const key = bucketKey(purpose, kind, value);
  countHits(key, RULES[purpose].windowMs);
  hits.get(key).push(Date.now());
}

function isRisky(purpose, { ip, subject }) {
  const rule = RULES[purpose];
  const ipCount = ip ? countHits(bucketKey(purpose, 'ip', ip), rule.windowMs) : 0;
  const subjectCount = subject ? countHits(bucketKey(purpose, 'subject', subject), rule.windowMs) : 0;
  return ipCount >= rule.limits.ip || subjectCount >= rule.limits.subject;
}

// Drop idle buckets so the map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, list] of hits) {
    if (!list.length || now - list[list.length - 1] > 60 * 60 * 1000) hits.delete(key);
  }
}, 10 * 60 * 1000).unref();

/** true = human, false = rejected, null = Cloudflare unreachable (caller fails open). */
async function verifyTurnstile(token, ip) {
  if (!token) return false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: String(token),
        ...(ip ? { remoteip: ip } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Boolean(data.success);
  } catch {
    return null;
  }
}

async function createTicket(purpose, subject) {
  const ticket = crypto.randomBytes(18).toString('base64url');
  await CaptchaTicket.create({ ticket, purpose, subject, expiresAt: new Date(Date.now() + TICKET_TTL_MS) });
  return ticket;
}

/** Single use: a verified, unused ticket for the same purpose and subject. */
async function consumeTicket(ticket, purpose, subject) {
  if (!ticket) return false;
  const row = await CaptchaTicket.findOneAndUpdate(
    { ticket: String(ticket), purpose, subject, verifiedAt: { $ne: null }, usedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { usedAt: new Date() } }
  );
  return Boolean(row);
}

function clientIp(req) {
  return String(req.ip || '').replace(/^::ffff:/, '');
}

const SUBJECTS = {
  'admin-login': (req) => String(req.body?.email || '').trim().toLowerCase(),
  otp: (req) => String(req.body?.phone || '').replace(/\D/g, '').slice(-10),
};

/**
 * Express guard. Counts every attempt; once risky, the request needs a Turnstile token
 * (`captchaToken`, web) or a verified `captchaTicket` (app, see /auth/captcha/*).
 */
function captchaOnRisk(purpose, { countAttempts = true } = {}) {
  return async (req, res, next) => {
    if (!captchaEnabled()) return next();
    try {
      const ip = clientIp(req);
      const subject = SUBJECTS[purpose](req);
      const risky = isRisky(purpose, { ip, subject });
      if (countAttempts) {
        noteHit(purpose, 'ip', ip);
        noteHit(purpose, 'subject', subject);
      }
      if (!risky) return next();

      if (req.body?.captchaTicket && (await consumeTicket(req.body.captchaTicket, purpose, subject))) return next();
      if (req.body?.captchaToken) {
        const verdict = await verifyTurnstile(req.body.captchaToken, ip);
        if (verdict !== false) return next();
      }

      const ticket = await createTicket(purpose, subject);
      return res.status(428).json({
        message: 'Please confirm you are human to continue.',
        code: 'CAPTCHA_REQUIRED',
        siteKey: process.env.TURNSTILE_SITE_KEY,
        captchaTicket: ticket,
        verifyUrl: `${getStorefrontBaseUrl()}/human-check?ticket=${ticket}`,
      });
    } catch (error) {
      next(error);
    }
  };
}

/** Admin login failures feed the same risk counter (wrong password / 2FA code). */
function noteAdminLoginFailure(req) {
  noteHit('admin-login', 'ip', clientIp(req));
  noteHit('admin-login', 'subject', SUBJECTS['admin-login'](req));
}

/** Browser page posts the Turnstile token here to mark the app's ticket as verified. */
async function verifyTicket(req, res, next) {
  try {
    if (!captchaEnabled()) return res.json({ verified: true });
    const ticket = String(req.body?.ticket || '');
    const row = await CaptchaTicket.findOne({ ticket, usedAt: null, expiresAt: { $gt: new Date() } });
    if (!row) return res.status(410).json({ message: 'This check expired. Go back to the app and try again.', code: 'TICKET_EXPIRED' });
    const verdict = await verifyTurnstile(req.body?.token, clientIp(req));
    if (verdict === false) return res.status(400).json({ message: 'Verification failed. Please try again.', code: 'CAPTCHA_FAILED' });
    row.verifiedAt = new Date();
    await row.save();
    res.json({ verified: true });
  } catch (error) {
    next(error);
  }
}

function captchaConfig(_req, res) {
  res.json({ enabled: captchaEnabled(), siteKey: captchaEnabled() ? process.env.TURNSTILE_SITE_KEY : '' });
}

module.exports = { captchaEnabled, captchaOnRisk, noteAdminLoginFailure, verifyTicket, captchaConfig };
