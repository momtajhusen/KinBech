const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    type: { type: String, enum: ['listing', 'chat', 'call', 'system', 'promotion', 'broadcast'], default: 'system' },
    title: { type: String, required: true },
    body: { type: String },
    message: { type: String }, // Alternative to body for broadcast notifications
    icon: { type: String, default: 'notifications-outline' },
    iconBg: { type: String, default: 'iconBackground' },
    unread: { type: Boolean, default: true },
    route: { type: String },
    params: { type: Object },
    tab: { type: String },
    relatedListing: { type: mongoose.Schema.Types.ObjectId, ref: 'Listing' },
    relatedChat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat' },
    // Broadcast notification fields
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    audience: { type: String, enum: ['all', 'buyers', 'individual_sellers', 'shop_sellers', 'specific_city'], default: 'all' },
    deliveryMethod: { type: String, enum: ['push', 'banner', 'both'], default: 'both' },
    broadcastStatus: { type: String, enum: ['draft', 'sent'], default: 'sent' },
    city: { type: String, default: '', trim: true },
  },
  { timestamps: true, collection: 'notifications' }
);

// Make body required only for non-broadcast notifications
notificationSchema.pre('save', function(next) {
  if (this.type !== 'broadcast' && !this.body) {
    this.body = this.message || '';
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);