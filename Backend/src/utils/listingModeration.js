const Category = require('../models/Category');
const RestrictedKeyword = require('../models/RestrictedKeyword');

const MATCH_FIELDS = RestrictedKeyword.MATCH_FIELDS;
const SURFACES = RestrictedKeyword.SURFACES;
const ALL_PUBLIC_SURFACES = [...SURFACES];
const DEFAULT_BLOCK_FIELDS = [
  'title',
  'description',
  'searchWords',
  'name',
  'bio',
  'shopName',
  'shopDescription',
];

const KEYWORD_CACHE_TTL_MS = 60_000;
let keywordCache = { at: 0, items: null };

const FIELD_LABELS = {
  title: 'Title',
  description: 'Description',
  searchWords: 'Search words',
  brand: 'Brand',
  sku: 'SKU',
  location: 'Location',
  category: 'Category',
  variants: 'Product options',
  name: 'Name',
  bio: 'Bio',
  shopName: 'Shop name',
  shopDescription: 'Shop description',
  shopTagline: 'Shop tagline',
  shopCategory: 'Shop category',
  shopAddress: 'Address',
  review: 'Review',
};

const PUBLIC_BLOCK_MESSAGE =
  'This text is not allowed on KinBech. Remove adult, violent, or other prohibited words and try again.';

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[-_.*/\\|~+]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fieldLabel(field) {
  return FIELD_LABELS[field] || 'This field';
}

function fieldErrorMessage(field) {
  return `${fieldLabel(field)} cannot be saved. Remove adult, violent, or other prohibited words and try again.`;
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
    const re = new RegExp(`(^|[^a-z0-9\\u0900-\\u097F])${escapeRegex(needle)}([^a-z0-9\\u0900-\\u097F]|$)`, 'i');
    return re.test(haystack);
  }
  if (haystack.includes(needle)) return true;
  return looseSpacingMatches(haystack, needle);
}

// Catches "airgun" / "air-gun" for "air gun" and "ak 47" for "ak47".
function looseSpacingMatches(haystack, needle) {
  const parts = needle.split(/\s+|(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])/).filter(Boolean);
  if (parts.length < 2) return false;
  const re = new RegExp(`(^|[^a-z0-9\\u0900-\\u097F])${parts.map(escapeRegex).join('\\s?')}`, 'i');
  return re.test(haystack);
}

function flattenVariants(listingLike) {
  const parts = [];
  for (const option of listingLike.variantOptions || []) {
    parts.push(option?.name);
    for (const value of option?.values || []) parts.push(value);
  }
  for (const variant of listingLike.variants || []) {
    parts.push(variant?.sku, variant?.label, variant?.name);
    if (variant?.options && typeof variant.options === 'object') {
      parts.push(...Object.values(variant.options));
    }
  }
  return parts.filter(Boolean).join(' ');
}

function listingFieldBag(listingLike) {
  return {
    title: listingLike.title,
    description: listingLike.description,
    brand: listingLike.brand,
    sku: listingLike.sku,
    location: listingLike.location,
    category: listingLike.category,
    searchWords: Array.isArray(listingLike.searchWords)
      ? listingLike.searchWords.join(' ')
      : listingLike.searchWords,
    variants: flattenVariants(listingLike),
  };
}

function ruleSurfaces(rule) {
  if ((rule.severity || 'block') === 'block') return ALL_PUBLIC_SURFACES;
  if (Array.isArray(rule.surfaces) && rule.surfaces.length) {
    return rule.surfaces;
  }
  return rule.severity === 'block' ? ALL_PUBLIC_SURFACES : ['listing'];
}

function ruleApplies(rule, surface) {
  return ruleSurfaces(rule).includes(surface);
}

