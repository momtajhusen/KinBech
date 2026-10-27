const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'platform', unique: true },
    listingExpiryDays: { type: Number, default: 0, min: 0 },
    minListingPrice: { type: Number, default: 0, min: 0 },
    defaultCurrency: { type: String, default: 'NPR', trim: true },
    supportEmail: { type: String, default: 'support@kinbech.com', trim: true },
    /** New listings per seller per rolling 24 hours, by seller type. 0 = no limit. */
    individualDailyListings: { type: Number, default: 0, min: 0 },
    shopDailyListings: { type: Number, default: 0, min: 0 },
    /** Where sellers send plan payments: { esewa, khalti, ime, bank, note }. */
    subscriptionPayment: { type: mongoose.Schema.Types.Mixed, default: {} },
    /** Trust / auto-hide thresholds; missing keys fall back to utils/listingTrust DEFAULT_TRUST. */
    trust: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, collection: 'platform_settings' }
);

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);
