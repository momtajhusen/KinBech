/**
 * Basic chat abuse filter — blocks messages that contain known abusive terms.
 * EN + common Hinglish/Nepali-romanized harassment slang (not exhaustive).
 */

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Whole-word / phrase matches only */
const ABUSE_TERMS = [
  // English
  'fuck you',
  'fuck off',
  'fucker',
  'motherfucker',
  'son of a bitch',
  'bitch',
  'slut',
  'whore',
  'hoe',
  'cunt',
  'dickhead',
  'asshole',
  'bastard',
  'retard',
  'rape you',
  'kill yourself',
  'go die',
  // Solicitation / sexual harassment (chat context)
  'send nudes',
  'send nude',
  'sex chat',
  'only for sex',
  'come to my room',
  // Hinglish / common South Asian slang used as abuse
  'madarchod',
  'behenchod',
  'bhenchod',
  'bhosdike',
  'bhosdi',
  'randi',
  'randwa',
  'chutiya',
  'chutia',
  'harami',
  'kutta sala',
  'gandu',
  'lavde',
  'lawde',
  'teri maa',
  'teri behen',
];

const ABUSE_PATTERNS = ABUSE_TERMS.map((term) => {
  const parts = term.split(/\s+/).map(escapeRegex);
  const body = parts.join('\\s+');
  return {
    term,
    re: new RegExp(`(^|[^a-z0-9])${body}([^a-z0-9]|$)`, 'i'),
  };
});

function findAbusiveMatches(text) {
  const haystack = normalizeText(text);
  if (!haystack) return [];
  const hits = [];
  for (const { term, re } of ABUSE_PATTERNS) {
    if (re.test(haystack) || re.test(String(text || ''))) {
      hits.push(term);
    }
  }
  return [...new Set(hits)];
}

/**
 * @returns {{ ok: true } | { ok: false, httpStatus: number, code: string, message: string, matches: string[] }}
 */
function assertChatTextAllowed(text) {
  const matches = findAbusiveMatches(text);
  if (!matches.length) return { ok: true };
  return {
    ok: false,
    httpStatus: 400,
    code: 'ABUSIVE_LANGUAGE',
    message:
      'Your message was blocked because it contains abusive or harassing language. Please keep chats respectful.',
    matches,
  };
}

module.exports = {
  assertChatTextAllowed,
  findAbusiveMatches,
  ABUSE_TERMS,
};
