const mongoose = require('mongoose');
const Listing = require('../models/Listing');
const AiUserUsage = require('../models/AiUserUsage');

const LEVELS = ['new', 'regular', 'heavy'];

function levelLimits(settings) {
  const newUpTo = Math.max(1, Number(settings?.newSellerListings) || 3);
  const heavyFrom = Math.max(newUpTo + 1, Number(settings?.heavySellerListings) || 20);
  const reserve = Math.max(0, Number.isFinite(settings?.newSellerReserve) ? settings.newSellerReserve : 5);
  return { newUpTo, heavyFrom, reserve };
}

function levelForCount(count, settings) {
  const { newUpTo, heavyFrom } = levelLimits(settings);
  if (count < newUpTo) return 'new';
  if (count >= heavyFrom) return 'heavy';
  return 'regular';
}

/**
 * How much a seller has used KinBech so far: listings posted, or AI photo fills in the last
 * 60 days, whichever is higher (someone who keeps filling without posting is not "new").
 */
async function sellerLevel(userId, settings) {
  if (!mongoose.isValidObjectId(userId)) return { level: 'regular', listings: 0, aiFills: 0 };
  const id = new mongoose.Types.ObjectId(String(userId));
  const [listings, fills] = await Promise.all([
    Listing.countDocuments({ seller: id }),
    AiUserUsage.aggregate([{ $match: { user: id } }, { $group: { _id: null, total: { $sum: '$count' } } }]),
  ]);
  const aiFills = fills[0]?.total || 0;
  return { level: levelForCount(Math.max(listings, aiFills), settings), listings, aiFills };
}

module.exports = { LEVELS, levelForCount, levelLimits, sellerLevel };
