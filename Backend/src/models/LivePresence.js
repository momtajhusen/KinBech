const mongoose = require('mongoose');

const trailSchema = new mongoose.Schema(
  {
    screen: { type: String, default: '' },
    label: { type: String, default: '' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

/** One open app right now, keyed by install. The app pings about every 30s; rows expire soon after it stops. */
const livePresenceSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    screen: { type: String, default: '' },
    params: {
      listingId: { type: String, default: '' },
      shopId: { type: String, default: '' },
      sellerId: { type: String, default: '' },
      otherUserId: { type: String, default: '' },
      query: { type: String, default: '' },
      category: { type: String, default: '' },
      tab: { type: String, default: '' },
    },
    /** Names resolved from params so admins see "Viewing: iPhone 13" instead of ids. */
    context: {
      listingTitle: { type: String, default: '' },
      listingPrice: { type: Number, default: null },
      shopName: { type: String, default: '' },
      personName: { type: String, default: '' },
    },
    deviceName: { type: String, default: '' },
    platform: { type: String, default: '' },
    appVersion: { type: String, default: '' },
    ip: { type: String, default: '' },
    startedAt: { type: Date, default: Date.now },
    screenSince: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
    screensCount: { type: Number, default: 0 },
    trail: { type: [trailSchema], default: [] },
  },
  { collection: 'live_presence' }
);

livePresenceSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 120 });

module.exports = mongoose.model('LivePresence', livePresenceSchema);
