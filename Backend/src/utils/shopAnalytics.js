const Shop = require('../models/Shop');
const ShopAnalyticsDaily = require('../models/ShopAnalyticsDaily');
const Listing = require('../models/Listing');

function startOfUtcDay(date = new Date()) {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** @returns {{ key: string, metricDays: number, chartDays: number, bucket: 'day'|'week'|'month' }} */
function parsePeriod(period) {
  const raw = String(period || 'monthly').toLowerCase();
  if (raw === 'daily' || raw === 'day' || raw === '1d') {
    return { key: 'daily', metricDays: 1, chartDays: 7, bucket: 'day' };
  }
  if (raw === 'weekly' || raw === 'week' || raw === '7d') {
    return { key: 'weekly', metricDays: 7, chartDays: 7, bucket: 'day' };
  }
  if (raw === 'monthly' || raw === 'month' || raw === '30d') {
    return { key: 'monthly', metricDays: 30, chartDays: 30, bucket: 'day' };
  }
  if (raw === '90d') {
    return { key: 'monthly', metricDays: 90, chartDays: 90, bucket: 'day' };
  }
  const n = Number(period);
  if (Number.isFinite(n) && n > 0 && n <= 365) {
    return { key: 'custom', metricDays: Math.floor(n), chartDays: Math.floor(n), bucket: 'day' };
  }
  return { key: 'monthly', metricDays: 30, chartDays: 30, bucket: 'day' };
}

/** Back-compat for callers expecting a day count */
function parsePeriodDays(period) {
  return parsePeriod(period).metricDays;
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

async function recordShopSale(shopId, revenue = 0) {
  if (!shopId) return;
  const date = startOfUtcDay();
  const amount = Math.max(0, Number(revenue) || 0);
  await ShopAnalyticsDaily.findOneAndUpdate(
    { shop: shopId, date },
    { $inc: { salesCount: 1, salesRevenue: amount } },
    { upsert: true, setDefaultsOnInsert: true },
  );
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
      salesCount: row?.salesCount ?? 0,
      salesRevenue: row?.salesRevenue ?? 0,
    });
  }

  const totals = chart.reduce(
    (acc, row) => ({
      profileViews: acc.profileViews + row.profileViews,
      listingViews: acc.listingViews + row.listingViews,
      inquiries: acc.inquiries + row.inquiries,
      salesCount: acc.salesCount + row.salesCount,
      salesRevenue: acc.salesRevenue + row.salesRevenue,
    }),
    { profileViews: 0, listingViews: 0, inquiries: 0, salesCount: 0, salesRevenue: 0 },
  );

  return { chart, totals };
}

/**
 * Build sales chart + period totals from sold listings (soldAt || updatedAt).
 * Merges with daily analytics so historical sales work without prior daily rows.
 */
async function getShopSalesSeries(shopId, chartDays = 30) {
  const since = startOfUtcDay();
  since.setUTCDate(since.getUTCDate() - (chartDays - 1));

  const [daily, soldListings] = await Promise.all([
    ShopAnalyticsDaily.find({ shop: shopId, date: { $gte: since } }).lean(),
    Listing.find({
      shopId,
      sellerType: 'shop',
      status: 'sold',
      $or: [
        { soldAt: { $gte: since } },
        { soldAt: null, updatedAt: { $gte: since } },
      ],
    })
      .select('price currency soldAt updatedAt')
      .lean(),
  ]);

  const byDate = new Map();
  for (let i = 0; i < chartDays; i += 1) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, { date: key, salesCount: 0, salesRevenue: 0 });
  }

  daily.forEach((row) => {
    const key = row.date.toISOString().slice(0, 10);
    const bucket = byDate.get(key);
    if (!bucket) return;
    bucket.salesCount = Math.max(bucket.salesCount, row.salesCount || 0);
    bucket.salesRevenue = Math.max(bucket.salesRevenue, row.salesRevenue || 0);
  });

  // Prefer listing-derived series when daily analytics under-count (backfill)
  const listingByDate = new Map();
  soldListings.forEach((l) => {
    const when = l.soldAt || l.updatedAt;
    if (!when) return;
    const key = new Date(when).toISOString().slice(0, 10);
    if (!byDate.has(key)) return;
    const cur = listingByDate.get(key) || { salesCount: 0, salesRevenue: 0 };
    cur.salesCount += 1;
    cur.salesRevenue += Number(l.price) || 0;
    listingByDate.set(key, cur);
  });

  listingByDate.forEach((val, key) => {
    const bucket = byDate.get(key);
    if (!bucket) return;
    if (val.salesCount > bucket.salesCount) {
      bucket.salesCount = val.salesCount;
      bucket.salesRevenue = val.salesRevenue;
    }
  });

  const chart = Array.from(byDate.values());
  const totals = chart.reduce(
    (acc, row) => ({
      salesCount: acc.salesCount + row.salesCount,
      salesRevenue: acc.salesRevenue + row.salesRevenue,
    }),
    { salesCount: 0, salesRevenue: 0 },
  );

  return { chart, totals };
}

