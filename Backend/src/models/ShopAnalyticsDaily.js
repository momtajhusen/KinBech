const mongoose = require('mongoose');

const shopAnalyticsDailySchema = new mongoose.Schema(
  {
    shop: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shop',
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
    },
    profileViews: { type: Number, default: 0, min: 0 },
    listingViews: { type: Number, default: 0, min: 0 },
    inquiries: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: 'shop_analytics_daily' },
);

shopAnalyticsDailySchema.index({ shop: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('ShopAnalyticsDaily', shopAnalyticsDailySchema);
