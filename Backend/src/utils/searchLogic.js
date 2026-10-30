/**
 * The search logic language the AI writes: any condition a buyer puts on items becomes `where` entries and any order
 * becomes `order` entries over the listing fields below. Search reads them by field type only, so a new kind of
 * request needs no new code; a new listing field only needs an entry here.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_WHERE = 8;
const MAX_ORDER = 3;
const OPS = ['is', 'not', 'has', '<', '<=', '>', '>=', 'between'];

const daysAgo = (date) => (date ? (Date.now() - new Date(date).getTime()) / DAY_MS : null);

// `path` is the listing field in the database; `get` reads the value from a found listing (with its distance) for
// conditions the database cannot check and for ordering.
const FIELDS = {
  price: { type: 'number', about: 'price in NPR', path: 'price', get: ({ doc }) => doc.price },
  category: { type: 'text', about: 'product category, one exact name from the product categories', path: 'category' },
  condition: { type: 'enum', values: ['New', 'Good', 'Fair'], about: 'New = unused; Good and Fair = used', path: 'condition' },
  brand: { type: 'text', about: 'brand name', path: 'brand' },
  place: { type: 'text', about: 'town or area written on the listing', path: 'location' },
  seller: { type: 'name', about: 'name of the person selling or of their shop' },
  sellerType: { type: 'enum', values: ['individual', 'shop'], about: 'shop = sold by a shop; individual = by a person', path: 'sellerType' },
  onSale: { type: 'boolean', about: 'marked on sale / discounted', path: 'isOnSale' },
  stock: { type: 'number', about: 'pieces in stock', path: 'stock', get: ({ doc }) => doc.stock },
  postedDaysAgo: { type: 'number', about: 'days since it was posted (0 = today)', path: 'createdAt', days: true, get: ({ doc }) => daysAgo(doc.createdAt) },
  views: { type: 'number', about: 'times viewed (popularity)', path: 'views', get: ({ doc }) => doc.views || 0 },
  distanceKm: { type: 'number', about: 'km from the buyer', get: ({ distance }) => distance },
  sellerRating: { type: 'number', about: 'rating of the seller or shop, 0 to 5', get: ({ doc }) => doc.shopId?.ratingAverage ?? doc.seller?.ratingAverage ?? null },
};

/** The field list for the AI prompt. */
function describeSearchFields() {
  return Object.entries(FIELDS).map(([name, field]) => {
    const kind = field.type === 'enum' ? field.values.join('|') : field.type;
    return `  ${name} (${kind}): ${field.about}`;
  }).join('\n');
}

function cleanValue(field, op, value) {
  if (op === 'between') {
    if (!Array.isArray(value) || value.length !== 2) return null;
    const pair = value.map(Number);
    return pair.every(Number.isFinite) ? pair.sort((a, b) => a - b) : null;
  }
  if (field.type === 'number') {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  if (field.type === 'boolean') return value === true || value === 'true';
  if (field.type === 'enum') {
    const wanted = String(value || '').toLowerCase();
    return field.values.find((name) => name.toLowerCase() === wanted) || null;
  }
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return text || null;
}

/** The AI's `where`, keeping only known fields, operators and values. */
function normalizeWhere(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((entry) => {
    const field = FIELDS[entry?.field];
    const op = OPS.includes(entry?.op) ? entry.op : null;
    if (!field || !op || out.length >= MAX_WHERE) return;
    if (['<', '<=', '>', '>=', 'between'].includes(op) && field.type !== 'number') return;
    if (op === 'has' && !['text', 'name'].includes(field.type)) return;
    const value = cleanValue(field, op, entry.value);
    if (value === null) return;
    out.push({ field: entry.field, op, value });
  });
  return out;
}

/** The AI's `order`, keeping only fields that can be ordered. */
function normalizeOrder(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => FIELDS[entry?.field]?.get)
    .slice(0, MAX_ORDER)
    .map((entry) => ({ field: entry.field, dir: entry.dir === 'desc' ? 'desc' : 'asc' }));
}