function conversionPct(views, sold) {
  const v = Number(views) || 0;
  if (v <= 0) return 0;
  const sales = sold ? 1 : 0;
  return Math.round((sales / v) * 1000) / 10;
}

function performanceHint(item) {
  if (item.status === 'sold') {
    return item.views < 20
      ? 'Sold quickly — keep similar stock'
      : 'Sold — strong listing';
  }
  if (item.views >= 40 && item.inquiries === 0) {
    return 'High views, no chats — improve title/photos/price';
  }
  if (item.views >= 20 && item.inquiries > 0 && item.status !== 'sold') {
    return 'Getting interest — follow up buyers or adjust price';
  }
  if (item.views < 10) {
    return 'Low visibility — refresh photos or boost listing';
  }
  return 'Monitor — needs more traffic before judging';
}

/**
 * Top/bottom performers + views→sales conversion rows for shop listings.
 */
function buildPerformanceReport(listings, inquiryByListing) {
  const rows = listings.map((listing) => {
    const views = Number(listing.views) || 0;
    const sold = listing.status === 'sold';
    const inquiries = inquiryByListing[String(listing._id)] || 0;
    const revenue = sold ? Number(listing.price) || 0 : 0;
    const conversion = conversionPct(views, sold);
    const score =
      (sold ? 1000 : 0) +
      revenue / 100 +
      inquiries * 10 +
      Math.min(views, 200) * 0.1 +
      conversion;

    return {
      id: listing._id,
      title: listing.title,
      photos: listing.photos || [],
      price: listing.price,
      currency: listing.currency || 'NPR',
      status: listing.status,
      views,
      inquiries,
      sold,
      revenue,
      conversion,
      score,
      soldAt: listing.soldAt || (sold ? listing.updatedAt : null),
      category: listing.category,
      hint: '',
    };
  });

  rows.forEach((row) => {
    row.hint = performanceHint(row);
  });

  const bestItems = [...rows]
    .sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      if (b.conversion !== a.conversion) return b.conversion - a.conversion;
      if (b.inquiries !== a.inquiries) return b.inquiries - a.inquiries;
      return b.views - a.views;
    })
    .slice(0, 5);

  // Worst = active (or unsold) with traffic but poor conversion
  const worstPool = rows.filter((r) => !r.sold || r.conversion < 5);
  const worstItems = [...(worstPool.length ? worstPool : rows)]
    .sort((a, b) => {
      // Prefer high views + not sold
      const aBad = (!a.sold ? 1000 : 0) + a.views - a.conversion * 10 - a.inquiries * 5;
      const bBad = (!b.sold ? 1000 : 0) + b.views - b.conversion * 10 - b.inquiries * 5;
      return bBad - aBad;
    })
    .slice(0, 5);

  const conversionReport = [...rows]
    .filter((r) => r.views > 0 || r.sold)
    .sort((a, b) => {
      if (a.sold !== b.sold) return a.sold ? 1 : -1; // unsold first (need improvement)
      if (b.views !== a.views) return b.views - a.views;
      return a.conversion - b.conversion;
    })
    .slice(0, 15)
    .map(({ score, ...rest }) => rest);

  return {
    bestItems: bestItems.map(({ score, ...rest }) => rest),
    worstItems: worstItems.map(({ score, ...rest }) => rest),
    conversionReport,
  };
}

/** Nepal Standard Time hour (UTC+5:45) */
function nepalHour(date) {
  const ms = new Date(date).getTime() + (5 * 60 + 45) * 60 * 1000;
  return new Date(ms).getUTCHours();
}

function normalizeArea(loc) {
  const raw = String(loc || '').trim();
  if (!raw) return 'Unknown';
  const first = raw.split(',')[0].trim().replace(/\s+/g, ' ');
  if (!first || /^unknown$/i.test(first)) return 'Unknown';
  return first.slice(0, 48);
}

