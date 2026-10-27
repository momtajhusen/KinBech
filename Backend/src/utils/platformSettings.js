const PlatformSettings = require('../models/PlatformSettings');

const DEFAULTS = {
  listingExpiryDays: 0,
  minListingPrice: 0,
  defaultCurrency: 'NPR',
  supportEmail: 'support@kinbech.com',
  individualDailyListings: 0,
  shopDailyListings: 0,
};

const MAX_DAILY_LISTINGS = 1000;

function present(doc) {
  return {
    listingExpiryDays: Number(doc?.listingExpiryDays) || 0,
    minListingPrice: Number(doc?.minListingPrice) || 0,
    defaultCurrency: doc?.defaultCurrency || DEFAULTS.defaultCurrency,
    supportEmail: doc?.supportEmail || DEFAULTS.supportEmail,
    individualDailyListings: Number(doc?.individualDailyListings) || 0,
    shopDailyListings: Number(doc?.shopDailyListings) || 0,
  };
}

async function getPlatformSettings() {
  const doc = await PlatformSettings.findOne({ key: 'platform' }).lean();
  return present(doc);
}

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/** Saves only the fields sent, so one admin card can save without resetting the others. */
async function savePlatformSettings(input) {
  const update = { key: 'platform' };
  if (input.listingExpiryDays !== undefined) {
    update.listingExpiryDays = Math.max(0, Number(input.listingExpiryDays) || 0);
  }
  if (input.minListingPrice !== undefined) {
    update.minListingPrice = Math.max(0, Number(input.minListingPrice) || 0);
  }
  if (input.defaultCurrency !== undefined) {
    const currency = String(input.defaultCurrency || DEFAULTS.defaultCurrency).trim().toUpperCase();
    if (!['NPR', 'USD', 'EUR'].includes(currency)) throw badRequest('Currency must be NPR, USD, or EUR');
    update.defaultCurrency = currency;
  }
  if (input.supportEmail !== undefined) {
    const email = String(input.supportEmail || DEFAULTS.supportEmail).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw badRequest('Support email is invalid');
    update.supportEmail = email;
  }
  for (const key of ['individualDailyListings', 'shopDailyListings']) {
    if (input[key] === undefined) continue;
    const value = Number(input[key]);
    if (!Number.isInteger(value) || value < 0 || value > MAX_DAILY_LISTINGS) {
      throw badRequest(`Daily post limit must be a whole number from 0 to ${MAX_DAILY_LISTINGS}`);
    }
    update[key] = value;
  }
  const doc = await PlatformSettings.findOneAndUpdate(
    { key: 'platform' },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return present(doc);
}

module.exports = { getPlatformSettings, savePlatformSettings, MAX_DAILY_LISTINGS };
