import { adminPath } from '../routes';

/** Admin page -> backend RBAC scope (see Backend/src/utils/adminScopes.js). */
export const PAGE_SCOPES = {
  dashboard: 'dashboard',
  'live-activity': 'dashboard',
  users: 'users',
  support: 'users',
  'contact-center': 'users',
  testers: 'settings',
  shops: 'shops',
  'shop-verification': 'shops',
  'pending-review': 'listings',
  listings: 'listings',
  categories: 'categories',
  'restricted-keywords': 'moderation',
  reports: 'reports',
  trust: 'moderation',
  'scam-monitor': 'moderation',
  'fraud-signals': 'users',
  'error-log': 'errors',
  reviews: 'reviews',
  notifications: 'notifications',
  'ai-models': 'ai',
  'voice-calls': 'settings',
  settings: 'settings',
  activity: 'audit',
};

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  moderator: 'Moderator',
  support: 'Support',
};

export function canAccess(user, scope) {
  if (!user || !scope) return false;
  const scopes = Array.isArray(user.adminScopes) ? user.adminScopes : [];
  return scopes.includes(scope);
}

export function canAccessPath(user, path) {
  const segment = String(path || '').replace(adminPath(''), '').replace(/^\//, '').split('/')[0];
  const scope = PAGE_SCOPES[segment];
  return scope ? canAccess(user, scope) : true;
}

export function firstAllowedPath(user) {
  const entry = Object.entries(PAGE_SCOPES).find(([, scope]) => canAccess(user, scope));
  return entry ? adminPath(entry[0]) : null;
}