function parseList(value) {
  if (Array.isArray(value)) return value;
  try {
    const list = JSON.parse(String(value || ''));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Names and places are spelt many ways in Roman letters (Kaushal / Kausal, Barahathawa / Barhathwa): they match on
// their consonants, with any vowels (and h) between them.
const CONSONANT_SOUNDS = { s: '(?:sh|s|z)', k: '(?:kh|k|q)', f: '(?:ph|f)', w: '[wv]' };
const VOWELS = '[aeiouyh]*';

function looseRegex(text) {
  const plain = String(text || '').toLowerCase().replace(/[^a-z\s]/g, '').trim();
  if (!plain) return new RegExp(escapeRegex(String(text || '').trim()), 'i');
  const words = plain.split(/\s+/).map((word) => {
    const consonants = word.replace(/sh|z/g, 's').replace(/kh|q|ck/g, 'k').replace(/ph/g, 'f').replace(/v/g, 'w')
      .replace(/[aeiouyh]/g, '');
    if (!consonants) return escapeRegex(word);
    return VOWELS + [...consonants].map((letter) => CONSONANT_SOUNDS[letter] || letter).join(VOWELS);
  });
  return new RegExp(`\\b${words.join('.*')}`, 'i');
}

function compare(actual, op, value) {
  if (actual == null || Number.isNaN(actual)) return false;
  if (op === 'between') return actual >= value[0] && actual <= value[1];
  if (op === '<') return actual < value;
  if (op === '<=') return actual <= value;
  if (op === '>') return actual > value;
  if (op === '>=') return actual >= value;
  if (op === 'not') return actual !== value;
  return actual === value;
}

const MONGO_OPS = { '<': '$lt', '<=': '$lte', '>': '$gt', '>=': '$gte' };
// A smaller "days ago" is a later date.
const FLIPPED = { '<': '$gt', '<=': '$gte', '>': '$lt', '>=': '$lte' };

function numberClause(field, op, value) {
  const toValue = (num) => (field.days ? new Date(Date.now() - num * DAY_MS) : num);
  if (op === 'between') {
    const [low, high] = field.days ? [value[1], value[0]] : value;
    return { [field.path]: { $gte: toValue(low), $lte: toValue(high) } };
  }
  if (op === 'is' || op === 'not') {
    if (field.days) {
      const range = { $gte: toValue(value + 1), $lte: toValue(value) };
      return op === 'is' ? { [field.path]: range } : { [field.path]: { $not: range } };
    }
    return { [field.path]: op === 'is' ? value : { $ne: value } };
  }
  const mongoOp = (field.days ? FLIPPED : MONGO_OPS)[op];
  return { [field.path]: { [mongoOp]: toValue(value) } };
}

// A spoken name is usually part of the full one ("Kaushal" for "Kausal Kinara Pasal"), so names always match loosely.
async function sellerClause(op, value) {
  const User = require('../models/User');
  const Shop = require('../models/Shop');
  const name = looseRegex(value);
  const [users, shops] = await Promise.all([
    User.find({ name }).select('_id').limit(200).lean(),
    Shop.find({ name }).select('_id').limit(200).lean(),
  ]);
  const match = [
    { seller: { $in: users.map((user) => user._id) } },
    { shopId: { $in: shops.map((shop) => shop._id) } },
  ];
  return op === 'not' ? { $nor: match } : { $or: match };
}

/** The seller or shop a spoken name means (the one with most items for sale), or null. */
async function findSellerByName(spoken) {
  const User = require('../models/User');
  const Shop = require('../models/Shop');
  const Listing = require('../models/Listing');
  const name = looseRegex(spoken);
  const [users, shops] = await Promise.all([
    User.find({ name }).select('_id name').limit(20).lean(),
    Shop.find({ name }).select('_id name').limit(20).lean(),
  ]);
  if (!users.length && !shops.length) return null;
  const counts = await Listing.aggregate([
    { $match: { status: 'active', $or: [{ seller: { $in: users.map((u) => u._id) } }, { shopId: { $in: shops.map((s) => s._id) } }] } },
    { $group: { _id: { $ifNull: ['$shopId', '$seller'] }, items: { $sum: 1 } } },
  ]);
  const itemsOf = (id) => counts.find((row) => String(row._id) === String(id))?.items || 0;
  const found = [
    ...shops.map((shop) => ({ kind: 'shop', id: String(shop._id), name: shop.name, items: itemsOf(shop._id) })),
    ...users.map((user) => ({ kind: 'seller', id: String(user._id), name: user.name, items: itemsOf(user._id) })),
  ].sort((a, b) => b.items - a.items);
  const { items, ...best } = found[0];
  return best;
}

/**
 * `where` as database conditions (`clauses`) plus checks on found listings (`checks`, e.g. distance and rating).
 */
async function buildSearchLogic(rawWhere, rawOrder) {
  const where = normalizeWhere(parseList(rawWhere));
  const order = normalizeOrder(parseList(rawOrder));
  const clauses = [];
  const checks = [];
  for (const { field: name, op, value } of where) {
    const field = FIELDS[name];
    if (field.type === 'name') {
      clauses.push(await sellerClause(op, value));
    } else if (!field.path) {
      checks.push((row) => compare(field.get(row), op, value));
    } else if (field.type === 'number') {
      clauses.push(numberClause(field, op, value));
    } else if (field.type === 'text') {
      const exact = new RegExp(`^${escapeRegex(value)}$`, 'i');
      if (op === 'is') clauses.push({ [field.path]: exact });
      else if (op === 'not') clauses.push({ [field.path]: { $not: exact } });
      else clauses.push({ [field.path]: looseRegex(value) });
    } else {
      clauses.push({ [field.path]: op === 'not' ? { $ne: value } : value });
    }
  }
  return { where, order, clauses, checks };
}

/** Orders found listings by `order` (most important first); listings without a value go last. */
function compareByOrder(order) {
  return (a, b) => {
    for (const { field, dir } of order) {
      const va = FIELDS[field].get(a);
      const vb = FIELDS[field].get(b);
      if (va == null && vb == null) continue;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va !== vb) return dir === 'desc' ? vb - va : va - vb;
    }
    return 0;
  };
}

module.exports = {
  buildSearchLogic,
  compareByOrder,
  describeSearchFields,
  findSellerByName,
  normalizeOrder,
  normalizeWhere,
};
