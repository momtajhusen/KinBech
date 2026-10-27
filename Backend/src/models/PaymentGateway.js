const mongoose = require('mongoose');

const credentialsSchema = new mongoose.Schema(
  {
    productCode: { type: String, default: '', trim: true, maxlength: 60 },
    /** Sealed with fieldCrypto; never sent to clients. */
    secretKey: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * Online payment gateway settings, edited from the admin panel. Test and live credentials are
 * kept apart so switching mode never loses either set.
 */
const paymentGatewaySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, enum: ['esewa'] },
    enabled: { type: Boolean, default: false },
    mode: { type: String, enum: ['sandbox', 'live'], default: 'sandbox' },
    sandbox: { type: credentialsSchema, default: () => ({}) },
    live: { type: credentialsSchema, default: () => ({}) },
    /**
     * eSewa Intent: the app opens the eSewa app and the buyer confirms with MPIN.
     * Separate product code + access key from ePay; falls back to the ePay page when off or unset.
     */
    intent: {
      enabled: { type: Boolean, default: true },
      /** Test bookings open only in eSewa's RC test app; the Play Store app reports them as expired links. */
      sandboxApp: { type: Boolean, default: false },
      sandbox: { type: credentialsSchema, default: () => ({}) },
      live: { type: credentialsSchema, default: () => ({}) },
    },
    /** Test mode is limited to staff and test accounts unless this is on. */
    sandboxOpen: { type: Boolean, default: false },
    /** Base URL eSewa sends the buyer back to; empty = the URL the app called. */
    publicApiUrl: { type: String, default: '', trim: true, maxlength: 200 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('PaymentGateway', paymentGatewaySchema);
