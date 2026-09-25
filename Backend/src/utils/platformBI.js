const User = require('../models/User');
const Listing = require('../models/Listing');
const Notification = require('../models/Notification');
const PlatformAlert = require('../models/PlatformAlert');

const ADMIN_ROLES = ['admin', 'super_admin', 'moderator', 'support'];
const ACTIVE_TOUCH_THROTTLE_MS = 5 * 60 * 1000;

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function dayKey(date) {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/** Fire-and-forget: update lastActiveAt at most every 5 minutes */
function touchLastActive(user) {
  if (!user?._id) return;
  const last = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
  if (Date.now() - last < ACTIVE_TOUCH_THROTTLE_MS) return;
  User.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date() } }).catch(() => {});
  user.lastActiveAt = new Date();
}

async function countByDay(model, matchExtra, dateField, since, until) {
  const rows = await model.aggregate([
    {
      $match: {
        ...matchExtra,
        [dateField]: { $gte: since, $lt: until },
      },
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: `$${dateField}`, timezone: 'UTC' },
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const map = {};
  rows.forEach((r) => {
    map[r._id] = r.count;
  });
  return map;
}

function seriesLastNDays(dayMap, days) {
  const out = [];
  const today = startOfUtcDay();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today.getTime() - i * 86400000);
    const key = dayKey(d);
    out.push({ date: key, count: dayMap[key] || 0 });
  }
  return out;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Live BI snapshot for admin dashboard.
 */
async function computeLiveMetrics() {
  const today = startOfUtcDay();
  const tomorrow = new Date(today.getTime() + 86400000);
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);
  const eightDaysAgo = new Date(today.getTime() - 8 * 86400000);

  const [
    totalUsers,
    activeListings,
    dau,
    signupsToday,
    signupsYesterday,
    soldToday,
    soldYesterday,
    newListingsToday,
    topCategories,
    signupDayMap,
    soldDayMap,
  ] = await Promise.all([
    User.countDocuments({ role: 'user' }),
    Listing.countDocuments({ status: 'active' }),
    User.countDocuments({
      role: 'user',
      lastActiveAt: { $gte: today },
    }),
    User.countDocuments({ role: 'user', createdAt: { $gte: today, $lt: tomorrow } }),
    User.countDocuments({ role: 'user', createdAt: { $gte: yesterday, $lt: today } }),
    Listing.countDocuments({ status: 'sold', updatedAt: { $gte: today, $lt: tomorrow } }),
    Listing.countDocuments({ status: 'sold', updatedAt: { $gte: yesterday, $lt: today } }),
    Listing.countDocuments({ createdAt: { $gte: today, $lt: tomorrow } }),
    Listing.aggregate([
      {
        $match: {
          createdAt: { $gte: weekAgo },
          status: { $in: ['active', 'sold', 'pending'] },
        },
      },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 },
    ]),
    countByDay(User, { role: 'user' }, 'createdAt', eightDaysAgo, tomorrow),
    countByDay(Listing, { status: 'sold' }, 'updatedAt', eightDaysAgo, tomorrow),
  ]);

  const signupsSeries = seriesLastNDays(signupDayMap, 7);
  const transactionsSeries = seriesLastNDays(soldDayMap, 7);
  // baseline = avg of previous 6 complete days (exclude today)
  const signupBaseline = mean(signupsSeries.slice(0, -1).map((d) => d.count));
  const txBaseline = mean(transactionsSeries.slice(0, -1).map((d) => d.count));

  const pct = (todayVal, prev) => {
    if (!prev) return todayVal > 0 ? 100 : 0;
    return Math.round(((todayVal - prev) / prev) * 1000) / 10;
  };

  return {
    generatedAt: new Date().toISOString(),
    totalUsers,
    activeListings,
    dau,
    signupsToday,
    signupsYesterday,
    signupsChangePct: pct(signupsToday, signupsYesterday),
    transactionsToday: soldToday,
    transactionsYesterday: soldYesterday,
    transactionsChangePct: pct(soldToday, soldYesterday),
    newListingsToday,
    topCategories: topCategories.map((c) => ({
      category: c._id || 'Other',
      count: c.count,
    })),
    signupsSeries,
    transactionsSeries,
    baselines: {
      signups: Math.round(signupBaseline * 10) / 10,
      transactions: Math.round(txBaseline * 10) / 10,
    },
  };
}

