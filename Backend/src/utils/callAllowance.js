const CallUsageDaily = require('../models/CallUsageDaily');
const User = require('../models/User');
const { nepalDay } = require('./aiQuota');
const { isAdminRole } = require('./adminScopes');
const { getCallSettings } = require('./callSettings');

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;
const DEFAULT_DAILY_MINUTES = 10;

function nextNepalMidnight() {
  const shifted = new Date(Date.now() + NEPAL_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1) - NEPAL_OFFSET_MS);
}

async function dailyLimitMinutes() {
  const settings = await getCallSettings();
  const value = Number(settings.dailyUserMinutes);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_DAILY_MINUTES;
}

/**
 * Talk time left today for one person. Staff accounts and a 0 limit are unlimited
 * (`remainingSeconds: null`).
 */
async function callAllowanceFor(user) {
  const limitMinutes = await dailyLimitMinutes();
  const resetsAt = nextNepalMidnight();
  if (!user || isAdminRole(user.role) || limitMinutes === 0) {
    return { unlimited: true, limitMinutes, usedSeconds: 0, remainingSeconds: null, resetsAt };
  }
  const row = await CallUsageDaily.findOne({ user: user._id, day: nepalDay() }).select('seconds').lean();
  const usedSeconds = Math.round(row?.seconds || 0);
  return {
    unlimited: false,
    limitMinutes,
    usedSeconds,
    remainingSeconds: Math.max(0, limitMinutes * 60 - usedSeconds),
    resetsAt,
  };
}

/** Adds answered talk time to each non-staff person. Calls with KinBech Support are free. */
async function addCallSeconds(userIds, seconds) {
  const total = Math.round(Number(seconds) || 0);
  if (!(total > 0) || !userIds?.length) return;
  try {
    const people = await User.find({ _id: { $in: userIds } }).select('role').lean();
    if (people.some((person) => isAdminRole(person.role))) return;
    const day = nepalDay();
    await CallUsageDaily.bulkWrite(
      people.map((person) => ({
        updateOne: {
          filter: { user: person._id, day },
          update: { $inc: { seconds: total } },
          upsert: true,
        },
      }))
    );
  } catch (error) {
    console.warn('[calls] could not record daily call time:', error.message);
  }
}

module.exports = { addCallSeconds, callAllowanceFor };
