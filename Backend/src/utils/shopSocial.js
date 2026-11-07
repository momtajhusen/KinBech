/** Shop social accounts: up to SOCIAL_MAX of these platforms, stored as a handle or a profile URL on the platform's own domain. */
const SOCIAL_MAX = 3;

const SOCIAL_PLATFORMS = {
  facebook: { label: 'Facebook', hosts: ['facebook.com', 'fb.com', 'fb.me'] },
  instagram: { label: 'Instagram', hosts: ['instagram.com', 'instagr.am'] },
  tiktok: { label: 'TikTok', hosts: ['tiktok.com'] },
  youtube: { label: 'YouTube', hosts: ['youtube.com', 'youtu.be'] },
};

const SOCIAL_KEYS = Object.keys(SOCIAL_PLATFORMS);
const HANDLE_RE = /^[A-Za-z0-9._-]{1,100}$/;

function hostAllowed(host, hosts) {
  const clean = String(host || '').toLowerCase();
  return hosts.some((h) => clean === h || clean.endsWith(`.${h}`));
}

function looksLikeUrl(text, hosts) {
  if (/^https?:\/\//i.test(text) || text.includes('/')) return true;
  const bare = text.toLowerCase().replace(/^(www|m|web|mobile)\./, '');
  return hosts.some((h) => bare === h || bare.startsWith(`${h}/`));
}

/** Returns `{ value }` with the cleaned link, or `{ error }` when it is not a profile on that platform. */
function cleanSocialLink(key, raw) {
  const platform = SOCIAL_PLATFORMS[key];
  const text = String(raw ?? '').trim().slice(0, 200);
  if (!platform || !text) return { value: '' };

  if (looksLikeUrl(text, platform.hosts)) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
      return { error: `Enter a valid ${platform.label} link` };
    }
    if (!/^https?:$/.test(url.protocol) || !hostAllowed(url.hostname, platform.hosts)) {
      return { error: `${platform.label} link must be on ${platform.hosts[0]}` };
    }
    if (!url.pathname.replace(/\/+$/, '') && !url.search) {
      return { error: `Add your ${platform.label} profile, not just ${platform.hosts[0]}` };
    }
    return { value: `https://${url.hostname.toLowerCase()}${url.pathname}${url.search}` };
  }

  const handle = text.replace(/^@/, '');
  if (!HANDLE_RE.test(handle)) return { error: `Enter a valid ${platform.label} username or link` };
  return { value: handle };
}

/**
 * Merges incoming links over the current ones.
 * Returns `{ links }` or `{ error, field }` when a link is invalid or more than SOCIAL_MAX are set.
 */
function mergeSocialLinks(current, incoming) {
  const links = {};
  SOCIAL_KEYS.forEach((key) => {
    links[key] = String(current?.[key] || '');
  });
  if (!incoming || typeof incoming !== 'object') return { links };

  for (const key of SOCIAL_KEYS) {
    if (incoming[key] === undefined) continue;
    const { value, error } = cleanSocialLink(key, incoming[key]);
    if (error) return { error, field: key };
    links[key] = value;
  }
  if (SOCIAL_KEYS.filter((key) => links[key]).length > SOCIAL_MAX) {
    return { error: `You can link up to ${SOCIAL_MAX} social accounts`, field: 'socialLinks' };
  }
  return { links };
}

/** Public view: only filled platforms, at most SOCIAL_MAX. */
function publicSocialLinks(socialLinks) {
  const out = {};
  SOCIAL_KEYS.filter((key) => socialLinks?.[key])
    .slice(0, SOCIAL_MAX)
    .forEach((key) => {
      out[key] = socialLinks[key];
    });
  return out;
}

module.exports = { SOCIAL_MAX, SOCIAL_KEYS, cleanSocialLink, mergeSocialLinks, publicSocialLinks };
