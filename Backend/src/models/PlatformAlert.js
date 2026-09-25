const mongoose = require('mongoose');

const platformAlertSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'signup_spike',
        'signup_crash',
        'transaction_spike',
        'transaction_crash',
        'dau_spike',
        'dau_crash',
      ],
      required: true,
      index: true,
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    metricValue: { type: Number, default: 0 },
    baselineValue: { type: Number, default: 0 },
    changePct: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
      index: true,
    },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'platform_alerts' }
);

platformAlertSchema.index({ type: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('PlatformAlert', platformAlertSchema);
