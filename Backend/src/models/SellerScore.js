const mongoose = require('mongoose');

/** Nightly seller trust score (utils/sellerScore). One row per seller; admins see the breakdown. */
const sellerScoreSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    sellerType: { type: String, enum: ['individual', 'shop'], default: 'individual', index: true },
    score: { type: Number, default: 50, index: true },
    rawScore: { type: Number, default: 50 },
    confidence: { type: Number, default: 0 },
    tier: { type: String, default: 'new', index: true },
    pendingTier: { type: String, default: '' },
    tierStreak: { type: Number, default: 0 },
    parts: { type: mongoose.Schema.Types.Mixed, default: {} },
    signals: { type: mongoose.Schema.Types.Mixed, default: {} },
    reasons: [{ type: String }],
    override: {
      score: { type: Number, default: null },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      note: { type: String, default: '' },
      at: { type: Date, default: null },
    },
    computedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'seller_scores' }
);

module.exports = mongoose.model('SellerScore', sellerScoreSchema);
