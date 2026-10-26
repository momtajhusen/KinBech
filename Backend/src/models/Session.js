const mongoose = require('mongoose');

/** One signed-in device. The JWT carries `sid`; revoking the row ends that device only. */
const sessionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: ['app', 'admin'], default: 'app' },
    deviceName: { type: String, default: '', trim: true, maxlength: 120 },
    platform: { type: String, default: '', trim: true, maxlength: 40 },
    appVersion: { type: String, default: '', trim: true, maxlength: 40 },
    /** Random per-install id from the app (X-Install-Id); links accounts on one phone. */
    installId: { type: String, default: '', index: true },
    ip: { type: String, default: '' },
    lastIp: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
    revokedAt: { type: Date, default: null },
    /** sha256 of the current refresh secret; the previous one is kept to tell a race from reuse. */
    refreshHash: { type: String, default: null, select: false },
    refreshPrevHash: { type: String, default: null, select: false },
    refreshRotatedAt: { type: Date, default: null },
    /** Play Integrity soft signal: strong | device | basic | failed | unevaluated. */
    integrityLevel: { type: String, default: 'unevaluated' },
    integrityCheckedAt: { type: Date, default: null },
    integrityNonce: { type: String, default: null, select: false },
    integrityNonceExpires: { type: Date, default: null },
  },
  { timestamps: true, collection: 'sessions' }
);

sessionSchema.index({ user: 1, revokedAt: 1, lastSeenAt: -1 });
// Tokens live at most 30 days (JWT_EXPIRES_IN), so idle rows can go after that.
sessionSchema.index({ lastSeenAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Session', sessionSchema);
