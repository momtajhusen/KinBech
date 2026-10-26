const mongoose = require('mongoose');

/** Short-lived OTP send/verify log for fraud signals (repeat requests, banned devices). */
const otpEventSchema = new mongoose.Schema(
  {
    phone: { type: String, default: '', index: true },
    ip: { type: String, default: '', index: true },
    installId: { type: String, default: '', index: true },
    event: {
      type: String,
      enum: ['sent', 'sms_failed', 'failed', 'verified', 'blocked_suspended'],
      required: true,
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'otp_events' }
);

otpEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 14 * 24 * 60 * 60 });
otpEventSchema.index({ event: 1, createdAt: -1 });

module.exports = mongoose.model('OtpEvent', otpEventSchema);
