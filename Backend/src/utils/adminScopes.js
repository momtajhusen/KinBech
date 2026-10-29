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
  scopesForRole,
  hasScope,
};
