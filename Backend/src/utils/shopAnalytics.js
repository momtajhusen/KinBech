const Shop = require('../models/Shop');
const ShopAnalyticsDaily = require('../models/ShopAnalyticsDaily');

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function parsePeriodDays(period) {
  const map = { '7d': 7, '30d': 30, '90d': 90 };
  if (typeof period === 'string' && map[period]) return map[period];
  const n = Number(period);
  if (Number.isFinite(n) && n > 0 && n <= 365) return Math.floor(n);
  return 30;
}

async function recordShopMetric(shopId, field) {
  if (!shopId || !['profileViews', 'listingViews', 'inquiries'].includes(field)) {
    return;
  }

  const date = startOfUtcDay();
  await ShopAnalyticsDaily.findOneAndUpdate(
    { shop: shopId, date },
    { $inc: { [field]: 1 } },
    { upsert: true, setDefaultsOnInsert: true },
  );

  if (field === 'profileViews') {
    await Shop.updateOne({ _id: shopId }, { $inc: { profileViews: 1 } }).exec();
  }
}

async function getShopAnalyticsSummary(shopId, periodDays = 30) {
  const since = startOfUtcDay();
  since.setUTCDate(since.getUTCDate() - (periodDays - 1));

  const daily = await ShopAnalyticsDaily.find({
    shop: shopId,
    date: { $gte: since },
  })
    .sort({ date: 1 })
    .lean();

  const byDate = new Map(
    daily.map((row) => [row.date.toISOString().slice(0, 10), row]),
  );

  const chart = [];
  for (let i = 0; i < periodDays; i += 1) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    const row = byDate.get(key);
    chart.push({
      date: key,
      profileViews: row?.profileViews ?? 0,
      listingViews: row?.listingViews ?? 0,
      inquiries: row?.inquiries ?? 0,
    });
  }

  const totals = chart.reduce(
    (acc, row) => ({
      profileViews: acc.profileViews + row.profileViews,
      listingViews: acc.listingViews + row.listingViews,
      inquiries: acc.inquiries + row.inquiries,
    }),
    { profileViews: 0, listingViews: 0, inquiries: 0 },
  );

  return { chart, totals };
}

module.exports = {
  startOfUtcDay,
  parsePeriodDays,
  recordShopMetric,
  getShopAnalyticsSummary,
};
