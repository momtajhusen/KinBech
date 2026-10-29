const ADMIN_ROLES = ['super_admin', 'admin', 'moderator', 'support'];

export const ADMIN_ROUTES = new Set([
  'AdminTabs',
  'AdminShops',
  'AdminReviews',
  'AdminPayments',
  'AdminSupport',
  'AdminUserDetail',
  'AdminTesters',
  'AdminScam',
  'AdminLive',
]);

/** Tap-to-fill reasons for rejecting or removing a listing; the seller reads them as written. */
export const LISTING_REJECT_REASONS = [
  'Photos do not match the item',
  'Blurry or unclear photos',
  'Prohibited or restricted item',
  'Looks fake or like a scam',
  'Price is wrong or misleading',
  'Wrong category',
  'Duplicate listing',
  'Title or description is incomplete',
  'Phone number or links in photos or text',
  'Adult or offensive content',
  'Item already sold or not available',
];

export const LISTING_HOLD_REASONS = [
  'Checking photos',
  'Checking price',
  'Checking seller details',
  'Waiting for clearer photos',
];

export const ROLE_LABELS = {
  super_admin: 'Super admin',
  admin: 'Platform admin',
  moderator: 'Moderator',
  support: 'Support',
};

export function isAdminUser(user) {
  return ADMIN_ROLES.includes(user?.role);
}

export function formatCount(value) {
  const n = Number(value) || 0;
  if (n >= 100000) return `${(n / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

export function formatNpr(value) {
  const n = Number(value) || 0;
  return `Rs. ${n.toLocaleString('en-IN')}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "just now", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(value) {
  if (!value) return '';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return '';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Waiting time for queues: "45m", "6h", "3d". */
export function waitingFor(value) {
  if (!value) return '';
  const min = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (!Number.isFinite(min)) return '';
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

export function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
