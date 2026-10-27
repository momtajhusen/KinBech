const mongoose = require('mongoose');

/**
 * A seller paid KinBech outside the app (eSewa, Khalti, IME Pay or bank) and asks for a plan.
 * An admin checks the payment reference, then approves or rejects. The plan is copied in,
 * so later plan edits do not change what this seller paid for.
 *
 * Online payments (`gateway` set) start as `initiated` and are approved automatically once
 * the gateway confirms them, or marked `failed`.
 */
const subscriptionRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'SubscriptionPlan', required: true },
    planName: { type: String, required: true },
    price: { type: Number, required: true },
    durationDays: { type: Number, required: true },
    individualDailyListings: { type: Number, default: null },
    shopDailyListings: { type: Number, default: null },
    method: { type: String, enum: ['esewa', 'khalti', 'ime', 'bank'], required: true },
    reference: { type: String, required: true, trim: true, maxlength: 80 },
    note: { type: String, default: '', trim: true, maxlength: 300 },
    status: {
      type: String,
      enum: ['initiated', 'pending', 'approved', 'rejected', 'cancelled', 'failed'],
      default: 'pending',
      index: true,
    },
    gateway: { type: String, enum: ['esewa', null], default: null },
    gatewayMode: { type: String, enum: ['sandbox', 'live', null], default: null },
    transactionUuid: { type: String, default: undefined },
    gatewayStatus: { type: String, default: '' },
    gatewayRef: { type: String, default: '' },
    /** 'intent' = paid in the eSewa app; otherwise the ePay web page. */
    gatewayFlow: { type: String, enum: ['form', 'intent', null], default: null },
    bookingId: { type: String, default: '' },
    correlationId: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    rejectReason: { type: String, default: '', trim: true, maxlength: 300 },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
  },
  { timestamps: true }
);

subscriptionRequestSchema.index({ status: 1, createdAt: -1 });
subscriptionRequestSchema.index({ transactionUuid: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('SubscriptionRequest', subscriptionRequestSchema);
