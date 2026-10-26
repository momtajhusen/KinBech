const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportedListing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    reason: { type: String, required: true, enum: ['spam', 'fake-listing', 'inappropriate', 'other', 'not-available', 'scam', 'no-show'] },
    details: { type: String, trim: true, maxLength: 500 },
    status: { type: String, enum: ['pending', 'reviewed', 'resolved', 'dismissed'], default: 'pending' },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
    notes: { type: String },
  },
  { timestamps: true, collection: 'reports' }
);

module.exports = mongoose.model('Report', reportSchema);