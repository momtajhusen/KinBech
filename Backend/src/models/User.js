const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, required: false, unique: true, sparse: true, index: true },
    email: { type: String, trim: true, sparse: true },
    password: { type: String, trim: true },
    role: { type: String, enum: ['user', 'admin', 'super_admin', 'moderator', 'support'], default: 'user' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    avatarUrl: { type: String, default: '' },
    location: { type: String, trim: true, default: '' },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    profileComplete: { type: Boolean, default: false },
    soldCount: { type: Number, default: 0 },
    boughtCount: { type: Number, default: 0 },
    bio: { type: String, trim: true, default: '', maxlength: 200 },
    addresses: {
      type: [
        {
          label: { type: String, trim: true, default: 'Home' },
          line1: { type: String, trim: true, default: '' },
          city: { type: String, trim: true, default: '' },
          isDefault: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    paymentMethods: {
      type: [
        {
          provider: {
            type: String,
            enum: ['cash', 'esewa', 'khalti', 'ime', 'bank'],
            default: 'cash',
          },
          label: { type: String, trim: true, default: '' },
          identifier: { type: String, trim: true, default: '' },
          isDefault: { type: Boolean, default: false },
        },
      ],
      default: [],
    },
    blockedUserIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    sellerTypePreference: { 
      type: String, 
      enum: ['individual', 'shop', 'both'], 
      default: 'individual' 
    },
    preferences: {
      notifications: { type: Boolean, default: true },
      language: { type: String, default: 'English' },
      currency: { type: String, default: 'NPR (₨)' },
      showPhone: { type: Boolean, default: false },
      showLocation: { type: Boolean, default: true },
    },
  },
  { timestamps: true, collection: 'users' }
);

module.exports = mongoose.model('User', userSchema);
