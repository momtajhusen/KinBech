const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop', default: null, index: true },
    /** Listing's seller (individual or shop owner). */
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    /** The completed-deal chat that unlocked this review. */
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', default: null },
    reviewedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true }, // Keep for backward compatibility
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    review: { type: String, trim: true, maxLength: 500 },
    tags: [{ type: String }],
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  },
  { timestamps: true, collection: 'reviews' }
);

// Ensure one review per user per listing
reviewSchema.index({ reviewer: 1, listing: 1 }, { unique: true });
// Index for shop reviews
reviewSchema.index({ shopId: 1, status: 1 });

module.exports = mongoose.model('Review', reviewSchema);