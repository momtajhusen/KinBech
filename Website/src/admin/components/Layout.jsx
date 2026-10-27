import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BadgeCheck,
  Ban,
  Bell,
  Bug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Fingerprint,
  Flag,
  FlaskConical,
  FolderTree,
  Headphones,
  History,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquareWarning,
  Moon,
  Package,
  Phone,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Store,
  Sun,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { adminPath } from '../routes';
import { BRAND_TAGLINE } from '../../content/brand';
import { BRAND_ICON_SRC } from '../../content/brandAssets';
import api from '../services/api';
import useDebounce from '../utils/useDebounce';
import { ROLE_LABELS, canAccess, canAccessPath } from '../utils/access';

const SIDEBAR_KEY = 'admin-sidebar-collapsed';

const navSections = [
  {
    title: 'Overview',
    items: [
      { path: adminPath('dashboard'), label: 'Dashboard', icon: LayoutDashboard },
      { path: adminPath('live-activity'), label: 'Live Activity', icon: Activity },
    ],
  },
  {
    title: 'Marketplace',
    items: [
      { path: adminPath('users'), label: 'Users', icon: Users },
      { path: adminPath('support'), label: 'Support Inbox', icon: LifeBuoy },
      { path: adminPath('contact-center'), label: 'Contact Center', icon: Headphones },
      { path: adminPath('testers'), label: 'Test Accounts', icon: FlaskConical },
      { path: adminPath('shops'), label: 'Shops', icon: Store },
      { path: adminPath('shop-verification'), label: 'Shop Verification', icon: BadgeCheck },
      { path: adminPath('pending-review'), label: 'Pending Review', icon: ClipboardCheck },
      { path: adminPath('listings'), label: 'Listings', icon: Package },
      { path: adminPath('categories'), label: 'Categories', icon: FolderTree },
    ],
  },
  {
    title: 'Trust & Safety',
    items: [
      { path: adminPath('reports'), label: 'Reports', icon: Flag },
      { path: adminPath('trust'), label: 'Seller Trust', icon: ShieldCheck },
      { path: adminPath('scam-monitor'), label: 'Scam Monitor', icon: MessageSquareWarning },
      { path: adminPath('fraud-signals'), label: 'Fraud Signals', icon: Fingerprint },
      { path: adminPath('error-log'), label: 'Error Log', icon: Bug },
      { path: adminPath('reviews'), label: 'Reviews', icon: Star },
      { path: adminPath('restricted-keywords'), label: 'Restricted Keywords', icon: Ban },
    ],
  },
  {
    title: 'System',
    items: [
      { path: adminPath('notifications'), label: 'Notifications', icon: Bell },
      { path: adminPath('ai-models'), label: 'AI Models', icon: Sparkles },
      { path: adminPath('voice-calls'), label: 'Voice Calls', icon: Phone },
      { path: adminPath('settings'), label: 'Settings & Roles', icon: Settings },
      { path: adminPath('activity'), label: 'Activity', icon: History },
      { path: adminPath('account-security'), label: 'My Security', icon: KeyRound },
    ],
  },
];

const IDLE_KEY = 'adminLastActive';
const IDLE_LIMIT_MS = 30 * 60 * 1000;
const IDLE_WARNING_MS = 5 * 60 * 1000;

/**
 * Signs the admin out after 30 idle minutes, with a warning 5 minutes before.
 * Activity is shared through localStorage so another open tab keeps this one alive.
 */
