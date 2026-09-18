const mongoose = require('mongoose');

const listingSchema = new mongoose.Schema(
  {
    seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sellerType: { 
      type: String, 
      enum: ['individual', 'shop'], 
      required: true,
      default: 'individual',
      index: true 
    },
    shopId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'Shop', 
      default: null,
      index: true 
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'NPR' },
    category: { type: String, required: true, index: true },
    condition: { type: String, enum: ['New', 'Good', 'Fair'], default: 'Good' },
    photos: [{ type: String }],
    location: { type: String, default: '' },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
    meetupOption: {
      type: String,
      enum: ['Public place', 'Seller location', 'Buyer location'],
      default: 'Public place',
    },
    status: {
      type: String,
      enum: ['active', 'pending', 'sold'],
      default: 'active',
      index: true,
    },
    views: { type: Number, default: 0, index: true },
    // Shop-specific fields
    stock: { type: Number, default: 1, min: 0 },
    brand: { type: String, default: '' },
    sku: { type: String, default: '' },
    originalPrice: { type: Number, default: null },
    isOnSale: { type: Boolean, default: false },
    hasVariants: { type: Boolean, default: false },
    variantOptions: [
      {
        name: { type: String, trim: true },
        values: [{ type: String, trim: true }],
      },
    ],
    variants: [
      {
        id: { type: String, default: '' },
        label: { type: String, default: '' },
        attributes: [
          {
            name: { type: String, trim: true },
            value: { type: String, trim: true },
          },
        ],
        sku: { type: String, default: '' },
        price: { type: Number, default: null, min: 0 },
        stock: { type: Number, default: 0, min: 0 },
        photo: { type: String, default: '' },
      },
    ],
  },
  { timestamps: true }
);

listingSchema.index({ title: 'text', description: 'text', location: 'text' });
listingSchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });
listingSchema.index({ sellerType: 1, status: 1 });
listingSchema.index({ shopId: 1, status: 1 });

module.exports = mongoose.model('Listing', listingSchema);
