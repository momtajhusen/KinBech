const jwt = require('jsonwebtoken');

function signUserToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), phone: user.phone, role: user.role || 'user' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
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
    sellerTypePreference: user.sellerTypePreference || 'individual',
    preferences: prefs,
    location: includePrivate || prefs.showLocation !== false ? user.location || '' : '',
    coordinates: includePrivate || prefs.showLocation !== false ? user.coordinates || null : null,
    blockedCount: Array.isArray(user.blockedUserIds) ? user.blockedUserIds.length : 0,
    profileComplete: Boolean(user.profileComplete),
    joinedAt: user.createdAt || null,
    createdAt: user.createdAt || null,
    ...(includePrivate
      ? {
          chatRestrictedUntil: user.chatRestrictedUntil || null,
          restrictionReason: user.restrictionReason || '',
          status: user.status || 'active',
          referralCode: user.referralCode || '',
          featuredCredits: Math.max(0, Number(user.featuredCredits) || 0),
          referredBy: user.referredBy ? String(user.referredBy) : null,
        }
      : {}),
  };
}

module.exports = { signUserToken, publicUser };
