const mongoose = require('mongoose');
const { audiencePlugin } = require('../utils/audience');

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
    // Alternate buyer phrases. Used only for search, never shown on listing screens.
    searchWords: [{ type: String, trim: true }],
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
      // hidden = auto-hidden by trust rules (see autoHidden); seller restores in one tap.
      enum: ['active', 'pending', 'sold', 'removed', 'hidden'],
      default: 'active',
      index: true,
    },
    /** single = one piece, stock = counted stock, always = service / made to order. null = by seller type. */
    listingKind: { type: String, enum: ['single', 'stock', 'always', null], default: null },
    lowStockLimit: { type: Number, default: 3, min: 0 },
    stockConfirmedAt: { type: Date, default: null },
    /** Seller said "still available" (button or chat). */
    availabilityConfirmedAt: { type: Date, default: null },
    /** Computed by utils/listingTrust; reasons are shown to admin and the seller. */
    trust: {
      soldWordAt: { type: Date, default: null },
      soldLikelihood: { type: Number, default: 0 },
      reasons: [{ type: String }],
      promptedAt: { type: Date, default: null },
      confirmBy: { type: Date, default: null },
      stockState: { type: String, default: '' },
      outOfStockSince: { type: Date, default: null },
      /** Subtracted from the ranking boost (likely sold, out of stock, unconfirmed). */
      rankPenalty: { type: Number, default: 0 },
      /** Sold by a detected deal (not by the seller); "still available" can undo it. */
      autoSoldAt: { type: Date, default: null },
    },
    /** Who last changed `status` and why, so the seller sees "Sold by you" vs "Auto-sold". */
    statusChange: {
      status: { type: String, default: '' },
      by: { type: String, enum: ['', 'seller', 'auto', 'admin'], default: '' },
      reason: { type: String, default: '' },
      at: { type: Date, default: null },
    },
    autoHidden: {
      at: { type: Date, default: null },
      reason: { type: String, default: '' },
      restoredAt: { type: Date, default: null },
      restoreCount: { type: Number, default: 0 },
    },
    moderationReason: { type: String, default: '' },
    /** Last move by the daily category check (utils/categoryFix); a seller moving it back is then left alone. */
    categoryFix: {
      from: { type: String, default: '' },
      to: { type: String, default: '' },
      at: { type: Date, default: null },
      /** The title the AI last named a category for, so it is asked once per title. */
      aiTitle: { type: String, default: '' },
    },
    /** What the AI understood this product to be, for related items (utils/relatedListings). */
    relatedAi: {
      key: { type: String, default: '' },
      type: { type: String, default: '' },
      same: [{ type: String }],
      close: [{ type: String }],
    },
    matchedKeywords: [{ type: String }],
    heldAt: { type: Date, default: null },
    views: { type: Number, default: 0, index: true },
    /** Set when status first becomes sold — used for sales reports */
    soldAt: { type: Date, default: null, index: true },
    /** Time-boxed promo from referral credits (or future paid boosts) */
    featuredUntil: { type: Date, default: null, index: true },
    /** Views when the boost started, for the "boost ended" summary. */
    featuredViewsAtStart: { type: Number, default: 0 },
    /** The featuredUntil the seller was already told about, so each boost ends with one notice. */
    featuredEndNotifiedFor: { type: Date, default: null },
    featuredSource: {
      type: String,
      enum: ['', 'referral', 'promo', 'manual'],
      default: '',
    },
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
    /** Posted by a tester account; visible only to testers (utils/audience). */
    isTest: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

listingSchema.plugin(audiencePlugin);

listingSchema.index({ title: 'text', description: 'text', location: 'text' });
listingSchema.index({ 'coordinates.lat': 1, 'coordinates.lng': 1 });
listingSchema.index({ sellerType: 1, status: 1 });
listingSchema.index({ shopId: 1, status: 1 });
listingSchema.index({ seller: 1, price: 1, createdAt: -1 });
listingSchema.index({ seller: 1, createdAt: -1 });

module.exports = mongoose.model('Listing', listingSchema);
