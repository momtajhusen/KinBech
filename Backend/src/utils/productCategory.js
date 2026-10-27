const Category = require('../models/Category');
const { PRODUCT_DEFAULTS } = require('./categoryDefaults');

const JUNK = new Set([
  'other', 'others', 'general', 'misc', 'miscellaneous', 'item', 'items',
  'product', 'products', 'stuff', 'used', 'new', 'sale', 'for', 'and',
]);

const PALETTE = ['#5B39C6', '#16A34A', '#DB2777', '#059669', '#4F46E5', '#EC4899', '#0D9488', '#D97706', '#2563EB'];

const ICON_RULES = [
  [/book|novel|stationery|copy/i, { icon: 'book-outline', color: '#0D9488' }],
  [/toy|game|kids|baby/i, { icon: 'game-controller-outline', color: '#EA580C' }],
  [/beauty|cosmetic|makeup|skincare/i, { icon: 'flower-outline', color: '#EC4899' }],
  [/tool|hardware|drill/i, { icon: 'construct-outline', color: '#64748B' }],
  [/pet|dog|cat|aquarium/i, { icon: 'paw-outline', color: '#CA8A04' }],
  [/jewel|watch|gold|silver/i, { icon: 'diamond-outline', color: '#D97706' }],
  [/kitchen|home|decor|utensil/i, { icon: 'home-outline', color: '#059669' }],
  [/music|guitar|instrument/i, { icon: 'musical-notes-outline', color: '#7C3AED' }],
  [/camera|photo|dslr/i, { icon: 'camera-outline', color: '#2563EB' }],
  [/power|inverter|battery|solar|ups/i, { icon: 'flash-outline', color: '#D97706' }],
  [/fan|cooler|ac|fridge|appliance/i, { icon: 'snow-outline', color: '#0EA5E9' }],
  [/phone|mobile|iphone/i, { icon: 'phone-portrait-outline', color: '#5B39C6' }],
  [/laptop|macbook|computer/i, { icon: 'laptop-outline', color: '#16A34A' }],
  [/sofa|chair|table|bed|furniture/i, { icon: 'bed-outline', color: '#059669' }],
  [/car|bike|scooter|vehicle/i, { icon: 'car-outline', color: '#4F46E5' }],
  [/shirt|shoe|fashion|cloth/i, { icon: 'shirt-outline', color: '#EC4899' }],
  [/gym|sport|fitness|dumbbell/i, { icon: 'barbell-outline', color: '#0D9488' }],
];

const TYPE_KEYWORDS = {
  Mobiles: [
    'phone', 'iphone', 'smartphone', 'mobile', 'android', 'redmi', 'xiaomi',
    'samsung galaxy', 'oneplus', 'pixel', 'nokia', 'phone cover', 'phone case',
    'mobile cover', 'back cover', 'charger', 'earphone',
  ],
  Laptops: ['laptop', 'macbook', 'notebook', 'thinkpad', 'chromebook', 'ultrabook'],
  Electronics: [
    'tv', 'television', 'headphone', 'earbud', 'speaker', 'ssd', 'hdd', 'monitor',
    'router', 'camera', 'console', 'playstation', 'xbox', 'fan', 'inverter',
    'power supply', 'adaptor', 'adapter', 'mixer', 'iron', 'trimmer', 'gadget',
  ],
  Furniture: ['sofa', 'chair', 'table', 'bed', 'wardrobe', 'mattress', 'almirah', 'stool', 'desk'],
  Vehicles: ['car', 'bike', 'motorcycle', 'scooter', 'scooty', 'activa', 'bicycle', 'tyre'],
  Fashion: ['shirt', 'jeans', 'shoes', 'saree', 'kurta', 'jacket', 'bag', 'hoodie', 'tshirt'],
  'Sports & Fitness': ['gym', 'dumbbell', 'treadmill', 'cricket', 'football', 'yoga', 'barbell', 'bat'],
};

