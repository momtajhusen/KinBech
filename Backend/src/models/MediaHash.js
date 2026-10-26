const mongoose = require('mongoose');

/** 64-bit dHash of an uploaded listing photo, split in 4 bands so near-duplicates can be looked up. */
const mediaHashSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    hash: { type: String, required: true },
    bands: { type: [String], index: true },
  },
  { timestamps: true, collection: 'media_hashes' }
);

module.exports = mongoose.model('MediaHash', mediaHashSchema);
