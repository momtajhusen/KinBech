const Shop = require('../models/Shop');
const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const { parsePeriodDays, getShopAnalyticsSummary } = require('../utils/shopAnalytics');

async function getOwnedShop(userId) {
  return Shop.findOne({ owner: userId, status: 'active' });
}

async function getMyShopAnalytics(req, res, next) {
  try {
    const shop = await getOwnedShop(req.user._id);
    if (!shop) {
      return res.status(404).json({ message: 'Shop not found' });
    }

    const periodDays = parsePeriodDays(req.query.period);
    const shopId = shop._id;

    const [summaryData, listings, inquiryAgg] = await Promise.all([
      getShopAnalyticsSummary(shopId, periodDays),
      Listing.find({ shopId, sellerType: 'shop' })
        .select('title photos price currency status views category createdAt updatedAt')
        .sort({ views: -1, updatedAt: -1 })
        .limit(50)
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

    let periodInquiries = summaryData.totals.inquiries;
    if (periodInquiries === 0 && listingIds.length) {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - periodDays);
      periodInquiries = await Chat.countDocuments({
        listing: { $in: listingIds },
        createdAt: { $gte: since },
      });
    }

    const activeListings = listings.filter((l) => l.status === 'active').length;
    const soldListings = listings.filter((l) => l.status === 'sold').length;
    const totalListingViews = listings.reduce((sum, l) => sum + (Number(l.views) || 0), 0);

    const topProducts = listings
      .map((listing) => ({
        id: listing._id,
        title: listing.title,
        photos: listing.photos || [],
        price: listing.price,
        currency: listing.currency,
        status: listing.status,
        views: Number(listing.views) || 0,
        inquiries: inquiryByListing[String(listing._id)] || 0,
        category: listing.category,
        updatedAt: listing.updatedAt,
      }))
      .sort((a, b) => {
        if (a.status === 'sold' && b.status !== 'sold') return -1;
        if (b.status === 'sold' && a.status !== 'sold') return 1;
        if (b.inquiries !== a.inquiries) return b.inquiries - a.inquiries;
        return b.views - a.views;
      })
      .slice(0, 8);

    const conversionRate =
      summaryData.totals.listingViews > 0
        ? Math.round((periodInquiries / summaryData.totals.listingViews) * 1000) / 10
        : 0;

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
      periodDays,
      summary: {
        profileViews: summaryData.totals.profileViews,
        listingViews: summaryData.totals.listingViews || totalListingViews,
        totalInquiries: periodInquiries,
        totalInquiriesAllTime,
        activeListings,
        soldListings,
        totalListingViews,
        conversionRate,
      },
      chart: summaryData.chart,
      topProducts,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMyShopAnalytics,
};
