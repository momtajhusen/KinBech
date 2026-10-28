import { adminPath } from './routes';
import { ROLE_SCOPES, canAccessPath } from './utils/access';

/**
 * Sidebar sections. Each hub is one sidebar item; its tabs are the related pages shown as
 * tabs at the top of the page. Hubs are ordered by daily use, and each hub's first tab is its
 * work queue. Every tab keeps its own URL, so old links and RBAC scopes still apply.
 * `icon` values are Material Symbols names (see components/MIcon).
 */
export const NAV_GROUPS = [
  {
    title: 'Daily work',
    hubs: [
      {
        key: 'dashboard',
        label: 'Dashboard',
        icon: 'space_dashboard',
        hint: 'Today’s numbers, alerts, and what needs your attention.',
        tabs: [
          { page: 'dashboard', label: 'Overview', icon: 'monitoring' },
          { page: 'live-activity', label: 'Live activity', icon: 'sensors' },
        ],
      },
      {
        key: 'listings',
        label: 'Listings',
        icon: 'inventory_2',
        hint: 'Approve held posts, browse every listing, and manage categories and banned words.',
        tabs: [
          { page: 'pending-review', label: 'Pending review', icon: 'pending_actions' },
          { page: 'listings', label: 'All listings', icon: 'view_list' },
          { page: 'categories', label: 'Categories', icon: 'category' },
          { page: 'restricted-keywords', label: 'Banned words', icon: 'block' },
        ],
      },
      {
        key: 'safety',
        label: 'Reports & Safety',
        icon: 'shield',
        hint: 'User reports, scam chats, flagged reviews, seller trust scores, and fraud signals.',
        tabs: [
          { page: 'reports', label: 'Reports', icon: 'flag' },
          { page: 'scam-monitor', label: 'Scam chats', icon: 'chat_error' },
          { page: 'reviews', label: 'Reviews', icon: 'reviews' },
          { page: 'trust', label: 'Seller trust', icon: 'verified_user' },
          { page: 'fraud-signals', label: 'Fraud signals', icon: 'fingerprint' },
        ],
      },
      {
        key: 'support',
        label: 'Support',
        icon: 'support_agent',
        hint: 'Answer tickets and deletion requests, contact a user directly, or send an announcement.',
        tabs: [
          { page: 'support', label: 'Inbox', icon: 'inbox' },
          { page: 'contact-center', label: 'Contact a user', icon: 'contact_phone' },
          { page: 'notifications', label: 'Announcements', icon: 'campaign' },
        ],
      },
      {
        key: 'shops',
        label: 'Shops',
        icon: 'storefront',
        hint: 'Check shop documents and manage every shop.',
        tabs: [
          { page: 'shop-verification', label: 'Verification', icon: 'verified' },
          { page: 'shops', label: 'All shops', icon: 'store' },
        ],
      },
    ],
  },
  {
    title: 'Manage',
    hubs: [
      {
        key: 'users',
        label: 'Users',
        icon: 'group',
        hint: 'Buyers, individual sellers and shops in one list. Use the tabs, quick filters or Filters to find anyone.',
        tabs: [
          { page: 'users', label: 'Users & sellers', icon: 'groups' },
          { page: 'testers', label: 'Test accounts', icon: 'science' },
        ],
      },
      {
        key: 'payments',
        label: 'Plans & Payments',
        icon: 'workspace_premium',
        hint: 'Approve seller plan payments, edit plans, and set payout details.',
        tabs: [{ page: 'subscriptions', label: 'Plans & payments', icon: 'payments' }],
      },
      {
        key: 'system',
        label: 'Settings',
        icon: 'settings',
        hint: 'Admins and roles, platform rules, AI and call providers, error and admin logs.',
        tabs: [
          { page: 'settings', label: 'Settings & roles', icon: 'admin_panel_settings' },
          { page: 'ai-models', label: 'AI accounts', icon: 'smart_toy' },
          { page: 'voice-calls', label: 'Call accounts', icon: 'call' },
          { page: 'error-log', label: 'Error log', icon: 'bug_report' },
          { page: 'activity', label: 'Admin activity', icon: 'history' },
          { page: 'account-security', label: 'My security', icon: 'lock' },
        ],
      },
    ],
  },
];

export function isActivePath(pathname, path) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function tabPath(tab) {
  return adminPath(tab.page);
}

/** Groups and hubs filtered to the tabs this admin's role can open. */
export function visibleNav(user) {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      hubs: group.hubs
        .map((hub) => ({ ...hub, tabs: hub.tabs.filter((tab) => canAccessPath(user, tabPath(tab))) }))
        .filter((hub) => hub.tabs.length > 0),
    }))
    .filter((group) => group.hubs.length > 0);
}

/** Per sidebar item, which of its pages a role can open (for the Settings role table). */
export function roleMenuAccess(role) {
  const user = { adminScopes: ROLE_SCOPES[role] || [] };
  return NAV_GROUPS.flatMap((group) => group.hubs).map((hub) => {
    const allowed = hub.tabs.filter((tab) => canAccessPath(user, tabPath(tab)));
    return {
      key: hub.key,
      label: hub.label,
      allowed: allowed.length > 0,
      partial: allowed.length > 0 && allowed.length < hub.tabs.length ? allowed.map((tab) => tab.label) : null,
    };
  });
}

/** The hub and tab for a URL, e.g. /admin/users/123 → Users › All users. */
export function findNavLocation(groups, pathname) {
  for (const group of groups) {
    for (const hub of group.hubs) {
      const tab = hub.tabs.find((item) => isActivePath(pathname, tabPath(item)));
      if (tab) return { group, hub, tab };
    }
  }
  return null;
}
