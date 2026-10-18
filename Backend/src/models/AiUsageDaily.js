const mongoose = require('mongoose');

const aiUsageDailySchema = new mongoose.Schema(
  {
    // Calendar day in Pacific time, which is when Gemini resets daily quotas.
    day: { type: String, required: true, index: true },
    model: { type: String, required: true },
    success: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    quotaHits: { type: Number, default: 0 },
    lastError: { type: String, default: '' },
    lastErrorAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

aiUsageDailySchema.index({ day: 1, model: 1 }, { unique: true });

module.exports = mongoose.model('AiUsageDaily', aiUsageDailySchema);
