export const ADMIN_BASE = '/admin';

export function adminPath(segment = '') {
  if (!segment) return ADMIN_BASE;
  const clean = segment.replace(/^\//, '');
  return `${ADMIN_BASE}/${clean}`;
}
