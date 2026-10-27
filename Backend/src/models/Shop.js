const mongoose = require('mongoose');
const { sealField } = require('../utils/fieldCrypto');
const { audiencePlugin } = require('../utils/audience');

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
    coverImage: {
      type: String,
      default: '',
    },
    tagline: {
      type: String,
      trim: true,
      default: '',
    },
    whatsapp: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    website: { type: String, trim: true, default: '' },
    socialLinks: {
      facebook: { type: String, trim: true, default: '' },
      instagram: { type: String, trim: true, default: '' },
      tiktok: { type: String, trim: true, default: '' },
      youtube: { type: String, trim: true, default: '' },
    },
    openDays: {
      type: [String],
      default: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    },
    deliveryAvailable: { type: Boolean, default: false },
    deliveryAreas: { type: String, trim: true, default: '' },
    paymentMethods: { type: [String], default: ['Cash'] },
    returnPolicy: { type: String, trim: true, default: '' },
    establishedYear: { type: Number, default: null },
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
    /** Nepal business tax IDs — optional; encrypted at rest (utils/fieldCrypto). */
    panNumber: {
      type: String,
      trim: true,
      default: '',
      set: sealField,
    },
    vatNumber: {
      type: String,
      trim: true,
      default: '',
      set: sealField,
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
    /** Admin review checklist; approve needs nameMatches plus panValid or documentClear. */
    verificationChecklist: {
      panValid: { type: Boolean, default: false },
      nameMatches: { type: Boolean, default: false },
      documentClear: { type: Boolean, default: false },
      addressMatches: { type: Boolean, default: false },
      phoneReachable: { type: Boolean, default: false },
    },
    verificationReviewedAt: { type: Date, default: null },
    verificationReviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verificationHistory: [
      {
        action: { type: String, enum: ['submitted', 'approved', 'rejected', 'revoked', 'note'], required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        byName: { type: String, default: '' },
        note: { type: String, trim: true, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],
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
    lastStockReminderAt: { type: Date, default: null },
    status: {
      type: String,
      enum: ['active', 'inactive', 'suspended'],
      default: 'active',
      index: true
    },
    /** Set with status `inactive` when the owner switched to selling as an individual; switching back reopens the store. */
    pausedAt: { type: Date, default: null },
    pauseReason: { type: String, default: '' },
    /** Owned by a tester account; visible only to testers (utils/audience). */
    isTest: { type: Boolean, default: false, index: true }
  },
  { timestamps: true, collection: 'shops' }
);

shopSchema.plugin(audiencePlugin);

// Indexes for better query performance
shopSchema.index({ owner: 1, status: 1 });
shopSchema.index({ category: 1, status: 1 });
shopSchema.index({ ratingAverage: -1 });
shopSchema.index({ name: 'text', description: 'text' });

module.exports = mongoose.model('Shop', shopSchema);