import FacebookRounded from '@mui/icons-material/FacebookRounded';
import Instagram from '@mui/icons-material/Instagram';
import YouTube from '@mui/icons-material/YouTube';

const SOCIAL_MAX = 3;

function TikTokIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden {...props}>
      <path d="M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  );
}

const PLATFORMS = [
  { key: 'facebook', label: 'Facebook', Icon: FacebookRounded, base: 'https://www.facebook.com/', hosts: ['facebook.com', 'fb.com', 'fb.me'] },
  { key: 'instagram', label: 'Instagram', Icon: Instagram, base: 'https://www.instagram.com/', hosts: ['instagram.com', 'instagr.am'] },
  { key: 'tiktok', label: 'TikTok', Icon: TikTokIcon, base: 'https://www.tiktok.com/@', hosts: ['tiktok.com'] },
  { key: 'youtube', label: 'YouTube', Icon: YouTube, base: 'https://www.youtube.com/@', hosts: ['youtube.com', 'youtu.be'] },
];

function socialUrl(platform, value) {
  const text = String(value || '').trim();
  if (/^https?:\/\//i.test(text)) return text;
  const bare = text.toLowerCase().replace(/^(www|m|web|mobile)\./, '');
  if (text.includes('/') || platform.hosts.some((h) => bare === h || bare.startsWith(`${h}/`))) return `https://${text}`;
  return `${platform.base}${text.replace(/^@/, '')}`;
}

/** Shop social accounts as pill links; renders nothing when none are set. */
export default function SocialLinks({ links, className = '' }) {
  const items = PLATFORMS.filter((p) => String(links?.[p.key] || '').trim()).slice(0, SOCIAL_MAX);
  if (!items.length) return null;
  return (
    <div className={`seller-social-links ${className}`.trim()}>
      {items.map(({ key, label, Icon, ...platform }) => (
        <a
          key={key}
          href={socialUrl(platform, links[key])}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className={`seller-social-link seller-social-link--${key}`}
          aria-label={`${label} profile`}
        >
          <Icon style={{ fontSize: 16 }} />
          <span>{label}</span>
        </a>
      ))}
    </div>
  );
}
