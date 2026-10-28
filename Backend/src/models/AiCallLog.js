const mongoose = require('mongoose');

const aiCallLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  // Calendar day in Pacific time, which is when Gemini resets daily quotas.
  day: { type: String, required: true, index: true },
  accountId: { type: String, default: '' },
  accountLabel: { type: String, default: '' },
  model: { type: String, required: true },
  result: { type: String, enum: ['ok', 'failed', 'limit'], required: true },
  purpose: { type: String, default: '' },
  ms: { type: Number, default: 0 },
  error: { type: String, default: '' },
});

aiCallLogSchema.index({ at: -1 });

module.exports = mongoose.model('AiCallLog', aiCallLogSchema);
