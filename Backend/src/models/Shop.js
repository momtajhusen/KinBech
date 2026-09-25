const mongoose = require('mongoose');

const shopSchema = new mongoose.Schema(
  {
    owner: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    name: { 
      type: String, 
      required: true, 
      trim: true,
      index: true 
    },
    logo: { 
      type: String, 
      default: '' 
    },
    category: { 
      type: String, 
      required: true,
      trim: true,
      index: true 
    },
    description: { 
      type: String, 
      trim: true, 
      default: '' 
    },
    phone: { 
      type: String, 
      trim: true 
    },
    address: { 
      type: String, 
      trim: true, 
      default: '' 
    },
    location: { 
      type: String, 
      trim: true, 
      default: '' 
    },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    openingHours: {
      type: String,
      default: '9:00 AM - 8:00 PM'
    },
    isVerified: { 
      type: Boolean, 
      default: false,
      index: true 
    },
    /** Nepal business tax IDs — optional; used for admin verification badge */
    panNumber: {
      type: String,
      trim: true,
      default: '',
    },
    vatNumber: {
      type: String,
      trim: true,
      default: '',
    },
    businessDocuments: [
      {
        url: { type: String, required: true },
        label: { type: String, trim: true, default: 'Business document' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    verificationStatus: {
      type: String,
      enum: ['none', 'pending', 'approved', 'rejected'],
      default: 'none',
      index: true,
    },
    verificationNotes: {
      type: String,
      trim: true,
      default: '',
    },
    verificationSubmittedAt: {
      type: Date,
      default: null,
    },
    ratingAverage: { 
      type: Number, 
      default: 0,
      min: 0,
      max: 5 
    },
    reviewCount: { 
      type: Number, 
      default: 0,
      min: 0 
    },
    followersCount: { 
      type: Number, 
      default: 0,
      min: 0 
    },
    profileViews: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true
    }
  },
  { timestamps: true, collection: 'shops' }
);

// Indexes for better query performance
shopSchema.index({ owner: 1, status: 1 });
shopSchema.index({ category: 1, status: 1 });
shopSchema.index({ ratingAverage: -1 });
shopSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Shop', shopSchema);