const ALIASES = {
  mobile: 'Mobiles',
  mobiles: 'Mobiles',
  phone: 'Mobiles',
  phones: 'Mobiles',
  smartphone: 'Mobiles',
  smartphones: 'Mobiles',
  cellphone: 'Mobiles',
  iphone: 'Mobiles',
  laptop: 'Laptops',
  laptops: 'Laptops',
  notebook: 'Laptops',
  notebooks: 'Laptops',
  macbook: 'Laptops',
  computer: 'Laptops',
  computers: 'Laptops',
  pc: 'Laptops',
  electronics: 'Electronics',
  electronic: 'Electronics',
  gadget: 'Electronics',
  gadgets: 'Electronics',
  appliance: 'Electronics',
  appliances: 'Electronics',
  furniture: 'Furniture',
  furnitures: 'Furniture',
  vehicle: 'Vehicles',
  vehicles: 'Vehicles',
  automobile: 'Vehicles',
  automotive: 'Vehicles',
  fashion: 'Fashion',
  clothing: 'Fashion',
  clothes: 'Fashion',
  apparel: 'Fashion',
  sport: 'Sports & Fitness',
  sports: 'Sports & Fitness',
  fitness: 'Sports & Fitness',
  gym: 'Sports & Fitness',
  book: 'Books & Stationery',
  books: 'Books & Stationery',
  stationery: 'Books & Stationery',
  toy: 'Toys & Games',
  toys: 'Toys & Games',
  games: 'Toys & Games',
  beauty: 'Beauty & Personal Care',
  cosmetics: 'Beauty & Personal Care',
  headphone: 'Electronics',
  headphones: 'Electronics',
  earphone: 'Electronics',
  earphones: 'Electronics',
  ssd: 'Electronics',
  inverter: 'Electronics',
  charger: 'Mobiles',
};

function fold(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .replace(/[^\w\s&]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(word) {
  const w = String(word || '');
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (/(ses|xes|zes|ches|shes)$/.test(w) && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && !w.endsWith('ss') && w.length > 3) return w.slice(0, -1);
  return w;
}

function tokens(value) {
  return fold(value)
    .split(' ')
    .map(singularize)
    .filter((t) => t && !JUNK.has(t));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const tmp = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = tmp;
    }
  }
  return row[b.length];
}

