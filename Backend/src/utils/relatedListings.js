const crypto = require('crypto');
const Listing = require('../models/Listing');
const { understandRelatedProduct } = require('./aiSuggest');

/** The detail page waits this long for a first AI answer; a slower one still lands in the cache. */
const AI_WAIT_MS = 5000;
const AI_DEADLINE_MS = 12000;
const AI_RETRY_MS = 10 * 60 * 1000;
const KEYWORD_CACHE_MAX = 500;
const CANDIDATE_LIMIT = 300;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'without', 'to', 'of', 'in', 'on', 'at', 'by',
  'from', 'is', 'it', 'this', 'that', 'sale', 'item', 'new', 'used', 'old', 'good', 'best',
]);
// Colours and materials are shared by unrelated products (a blue chair and a blue dustbin),
// so without the AI they never make two listings related on their own.
const DESCRIPTOR_WORDS = new Set([
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple', 'orange', 'brown', 'grey',
  'gray', 'silver', 'gold', 'golden', 'navy', 'maroon', 'beige', 'cream', 'dark', 'light',
  'multicolor', 'multicolour', 'colour', 'color', 'plastic', 'wooden', 'wood', 'metal', 'steel',
  'iron', 'fabric', 'leather', 'glass', 'cotton', 'solid', 'material', 'small', 'big', 'large',
  'mini', 'portable', 'single', 'double', 'set', 'pack', 'piece', 'pcs', 'pure', 'original',
]);

const COLOUR_WORDS = new Set([
  'red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple', 'orange', 'brown', 'grey',
  'gray', 'silver', 'gold', 'golden', 'navy', 'maroon', 'beige', 'cream', 'dark', 'light',
]);
// "armchair" is a chair, but "portable" is not a table and "headphone" is not a phone.
const COMPOUND_PREFIXES = ['arm', 'wheel', 'high', 'deck', 'push', 'smart'];

const keywordCache = new Map();
const pending = new Map();
const failedAt = new Map();

function stem(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(ches|shes|sses|xes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

function wordsOf(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^\p{L}\p{M}\p{N}]+/u)
    .filter(Boolean)
    .map(stem);
}

const sameWord = (word, part) => word === part
  || COMPOUND_PREFIXES.some((prefix) => word === `${prefix}${part}`);

/**
 * Whole words only: "pen" never matches "pendrive" and "chair" never matches "chairman".
 * A phrase matches when all its words are in the title ("table fan" in "Table Stand Fan").
 */
function hasTerm(words, term) {
  const parts = wordsOf(term);
  return parts.length > 0 && parts.every((part) => words.some((word) => sameWord(word, part)));
}

const sourceKey = (source) => crypto
  .createHash('md5')
  .update(`${source.title}|${source.description || ''}|${source.category || ''}`)
  .digest('hex');

/** Without the AI: the title's product words, and only listings in the same category. */
function fallbackUnderstanding(source, keyword) {
  const productWords = [...new Set(wordsOf(source.title))]
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && !DESCRIPTOR_WORDS.has(word) && !/^\d+$/.test(word));
  return {
    type: '',
    same: productWords,
    close: [],
    prefer: wordsOf(keyword).filter((word) => DESCRIPTOR_WORDS.has(word)),
    sameCategoryOnly: true,
  };
}

function rememberKeyword(key, value) {
  keywordCache.delete(key);
  keywordCache.set(key, value);
  if (keywordCache.size > KEYWORD_CACHE_MAX) keywordCache.delete(keywordCache.keys().next().value);
}

async function askAi(source, keyword, key, cacheKey) {
  const understood = await understandRelatedProduct({
    title: source.title,
    description: source.description,
    category: source.category,
    keyword,
    deadlineMs: AI_DEADLINE_MS,
  });
  if (!understood) throw new Error('AI gave no product type');
  if (keyword) {
    rememberKeyword(cacheKey, understood);
  } else if (source._id) {
    await Listing.updateOne(
      { _id: source._id },
      { $set: { relatedAi: { key, type: understood.type, same: understood.same, close: understood.close } } }
    );
  }
  return understood;
}

