const mongoose = require('mongoose');

const flaggedMediaSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true },
    folder: { type: String, default: '' },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    code: { type: String, default: '' },
    message: { type: String, default: '' },
    reasons: [{ type: String }],
  },
  { timestamps: true }
);

module.exports = mongoose.model('FlaggedMedia', flaggedMediaSchema);
