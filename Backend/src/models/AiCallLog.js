const mongoose = require('mongoose');

const aiCallLogSchema = new mongoose.Schema({
  at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
  // Calendar day in Pacific time, which is when Gemini resets daily quotas.
  day: { type: String, required: true, index: true },
  // Every HTTP call made for one app request shares this id, so the admin log can show the switch chain.
  requestId: { type: String, default: '', index: true },
  attempt: { type: Number, default: 1 },
  accountId: { type: String, default: '' },
  accountLabel: { type: String, default: '' },
  model: { type: String, required: true },
  result: { type: String, enum: ['ok', 'failed', 'limit'], required: true },
  // quota_day | quota_minute | quota_zero | spend_limit | overloaded | server_error | timeout | network |
  // key_invalid | model_missing | bad_request | bad_response | safety_block
  errorType: { type: String, default: '' },
  status: { type: Number, default: 0 },
  retryMs: { type: Number, default: 0 },
  purpose: { type: String, default: '' },
  userId: { type: String, default: '' },
  // Seller level when the request came in: new | regular | heavy ('' for admin tests).
  level: { type: String, default: '' },
  ms: { type: Number, default: 0 },
  error: { type: String, default: '' },
});

aiCallLogSchema.index({ at: -1 });

module.exports = mongoose.model('AiCallLog', aiCallLogSchema);
