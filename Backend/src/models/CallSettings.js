const mongoose = require('mongoose');

const failureReportSchema = new mongoose.Schema(
  {
    user: { type: String, required: true },
    at: { type: Date, default: Date.now },
    reason: { type: String, default: '' },
  },
  { _id: false }
);

const agoraAccountSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true, trim: true },
    appId: { type: String, required: true, trim: true },
    // Sealed with utils/fieldCrypto; never sent to the admin panel.
    appCertificate: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    // Agora's free tier is 10,000 minutes a month; every person in a call counts.
    monthlyLimitMinutes: { type: Number, default: 10000, min: 0 },
    usageMonth: { type: String, default: '' },
    usedMinutes: { type: Number, default: 0, min: 0 },
    callCount: { type: Number, default: 0, min: 0 },
    blockedUntil: { type: Date, default: null },
    lastError: { type: String, default: '' },
    failureReports: { type: [failureReportSchema], default: [] },
  },
  { _id: false }
);

const callSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    // On: when an account reaches its monthly limit or Agora rejects it, the next one is used.
    // Off: only the first enabled account is ever used.
    autoSwitch: { type: Boolean, default: true },
    // Talk time each user gets per Nepal day; 0 means no limit.
    dailyUserMinutes: { type: Number, default: 10, min: 0 },
    accounts: { type: [agoraAccountSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CallSettings', callSettingsSchema);
