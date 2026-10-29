const ADMIN_ROLES = ['super_admin', 'admin', 'moderator', 'support'];

const ALL_SCOPES = [
  'dashboard',
  'users',
  'listings',
  'shops',
  'reports',
  'reviews',
  'categories',
  'moderation',
  'notifications',
  'errors',
  'ai',
  'settings',
  'audit',
  'admins',
];

/** What each admin role may touch. Only super_admin manages other admins. */
const ROLE_SCOPES = {
  super_admin: ALL_SCOPES,
  admin: ALL_SCOPES.filter((scope) => scope !== 'admins'),
  moderator: ['dashboard', 'listings', 'shops', 'reports', 'reviews', 'moderation'],
  support: ['dashboard', 'users', 'reports', 'errors'],
};

function isAdminRole(role) {
  return ADMIN_ROLES.includes(role);
}

/** Google accounts that open the in-app admin panel instead of the marketplace (PLATFORM_ADMIN_EMAILS, comma separated). */
function isPlatformAdminEmail(email) {
  const wanted = String(email || '').trim().toLowerCase();
  if (!wanted) return false;
  return String(process.env.PLATFORM_ADMIN_EMAILS || 'kinbechapp@gmail.com')
    .split(',')
    .some((entry) => entry.trim().toLowerCase() === wanted);
}

function scopesForRole(role) {
  return ROLE_SCOPES[role] || [];
}

function hasScope(role, scope) {
  return scopesForRole(role).includes(scope);
}

module.exports = {
  ADMIN_ROLES,
  ALL_SCOPES,
  ROLE_SCOPES,
  isAdminRole,
  isPlatformAdminEmail,
  scopesForRole,
  hasScope,
};
