const mongoose = require('mongoose');
const User = require('../models/User');
const Report = require('../models/Report');

/** Distinct reporters needed within the lookback window to auto-restrict */
const REPORT_THRESHOLD = 3;
/** Count reports created within this many days */
const REPORT_LOOKBACK_DAYS = 14;
/** Temporary chat restriction length */
const RESTRICT_DAYS = 7;

const ADMIN_ROLES = new Set(['admin', 'super_admin', 'moderator', 'support']);

function toObjectId(id) {
  if (id instanceof mongoose.Types.ObjectId) return id;
  try {
    return new mongoose.Types.ObjectId(String(id));
  } catch {
    return null;
  }
}

function isChatRestricted(user) {
  if (!user) return false;
  if (user.status === 'suspended') return true;
  if (!user.chatRestrictedUntil) return false;
  return new Date(user.chatRestrictedUntil).getTime() > Date.now();
}

function chatRestrictionPayload(user) {
  if (!isChatRestricted(user)) {
    return { restricted: false };
  }
  const until =
    user.status === 'suspended'
      ? null
      : user.chatRestrictedUntil
        ? new Date(user.chatRestrictedUntil).toISOString()
        : null;
  return {
    restricted: true,
    until,
    reason:
      user.status === 'suspended'
        ? 'Your account is suspended.'
        : user.restrictionReason ||
          'Your chat access is temporarily restricted due to multiple user reports.',
    code: user.status === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'CHAT_RESTRICTED',
  };
}

async function applyTempChatRestriction(userId, reason) {
  const until = new Date(Date.now() + RESTRICT_DAYS * 24 * 60 * 60 * 1000);
  const user = await User.findById(userId);
  if (!user) return null;
  if (ADMIN_ROLES.has(user.role)) return null;

  // Extend if already restricted further out
  const currentUntil = user.chatRestrictedUntil
    ? new Date(user.chatRestrictedUntil).getTime()
    : 0;
  if (currentUntil > until.getTime()) {
    return user;
  }

  user.chatRestrictedUntil = until;
  user.restrictionReason =
    reason ||
    `Temporarily restricted from chat for ${RESTRICT_DAYS} days after multiple reports.`;
  await user.save();
  return user;
}

/**
 * After a new report: if enough distinct reporters, auto-restrict the reported user.
 */
async function maybeAutoRestrictFromReports(reportedUserId) {
  const oid = toObjectId(reportedUserId);
  if (!oid) return { restricted: false, reporterCount: 0 };

  const since = new Date(Date.now() - REPORT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const distinct = await Report.aggregate([
    {
      $match: {
        reportedUser: oid,
        createdAt: { $gte: since },
        status: { $in: ['pending', 'reviewed', 'resolved'] },
      },
    },
    { $group: { _id: '$reporter' } },
    { $count: 'reporters' },
  ]);

  const reporterCount = distinct[0]?.reporters || 0;
  if (reporterCount < REPORT_THRESHOLD) {
    return { restricted: false, reporterCount };
  }

  const user = await applyTempChatRestriction(
    oid,
    `Temporarily restricted from chat for ${RESTRICT_DAYS} days after ${reporterCount} user reports.`
  );

  return {
    restricted: Boolean(user && isChatRestricted(user)),
    reporterCount,
    until: user?.chatRestrictedUntil || null,
  };
}

module.exports = {
  isChatRestricted,
  chatRestrictionPayload,
  applyTempChatRestriction,
  maybeAutoRestrictFromReports,
  REPORT_THRESHOLD,
  RESTRICT_DAYS,
  REPORT_LOOKBACK_DAYS,
};
