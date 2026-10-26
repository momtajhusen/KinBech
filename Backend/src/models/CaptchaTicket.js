const mongoose = require('mongoose');

/**
 * Human check done in the browser for a client without an embedded captcha (the mobile app).
 * The app retries with `captchaTicket`; a verified ticket is good for one request.
 */
const captchaTicketSchema = new mongoose.Schema(
  {
    ticket: { type: String, required: true, unique: true },
    purpose: { type: String, required: true },
    subject: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: 'captcha_tickets' }
);

captchaTicketSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('CaptchaTicket', captchaTicketSchema);