/** The AI's reading of the product, from cache when the title, description and search are unchanged. */
async function understand(source, keyword) {
  const key = sourceKey(source);
  const cacheKey = `${source._id || source.title}|${key}|${keyword}`;
  if (keyword && keywordCache.has(cacheKey)) return keywordCache.get(cacheKey);
  if (!keyword && source.relatedAi?.key === key && source.relatedAi.same?.length) {
    return { ...source.relatedAi, prefer: [] };
  }
  if (Date.now() - (failedAt.get(cacheKey) || 0) < AI_RETRY_MS) return null;

  let job = pending.get(cacheKey);
  if (!job) {
    job = askAi(source, keyword, key, cacheKey)
      .catch((error) => {
        failedAt.set(cacheKey, Date.now());
        if (failedAt.size > KEYWORD_CACHE_MAX) failedAt.delete(failedAt.keys().next().value);
        console.warn('[related] AI failed:', error.message);
        return null;
      })
      .finally(() => pending.delete(cacheKey));
    pending.set(cacheKey, job);
  }
  let timer;
  const waited = new Promise((resolve) => { timer = setTimeout(() => resolve(null), AI_WAIT_MS); });
  const result = await Promise.race([job, waited]);
  clearTimeout(timer);
  return result;
}

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 2 for the same product, 1 for a close one, 0 for anything else. Only the title and the
 * AI's own reading of the candidate count: sellers stuff unrelated search words.
 * A close product must share the category: a "Table Fan" is not furniture next to a chair.
 */
function tierOf(doc, understood, category) {
  const titleWords = wordsOf(doc.title);
  const ownType = doc.relatedAi?.type || '';
  const inTitle = (terms) => terms.some((term) => hasTerm(titleWords, term));
  if (inTitle(understood.same) || (ownType && understood.same.includes(ownType))) return 2;
  if (ownType && understood.close.includes(ownType)) return 1;
  if (inTitle(understood.close) && (!category || doc.category === category)) return 1;
  return 0;
}

function sharedWordScore(word) {
  if (COLOUR_WORDS.has(word)) return 0.1;
  if (DESCRIPTOR_WORDS.has(word)) return 0.25;
  return 1;
}

/**
 * Listings that are the same kind of product as `source` (or a close one), best first.
 * Anything that only shares a colour, material or part of a word is left out.
 */
async function findRelatedListings(source, { keyword = '', limit = 8, excludeId = '' } = {}) {
  const cleanKeyword = String(keyword || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 80);
  const understood = (await understand(source, cleanKeyword)) || fallbackUnderstanding(source, cleanKeyword);
  const terms = [...understood.same, ...understood.close];
  if (!terms.length) return { listings: [], ai: false };

  const patterns = [...new Set(terms.map((term) => wordsOf(term).pop()).filter(Boolean))]
    .map((word) => new RegExp(escapeRegex(word), 'i'));
  const query = {
    status: 'active',
    $or: [
      { title: { $in: patterns } },
      { 'relatedAi.type': { $in: terms } },
    ],
  };
  if (excludeId) query._id = { $ne: excludeId };
  if (understood.sameCategoryOnly && source.category) query.category = source.category;
  const docs = await Listing.find(query).limit(CANDIDATE_LIMIT).lean();

  const sourceWords = new Set(wordsOf(source.title).filter((word) => !STOP_WORDS.has(word)));
  const ranked = docs
    .map((doc) => {
      const tier = tierOf(doc, understood, source.category);
      if (!tier) return null;
      const titleWords = wordsOf(doc.title);
      const preferHits = understood.prefer.filter((term) => hasTerm(titleWords, term)).length;
      const shared = [...new Set(titleWords.filter((word) => sourceWords.has(word)))]
        .reduce((sum, word) => sum + sharedWordScore(word), 0);
      const sameCategory = Boolean(source.category) && doc.category === source.category;
      return { doc, tier, score: preferHits * 2 + shared + (sameCategory ? 1 : 0) };
    })
    .filter(Boolean)
    .sort((a, b) => b.tier - a.tier
      || b.score - a.score
      || new Date(b.doc.createdAt || 0) - new Date(a.doc.createdAt || 0))
    .slice(0, limit);

  return { listings: ranked.map((row) => row.doc), ai: !understood.sameCategoryOnly, understood };
}

module.exports = { findRelatedListings, hasTerm };
