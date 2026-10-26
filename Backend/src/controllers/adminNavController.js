const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const Report = require('../models/Report');
const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const Message = require('../models/Message');
const ErrorEvent = require('../models/ErrorEvent');
const { hasScope } = require('../utils/adminScopes');

const SCAM_OPEN = { safetyFlag: 'scam_words', 'safetyReview.status': { $nin: ['dismissed', 'actioned'] } };

/** Sidebar badge per page: scope it needs and how many open items arrived after `since`. */
const QUEUES = {
  'pending-review': {
    scope: 'listings',
    count: (since) => Listing.countDocuments({
      status: 'pending',
      ...(since ? { $or: [{ heldAt: { $gt: since } }, { heldAt: null, createdAt: { $gt: since } }] } : {}),
    }),
  },
  support: {
    scope: 'users',
    count: async (since) => {
      const [tickets, deletions] = await Promise.all([
        SupportTicket.countDocuments({ status: 'open', ...(since ? { createdAt: { $gt: since } } : {}) }),
        User.countDocuments({
          deletionScheduledFor: { $ne: null },
          deletedAt: null,
          ...(since ? { deletionRequestedAt: { $gt: since } } : {}),
        }),
      ]);
      return tickets + deletions;
    },
  },
  'shop-verification': {
    scope: 'shops',
    count: (since) => Shop.countDocuments({
      verificationStatus: 'pending',
      ...(since ? { verificationSubmittedAt: { $gt: since } } : {}),
    }),
  },
  reports: {
    scope: 'reports',
    count: (since) => Report.countDocuments({ status: 'pending', ...(since ? { createdAt: { $gt: since } } : {}) }),
  },
  'scam-monitor': {
    scope: 'moderation',
    count: (since) => Message.countDocuments({ ...SCAM_OPEN, ...(since ? { createdAt: { $gt: since } } : {}) }),
  },
  'error-log': {
    scope: 'errors',
    count: (since) => ErrorEvent.countDocuments({
      status: 'open',
      severity: { $in: ['fatal', 'error'] },
      ...(since ? { createdAt: { $gt: since } } : {}),
    }),
  },
};

function readSince(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(Math.min(ms, Date.now()));
}

/** GET /auth/admin/nav-counts?pending-review=<ms>&reports=<ms>... (ms = when the admin last opened that page). */
async function getNavCounts(req, res, next) {
  try {
    const keys = Object.keys(QUEUES).filter((key) => hasScope(req.user.role, QUEUES[key].scope));
    const values = await Promise.all(keys.map((key) => QUEUES[key].count(readSince(req.query[key]))));
    const counts = {};
    keys.forEach((key, index) => {
      counts[key] = values[index];
    });
    res.json({ counts, now: Date.now() });
  } catch (error) {
    next(error);
  }
}

module.exports = { getNavCounts };
