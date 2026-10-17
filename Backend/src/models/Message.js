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
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
