const mongoose = require('mongoose');

const callUsageDailySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Nepal calendar day, YYYY-MM-DD.
    day: { type: String, required: true },
    seconds: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

callUsageDailySchema.index({ user: 1, day: 1 }, { unique: true });
callUsageDailySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 45 });

module.exports = mongoose.model('CallUsageDaily', callUsageDailySchema);
