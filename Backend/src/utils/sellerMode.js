const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const Chat = require('../models/Chat');
const listingQueryCache = require('./listingQueryCache');
const { statusChange } = require('./listing');

const SELLER_MODES = ['individual', 'shop'];
const CHANGE_COOLDOWN_DAYS = 30;
const UNDO_HOURS = 24;
/** `autoHidden.reason` on listings and `pauseReason` on the store while their mode is switched off. */
const MODE_PAUSE_REASON = 'seller_mode';

const DAY = 24 * 60 * 60 * 1000;
const KIND = {
  personal: { filter: { sellerType: { $ne: 'shop' } }, label: 'personal' },
  store: { filter: { sellerType: 'shop' }, label: 'store' },
};

const hasStore = (mode) => mode === 'shop';
const hasPersonal = (mode) => mode === 'individual';
const kindsFor = (mode) => [hasPersonal(mode) && 'personal', hasStore(mode) && 'store'].filter(Boolean);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Accounts saved with the retired 'both' mode sell as a store. */
function normalizeSellerMode(mode) {
  if (mode === 'both') return 'shop';
  return SELLER_MODES.includes(mode) ? mode : 'individual';
}

function currentMode(user) {
  return normalizeSellerMode(user?.sellerTypePreference);
}

/** Cooldown and the one-time 24h undo, from the last recorded switch. */
function changeWindow(user, now = new Date()) {
  const last = user?.sellerTypeChange || {};
  const at = last.at ? new Date(last.at).getTime() : 0;
  if (!at) return { cooldownOver: true, nextChangeAt: null, undoTarget: null, undoUntil: null };
  const nextChange = at + CHANGE_COOLDOWN_DAYS * DAY;
  const undoEnd = at + UNDO_HOURS * 60 * 60 * 1000;
  const canUndo = !last.undone && SELLER_MODES.includes(last.from) && now.getTime() < undoEnd;
  return {
    cooldownOver: now.getTime() >= nextChange,
    nextChangeAt: now.getTime() >= nextChange ? null : new Date(nextChange),
    undoTarget: canUndo ? last.from : null,
    undoUntil: canUndo ? new Date(undoEnd) : null,
  };
}

async function ownerStore(userId) {
  return Shop.findOne({ owner: userId }).sort({ status: 1, createdAt: -1 }).select('status pauseReason').lean();
}

function storeUsable(shop) {
  return Boolean(shop && (shop.status === 'active' || (shop.status === 'inactive' && shop.pauseReason === MODE_PAUSE_REASON)));
}

async function kindCounts(userId, kind) {
  const { filter } = KIND[kind];
  const listingIds = await Listing.find({ seller: userId, status: { $in: ['active', 'pending'] }, ...filter }).distinct('_id');
  const [active, pending, paused, scheduledDeals] = await Promise.all([
    Listing.countDocuments({ seller: userId, status: 'active', ...filter }),
    Listing.countDocuments({ seller: userId, status: 'pending', ...filter }),
    Listing.countDocuments({ seller: userId, status: 'hidden', 'autoHidden.reason': MODE_PAUSE_REASON, ...filter }),
    listingIds.length
      ? Chat.countDocuments({ listing: { $in: listingIds }, 'deal.state': 'scheduled' })
      : 0,
  ]);
  return { active, pending, paused, scheduledDeals };
}

/** Everything the Seller Preference screen needs to explain a switch before the user confirms it. */
async function sellerModeStatus(user) {
  const now = new Date();
  const [store, personal, storeKind] = await Promise.all([
    ownerStore(user._id),
    kindCounts(user._id, 'personal'),
    kindCounts(user._id, 'store'),
  ]);
  const window = changeWindow(user, now);
  return {
    current: currentMode(user),
    cooldownDays: CHANGE_COOLDOWN_DAYS,
    undoHours: UNDO_HOURS,
    canChange: window.cooldownOver,
    nextChangeAt: window.nextChangeAt,
    undoTarget: window.undoTarget,
    undoUntil: window.undoUntil,
    store: {
      exists: storeUsable(store),
      paused: Boolean(store && store.pauseReason === MODE_PAUSE_REASON && store.status === 'inactive'),
      unavailable: Boolean(store && !storeUsable(store)),
    },
    listings: { personal, store: storeKind },
  };
}

function refusal(status, code, message, extra = {}) {
  return { ok: false, status, code, message, ...extra };
}

/**
 * Validates a switch. During signup (`inSetup`) the cooldown is skipped and nothing is recorded.
 * Returns `{ ok: true, leaving, entering }` or a refusal with an HTTP status and code.
 */
