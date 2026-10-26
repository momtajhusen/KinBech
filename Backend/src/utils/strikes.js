const Listing = require('../models/Listing');
const Notification = require('../models/Notification');
const { revokeAllSessions } = require('./sessions');
const listingQueryCache = require('./listingQueryCache');
const { statusChange } = require('./listing');

const DAY = 24 * 60 * 60 * 1000;

/**
 * Admin strikes: 1 = warning, 2 = 7-day suspension, 3+ = permanent suspension.
 * Suspensions sign the user out and hide their active listings.
 */
async function applyStrike(user, reason, byUserId) {
  user.strikes.push({ reason, at: new Date(), by: byUserId });
  const count = user.strikes.length;
  let action = 'warning';
  if (count === 2) {
    action = 'suspended_7d';
    user.status = 'suspended';
    user.suspendedUntil = new Date(Date.now() + 7 * DAY);
  } else if (count >= 3) {
    action = 'suspended';
    user.status = 'suspended';
    user.suspendedUntil = null;
  }
  if (action !== 'warning') user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
  await user.save();
  if (action !== 'warning') {
    await revokeAllSessions(user._id);
    await Listing.updateMany(
      { seller: user._id, status: 'active' },
      { $set: { status: 'hidden', 'autoHidden.at': new Date(), 'autoHidden.reason': 'account_suspended', statusChange: statusChange('hidden', 'admin', 'account_suspended') } }
    );
    listingQueryCache.invalidateAll();
  } else {
    await Notification.create({
      user: user._id,
      type: 'system',
      title: 'Warning from KinBech',
      body: `${reason} Another violation will suspend your account for 7 days.`,
      icon: 'warning-outline',
    });
  }
  return { count, action };
}

module.exports = { applyStrike };