function toDisplayName(raw) {
  const words = String(raw || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/’/g, "'")
    .replace(/[^\w\s&']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w && !JUNK.has(w))
    .slice(0, 4);
  if (!words.length) return '';
  return words
    .map((w) => (w === '&' ? '&' : `${w.charAt(0).toUpperCase()}${w.slice(1)}`))
    .join(' ')
    .slice(0, 36);
}

function styleForName(name) {
  const rule = ICON_RULES.find(([re]) => re.test(name));
  if (rule) return rule[1];
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  return { icon: 'pricetag-outline', color: PALETTE[hash % PALETTE.length] };
}

async function ensureProductCategories() {
  const count = await Category.countDocuments({ type: 'product' });
  if (count > 0) return;
  await Category.insertMany(
    PRODUCT_DEFAULTS.map((item, index) => ({
      type: 'product',
      name: item.name,
      icon: item.icon,
      color: item.color,
      description: item.description || '',
      sortOrder: index,
      isActive: true,
    }))
  );
}

async function listProductCategories() {
  await ensureProductCategories();
  return Category.find({ type: 'product', isActive: true }).sort({ sortOrder: 1, name: 1 });
}

/** Whole words only, so "cover" does not match "hardcover" and "fan" does not match "fantasy". */
function wordText(value) {
  return ` ${fold(value).split(' ').filter(Boolean).map(singularize).join(' ')} `;
}

function hasPhrase(text, phrase) {
  const words = wordText(phrase).trim();
  return Boolean(words) && text.includes(` ${words} `);
}

/**
 * `named` is true when the category relates to the AI's own category name; a match found only
 * in the title or description is weaker and must not override an explicit new class like "Books".
 */
function scoreCategory(doc, { suggested, title, description }) {
  const nameFold = fold(doc.name);
  const nameSing = singularize(nameFold);
  const suggestedFold = fold(suggested);
  const suggestedSing = singularize(suggestedFold);
  const catTokens = tokens(doc.name);
  const sugTokens = tokens(suggested);
  const suggestedWords = wordText(suggested);
  const blobWords = wordText(`${title} ${description}`);
  let score = 0;

  if (suggestedFold && suggestedFold === nameFold) score += 120;
  else if (suggestedSing && suggestedSing === nameSing) score += 110;

  const alias = ALIASES[suggestedFold] || ALIASES[suggestedSing];
  if (alias && fold(alias) === nameFold) score += 100;

  if (sugTokens.length && catTokens.length) {
    const overlap = sugTokens.filter((t) => catTokens.includes(t)).length;
    if (overlap === catTokens.length) score += 80;
    if (overlap === sugTokens.length && overlap > 0) score += 70;
    if (overlap > 0) score += overlap * 18;
  }

  const hasWords = (text, part) => ` ${text} `.includes(` ${part} `);
  if (suggestedFold && hasWords(nameFold, suggestedFold) && suggestedFold.length >= 4) score += 55;
  if (suggestedFold && hasWords(suggestedFold, nameFold) && nameFold.length >= 4) score += 75;

  if (suggestedFold && nameFold) {
    const dist = levenshtein(suggestedSing, nameSing);
    if (dist === 1) score += 50;
    if (dist === 2 && Math.min(suggestedSing.length, nameSing.length) >= 6) score += 30;
  }

  const keywords = TYPE_KEYWORDS[doc.name] || [];
  let namedHits = 0;
  let keywordHits = 0;
  keywords.forEach((word) => {
    if (hasPhrase(suggestedWords, word)) namedHits += 1;
    else if (hasPhrase(blobWords, word)) keywordHits += 1;
  });
  const named = score > 0 || namedHits > 0;
  if (namedHits + keywordHits) score += 40 + (namedHits + keywordHits) * 12;
  if (nameFold.length >= 4 && hasPhrase(blobWords, nameFold)) score += 20;
  catTokens.forEach((t) => {
    if (t.length >= 4 && hasPhrase(blobWords, t)) score += 10;
  });

  return { score, named };
}

async function createProductCategory(name) {
  const display = toDisplayName(name);
  if (!display) return null;
  const style = styleForName(display);
  const last = await Category.findOne({ type: 'product' }).sort({ sortOrder: -1 }).select('sortOrder').lean();
  try {
    return await Category.create({
      type: 'product',
      name: display,
      icon: style.icon,
      color: style.color,
      description: '',
      sortOrder: (last?.sortOrder || 0) + 1,
      isActive: true,
    });
  } catch (error) {
    if (error.code === 11000) {
      return Category.findOne({ type: 'product', name: display });
    }
    throw error;
  }
}

function toRecord(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    type: 'product',
    name: doc.name,
    icon: doc.icon || 'pricetag-outline',
    color: doc.color || '#5B39C6',
    created: false,
  };
}

/**
 * Map a free-text AI/seller category onto one canonical product category.
 * Reuses an existing row when the product type already exists; otherwise creates it.
 */
async function resolveProductCategory({
  name,
  title = '',
  description = '',
  createIfMissing = true,
} = {}) {
  const docs = await listProductCategories();
  const suggested = String(name || '').trim();
  const ranked = docs
    .map((doc) => ({ doc, ...scoreCategory(doc, { suggested, title, description }) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const second = ranked[1];
  // When the AI named a class (e.g. "Books") that no existing category relates to, create it
  // rather than letting stray words in the description pick an unrelated category.
  const explicitNewClass = Boolean(toDisplayName(suggested)) && !best?.named;
  const clearWinner =
    best &&
    !explicitNewClass &&
    best.score >= 50 &&
    (!second || best.score >= second.score + 8 || best.score >= 90);

  if (clearWinner) {
    return { ...toRecord(best.doc), created: false };
  }

  if (!createIfMissing) {
    return !explicitNewClass && best?.score >= 30 ? { ...toRecord(best.doc), created: false } : null;
  }

  const display = toDisplayName(suggested);
  if (!display) {
    return best ? { ...toRecord(best.doc), created: false } : toRecord(docs[0]);
  }

  const created = await createProductCategory(display);
  return { ...toRecord(created), created: true };
}

async function listProductCategoryNames() {
  const docs = await listProductCategories();
  return docs.map((doc) => doc.name);
}

module.exports = {
  resolveProductCategory,
  listProductCategoryNames,
  listProductCategories,
};