function useIdleLogout(logout) {
  const [secondsLeft, setSecondsLeft] = useState(null);
  const logoutRef = useRef(logout);
  logoutRef.current = logout;

  useEffect(() => {
    const markActive = () => {
      try {
        localStorage.setItem(IDLE_KEY, String(Date.now()));
      } catch {
        /* ignore */
      }
    };
    let last = 0;
    const onActivity = () => {
      const now = Date.now();
      if (now - last > 15000) {
        last = now;
        markActive();
      }
    };
    if (!localStorage.getItem(IDLE_KEY)) markActive();
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    events.forEach((name) => window.addEventListener(name, onActivity, { passive: true }));
    const timer = setInterval(() => {
      const lastActive = Number(localStorage.getItem(IDLE_KEY)) || Date.now();
      const left = IDLE_LIMIT_MS - (Date.now() - lastActive);
      if (left <= 0) {
        localStorage.removeItem(IDLE_KEY);
        logoutRef.current();
      } else setSecondsLeft(left <= IDLE_WARNING_MS ? Math.ceil(left / 1000) : null);
    }, 1000);
    return () => {
      events.forEach((name) => window.removeEventListener(name, onActivity));
      clearInterval(timer);
    };
  }, []);

  const stayActive = () => {
    localStorage.setItem(IDLE_KEY, String(Date.now()));
    setSecondsLeft(null);
  };
  return { secondsLeft, stayActive };
}

const pageTitleMap = {
  [adminPath('dashboard')]: 'Dashboard',
  [adminPath('live-activity')]: 'Live Activity',
  [adminPath('users')]: 'Users',
  [adminPath('support')]: 'Support Inbox',
  [adminPath('contact-center')]: 'Contact Center',
  [adminPath('testers')]: 'Test Accounts',
  [adminPath('shops')]: 'Shops',
  [adminPath('pending-review')]: 'Pending Review',
  [adminPath('listings')]: 'Listings',
  [adminPath('categories')]: 'Categories',
  [adminPath('restricted-keywords')]: 'Restricted Keywords',
  [adminPath('reports')]: 'Reports',
  [adminPath('trust')]: 'Seller Trust',
  [adminPath('scam-monitor')]: 'Scam Monitor',
  [adminPath('fraud-signals')]: 'Fraud Signals',
  [adminPath('shop-verification')]: 'Shop Verification',
  [adminPath('error-log')]: 'Error Log',
  [adminPath('reviews')]: 'Reviews',
  [adminPath('notifications')]: 'Notifications',
  [adminPath('ai-models')]: 'AI Models',
  [adminPath('voice-calls')]: 'Voice Calls',
  [adminPath('settings')]: 'Settings & Roles',
  [adminPath('activity')]: 'Activity',
  [adminPath('account-security')]: 'My Security',
};

function isActivePath(pathname, path) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

const NAV_SEEN_KEY = 'adminNavSeen';
const BADGE_PAGES = ['pending-review', 'support', 'shop-verification', 'reports', 'scam-monitor', 'error-log'];
const BADGE_POLL_MS = 60000;

/**
 * Sidebar counts of work that arrived since the admin last opened each page.
 * "Last opened" is kept per admin in localStorage, in server time so clock drift can't hide items.
 */
