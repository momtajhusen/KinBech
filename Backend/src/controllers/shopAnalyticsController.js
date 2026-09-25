const Shop = require('../models/Shop');
const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const {
  parsePeriod,
  getShopAnalyticsSummary,
  getShopSalesSeries,
  buildPerformanceReport,
  getShopCustomerAndCategoryInsights,
} = require('../utils/shopAnalytics');

async function getOwnedShop(userId) {
  return Shop.findOne({ owner: userId, status: 'active' });
}

async function getMyShopAnalytics(req, res, next) {
  try {
    const shop = await getOwnedShop(req.user._id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const period = parsePeriod(req.query.period);
    const shopId = shop._id;
    const chartDays = period.chartDays;
    const metricDays = period.metricDays;

    const [summaryData, salesSeries, listings, inquiryAgg] = await Promise.all([
      getShopAnalyticsSummary(shopId, chartDays),
      getShopSalesSeries(shopId, chartDays),
      Listing.find({ shopId, sellerType: 'shop' })
        .select('title photos price currency status views category location createdAt updatedAt soldAt')
        .sort({ views: -1, updatedAt: -1 })
        .limit(100)
        .lean(),
      Chat.aggregate([
        {
          $lookup: {
            from: 'listings',
            localField: 'listing',
            foreignField: '_id',
            as: 'listingDoc',
          },
        },
        { $unwind: '$listingDoc' },
        { $match: { 'listingDoc.shopId': shopId } },
        { $group: { _id: '$listing', count: { $sum: 1 } } },
      ]),
    ]);

    const inquiryByListing = {};
    inquiryAgg.forEach((row) => {
      inquiryByListing[String(row._id)] = row.count;
    });

    const listingIds = listings.map((l) => l._id);
    const totalInquiriesAllTime = inquiryAgg.reduce((sum, row) => sum + row.count, 0);

    const metricSince = new Date();
    metricSince.setUTCHours(0, 0, 0, 0);
    metricSince.setUTCDate(metricSince.getUTCDate() - (metricDays - 1));

    let periodInquiries = summaryData.chart
      .filter((row) => row.date >= metricSince.toISOString().slice(0, 10))
      .reduce((sum, row) => sum + row.inquiries, 0);

    if (periodInquiries === 0 && listingIds.length) {
      periodInquiries = await Chat.countDocuments({
        listing: { $in: listingIds },
        createdAt: { $gte: metricSince },
      });
    }

    const periodSales = salesSeries.chart
      .filter((row) => row.date >= metricSince.toISOString().slice(0, 10))
      .reduce(
        (acc, row) => ({
          salesCount: acc.salesCount + row.salesCount,
          salesRevenue: acc.salesRevenue + row.salesRevenue,
        }),
        { salesCount: 0, salesRevenue: 0 },
      );

    const periodViews = summaryData.chart
      .filter((row) => row.date >= metricSince.toISOString().slice(0, 10))
      .reduce(
        (acc, row) => ({
          profileViews: acc.profileViews + row.profileViews,
          listingViews: acc.listingViews + row.listingViews,
        }),
        { profileViews: 0, listingViews: 0 },
      );

    const activeListings = listings.filter((l) => l.status === 'active').length;
    const soldListings = listings.filter((l) => l.status === 'sold').length;
    const totalListingViews = listings.reduce((sum, l) => sum + (Number(l.views) || 0), 0);

    const salesToViewRate =
      periodViews.listingViews > 0
        ? Math.round((periodSales.salesCount / periodViews.listingViews) * 1000) / 10
        : 0;

    const inquiryRate =
      periodViews.listingViews > 0
        ? Math.round((periodInquiries / periodViews.listingViews) * 1000) / 10
        : 0;

    const avgOrderValue =
      periodSales.salesCount > 0
        ? Math.round(periodSales.salesRevenue / periodSales.salesCount)
        : 0;

    const { bestItems, worstItems, conversionReport } = buildPerformanceReport(
      listings,
      inquiryByListing,
    );

    const { customerInsights, categoryPerformance } = await getShopCustomerAndCategoryInsights(
      shopId,
      shop.owner || req.user._id,
      metricSince,
      listings,
      inquiryByListing,
    );

    const topProducts = bestItems.slice(0, 8);

    // Merge activity + sales into one chart for the UI
    const salesByDate = new Map(salesSeries.chart.map((r) => [r.date, r]));
    const chart = summaryData.chart.map((row) => {
      const sale = salesByDate.get(row.date) || { salesCount: 0, salesRevenue: 0 };
      return {
        date: row.date,
        profileViews: row.profileViews,
        listingViews: row.listingViews,
        inquiries: row.inquiries,
        salesCount: sale.salesCount,
        salesRevenue: sale.salesRevenue,
      };
    });

    res.json({
      shop: {
        id: shop._id,
        name: shop.name,
        logo: shop.logo,
        category: shop.category,
        isVerified: shop.isVerified,
        ratingAverage: shop.ratingAverage,
        reviewCount: shop.reviewCount,
        profileViews: shop.profileViews ?? 0,
      },
      period: period.key,
      periodDays: metricDays,
      summary: {
        profileViews: periodViews.profileViews,
        listingViews: periodViews.listingViews || totalListingViews,
        totalInquiries: periodInquiries,
        totalInquiriesAllTime,
        activeListings,
        soldListings,
        totalListingViews,
        conversionRate: inquiryRate,
        salesCount: periodSales.salesCount,
        salesRevenue: periodSales.salesRevenue,
        avgOrderValue,
        salesConversionRate: salesToViewRate,
      },
      salesSummary: {
        period: period.key,
        units: periodSales.salesCount,
        revenue: periodSales.salesRevenue,
        avgOrderValue,
        currency: 'NPR',
      },
      chart,
      salesChart: salesSeries.chart,
      topProducts,
      bestItems,
      worstItems,
      conversionReport,
      customerInsights,
      categoryPerformance,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyShopAnalytics,
};