function fieldsToScan(rule, fieldBag, surface) {
  if ((rule.severity || 'block') === 'block') return Object.keys(fieldBag);
  const configured =
    Array.isArray(rule.matchFields) && rule.matchFields.length
      ? rule.matchFields
      : Object.keys(fieldBag);
  const overlap = configured.filter((field) => Object.prototype.hasOwnProperty.call(fieldBag, field));
  if (overlap.length) return overlap;
  if (surface !== 'listing') return Object.keys(fieldBag);
  return [];
}

function collectMatches(fieldBag, keywords, surface) {
  const matches = [];
  for (const rule of keywords) {
    if (!ruleApplies(rule, surface)) continue;
    const targets = fieldsToScan(rule, fieldBag, surface);
    for (const field of targets) {
      if (fieldMatches(fieldBag[field], rule.keyword, rule.matchMode || 'contains')) {
        matches.push({
          keyword: rule.keyword,
          field,
          severity: rule.severity || 'block',
          matchMode: rule.matchMode || 'contains',
        });
        break;
      }
    }
  }
  return matches;
}

function prohibitedResult(matches) {
  const fieldErrors = {};
  for (const match of matches) {
    if (!fieldErrors[match.field]) {
      fieldErrors[match.field] = fieldErrorMessage(match.field);
    }
  }
  const firstField = matches[0]?.field;
  return {
    ok: false,
    httpStatus: 400,
    code: 'PROHIBITED_CONTENT',
    message: firstField ? fieldErrorMessage(firstField) : PUBLIC_BLOCK_MESSAGE,
    fieldErrors,
    matchedKeywords: [...new Set(matches.map((item) => item.keyword))],
    matches,
  };
}

/**
 * Block public text that matches restricted keywords.
 * Listings: only `block` severity rejects (hold still goes to review).
 * Profile / shop / review: any matching keyword is rejected so it never shows publicly.
 */
async function evaluatePublicText(fieldBag, surface = 'listing') {
  const keywords = await loadActiveKeywords();
  const matches = collectMatches(fieldBag, keywords, surface);
  if (!matches.length) {
    return { ok: true, matches: [], matchedKeywords: [] };
  }

  const blocking =
    surface === 'listing' ? matches.filter((item) => item.severity === 'block') : matches;
  if (!blocking.length) {
    return { ok: true, matches, matchedKeywords: [...new Set(matches.map((item) => item.keyword))] };
  }
  return prohibitedResult(blocking);
}

function publicProhibitedBody(result) {
  return {
    code: result.code || 'PROHIBITED_CONTENT',
    message: result.message || PUBLIC_BLOCK_MESSAGE,
    fieldErrors: result.fieldErrors || {},
  };
}