function useNavBadges(user, pathname) {
  const [counts, setCounts] = useState({});
  const clockOffset = useRef(0);
  const storageKey = `${NAV_SEEN_KEY}:${user?.id || user?._id || 'admin'}`;
  const currentPage = BADGE_PAGES.find((page) => isActivePath(pathname, adminPath(page))) || null;

  useEffect(() => {
    let cancelled = false;
    const readSeen = () => {
      try {
        return JSON.parse(localStorage.getItem(storageKey)) || {};
      } catch {
        return {};
      }
    };
    const markSeen = () => {
      if (!currentPage) return;
      const seen = readSeen();
      seen[currentPage] = Date.now() + clockOffset.current;
      try {
        localStorage.setItem(storageKey, JSON.stringify(seen));
      } catch {
        /* ignore */
      }
    };
    const load = () => {
      markSeen();
      const sentAt = Date.now();
      api.get('/auth/admin/nav-counts', { params: readSeen() })
        .then((response) => {
          if (cancelled) return;
          if (response.data.now) clockOffset.current = response.data.now - sentAt;
          setCounts({ ...(response.data.counts || {}), ...(currentPage ? { [currentPage]: 0 } : {}) });
        })
        .catch(() => {});
    };
    if (currentPage) setCounts((prev) => ({ ...prev, [currentPage]: 0 }));
    load();
    const timer = setInterval(load, BADGE_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      markSeen();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentPage, storageKey]);

  return counts;
}

function NavBadge({ count }) {
  if (!count) return null;
  return <span className="nav-badge">{count > 99 ? '99+' : count}</span>;
}

const mobileTabs = [
  { path: adminPath('dashboard'), label: 'Home', icon: LayoutDashboard },
  { path: adminPath('users'), label: 'Users', icon: Users },
  { path: adminPath('listings'), label: 'Listings', icon: Package },
  { path: adminPath('reports'), label: 'Reports', icon: Flag },
];

function Dropdown({ align = 'end', trigger, children, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`dropdown ${className}`} ref={ref}>
      <button
        type="button"
        className="dropdown-trigger"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </button>
      {open ? (
        <div className={`dropdown-menu ${align === 'start' ? 'align-start' : 'align-end'}`} role="menu">
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      ) : null}
    </div>
  );
}

