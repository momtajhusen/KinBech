const crypto = require('crypto');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Notification = require('../models/Notification');
const { sendUserPush } = require('./callPush');
const { scheduleJob } = require('./jobLock');

const FEATURED_DURATION_MS = 24 * 60 * 60 * 1000;
const REFERRAL_FEATURED_CREDITS = 1;

const BOOST_BLOCKED = {
  pending: 'You can boost this listing once it is approved.',
  hidden: 'Confirm the listing is still available before boosting it.',
  removed: 'Rejected listings cannot be boosted. Edit it and send it for review again.',
  sold: 'Sold listings cannot be boosted.',
};

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
    message: 'Referral applied. Your friend gets 1 free boost.',
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
  if (listing.status !== 'active') {
    return {
      ok: false,
      httpStatus: 400,
      code: 'NOT_ACTIVE',
      message: BOOST_BLOCKED[listing.status] || 'Only live listings can be boosted.',
    };
  }
  if (isListingFeatured(listing)) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'ALREADY_FEATURED',
      message: 'This listing is already featured',
      featuredUntil: listing.featuredUntil,
    };
  }

  const charged = await User.findOneAndUpdate(
    { _id: user._id, featuredCredits: { $gte: 1 } },
    { $inc: { featuredCredits: -1 } },
    { new: true, projection: { featuredCredits: 1 } },
  );
  if (!charged) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'NO_FEATURED_CREDITS',
      message: 'No boost credits left. Invite a friend to earn 1 free boost.',
    };
  }

  // Conditional update so two quick taps cannot spend two credits on one listing.
  const now = new Date();
  const featuredUntil = new Date(now.getTime() + FEATURED_DURATION_MS);
  const claimed = await Listing.findOneAndUpdate(
    {
      _id: listing._id,
      seller: user._id,
      status: 'active',
      $or: [{ featuredUntil: null }, { featuredUntil: { $lte: now } }],
    },
    { $set: { featuredUntil, featuredSource: 'referral' } },
    { new: true, projection: { featuredUntil: 1, views: 1 } },
  );
  if (claimed) {
    await Listing.updateOne({ _id: claimed._id }, { $set: { featuredViewsAtStart: Number(claimed.views) || 0 } });
  }
  if (!claimed) {
    await User.updateOne({ _id: user._id }, { $inc: { featuredCredits: 1 } });
    return {
      ok: false,
      httpStatus: 409,
      code: 'ALREADY_FEATURED',
      message: 'This listing is already featured',
    };
  }

  user.featuredCredits = charged.featuredCredits;
  listing.featuredUntil = featuredUntil;
  listing.featuredSource = 'referral';

  return {
    ok: true,
    featuredUntil,
    featuredCredits: charged.featuredCredits,
    message: 'Listing featured for 24 hours',
  };
}

const BOOST_SWEEP_LOOKBACK_MS = 2 * 24 * 60 * 60 * 1000;

/** Tells sellers once when a boost ends, with the views it brought and how to boost again. */
async function boostExpirySweep(now = new Date()) {
  const ended = await Listing.find({
    featuredUntil: { $lte: now, $gt: new Date(now.getTime() - BOOST_SWEEP_LOOKBACK_MS) },
    $expr: { $ne: ['$featuredEndNotifiedFor', '$featuredUntil'] },
  })
    .select('seller title status views featuredUntil featuredViewsAtStart')
    .limit(500)
    .lean();

  let notified = 0;
  for (const listing of ended) {
    const claim = await Listing.updateOne(
      { _id: listing._id, featuredUntil: listing.featuredUntil, featuredEndNotifiedFor: { $ne: listing.featuredUntil } },
      { $set: { featuredEndNotifiedFor: listing.featuredUntil } },
    );
    if (!claim.modifiedCount || listing.status !== 'active') continue;

    const seller = await User.findById(listing.seller).select('featuredCredits status').lean();
    if (!seller || seller.status === 'suspended') continue;
    const credits = Math.max(0, Number(seller.featuredCredits) || 0);
    const gained = listing.featuredViewsAtStart == null
      ? 0
      : Math.max(0, (Number(listing.views) || 0) - Number(listing.featuredViewsAtStart));

    const result = gained > 0
      ? `"${listing.title}" got ${gained} ${gained === 1 ? 'view' : 'views'} during its 24-hour boost.`
      : `"${listing.title}" is no longer Featured.`;
    const next = credits > 0
      ? ` You have ${credits} boost ${credits === 1 ? 'credit' : 'credits'} left. Boost it again from My Listings.`
      : ' Invite a friend to earn another free boost.';

    try {
      const note = await Notification.create({
        user: listing.seller,
        type: 'listing',
        title: 'Boost ended',
        body: `${result}${next}`,
        icon: 'flash-outline',
        route: credits > 0 ? 'MyListings' : 'InviteFriends',
        params: credits > 0 ? { initialTab: 'active' } : undefined,
        relatedListing: listing._id,
      });
      sendUserPush({
        userId: listing.seller,
        title: note.title,
        body: note.body,
        data: { type: note.type, notificationId: String(note._id), route: note.route || '' },
      }).catch(() => {});
      notified += 1;
    } catch {
      /* best effort */
    }
  }
  return { checked: ended.length, notified };
}

function startBoostJobs() {
  scheduleJob('boost-expiry', 10 * 60 * 1000, boostExpirySweep, { delayMs: 90 * 1000 });
}

module.exports = {
  boostExpirySweep,
  startBoostJobs,
  generateReferralCode,
  ensureReferralCode,
  applyReferralCode,
  featureListingWithCredit,
  isListingFeatured,
  featuredTrustBoost,
  FEATURED_DURATION_MS,
  REFERRAL_FEATURED_CREDITS,
};
