// Mirrors Backend/src/utils/shopSocial.js so the form can flag a bad link before saving.
export const SOCIAL_MAX = 3;

export const SOCIAL_PLATFORMS = [
  {
    key: 'facebook',
    label: 'Facebook',
    icon: 'logo-facebook',
    color: '#1877F2',
    placeholder: 'facebook.com/yourstore',
    base: 'https://www.facebook.com/',
    hosts: ['facebook.com', 'fb.com', 'fb.me'],
  },
  {
    key: 'instagram',
    label: 'Instagram',
    icon: 'logo-instagram',
    color: '#E1306C',
    placeholder: '@yourstore',
    base: 'https://www.instagram.com/',
    hosts: ['instagram.com', 'instagr.am'],
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    icon: 'logo-tiktok',
    color: '#111111',
    placeholder: '@yourstore',
    base: 'https://www.tiktok.com/@',
    hosts: ['tiktok.com'],
  },
  {
    key: 'youtube',
    label: 'YouTube',
    icon: 'logo-youtube',
    color: '#FF0000',
    placeholder: 'youtube.com/@yourstore',
    base: 'https://www.youtube.com/@',
    hosts: ['youtube.com', 'youtu.be'],
  },
];

const HANDLE_RE = /^[A-Za-z0-9._-]{1,100}$/;

function looksLikeUrl(text, hosts) {
  if (/^https?:\/\//i.test(text) || text.includes('/')) return true;
  const bare = text.toLowerCase().replace(/^(www|m|web|mobile)\./, '');
  return hosts.some((h) => bare === h || bare.startsWith(`${h}/`));
}

function parseUrl(text) {
  const match = /^(?:https?:\/\/)?([^/?#\s]+)([^#\s]*)/i.exec(text);
  if (!match) return null;
  return { host: match[1].toLowerCase(), rest: match[2] || '' };
}

/** Error text for one platform's input, or '' when it is empty or valid. */
export function socialLinkError(platform, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (looksLikeUrl(text, platform.hosts)) {
    const url = parseUrl(text);
    if (!url || !platform.hosts.some((h) => url.host === h || url.host.endsWith(`.${h}`))) {
      return `${platform.label} link must be on ${platform.hosts[0]}`;
    }
    if (!url.rest.replace(/\/+$/, '')) return `Add your ${platform.label} profile, not just ${platform.hosts[0]}`;
    return '';
  }
  return HANDLE_RE.test(text.replace(/^@/, '')) ? '' : `Enter a valid ${platform.label} username or link`;
}

/** Profile URL for a saved handle or link. */
export function socialUrl(platform, value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (looksLikeUrl(text, platform.hosts)) return `https://${text}`;
  return `${platform.base}${text.replace(/^@/, '')}`;
}

/** Filled platforms in display order, at most SOCIAL_MAX, each with its URL. */
export function linkedSocials(socialLinks) {
  return SOCIAL_PLATFORMS.filter((p) => String(socialLinks?.[p.key] || '').trim())
    .slice(0, SOCIAL_MAX)
    .map((p) => ({ ...p, url: socialUrl(p, socialLinks[p.key]) }));
}
