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
]);

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

export function titleCase(value) {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
