const mongoose = require('mongoose');

/**
 * One row per user, Nepal day and slot (morning / afternoon / evening / night).
 * The unique index is the claim: a slot is processed at most once even with several API instances.
 */
const digestLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    day: { type: String, required: true },
    slot: { type: String, enum: ['morning', 'afternoon', 'evening', 'night'], required: true },
    /** What was sent, or 'skip' when nothing was worth a push. */
    kind: { type: String, default: 'skip' },
    template: { type: Number, default: -1 },
    reason: { type: String, default: '' },
    notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null },
    sent: { type: Boolean, default: false },
    /** Seller totals at send time, so the next summary can say "+N since last time". */
    views: { type: Number, default: null },
    saves: { type: Number, default: null },
  },
  { timestamps: true, collection: 'digest_logs' }
);

digestLogSchema.index({ user: 1, day: 1, slot: 1 }, { unique: true });
digestLogSchema.index({ user: 1, kind: 1, createdAt: -1 });
digestLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });

module.exports = mongoose.model('DigestLog', digestLogSchema);