const Layout = () => {
  const { user, logout } = useAuth();
  const { secondsLeft, stayActive } = useIdleLogout(logout);
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navCounts = useNavBadges(user, location.pathname);
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [searchHits, setSearchHits] = useState([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const debouncedQuery = useDebounce(query, 300);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setSidebarOpen(false);
    setSearchOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const term = debouncedQuery.trim();
    if (term.length < 2) {
      setSearchHits([]);
      return undefined;
    }
    let cancelled = false;
    const empty = Promise.resolve({ data: {} });
    Promise.all([
      canAccess(user, 'users') ? api.get('/auth/admin/users', { params: { q: term, limit: 4 } }) : empty,
      canAccess(user, 'shops') ? api.get('/shops/admin/all', { params: { q: term, limit: 4 } }) : empty,
      canAccess(user, 'listings')
        ? api.get('/listings/admin/all', { params: { q: term, status: 'all', limit: 4 } })
        : empty,
    ]).then(([users, shops, listings]) => {
      if (cancelled) return;
      const hits = [
        ...(users.data.users || []).map((user) => ({
          id: `user-${user.id}`,
          label: user.name || user.phone,
          meta: 'User',
          to: `${adminPath('users')}?q=${encodeURIComponent(user.name || user.phone || term)}`,
        })),
        ...(shops.data.shops || []).map((shop) => ({
          id: `shop-${shop._id}`,
          label: shop.name,
          meta: 'Shop',
          to: `${adminPath('shops')}?q=${encodeURIComponent(shop.name || term)}`,
        })),
        ...(listings.data.listings || []).map((listing) => ({
          id: `listing-${listing.id || listing._id}`,
          label: listing.title,
          meta: 'Listing',
          to: `${adminPath('listings')}?q=${encodeURIComponent(listing.title || term)}`,
        })),
      ];
      setSearchHits(hits.slice(0, 8));
      setSearchOpen(true);
    }).catch(() => {
      if (!cancelled) setSearchHits([]);
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, user]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      api.get('/auth/admin/platform-alerts', { params: { limit: 6 } })
        .then((response) => {
          if (!cancelled) setAlerts(response.data.alerts || []);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const acknowledgeAlert = async (id) => {
    try {
      await api.patch(`/auth/admin/platform-alerts/${id}`, { status: 'acknowledged' });
      setAlerts((current) => current.map((alert) => (
        alert.id === id ? { ...alert, status: 'acknowledged' } : alert
      )));
    } catch {
      /* keep the list as it is */
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false);
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.toggle('admin-sidebar-lock', sidebarOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('admin-sidebar-lock');
    };
  }, [sidebarOpen]);

  const activeSection = useMemo(
    () => navSections.find((section) => section.items.some((item) => isActivePath(location.pathname, item.path))),
    [location.pathname],
  );

  const currentTitle = pageTitleMap[location.pathname]
    || (location.pathname.startsWith(`${adminPath('users')}/`) ? 'User Details' : 'Dashboard');
  const displayName = user?.name || 'Admin';
  const roleLabel = ROLE_LABELS[user?.role] || 'Admin';
  const visibleSections = navSections
    .map((section) => ({ ...section, items: section.items.filter((item) => canAccessPath(user, item.path)) }))
    .filter((section) => section.items.length > 0);
  const visibleTabs = mobileTabs.filter((tab) => canAccessPath(user, tab.path));

  const navList = (onNavigate) => (
    <nav className="sidebar-nav">
      {visibleSections.map((section) => (
        <div key={section.title} className="nav-section">
          {!collapsed ? <div className="nav-section-title">{section.title}</div> : null}
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(location.pathname, item.path);
            const count = navCounts[item.path.split('/').pop()] || 0;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={count ? `${item.label} (${count} new)` : item.label}
                onClick={onNavigate}
                className={`sidebar-item ${active ? 'sidebar-item-active' : 'sidebar-item-inactive'}`}
              >
                <Icon className="item-icon" aria-hidden />
                {!collapsed ? <span className="item-label">{item.label}</span> : null}
                <NavBadge count={count} />
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="layout admin-shell">
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
      />

      <aside
        className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${sidebarOpen ? 'is-open' : ''}`}
      >
        <div className="sidebar-brand">
          <img src={BRAND_ICON_SRC} alt="" className="brand-mark" />
          {!collapsed ? (
            <span className="sidebar-brand-text">
              <span className="gradient-text">KinBech</span>
              <span className="brand-sub">{BRAND_TAGLINE}</span>
            </span>
          ) : null}
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="item-icon" />
          </button>
        </div>

        {navList(() => setSidebarOpen(false))}

        <div className="sidebar-foot">
          <div className="foot-user">
            <div className="user-avatar">{displayName.charAt(0).toUpperCase()}</div>
            {!collapsed ? (
              <div className="foot-user-info">
                <div className="user-name">{displayName}</div>
                <div className="user-role">{roleLabel}</div>
              </div>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          className="sidebar-collapse"
          onClick={() => setCollapsed((value) => !value)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight className="item-icon" /> : <ChevronLeft className="item-icon" />}
        </button>
      </aside>

      <div className="shell-main">
        <header className="appbar">
          <div className="appbar-left">
            <button
              type="button"
              className="icon-btn appbar-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="item-icon" />
            </button>
            <button
              type="button"
              className="icon-btn appbar-collapse"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Menu className="item-icon" />
            </button>
            <nav className="crumbs" aria-label="Breadcrumb">
              <span className="crumb-muted">{activeSection?.title || 'Overview'}</span>
              <ChevronRight className="crumb-sep" aria-hidden />
              <span className="crumb-current">{currentTitle}</span>
            </nav>
          </div>

          <div className="appbar-center">
            <div className="appbar-search">
              <Search className="search-icon" aria-hidden />
              <input
                type="text"
                placeholder="Search users, shops, listings..."
                className="search-input"
                aria-label="Search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
              />
              {searchOpen && query.trim().length >= 2 ? (
                <div className="appbar-search-results">
                  {searchHits.length === 0 ? (
                    <div className="dropdown-empty">No matches</div>
                  ) : searchHits.map((hit) => (
                    <button
                      key={hit.id}
                      type="button"
                      className="dropdown-item"
                      onClick={() => {
                        setSearchOpen(false);
                        navigate(hit.to);
                      }}
                    >
                      <span>{hit.label}</span>
                      <span className="dropdown-sub">{hit.meta}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="appbar-right">
            <Dropdown
              trigger={<Bell className="item-icon" />}
              className="dropdown-notify"
            >
              {({ close }) => (
                <>
                  <div className="dropdown-head">
                    <div>
                      <p className="dropdown-title">Notifications</p>
                      <p className="dropdown-sub">Platform alerts appear here</p>
                    </div>
                  </div>
                  {alerts.length === 0 ? (
                    <div className="dropdown-empty">No alerts right now.</div>
                  ) : alerts.map((alert) => (
                    <div key={alert.id} className="dropdown-item alert-row">
                      <span>
                        <span className="dropdown-title">{alert.title}</span>
                        <span className="dropdown-sub">{alert.message}</span>
                      </span>
                      {alert.status === 'open' ? (
                        <button type="button" className="action-btn" onClick={() => acknowledgeAlert(alert.id)}>
                          Ack
                        </button>
                      ) : <em>{alert.status}</em>}
                    </div>
                  ))}
                  <div className="dropdown-foot">
                    <Link to={adminPath('notifications')} onClick={close} className="dropdown-link">
                      View all notifications
                    </Link>
                  </div>
                </>
              )}
            </Dropdown>

            <button
              type="button"
              className="icon-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label="Toggle theme"
            >
              {theme === 'light' ? <Moon className="item-icon" /> : <Sun className="item-icon" />}
            </button>

            <Dropdown
              className="dropdown-user"
              trigger={
                <>
                  <span className="user-avatar small">{displayName.charAt(0).toUpperCase()}</span>
                  <span className="dropdown-user-text">
                    <span className="user-name">{displayName}</span>
                    <span className="user-role">{roleLabel}</span>
                  </span>
                  <ChevronDown className="chev" aria-hidden />
                </>
              }
            >
              {({ close }) => (
                <>
                  <div className="dropdown-head">
                    <span className="user-avatar">{displayName.charAt(0).toUpperCase()}</span>
                    <div>
                      <p className="dropdown-title">{displayName}</p>
                      <p className="dropdown-sub">{user?.email || roleLabel}</p>
                    </div>
                  </div>
                  {canAccess(user, 'settings') ? (
                    <Link to={adminPath('settings')} onClick={close} className="dropdown-item">
                      <Settings className="item-icon" aria-hidden />
                      <span>Settings &amp; Roles</span>
                    </Link>
                  ) : null}
                  {canAccess(user, 'notifications') ? (
                    <Link to={adminPath('notifications')} onClick={close} className="dropdown-item">
                      <Bell className="item-icon" aria-hidden />
                      <span>Notifications</span>
                    </Link>
                  ) : null}
                  <Link to={adminPath('account-security')} onClick={close} className="dropdown-item">
                    <KeyRound className="item-icon" aria-hidden />
                    <span>My Security</span>
                  </Link>
                  <div className="dropdown-sep" />
                  <button type="button" className="dropdown-item danger" onClick={logout}>
                    <LogOut className="item-icon" aria-hidden />
                    <span>Logout</span>
                  </button>
                </>
              )}
            </Dropdown>
          </div>
        </header>

        <main className="app-main">
          {secondsLeft ? (
            <div className="idle-warning" role="alert">
              <span>
                You&apos;ll be signed out in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} because of inactivity.
              </span>
              <button type="button" className="btn btn-primary" onClick={stayActive}>Stay signed in</button>
            </div>
          ) : null}
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="mkt-bottom-nav" aria-label="Admin navigation">
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActivePath(location.pathname, tab.path);
          return (
            <Link key={tab.path} to={tab.path} className={active ? 'is-active' : ''}>
              <Icon className="item-icon" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
        <button type="button" className="mkt-menu-btn" onClick={() => setSidebarOpen(true)}>
          <ShieldCheck className="item-icon" aria-hidden />
          Menu
          <NavBadge count={Object.values(navCounts).reduce((sum, value) => sum + (Number(value) || 0), 0)} />
        </button>
      </nav>
    </div>
  );
};

export default Layout;
