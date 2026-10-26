const PlatformSettings = require('../models/PlatformSettings');

const DEFAULTS = {
  listingExpiryDays: 0,
  minListingPrice: 0,
  defaultCurrency: 'NPR',
  supportEmail: 'support@kinbech.com',
};

function present(doc) {
  return {
    listingExpiryDays: Number(doc?.listingExpiryDays) || 0,
    minListingPrice: Number(doc?.minListingPrice) || 0,
    defaultCurrency: doc?.defaultCurrency || DEFAULTS.defaultCurrency,
    supportEmail: doc?.supportEmail || DEFAULTS.supportEmail,
  };
}

async function getPlatformSettings() {
  const doc = await PlatformSettings.findOne({ key: 'platform' }).lean();
  return present(doc);
}

async function savePlatformSettings(input) {
  const days = Math.max(0, Number(input.listingExpiryDays) || 0);
  const minPrice = Math.max(0, Number(input.minListingPrice) || 0);
  const currency = String(input.defaultCurrency || DEFAULTS.defaultCurrency).trim().toUpperCase();
  const email = String(input.supportEmail || DEFAULTS.supportEmail).trim();
  if (!['NPR', 'USD', 'EUR'].includes(currency)) {
    const error = new Error('Currency must be NPR, USD, or EUR');
    error.status = 400;
    throw error;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const error = new Error('Support email is invalid');
    error.status = 400;
    throw error;
  }
  const doc = await PlatformSettings.findOneAndUpdate(
    { key: 'platform' },
    {
      key: 'platform',
      listingExpiryDays: days,
      minListingPrice: minPrice,
      defaultCurrency: currency,
      supportEmail: email,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return present(doc);
}

module.exports = { getPlatformSettings, savePlatformSettings };