function hourLabel(h) {
  const period = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}${period}`;
}

function peakWindowLabel(hours) {
  if (!hours.length) return null;
  const top = [...hours].sort((a, b) => b.count - a.count).slice(0, 3);
  if (!top[0] || top[0].count === 0) return null;
  const start = Math.min(...top.map((h) => h.hour));
  const end = Math.max(...top.map((h) => h.hour));
  if (start === end) return `${hourLabel(start)}`;
  return `${hourLabel(start)}–${hourLabel((end + 1) % 24)}`;
}

/**
 * Customer areas (buyer locations) + active hours from shop chats/messages.
 * Category revenue/views/inquiries from shop listings.
 */
async function getShopCustomerAndCategoryInsights(shopId, ownerId, since, listings, inquiryByListing) {
  const Chat = require('../models/Chat');
  const Message = require('../models/Message');
  const User = require('../models/User');

  const listingIds = (listings || []).map((l) => l._id);
  const emptyCustomer = {
    topAreas: [],
    activeHours: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      label: hourLabel(hour),
      count: 0,
    })),
    peakWindow: null,
    totalCustomers: 0,
    totalMessages: 0,
  };

  let customerInsights = { ...emptyCustomer };

  if (listingIds.length) {
    const chats = await Chat.find({ listing: { $in: listingIds } })
      .select('listing participants createdAt lastMessageAt')
      .lean();

    const buyerIds = new Set();
    const chatIds = [];
    chats.forEach((chat) => {
      chatIds.push(chat._id);
      (chat.participants || []).forEach((pid) => {
        if (String(pid) !== String(ownerId)) buyerIds.add(String(pid));
      });
    });

    const buyers = buyerIds.size
      ? await User.find({ _id: { $in: Array.from(buyerIds) } })
          .select('location')
          .lean()
      : [];

    const locationByUser = {};
    buyers.forEach((u) => {
      locationByUser[String(u._id)] = normalizeArea(u.location);
    });

    // Area counts from unique buyers; fall back to listing meetup location
    const areaMap = new Map();
    const listingLocById = {};
    (listings || []).forEach((l) => {
      listingLocById[String(l._id)] = normalizeArea(l.location);
    });

    const seenBuyer = new Set();
    chats.forEach((chat) => {
      (chat.participants || []).forEach((pid) => {
        const id = String(pid);
        if (id === String(ownerId) || seenBuyer.has(id)) return;
        seenBuyer.add(id);
        let area = locationByUser[id];
        if (!area || area === 'Unknown') {
          area = listingLocById[String(chat.listing)] || 'Unknown';
        }
        const cur = areaMap.get(area) || { area, customers: 0 };
        cur.customers += 1;
        areaMap.set(area, cur);
      });
    });

    const topAreas = Array.from(areaMap.values())
      .sort((a, b) => b.customers - a.customers)
      .slice(0, 8)
      .map((row) => ({
        area: row.area,
        customers: row.customers,
        share:
          seenBuyer.size > 0
            ? Math.round((row.customers / seenBuyer.size) * 1000) / 10
            : 0,
      }));

    // Active hours from buyer messages in period (fallback: chat createdAt)
    const hourCounts = Array.from({ length: 24 }, () => 0);
    let totalMessages = 0;

    if (chatIds.length) {
      const msgMatch = {
        chat: { $in: chatIds },
        sender: { $ne: ownerId },
      };
      if (since) msgMatch.createdAt = { $gte: since };

      const messages = await Message.find(msgMatch).select('createdAt').limit(5000).lean();
      if (messages.length) {
        messages.forEach((m) => {
          hourCounts[nepalHour(m.createdAt)] += 1;
          totalMessages += 1;
        });
      } else {
        chats.forEach((c) => {
          const when = c.lastMessageAt || c.createdAt;
          if (!when) return;
          if (since && new Date(when) < since) return;
          hourCounts[nepalHour(when)] += 1;
          totalMessages += 1;
        });
      }
    }

    const activeHours = hourCounts.map((count, hour) => ({
      hour,
      label: hourLabel(hour),
      count,
    }));

    customerInsights = {
      topAreas,
      activeHours,
      peakWindow: peakWindowLabel(activeHours),
      totalCustomers: seenBuyer.size,
      totalMessages,
    };
  }

  // Category performance from listings
  const catMap = new Map();
  (listings || []).forEach((l) => {
    const cat = String(l.category || 'Other').trim() || 'Other';
    const cur = catMap.get(cat) || {
      category: cat,
      listings: 0,
      active: 0,
      sold: 0,
      views: 0,
      inquiries: 0,
      revenue: 0,
    };
    cur.listings += 1;
    if (l.status === 'active') cur.active += 1;
    if (l.status === 'sold') {
      cur.sold += 1;
      cur.revenue += Number(l.price) || 0;
    }
    cur.views += Number(l.views) || 0;
    cur.inquiries += inquiryByListing?.[String(l._id)] || 0;
    catMap.set(cat, cur);
  });

  const totalRevenue = Array.from(catMap.values()).reduce((s, c) => s + c.revenue, 0);
  const categoryPerformance = Array.from(catMap.values())
    .map((c) => ({
      ...c,
      share: totalRevenue > 0 ? Math.round((c.revenue / totalRevenue) * 1000) / 10 : 0,
      conversion:
        c.views > 0 ? Math.round((c.sold / c.views) * 1000) / 10 : 0,
    }))
    .sort((a, b) => {
      if (b.revenue !== a.revenue) return b.revenue - a.revenue;
      if (b.sold !== a.sold) return b.sold - a.sold;
      return b.views - a.views;
    });

  return { customerInsights, categoryPerformance };
}

module.exports = {
  startOfUtcDay,
  parsePeriod,
  parsePeriodDays,
  recordShopMetric,
  recordShopSale,
  getShopAnalyticsSummary,
  getShopSalesSeries,
  buildPerformanceReport,
  getShopCustomerAndCategoryInsights,
};