async function checkSellerModeChange(user, target, { inSetup = false } = {}) {
  if (!SELLER_MODES.includes(target)) return refusal(400, 'invalid_mode', 'Choose Individual or Shop.');
  const current = currentMode(user);
  if (target === current) return { ok: true, unchanged: true, leaving: [], entering: [] };

  if (!inSetup) {
    const window = changeWindow(user);
    const isUndo = window.undoTarget === target;
    if (!window.cooldownOver && !isUndo) {
      const when = window.nextChangeAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
      return refusal(429, 'cooldown', `You can change how you sell once every ${CHANGE_COOLDOWN_DAYS} days. Next change on ${when}.`, {
        nextChangeAt: window.nextChangeAt,
      });
    }
  }

  if (hasStore(target)) {
    const store = await ownerStore(user._id);
    if (!store) return refusal(409, 'store_required', 'Set up your store first.');
    if (!storeUsable(store)) {
      return refusal(403, 'store_unavailable', 'Your store is not active right now. Contact KinBech support to reopen it.');
    }
  }

  const leaving = kindsFor(current).filter((kind) => !kindsFor(target).includes(kind));
  const entering = kindsFor(target).filter((kind) => !kindsFor(current).includes(kind));
  for (const kind of leaving) {
    const counts = await kindCounts(user._id, kind);
    if (counts.scheduledDeals) {
      return refusal(409, 'open_deals', `You have ${plural(counts.scheduledDeals, 'meetup')} scheduled for ${KIND[kind].label} items. Finish or cancel ${counts.scheduledDeals === 1 ? 'it' : 'them'} first, so no buyer is left waiting.`);
    }
    if (counts.pending) {
      return refusal(409, 'pending_review', `${plural(counts.pending, `${KIND[kind].label} listing`)} ${counts.pending === 1 ? 'is' : 'are'} still under review. Try again once the review is done.`);
    }
  }
  return { ok: true, leaving, entering };
}

/**
 * Applies a validated switch: pauses listings (and the store) of the mode being left,
 * brings back what was paused for the mode being entered, and records the change.
 */
async function applySellerModeChange(user, target, plan, { inSetup = false } = {}) {
  const current = currentMode(user);
  if (plan.unchanged) {
    user.sellerTypePreference = target;
    return { paused: 0, restored: 0 };
  }
  const now = new Date();
  let paused = 0;
  let restored = 0;

  for (const kind of plan.leaving) {
    const result = await Listing.updateMany(
      { seller: user._id, status: 'active', ...KIND[kind].filter },
      {
        $set: {
          status: 'hidden',
          'autoHidden.at': now,
          'autoHidden.reason': MODE_PAUSE_REASON,
          'autoHidden.restoredAt': null,
          statusChange: statusChange('hidden', 'seller', MODE_PAUSE_REASON),
        },
      }
    );
    paused += result.modifiedCount || 0;
    if (kind === 'store') {
      await Shop.updateMany(
        { owner: user._id, status: 'active' },
        { $set: { status: 'inactive', pausedAt: now, pauseReason: MODE_PAUSE_REASON } }
      );
    }
  }

  for (const kind of plan.entering) {
    if (kind === 'store') {
      await Shop.updateMany(
        { owner: user._id, status: 'inactive', pauseReason: MODE_PAUSE_REASON },
        { $set: { status: 'active', pausedAt: null, pauseReason: '' } }
      );
    }
    const result = await Listing.updateMany(
      { seller: user._id, status: 'hidden', 'autoHidden.reason': MODE_PAUSE_REASON, ...KIND[kind].filter },
      {
        $set: {
          status: 'active',
          'autoHidden.restoredAt': now,
          statusChange: statusChange('active', 'seller', MODE_PAUSE_REASON),
        },
      }
    );
    restored += result.modifiedCount || 0;
  }

  if (!inSetup) {
    const last = user.sellerTypeChange || {};
    const isUndo = changeWindow(user, now).undoTarget === target;
    // An undo keeps the original timestamp, so it cannot be used to reset the cooldown.
    user.sellerTypeChange = isUndo
      ? { from: current, to: target, at: last.at, undone: true }
      : { from: current, to: target, at: now, undone: false };
    user.markModified('sellerTypeChange');
  }
  user.sellerTypePreference = target;
  if (paused || restored) listingQueryCache.invalidateAll();
  return { paused, restored };
}

/** Listing-create guard: the listing kind must be switched on for the seller. */
function modeAllowsListing(user, sellerType) {
  const mode = currentMode(user);
  return sellerType === 'shop' ? hasStore(mode) : hasPersonal(mode);
}

module.exports = {
  MODE_PAUSE_REASON,
  SELLER_MODES,
  applySellerModeChange,
  checkSellerModeChange,
  modeAllowsListing,
  normalizeSellerMode,
  sellerModeStatus,
};
