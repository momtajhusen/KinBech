const mongoose = require('mongoose');

/** AI photo-fill calls per user per Nepal calendar day (quota + cost cap). */
const aiUserUsageSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true, index: true },
    count: { type: Number, default: 0 },
  },
  { timestamps: true, collection: 'ai_user_usage' }
);

aiUserUsageSchema.index({ user: 1, day: 1 }, { unique: true });
aiUserUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

module.exports = mongoose.model('AiUserUsage', aiUserUsageSchema);
