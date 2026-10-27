const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastMessageKind: { type: String, enum: ['text', 'call', 'voice'], default: 'text' },
    /** Messages that matched scam phrases (advance payment, off-platform, OTP). */
    safetyFlags: { type: Number, default: 0 },
    lastSafetyFlagAt: { type: Date, default: null },
    /** Participant who is not the listing's seller (set on first message / meetup). */
    buyer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    /** Detected automatically (utils/deals); buttons are only a fallback. */
    deal: {
      state: {
        type: String,
        enum: ['none', 'scheduled', 'completed', 'no_show', 'lapsed'],
        default: 'none',
        index: true,
      },
      scheduledAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      source: { type: String, default: '' },
      noShowBy: { type: String, enum: ['', 'buyer', 'seller'], default: '' },
      sellerSoldWordAt: { type: Date, default: null },
      buyerGotWordAt: { type: Date, default: null },
      promptedAt: { type: Date, default: null },
    },
    meetupConfirmed: { type: Boolean, default: false },
    meetupPlace: { type: String, default: '' },
    meetupAt: { type: Date, default: null },
    typing: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      until: { type: Date, default: null },
    },
    ringingCall: {
      caller: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      callerName: { type: String, default: '' },
      callerImage: { type: String, default: '' },
      startedAt: { type: Date, default: null },
      deliveredAt: { type: Date, default: null },
      answeredAt: { type: Date, default: null },
      // CallSettings account the caller joined on; the callee must use the same Agora project.
      agoraAccountId: { type: String, default: '' },
      // Talk time left today for the person with less; null when the call has no daily limit.
      maxSeconds: { type: Number, default: null },
    },
    callGuard: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1 });
chatSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Chat', chatSchema);
