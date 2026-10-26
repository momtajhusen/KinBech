/**
 * Tester sandbox. Every request runs with an audience:
 *   public — anonymous or normal users: never see tester listings/shops/sellers.
 *   test   — tester accounts: see only tester data.
 *   all    — admins and background jobs: no filter.
 * Listing and Shop reads are filtered by `audiencePlugin`; User reads are not (auth and
 * login use them), so seller-facing user lookups call `sameAudienceUser` explicitly.
 */
const { AsyncLocalStorage } = require('async_hooks');
const jwt = require('jsonwebtoken');

const store = new AsyncLocalStorage();
const VIEWER_TTL_MS = 60 * 1000;
const viewers = new Map();

const PUBLIC_MATCH = Object.freeze({ isTest: { $ne: true } });
const TEST_MATCH = Object.freeze({ isTest: true });

function currentAudience() {
  return store.getStore()?.audience || 'all';
}

function isTestViewer() {
  return currentAudience() === 'test';
}

/** Mongo match for Listing/Shop docs visible to the current request, or null for admins/jobs. */
function audienceMatch() {
  const audience = currentAudience();
  if (audience === 'test') return { ...TEST_MATCH };
  if (audience === 'public') return { isTest: { $ne: true } };
  return null;
}

/** True when a user row (seller, chat peer) belongs to the current request's audience. */
function sameAudienceUser(user) {
  const audience = currentAudience();
  if (audience === 'all') return true;
  return Boolean(user?.isTester) === (audience === 'test');
}

function runAs(audience, fn) {
  return store.run({ audience }, fn);
}

async function viewerFlags(userId) {
  const key = String(userId);
  const hit = viewers.get(key);
  if (hit && Date.now() - hit.at < VIEWER_TTL_MS) return hit;
  const User = require('../models/User');
  const { isAdminRole } = require('./adminScopes');
  const user = await User.findById(userId).select('isTester role').lean();
  const flags = { at: Date.now(), tester: Boolean(user?.isTester), admin: isAdminRole(user?.role) };
  viewers.set(key, flags);
  if (viewers.size > 5000) viewers.delete(viewers.keys().next().value);
  return flags;
}

function forgetViewer(userId) {
  viewers.delete(String(userId));
}

async function audienceMiddleware(req, _res, next) {
  let audience = 'public';
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET);
      if (payload?.userId) {
        const flags = await viewerFlags(payload.userId);
        if (flags.admin) audience = 'all';
        else if (flags.tester) audience = 'test';
      }
    } catch {
      // Invalid/expired tokens browse as public; the route's own auth decides the rest.
    }
  }
  req.audience = audience;
  runAs(audience, next);
}

const READ_HOOKS = ['find', 'findOne', 'countDocuments', 'distinct', 'findOneAndUpdate'];

/** Adds the request audience to every Listing/Shop read, including populate. */
function audiencePlugin(schema) {
  schema.pre(READ_HOOKS, function applyAudience() {
    const match = audienceMatch();
    if (match && !this.getOptions().skipAudience) this.where(match);
  });
  schema.pre('aggregate', function applyAudience() {
    const match = audienceMatch();
    if (match && !this.options?.skipAudience) this.pipeline().unshift({ $match: match });
  });
}

module.exports = {
  PUBLIC_MATCH,
  TEST_MATCH,
  currentAudience,
  isTestViewer,
  audienceMatch,
  sameAudienceUser,
  runAs,
  forgetViewer,
  audienceMiddleware,
  audiencePlugin,
};
