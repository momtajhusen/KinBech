/**
 * Keyword intent from chat text, English phrases only. Phrases match on word boundaries,
 * so "not sold" never matches "sold" and "advanced" never matches "advance payment".
 * Extra phrases can be added with CHAT_SOLD_WORDS / CHAT_GOT_WORDS / CHAT_AVAILABLE_WORDS /
 * CHAT_SCAM_WORDS (comma separated) without a deploy.
 */

const SOLD = [
  'already sold', 'its sold', 'it is sold', 'it has been sold', 'item is sold', 'item sold',
  'sold out', 'sold it', 'just sold', 'got sold',
  'no longer available', 'not available anymore', 'its not available', 'it is not available',
  'out of stock', 'sorry sold', 'sorry its sold', 'sorry already sold',
];
/** Whole-message replies; a bare "sold" inside a longer sentence is too ambiguous. */
const SOLD_EXACT = new Set(['sold', 'sold sorry', 'sold already', 'sold out', 'not available']);

/** "Not sold yet" style replies: these mean the item is still available. */
const NOT_SOLD = ['not sold', 'not yet sold', 'not sold yet', 'not sold out', 'isnt sold', 'is not sold'];

const GOT = [
  'got it', 'got the item', 'item received', 'received the item', 'received it', 'deal done',
  'deal is done', 'deal completed', 'bought it', 'picked it up', 'collected it',
];

const AVAILABLE = [
  'still available', 'yes available', 'yes it is available', 'yes its available', 'its available',
  'it is available', 'still have it', 'still in stock', 'yes in stock',
];

/** Common scam moves: advance payment, moving off-platform, OTP/PIN asks, courier fees. */
const SCAM_GROUPS = {
  advance_payment: [
    'advance payment', 'pay in advance', 'pay advance', 'send advance', 'advance money',
    'pay first', 'send money first', 'payment first', 'token money', 'booking amount',
    'esewa first', 'khalti first', 'send esewa', 'send khalti',
  ],
  off_platform: ['whatsapp', 'viber', 'telegram'],
  otp_ask: ['send otp', 'share otp', 'tell me the otp', 'otp code', 'pin code', 'verification code', 'share the code'],
  fees: ['courier charge', 'delivery charge first', 'customs fee', 'customs charge'],
};
const SCAM = Object.values(SCAM_GROUPS).flat();

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extra(envName) {
  return String(process.env[envName] || '')
    .split(',')
    .map((w) => normalize(w))
    .filter(Boolean);
}

function hasPhrase(padded, phrases) {
  return phrases.some((phrase) => padded.includes(` ${normalize(phrase)} `));
}

/** { sold, gotIt, available } — `sold` wins over `available` when both appear. */
function detectChatIntent(text) {
  const padded = ` ${normalize(text)} `;
  if (padded.trim() === '') return { sold: false, gotIt: false, available: false };
  const notSold = hasPhrase(padded, NOT_SOLD);
  const sold = !notSold && (SOLD_EXACT.has(padded.trim()) || hasPhrase(padded, [...SOLD, ...extra('CHAT_SOLD_WORDS')]));
  return {
    sold,
    gotIt: hasPhrase(padded, [...GOT, ...extra('CHAT_GOT_WORDS')]),
    available: notSold || (!sold && hasPhrase(padded, [...AVAILABLE, ...extra('CHAT_AVAILABLE_WORDS')])),
  };
}

/** True when a message looks like a scam move; extra phrases via CHAT_SCAM_WORDS. */
function detectScamRisk(text) {
  const padded = ` ${normalize(text)} `;
  if (padded.trim() === '') return false;
  return hasPhrase(padded, [...SCAM, ...extra('CHAT_SCAM_WORDS')]);
}

/** Which scam groups a message hits, with the matched phrases (admin scam monitor). */
function scamMatches(text) {
  const padded = ` ${normalize(text)} `;
  if (padded.trim() === '') return [];
  const groups = { ...SCAM_GROUPS, custom: extra('CHAT_SCAM_WORDS') };
  return Object.entries(groups)
    .map(([category, phrases]) => ({
      category,
      phrases: phrases.filter((phrase) => padded.includes(` ${normalize(phrase)} `)),
    }))
    .filter((match) => match.phrases.length > 0);
}

module.exports = { detectChatIntent, detectScamRisk, scamMatches, SCAM_GROUPS, normalize };
