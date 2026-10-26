const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, required: false, unique: true, sparse: true, index: true },
    email: { type: String, trim: true, sparse: true },
    /** Google account `sub`; set on first Google sign-in. */
    googleId: { type: String, unique: true, sparse: true, index: true },
    password: { type: String, trim: true },
    role: { type: String, enum: ['user', 'admin', 'super_admin', 'moderator', 'support'], default: 'user' },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    /** Bumped to revoke every issued JWT (logout all, suspend, password change). */
    tokenVersion: { type: Number, default: 0 },
    /** Admin accounts: must set a new password before using the panel. */
    mustChangePassword: { type: Boolean, default: false },
    passwordChangedAt: { type: Date, default: null },
    /** Admin login lockout: counts wrong passwords, cleared on success. */
    failedLoginCount: { type: Number, default: 0 },
    loginLockedUntil: { type: Date, default: null },
    /** Admin TOTP 2FA. Secrets are AES-GCM encrypted (utils/totp). */
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: { type: String, default: '', select: false },
    twoFactorPendingSecret: { type: String, default: '', select: false },
    twoFactorBackupCodes: { type: [String], default: [], select: false },
    twoFactorLastStep: { type: Number, default: 0, select: false },
    /** Temporary chat lock after multiple reports (auto or admin). */
    chatRestrictedUntil: { type: Date, default: null, index: true },
    restrictionReason: { type: String, default: '', trim: true },
    avatarUrl: { type: String, default: '' },
    location: { type: String, trim: true, default: '' },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    profileComplete: { type: Boolean, default: false },
    /** Throttled on authenticated API use — used for DAU */
    lastActiveAt: { type: Date, default: null, index: true },
    soldCount: { type: Number, default: 0 },
    /** Approved deal-verified reviews of this seller (individual and shop listings). */
    ratingAverage: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    /** Listings auto-hidden by mistake and restored within 2 days; loosens the hide threshold. */
    autoHideRestores: { type: Number, default: 0 },
    /** Away mode: inactivity rules do not hide listings until this date. */
    vacationUntil: { type: Date, default: null },
    /** Last "still available?" push; trust prompts are capped at one per day. */
    trustPromptedAt: { type: Date, default: null },
    /** Admin strikes: 1 warning, 2 = 7-day suspension (suspendedUntil), 3 = permanent. */
    strikes: [{ reason: String, at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } }],
    suspendedUntil: { type: Date, default: null, index: true },
    /** Tester sandbox: this account and its listings/shops are visible only to other testers. */
    isTester: { type: Boolean, default: false, index: true },
    testerSince: { type: Date, default: null },
    /** Nepal dates (YYYY-MM-DD) with any activity, last 30. */
    activeDays: { type: [String], default: [], select: false },
    /** Copied from seller_scores each night for profiles and ranking. */
    trustScore: { type: Number, default: null },
    trustTier: { type: String, enum: ['new', 'top', 'trusted', 'standard', 'watch', 'restricted'], default: 'new' },
    rankBoost: { type: Number, default: 0 },
    replyMinutes: { type: Number, default: null },
    replyRate: { type: Number, default: null },
    dealsCompleted: { type: Number, default: 0 },
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
    /** Shareable invite code — friend signup grants featuredCredits */
    referralCode: { type: String, trim: true, uppercase: true, unique: true, sparse: true, index: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    referralRewardGranted: { type: Boolean, default: false },
    /** Each credit = 1 day featured listing */
    featuredCredits: { type: Number, default: 0, min: 0 },
    fcmToken: { type: String, default: '', index: true },
    /** Pinned stores - synced across devices */
    pinnedStores: [
      {
        storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shop' },
        storeType: { type: String, enum: ['shop', 'individual'] },
        pinnedAt: { type: Date, default: Date.now },
        viewCount: { type: Number, default: 0 },
      },
    ],
    /** Self-delete: 30-day grace (login cancels), then utils/accountDeletion purges PII. */
    deletionRequestedAt: { type: Date, default: null },
    deletionScheduledFor: { type: Date, default: null, index: true },
    /** What the request hid, so cancelling can restore it. */
    deletionHidden: {
      type: [{ kind: { type: String, enum: ['listing', 'shop'] }, ref: mongoose.Schema.Types.ObjectId, status: String }],
      default: [],
      select: false,
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'users' }
);

module.exports = mongoose.model('User', userSchema);
