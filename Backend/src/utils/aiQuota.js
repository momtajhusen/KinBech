const AiUserUsage = require('../models/AiUserUsage');
const { getAiSettings } = require('./aiSettings');
const { raiseAlert } = require('./securityAlerts');

const NEPAL_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

function nepalDay(date = new Date()) {
  return new Date(date.getTime() + NEPAL_OFFSET_MS).toISOString().slice(0, 10);
}

function secondsUntilNepalMidnight() {
  const shifted = new Date(Date.now() + NEPAL_OFFSET_MS);
  const next = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + 1);
  return Math.max(60, Math.ceil((next - shifted.getTime()) / 1000));
}

async function limits() {
  const settings = await getAiSettings();
  return {
    perUser: Number.isFinite(settings.userDailyLimit) ? settings.userDailyLimit : 15,
    global: Number.isFinite(settings.globalDailyCap) ? settings.globalDailyCap : 500,
  };
}

async function usedToday(day = nepalDay()) {
  const [row] = await AiUserUsage.aggregate([
    { $match: { day } },
    { $group: { _id: null, total: { $sum: '$count' } } },
  ]);
  return row?.total || 0;
}

/**
 * Takes one AI call from today's allowance. Returns { ok, used, limit } or
 * { ok: false, status, body } with a friendly message.
 */
async function reserveAiCall(userId) {
  const day = nepalDay();
  const { perUser, global } = await limits();
  const retryAfter = secondsUntilNepalMidnight();

  if (global > 0 && (await usedToday(day)) >= global) {
    raiseAlert({
      type: 'ai_cost_cap',
      title: 'AI daily cost cap reached',
      message: `AI photo fill hit today's cap of ${global} calls. Raise it in AI Models if needed.`,
      metricValue: global,
    });
    return {
      ok: false,
      status: 429,
      body: { message: "Today's AI limit is used up. Please fill in the details yourself.", code: 'AI_DAILY_CAP', retryAfter },
    };
  }

  const limitReached = {
    ok: false,
    status: 429,
    body: {
      message: `AI limit reached today (${perUser} photos). You can still fill in the details yourself.`,
      code: 'AI_DAILY_LIMIT',
      retryAfter,
    },
  };
  if (perUser <= 0) return limitReached;

  try {
    const row = await AiUserUsage.findOneAndUpdate(
      { user: userId, day, count: { $lt: perUser } },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );
    return { ok: true, used: row.count, limit: perUser, day };
  } catch (error) {
    // The row exists but is at the limit, so the conditional upsert collides.
    if (error.code === 11000) return limitReached;
    throw error;
  }
}

/** Give the call back when the AI itself failed. */
function refundAiCall(userId, day) {
  return AiUserUsage.updateOne({ user: userId, day, count: { $gt: 0 } }, { $inc: { count: -1 } }).catch(() => {});
}

module.exports = { reserveAiCall, refundAiCall, usedToday, nepalDay };
