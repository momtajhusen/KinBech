const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema(
  {
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }],
    lastMessage: { type: String, default: '' },
    lastMessageAt: { type: Date, default: Date.now },
    lastMessageSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastMessageKind: { type: String, enum: ['text', 'call', 'voice'], default: 'text' },
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
    },
    callGuard: {
      user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      at: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

chatSchema.index({ participants: 1 });

module.exports = mongoose.model('Chat', chatSchema);
