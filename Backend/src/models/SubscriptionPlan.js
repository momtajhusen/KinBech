const mongoose = require('mongoose');

/**
 * A paid posting plan admins create in Admin → Subscriptions.
 * Daily limits: null = not part of this plan (platform default applies), 0 = no limit, N = N posts / 24 h.
 */
const subscriptionPlanSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    tagline: { type: String, default: '', trim: true, maxlength: 90 },
    /** One line under the limits on the app card; empty = the app writes it from the limits. */
    description: { type: String, default: '', trim: true, maxlength: 140 },
    /** Ionicons name for the card icon; empty = picked from the plan type. */
    icon: { type: String, default: '', trim: true, maxlength: 40 },
    /** Ribbon text when highlight is on; empty = "Most popular". */
    badge: { type: String, default: '', trim: true, maxlength: 24 },
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
