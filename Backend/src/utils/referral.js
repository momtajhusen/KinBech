const crypto = require('crypto');
const User = require('../models/User');

const FEATURED_DURATION_MS = 24 * 60 * 60 * 1000;
const REFERRAL_FEATURED_CREDITS = 1;

function generateReferralCode(seed = '') {
  const raw = crypto
    .randomBytes(4)
    .toString('hex')
    .toUpperCase()
    .slice(0, 6);
  const prefix = String(seed || 'KB')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 2);
  return `${prefix || 'KB'}${raw}`;
}

async function ensureReferralCode(user) {
  if (!user) return null;
  if (user.referralCode) return user.referralCode;

  for (let i = 0; i < 5; i += 1) {
    const code = generateReferralCode(user.name || user.phone || 'KB');
    try {
      user.referralCode = code;
      await user.save();
      return code;
    } catch (err) {
      if (err?.code !== 11000) throw err;
    }
  }
  return null;
}

function isListingFeatured(listing) {
  if (!listing?.featuredUntil) return false;
  return new Date(listing.featuredUntil).getTime() > Date.now();
}

function featuredTrustBoost(listing) {
  return isListingFeatured(listing) ? 40 : 0;
}

/**
 * Attach referredBy on invitee and grant featured credit to referrer (once).
 */
async function applyReferralCode(invitee, rawCode) {
  const code = String(rawCode || '')
    .trim()
    .toUpperCase();
  if (!invitee || !code) {
    return { ok: false, message: 'Referral code is required' };
  }
  if (invitee.referredBy) {
    return { ok: false, message: 'You already used a referral code' };
  }

  const referrer = await User.findOne({ referralCode: code });
  if (!referrer) {
    return { ok: false, message: 'Invalid referral code' };
  }
  if (String(referrer._id) === String(invitee._id)) {
    return { ok: false, message: 'You cannot use your own referral code' };
  }

  invitee.referredBy = referrer._id;
  await invitee.save();

  if (!invitee.referralRewardGranted) {
    referrer.featuredCredits = Math.max(0, Number(referrer.featuredCredits) || 0) + REFERRAL_FEATURED_CREDITS;
    await referrer.save();
    invitee.referralRewardGranted = true;
    await invitee.save();
  }

  return {
    ok: true,
    message: 'Referral applied. Your friend gets 1 day of featured listing.',
    referrerId: String(referrer._id),
  };
}

/**
 * Consume one featured credit and feature a listing for 24h.
 */
async function featureListingWithCredit(user, listing) {
  if (!user || !listing) {
    return { ok: false, httpStatus: 400, message: 'Invalid request' };
  }
  if (String(listing.seller) !== String(user._id)) {
    return { ok: false, httpStatus: 403, message: 'You can only feature your own listing' };
  }
  if (listing.status === 'sold') {
    return { ok: false, httpStatus: 400, message: 'Sold listings cannot be featured' };
  }
  if (isListingFeatured(listing)) {
    return {
      ok: false,
      httpStatus: 400,
      message: 'This listing is already featured',
      featuredUntil: listing.featuredUntil,
    };
  }

  const credits = Math.max(0, Number(user.featuredCredits) || 0);
  if (credits < 1) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'NO_FEATURED_CREDITS',
      message: 'No featured credits left. Invite a friend to earn 1 free day.',
    };
  }

  user.featuredCredits = credits - 1;
  await user.save();

  listing.featuredUntil = new Date(Date.now() + FEATURED_DURATION_MS);
  listing.featuredSource = 'referral';
  await listing.save();

  return {
    ok: true,
    featuredUntil: listing.featuredUntil,
    featuredCredits: user.featuredCredits,
    message: 'Listing featured for 24 hours',
  };
}

module.exports = {
  generateReferralCode,
  ensureReferralCode,
  applyReferralCode,
  featureListingWithCredit,
  isListingFeatured,
  featuredTrustBoost,
  FEATURED_DURATION_MS,
  REFERRAL_FEATURED_CREDITS,
};
