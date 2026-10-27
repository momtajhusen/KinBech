const mongoose = require('mongoose');

/**
 * A paid posting plan admins create in Admin → Subscriptions.
 * Daily limits: null = not part of this plan (platform default applies), 0 = no limit, N = N posts / 24 h.
 */
const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    tagline: { type: String, default: '', trim: true, maxlength: 90 },
    price: { type: Number, required: true, min: 0 },
    durationDays: { type: Number, required: true, min: 1, max: 366 },
    individualDailyListings: { type: Number, default: null, min: 0 },
    shopDailyListings: { type: Number, default: null, min: 0 },
    features: [{ type: String, trim: true, maxlength: 80 }],
    highlight: { type: Boolean, default: false },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('SubscriptionPlan', subscriptionPlanSchema);