async function notifyAdmins({ title, body, route = 'dashboard' }) {
  const admins = await User.find({ role: { $in: ADMIN_ROLES } })
    .select('_id')
    .lean();
  if (!admins.length) return 0;

  const docs = admins.map((a) => ({
    user: a._id,
    type: 'system',
    title,
    body,
    message: body,
    icon: 'warning-outline',
    unread: true,
    route,
    deliveryMethod: 'both',
  }));
  await Notification.insertMany(docs);
  return docs.length;
}

/**
 * Compare today vs rolling baseline; open alerts + notify admins (deduped 6h).
 */
async function detectAndAlertAnomalies(live) {
  const checks = [
    {
      type: 'signup_spike',
      today: live.signupsToday,
      baseline: live.baselines.signups,
      spike: true,
      label: 'Sign-ups',
    },
    {
      type: 'signup_crash',
      today: live.signupsToday,
      baseline: live.baselines.signups,
      spike: false,
      label: 'Sign-ups',
    },
    {
      type: 'transaction_spike',
      today: live.transactionsToday,
      baseline: live.baselines.transactions,
      spike: true,
      label: 'Transactions (sold)',
    },
    {
      type: 'transaction_crash',
      today: live.transactionsToday,
      baseline: live.baselines.transactions,
      spike: false,
      label: 'Transactions (sold)',
    },
  ];

  const since = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const opened = [];

  for (const check of checks) {
    const baseline = Number(check.baseline) || 0;
    const today = Number(check.today) || 0;
    if (baseline < 3 && today < 5) continue; // not enough signal

    let hit = false;
    let changePct = 0;
    if (check.spike) {
      hit = today >= Math.max(5, baseline * 2.5);
      changePct = baseline ? ((today - baseline) / baseline) * 100 : 100;
    } else {
      hit = baseline >= 5 && today <= baseline * 0.35;
      changePct = baseline ? ((today - baseline) / baseline) * 100 : 0;
    }
    if (!hit) continue;

    const existing = await PlatformAlert.findOne({
      type: check.type,
      status: { $in: ['open', 'acknowledged'] },
      createdAt: { $gte: since },
    });
    if (existing) {
      opened.push(existing);
      continue;
    }

    const direction = check.spike ? 'spike' : 'drop';
    const title = `${check.label} ${direction} detected`;
    const message = `${check.label} today = ${today} vs ~${baseline.toFixed(1)}/day baseline (${changePct >= 0 ? '+' : ''}${changePct.toFixed(0)}%).`;

    const alert = await PlatformAlert.create({
      type: check.type,
      title,
      message,
      metricValue: today,
      baselineValue: baseline,
      changePct: Math.round(changePct * 10) / 10,
      status: 'open',
      notifiedAt: new Date(),
    });

    await notifyAdmins({
      title: `⚠ ${title}`,
      body: message,
      route: 'dashboard',
    });

    opened.push(alert);
  }

  const openAlerts = await PlatformAlert.find({ status: { $in: ['open', 'acknowledged'] } })
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return openAlerts.map((a) => ({
    id: String(a._id),
    type: a.type,
    title: a.title,
    message: a.message,
    metricValue: a.metricValue,
    baselineValue: a.baselineValue,
    changePct: a.changePct,
    status: a.status,
    createdAt: a.createdAt,
  }));
}

module.exports = {
  touchLastActive,
  computeLiveMetrics,
  detectAndAlertAnomalies,
  notifyAdmins,
  startOfUtcDay,
};
