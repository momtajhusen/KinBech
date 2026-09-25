const Category = require('../models/Category');
const RestrictedKeyword = require('../models/RestrictedKeyword');

const KEYWORD_CACHE_TTL_MS = 60_000;
let keywordCache = { at: 0, items: null };

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadActiveKeywords(force = false) {
  const now = Date.now();
  if (!force && keywordCache.items && now - keywordCache.at < KEYWORD_CACHE_TTL_MS) {
    return keywordCache.items;
  }
  const items = await RestrictedKeyword.find({ isActive: true }).lean();
  keywordCache = { at: now, items };
  return items;
}

function invalidateKeywordCache() {
  keywordCache = { at: 0, items: null };
}

function fieldMatches(text, keyword, matchMode) {
  const haystack = normalizeText(text);
  const needle = normalizeText(keyword);
  if (!haystack || !needle) return false;

  if (matchMode === 'exact') {
    return haystack === needle;
  }
  if (matchMode === 'word') {
    const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(needle)}([^a-z0-9]|$)`, 'i');
    return re.test(haystack);
  }
  return haystack.includes(needle);
}

function collectMatches(listingLike, keywords) {
  const fields = {
    title: listingLike.title,
    description: listingLike.description,
    brand: listingLike.brand,
    sku: listingLike.sku,
    location: listingLike.location,
    category: listingLike.category,
  };

  const matches = [];
  for (const rule of keywords) {
    const targets = Array.isArray(rule.matchFields) && rule.matchFields.length
      ? rule.matchFields
      : ['title', 'description'];
    for (const field of targets) {
      if (fieldMatches(fields[field], rule.keyword, rule.matchMode || 'contains')) {
        matches.push({
          keyword: rule.keyword,
          field,
          severity: rule.severity || 'hold',
          matchMode: rule.matchMode || 'contains',
        });
        break;
      }
    }
  }
  return matches;
}

/**
 * Decide listing status for create/update.
 * - block keywords → reject with 400
 * - hold keywords OR category requiresPreApproval → pending
 * - else → active (unless already sold)
 */
async function evaluateListingModeration(listingLike, { currentStatus } = {}) {
  if (currentStatus === 'sold') {
    return {
      ok: true,
      status: 'sold',
      matchedKeywords: [],
      requiresPreApproval: false,
      reason: '',
    };
  }

  const [keywords, categoryDoc] = await Promise.all([
    loadActiveKeywords(),
    listingLike.category
      ? Category.findOne({
          type: 'product',
          name: String(listingLike.category).trim(),
          isActive: true,
        }).lean()
      : null,
  ]);

  const matches = collectMatches(listingLike, keywords);
  const blocked = matches.filter((m) => m.severity === 'block');
  if (blocked.length) {
    const names = [...new Set(blocked.map((m) => m.keyword))];
    return {
      ok: false,
      status: 'pending',
      matchedKeywords: names,
      requiresPreApproval: false,
      reason: `Prohibited content detected: ${names.join(', ')}. Remove restricted words and try again.`,
      httpStatus: 400,
    };
  }

  const held = matches.filter((m) => m.severity === 'hold');
  const requiresPreApproval = Boolean(categoryDoc?.requiresPreApproval);
  const matchedKeywords = [...new Set(held.map((m) => m.keyword))];

  if (held.length || requiresPreApproval) {
    const reasons = [];
    if (held.length) {
      reasons.push(`Restricted keyword(s): ${matchedKeywords.join(', ')}`);
    }
    if (requiresPreApproval) {
      reasons.push(`Category "${listingLike.category}" requires admin pre-approval`);
    }
    return {
      ok: true,
      status: 'pending',
      matchedKeywords,
      requiresPreApproval,
      reason: reasons.join('. '),
      httpStatus: 200,
    };
  }

  return {
    ok: true,
    status: 'active',
    matchedKeywords: [],
    requiresPreApproval: false,
    reason: '',
    httpStatus: 200,
  };
}

const SEED_KEYWORDS = [
  { keyword: 'gun', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'guns', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'pistol', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'rifle', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'shotgun', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'firearm', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'weapon', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'weapons', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'ammunition', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'ammo', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'revolver', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'ak-47', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'ak47', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'airgun', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'air gun', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'बन्दुक', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'हतियार', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'cocaine', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'heroin', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'weed for sale', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'porn', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'xxx', matchFields: ['title', 'description'], severity: 'block', matchMode: 'word' },
  { keyword: 'onlyfans', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'stolen', matchFields: ['title', 'description'], severity: 'hold', matchMode: 'word' },
  { keyword: 'blacklisted imei', matchFields: ['title', 'description'], severity: 'hold', matchMode: 'contains' },
  { keyword: 'fake iphone', matchFields: ['title', 'description'], severity: 'hold', matchMode: 'contains' },
  { keyword: 'counterfeit', matchFields: ['title', 'description', 'brand'], severity: 'hold', matchMode: 'contains' },
  { keyword: 'replica watch', matchFields: ['title', 'description'], severity: 'hold', matchMode: 'contains' },
  { keyword: 'shutterstock', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'stock photo', matchFields: ['title', 'description'], severity: 'block', matchMode: 'contains' },
  { keyword: 'not actual product', matchFields: ['title', 'description'], severity: 'hold', matchMode: 'contains' },
];

async function ensureSeedKeywords() {
  const count = await RestrictedKeyword.countDocuments();
  if (count === 0) {
    await RestrictedKeyword.insertMany(
      SEED_KEYWORDS.map((item) => ({
        ...item,
        keyword: String(item.keyword).trim().toLowerCase(),
        isActive: true,
        notes: 'Default KinBech safety seed',
      }))
    );
    invalidateKeywordCache();
    return { seeded: true, count: SEED_KEYWORDS.length };
  }

  // Upsert any new safety keywords missing from DB
  let added = 0;
  for (const item of SEED_KEYWORDS) {
    const keyword = String(item.keyword).trim().toLowerCase();
    const existing = await RestrictedKeyword.findOne({ keyword }).lean();
    if (existing) continue;
    await RestrictedKeyword.create({
      ...item,
      keyword,
      isActive: true,
      notes: 'KinBech safety upsert',
    });
    added += 1;
  }
  if (added) invalidateKeywordCache();
  return { seeded: false, count, added };
}

module.exports = {
  evaluateListingModeration,
  invalidateKeywordCache,
  ensureSeedKeywords,
  loadActiveKeywords,
  MATCH_FIELDS: RestrictedKeyword.MATCH_FIELDS || [
    'title',
    'description',
    'brand',
    'sku',
    'location',
    'category',
  ],
};