/**
 * Decide listing status for create/update.
 * - block or hold keywords OR category requiresPreApproval → pending (manual review)
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
      fieldErrors: {},
    };
  }

  const fieldBag = listingFieldBag(listingLike);
  const [publicCheck, categoryDoc] = await Promise.all([
    evaluatePublicText(fieldBag, 'listing'),
    listingLike.category
      ? Category.findOne({
          type: 'product',
          isActive: true,
          name: new RegExp(
            `^${String(listingLike.category).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
            'i'
          ),
        }).lean()
      : null,
  ]);

  if (!publicCheck.ok) {
    return {
      ...publicCheck,
      prohibited: true,
      requiresPreApproval: false,
      reason: publicCheck.message,
    };
  }

  const held = (publicCheck.matches || []).filter((item) => item.severity === 'hold');
  const requiresPreApproval = Boolean(categoryDoc?.requiresPreApproval);
  const matchedKeywords = [...new Set(held.map((item) => item.keyword))];

  if (held.length || requiresPreApproval) {
    const reasons = [];
    if (held.length) {
      reasons.push('This listing was held for review because it may break marketplace rules.');
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
      fieldErrors: {},
    };
  }

  return {
    ok: true,
    status: 'active',
    matchedKeywords: [],
    requiresPreApproval: false,
    reason: '',
    httpStatus: 200,
    fieldErrors: {},
  };
}

async function testPublicText({ text, surface = 'listing', field = '' } = {}) {
  const bagKey =
    field && MATCH_FIELDS.includes(field)
      ? field
      : surface === 'profile'
        ? 'name'
        : surface === 'shop'
          ? 'shopName'
          : surface === 'review'
            ? 'review'
            : 'title';
  const fieldBag = { [bagKey]: text };
  const keywords = await loadActiveKeywords();
  const matches = collectMatches(fieldBag, keywords, surface);
  const blocked = surface === 'listing' ? matches.filter((item) => item.severity === 'block') : matches;
  return {
    ok: blocked.length === 0,
    surface,
    field: bagKey,
    matches: matches.map((item) => ({
      keyword: item.keyword,
      field: item.field,
      severity: item.severity,
    })),
    wouldBlock: blocked.length > 0,
    message: blocked.length ? fieldErrorMessage(bagKey) : 'No restricted words found.',
  };
}

const SEED_KEYWORDS = [
  { keyword: 'gun', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'guns', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'pistol', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'rifle', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'shotgun', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'firearm', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'weapon', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'weapons', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'ammunition', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'ammo', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'revolver', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'ak-47', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'ak47', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'airgun', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'air gun', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'बन्दुक', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'हतियार', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'cocaine', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'heroin', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'weed for sale', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'porn', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'xxx', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'onlyfans', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'nude', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'nudes', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'naked photo', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'pornography', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'nsfw', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'explicit sex', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'sex video', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'child porn', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'underage', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'rape', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'rapist', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'beheading', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'gore video', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'snuff', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'torture video', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'kill for hire', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'hitman', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'bomb making', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'grenade', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'explosive', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
  { keyword: 'molotov', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'नग्न', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'अश्लील', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'पोर्न', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'बलात्कार', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'हत्या', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'contains' },
  { keyword: 'बम', matchFields: DEFAULT_BLOCK_FIELDS, severity: 'block', matchMode: 'word' },
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
        surfaces: item.severity === 'block' ? ALL_PUBLIC_SURFACES : ['listing'],
        isActive: true,
        notes: 'Default KinBech safety seed',
      }))
    );
    invalidateKeywordCache();
    return { seeded: true, count: SEED_KEYWORDS.length };
  }

  let added = 0;
  let updated = 0;
  for (const item of SEED_KEYWORDS) {
    const keyword = String(item.keyword).trim().toLowerCase();
    const existing = await RestrictedKeyword.findOne({ keyword });
    if (!existing) {
      await RestrictedKeyword.create({
        ...item,
        keyword,
        surfaces: item.severity === 'block' ? ALL_PUBLIC_SURFACES : ['listing'],
        isActive: true,
        notes: 'KinBech safety upsert',
      });
      added += 1;
      continue;
    }

    if (item.severity === 'block') {
      const nextFields = [...new Set([...(existing.matchFields || []), ...(item.matchFields || [])])];
      const nextSurfaces = [...new Set([...(existing.surfaces || []), ...ALL_PUBLIC_SURFACES])];
      const fieldsChanged = nextFields.length !== (existing.matchFields || []).length;
      const surfacesChanged = nextSurfaces.length !== (existing.surfaces || []).length;
      if (fieldsChanged || surfacesChanged) {
        existing.matchFields = nextFields;
        existing.surfaces = nextSurfaces;
        await existing.save();
        updated += 1;
      }
    }
  }
  if (added || updated) invalidateKeywordCache();
  return { seeded: false, count, added, updated };
}

module.exports = {
  evaluateListingModeration,
  evaluatePublicText,
  testPublicText,
  publicProhibitedBody,
  listingFieldBag,
  invalidateKeywordCache,
  ensureSeedKeywords,
  loadActiveKeywords,
  MATCH_FIELDS,
  SURFACES,
  FIELD_LABELS,
  PUBLIC_BLOCK_MESSAGE,
};
