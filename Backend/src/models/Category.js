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
  },
  { timestamps: true }
);

categorySchema.index({ type: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Category', categorySchema);
