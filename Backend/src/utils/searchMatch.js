const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'with', 'to', 'at', 'by',
  'sale', 'sell', 'selling', 'buy', 'ko', 'ma', 'ra', 'ka', 'ki', 'ke',
]);

const MAX_TOKENS = 6;

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalize(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function stem(word) {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** Lowercased, de-duplicated query words; plural "s" is dropped so "phones" finds "phone". */
function searchTokens(q) {
  const words = normalize(q)
    .split(/[^\p{L}\p{N}]+/u)
    .map((word) => word.trim())
    .filter((word) => word.length >= 2 || /\d/.test(word));
  const meaningful = words.filter((word) => !STOP_WORDS.has(word));
  const picked = (meaningful.length ? meaningful : words).map(stem);
  return [...new Set(picked)].slice(0, MAX_TOKENS);
}

function tokenClause(token, fields) {
  const pattern = { $regex: escapeRegex(token), $options: 'i' };
  return { $or: fields.map((field) => ({ [field]: pattern })) };
}

/**
 * Mongo filter fragment for a free-text query.
 * mode "all" needs every word somewhere in the fields; "any" needs at least one.
 */
function queryFilter(q, fields, mode = 'all') {
  const tokens = searchTokens(q);
  if (!tokens.length) {
    const raw = normalize(q);
    return raw ? tokenClause(raw, fields) : {};
  }
  if (tokens.length === 1) return tokenClause(tokens[0], fields);
  if (mode === 'any') {
    return { $or: tokens.flatMap((token) => tokenClause(token, fields).$or) };
  }
  return { $and: tokens.map((token) => tokenClause(token, fields)) };
}

function wordStarts(text, token) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(token)}`, 'u').test(text);
}

/** How well a name/title matches the query (0 = no match). */
function scoreName(name, q, tokens = searchTokens(q)) {
  const text = normalize(name);
  const phrase = normalize(q);
  if (!text || !phrase) return 0;
  let score = 0;
  if (text === phrase) score += 100;
  else if (text.startsWith(phrase)) score += 70;
  else if (wordStarts(text, phrase)) score += 55;
  else if (text.includes(phrase)) score += 40;
  let hits = 0;
  tokens.forEach((token) => {
    if (wordStarts(text, token)) {
      score += 20;
      hits += 1;
    } else if (text.includes(token)) {
      score += 12;
      hits += 1;
    }
  });
  if (tokens.length > 1 && hits === tokens.length) score += 30;
  return score;
}

function scoreListing(doc, q, tokens = searchTokens(q)) {
  const phrase = normalize(q);
  if (!phrase) return 0;
  const words = (Array.isArray(doc.searchWords) ? doc.searchWords : []).map(normalize);
  const category = normalize(doc.category);
  const description = normalize(doc.description);
  const location = normalize(doc.location);

  let score = scoreName(doc.title, q, tokens) * 1.5;
  if (words.some((word) => word === phrase)) score += 40;
  else if (words.some((word) => word.includes(phrase))) score += 24;
  if (category === phrase) score += 25;
  if (description.includes(phrase)) score += 10;

  let covered = 0;
  tokens.forEach((token) => {
    let hit = false;
    if (words.some((word) => word.includes(token))) {
      score += 10;
      hit = true;
    }
    if (category.includes(token)) {
      score += 6;
      hit = true;
    }
    if (description.includes(token)) {
      score += 3;
      hit = true;
    }
    if (location.includes(token)) {
      score += 3;
      hit = true;
    }
    if (hit || normalize(doc.title).includes(token)) covered += 1;
  });
  if (tokens.length) score += (covered / tokens.length) * 20;
  return Math.round(score);
}

function scoreSeller(seller, q, tokens = searchTokens(q)) {
  const phrase = normalize(q);
  if (!phrase) return 0;
  const fields = [seller.tagline, seller.category, seller.description, seller.location].map(normalize);
  let score = scoreName(seller.name, q, tokens) * 2;
  if (fields[0].includes(phrase)) score += 20;
  if (fields[1].includes(phrase)) score += 18;
  if (fields[2].includes(phrase)) score += 10;
  tokens.forEach((token) => {
    if (fields[0].includes(token)) score += 8;
    if (fields[1].includes(token)) score += 8;
    if (fields[2].includes(token)) score += 4;
    if (fields[3].includes(token)) score += 3;
  });
  return score;
}

/** True when some query word starts a word in the title, keywords or category. */
function hasWordMatch(doc, tokens) {
  const texts = [doc.title, doc.category, ...(Array.isArray(doc.searchWords) ? doc.searchWords : [])]
    .map(normalize);
  return tokens.some((token) => texts.some((text) => wordStarts(text, token)));
}

function sellerMatches(seller, q, tokens = searchTokens(q)) {
  const haystack = normalize(
    [seller.name, seller.tagline, seller.category, seller.description, seller.location].join(' ')
  );
  if (!tokens.length) return haystack.includes(normalize(q));
  return tokens.every((token) => haystack.includes(token));
}

module.exports = {
  escapeRegex,
  normalize,
  searchTokens,
  queryFilter,
  scoreName,
  scoreListing,
  scoreSeller,
  sellerMatches,
  hasWordMatch,
};
