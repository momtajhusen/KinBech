const mongoose = require('mongoose');

const priceBandSchema = new mongoose.Schema(
  {
    logSum: { type: Number, default: 0 },
    weight: { type: Number, default: 0 },
  },
  { _id: false }
);

/** What a buyer keeps opening, saving, searching and chatting about. Scores decay over time. */
const userInterestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    categories: { type: Map, of: Number, default: {} },
    terms: { type: Map, of: Number, default: {} },
    priceBands: { type: Map, of: priceBandSchema, default: {} },
    decayedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserInterest', userInterestSchema);
