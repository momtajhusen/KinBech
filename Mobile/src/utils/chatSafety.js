const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

const TRUSTED_HOST_SUFFIXES = [
  'kinbech.app',
  'kinbechapi.codersalpha.com',
  'codersalpha.com',
];

export function extractUrls(text = '') {
  const matches = String(text).match(URL_REGEX) || [];
  return [...new Set(matches.map((m) => m.replace(/[.,)!?;:]+$/g, '')))];
}

export function messageHasUrl(text = '') {
  return extractUrls(text).length > 0;
}

export function normalizeUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

export function getUrlHost(raw) {
  try {
    const url = new URL(normalizeUrl(raw));
    return url.hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isTrustedChatUrl(raw) {
  const host = getUrlHost(raw);
  if (!host) return false;
  return TRUSTED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

export function messageHasExternalUrl(text = '') {
  return extractUrls(text).some((url) => !isTrustedChatUrl(url));
}

export function splitTextWithUrls(text = '') {
  const source = String(text || '');
  if (!source) return [{ type: 'text', value: '' }];

  const parts = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_REGEX.source, 'gi');
  let match = regex.exec(source);

  while (match) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', value: source.slice(lastIndex, match.index) });
    }
    const raw = match[0].replace(/[.,)!?;:]+$/g, '');
    const trailing = match[0].slice(raw.length);
    parts.push({ type: 'url', value: raw, href: normalizeUrl(raw) });
    if (trailing) {
      parts.push({ type: 'text', value: trailing });
    }
    lastIndex = match.index + match[0].length;
    match = regex.exec(source);
  }

  if (lastIndex < source.length) {
    parts.push({ type: 'text', value: source.slice(lastIndex) });
  }

  return parts.length ? parts : [{ type: 'text', value: source }];
}

export const CHAT_SAFETY_BANNER =
  'KinBech support never asks for passwords, OTP codes, or bank details in chat.';

export const EXTERNAL_LINK_WARNING = {
  title: 'External link detected',
  message:
    'This link leaves KinBech. Scammers sometimes pretend to be support. Never share passwords, OTP codes, or payment details. Open only if you trust the sender.',
  cancelLabel: 'Cancel',
  openLabel: 'Open link',
};
