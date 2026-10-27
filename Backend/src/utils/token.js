const jwt = require('jsonwebtoken');
const { isAdminRole, scopesForRole } = require('./adminScopes');

/**
 * Role is never read from the token; middleware always loads it from the DB.
 * `tv` must match user.tokenVersion or the token is treated as revoked.
 * `sid` ties the token to one device row in `sessions` (see utils/sessions).
 * `short` is for clients holding a refresh token; older clients keep long-lived tokens.
 */
function signUserToken(user, sessionId = null, { short = false } = {}) {
  const admin = isAdminRole(user.role);
  let expiresIn = admin
    ? process.env.ADMIN_JWT_EXPIRES_IN || '12h'
    : process.env.JWT_EXPIRES_IN || '7d';
  if (short && sessionId) expiresIn = process.env.ACCESS_TOKEN_TTL || '15m';
  return jwt.sign(
    {
      userId: user._id.toString(),
      tv: Number(user.tokenVersion) || 0,
      ...(sessionId ? { sid: String(sessionId) } : {}),
    },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Long-lived token for the native Android call watcher, which polls in the background
 * and cannot refresh. Middleware accepts it only on the incoming-call endpoints.
 */
function signCallWatchToken(user, sessionId = null) {
  return jwt.sign(
    {
      userId: user._id.toString(),
      tv: Number(user.tokenVersion) || 0,
      scope: 'calls',
      ...(sessionId ? { sid: String(sessionId) } : {}),
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.CALL_WATCH_TOKEN_TTL || '30d' }
  );
}

/** Buyer-facing trust lines. The score itself is never shown, only what it is made of. */
function sellerSignals(user) {
  if (user.trustTier === undefined && user.replyMinutes === undefined && user.dealsCompleted === undefined) return null;
  const minutes = user.replyMinutes;
  let replyText = '';
  if (minutes != null && minutes <= 60) replyText = 'Usually replies within an hour';
  else if (minutes != null && minutes <= 180) replyText = 'Usually replies within a few hours';
  else if (minutes != null && minutes <= 1440) replyText = 'Usually replies within a day';
  const idle = user.lastActiveAt ? Date.now() - new Date(user.lastActiveAt).getTime() : Infinity;
  let lastActive = '';
  if (idle < 24 * 60 * 60 * 1000) lastActive = 'Active today';
  else if (idle < 7 * 24 * 60 * 60 * 1000) lastActive = 'Active this week';
  const badges = { top: 'Top Seller', trusted: 'Trusted Seller', new: 'New seller' };
  return {
    replyText,
    lastActive,
    dealsCompleted: Number(user.dealsCompleted) || 0,
    ratingAverage: Number(user.ratingAverage) || 0,
    reviewCount: Number(user.reviewCount) || 0,
    badge: badges[user.trustTier] || '',
  };
}

/** Seller turned on Privacy > "Show phone number". Covers their personal and store numbers. */
function phoneVisible(user) {
  return Boolean(user?.preferences?.showPhone);
}

function publicUser(user, options = {}) {
  const defaultPrefs = {
    notifications: true,
    language: 'English',
    currency: 'NPR (₨)',
    showPhone: false,
    showLocation: true,
  };
  const prefs = user.preferences
    ? { ...defaultPrefs, ...(user.preferences.toObject ? user.preferences.toObject() : user.preferences) }
    : defaultPrefs;
  const includePrivate = options.includePrivate === true;

  // Format pinned stores for client
  const pinnedStores = (user.pinnedStores || []).map(p => ({
    storeId: p.storeId ? String(p.storeId) : null,
    storeType: p.storeType || 'shop',
    pinnedAt: p.pinnedAt,
  }));

  return {
    id: user._id.toString(),
    name: user.name,
    phone: includePrivate || prefs.showPhone ? user.phone : '',
    email: includePrivate ? user.email || '' : '',
    role: user.role || 'user',
    avatarUrl: user.avatarUrl,
    bio: user.bio || '',
    soldCount: user.soldCount,
    boughtCount: user.boughtCount,
    // Retired 'both' accounts sell as a store.
    sellerTypePreference: ['shop', 'both'].includes(user.sellerTypePreference) ? 'shop' : 'individual',
    preferences: prefs,
    location: includePrivate || prefs.showLocation !== false ? user.location || '' : '',
    coordinates: includePrivate || prefs.showLocation !== false ? user.coordinates || null : null,
    blockedCount: new Set([
      ...(user.blockedUserIds || []).map(String),
      ...(user.blocks || []).map((block) => String(block.user)),
    ]).size,
    profileComplete: Boolean(user.profileComplete),
    joinedAt: user.createdAt || null,
    createdAt: user.createdAt || null,
    pinnedStores,
    signals: sellerSignals(user),
    ...(includePrivate
      ? {
          chatRestrictedUntil: user.chatRestrictedUntil || null,
          restrictionReason: user.restrictionReason || '',
          status: user.status || 'active',
          trustTier: user.trustTier || 'new',
          strikeCount: Array.isArray(user.strikes) ? user.strikes.length : 0,
          isTester: Boolean(user.isTester),
          testerSince: user.isTester ? user.testerSince || null : null,
          referralCode: user.referralCode || '',
          featuredCredits: Math.max(0, Number(user.featuredCredits) || 0),
          referredBy: user.referredBy ? String(user.referredBy) : null,
          ...(isAdminRole(user.role)
            ? {
                adminScopes: scopesForRole(user.role),
                mustChangePassword: Boolean(user.mustChangePassword),
                twoFactorEnabled: Boolean(user.twoFactorEnabled),
                twoFactorSetupRequired:
                  process.env.ADMIN_2FA_REQUIRED === 'true' && !user.twoFactorEnabled,
              }
            : {}),
        }
      : {}),
  };
}

module.exports = { signUserToken, signCallWatchToken, publicUser, sellerSignals, phoneVisible };
