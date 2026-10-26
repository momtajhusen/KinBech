const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['text', 'call', 'voice'], default: 'text' },
    audio: {
      url: { type: String, default: '' },
      durationSec: { type: Number, default: 0, min: 0 },
    },
    call: {
      status: {
        type: String,
        enum: ['answered', 'missed', 'rejected', 'cancelled'],
      },
      durationSec: { type: Number, default: 0, min: 0 },
    },
    editedAt: { type: Date, default: null },
    viewedAt: { type: Date, default: null },
    deletedForEveryone: { type: Boolean, default: false },
    deletedFor: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    /** 'scam_words' = advance payment / off-platform / OTP ask; both sides see a warning. */
    safetyFlag: { type: String, default: '' },
    /** Admin scam-monitor decision on a flagged message. */
    safetyReview: {
      status: { type: String, enum: ['', 'dismissed', 'actioned'], default: '' },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
      note: { type: String, trim: true, default: '' },
    },
  },
  { timestamps: true }
);

messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ safetyFlag: 1, createdAt: -1 }, { partialFilterExpression: { safetyFlag: { $gt: '' } } });

module.exports = mongoose.model('Message', messageSchema);
