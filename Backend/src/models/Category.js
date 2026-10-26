const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['product', 'shop'],
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    icon: { type: String, default: 'pricetag-outline' },
    imageUrl: { type: String, default: '' },
    color: { type: String, default: '#5B39C6' },
    description: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    requiresPreApproval: { type: Boolean, default: false },
    /** Single-item listings: ask "still available?" after reminderDays, treat as stale after expiryDays (0 = built-in speed). */
    expiryDays: { type: Number, default: 0, min: 0 },
    reminderDays: { type: Number, default: 0, min: 0 },
    /** Product categories only: store keys (folded shop category, or `shop:<id>` for "Other") that sell this. */
    shopKeys: { type: [String], default: [] },
  },
  { timestamps: true }
);

categorySchema.index({ type: 1, name: 1 }, { unique: true });
categorySchema.index({ type: 1, shopKeys: 1 });

module.exports = mongoose.model('Category', categorySchema);
