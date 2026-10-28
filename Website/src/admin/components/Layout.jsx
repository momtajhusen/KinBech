import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MIcon from './MIcon';
import { useTheme } from '../context/ThemeContext';
import { adminPath } from '../routes';
import { BRAND_TAGLINE } from '../../content/brand';
import { BRAND_ICON_SRC } from '../../content/brandAssets';
import api from '../services/api';
import useDebounce from '../utils/useDebounce';
import useActivePill, { NavPill } from '../../utils/useActivePill';
import { ROLE_LABELS, canAccess, canAccessPath } from '../utils/access';
import { findNavLocation, isActivePath, tabPath, visibleNav } from '../navigation';

const SIDEBAR_KEY = 'admin-sidebar-collapsed';
const RIPPLE_TARGETS = '.btn, .action-btn, .sidebar-item, .hub-tab, .filter-chip, .pagination-btn, .ud-type-tab, .ud-quick-chip, .view-toggle button, .dropdown-item, .icon-btn';

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

const NAV_SEEN_KEY = 'adminNavSeen';
const BADGE_PAGES = ['pending-review', 'support', 'shop-verification', 'reports', 'scam-monitor', 'error-log', 'subscriptions'];
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
  { path: adminPath('dashboard'), label: 'Home', icon: 'space_dashboard' },
  { path: adminPath('pending-review'), label: 'Listings', icon: 'inventory_2' },
  { path: adminPath('reports'), label: 'Safety', icon: 'shield' },
  { path: adminPath('support'), label: 'Support', icon: 'support_agent' },
];

function hubBadge(hub, counts) {
  return hub.tabs.reduce((sum, tab) => sum + (Number(counts[tab.page]) || 0), 0);
}

/** Title, short explanation and tabs for the related pages of the current sidebar item. */
function HubHeader({ location, counts }) {
  const tabsPill = useActivePill('.hub-tab.is-active', [location?.hub.key, location?.tab.page]);
  if (!location || location.hub.tabs.length < 2) return null;
  const { hub, tab: current } = location;
  return (
    <div className="hub-head">
      <div className="hub-title">
        <span className="hub-title-icon" key={hub.key}><MIcon name={hub.icon} filled /></span>
        <div>
          <h2>{hub.label}</h2>
          <p className="hub-hint">{hub.hint}</p>
        </div>
      </div>
      <nav className="hub-tabs" aria-label={`${hub.label} pages`} ref={tabsPill.ref}>
        <NavPill pill={tabsPill.pill} ready={tabsPill.ready} />
        {hub.tabs.map((tab) => {
          const active = tab.page === current.page;
          return (
            <Link
              key={tab.page}
              to={tabPath(tab)}
              className={`hub-tab ${active ? 'is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <MIcon name={tab.icon} filled={active} />
              {tab.label}
              <NavBadge count={counts[tab.page] || 0} />
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

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
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = typeof document !== 'undefined'
    && Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);
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
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  const toggleFullscreen = () => {
    const root = document.documentElement;
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
    } else {
      const request = root.requestFullscreen || root.webkitRequestFullscreen;
      Promise.resolve(request?.call(root)).catch(() => {});
    }
  };

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const onDown = (event) => {
      if (event.button !== 0) return;
      const target = event.target.closest?.(RIPPLE_TARGETS);
      if (!target || target.disabled || !target.closest('.admin-app')) return;
      if (getComputedStyle(target).position === 'static') target.style.position = 'relative';
      const rect = target.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const wrap = document.createElement('span');
      wrap.className = 'kb-ripple-wrap';
      const ripple = document.createElement('span');
      ripple.className = 'kb-ripple';
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${event.clientY - rect.top - size / 2}px`;
      wrap.appendChild(ripple);
      target.appendChild(wrap);
      ripple.addEventListener('animationend', () => wrap.remove(), { once: true });
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

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

  const navGroups = useMemo(() => visibleNav(user), [user]);
  const navLocation = useMemo(
    () => findNavLocation(navGroups, location.pathname),
    [navGroups, location.pathname],
  );
  const sidebarPill = useActivePill('.sidebar-item-active', [navLocation?.hub.key, collapsed, navGroups]);

  // The new theme grows out of the toggle button as a circle.
  const switchTheme = (event) => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduceMotion) {
      toggleTheme();
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const root = document.documentElement;
    root.classList.add('admin-theme-reveal');
    const transition = document.startViewTransition(() => flushSync(toggleTheme));
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 650, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      );
    }).catch(() => {});
    transition.finished.finally(() => root.classList.remove('admin-theme-reveal'));
  };

  const isUserDetail = location.pathname.startsWith(`${adminPath('users')}/`);
  const currentTitle = isUserDetail ? 'User details' : navLocation?.tab.label || 'Dashboard';
  const displayName = user?.name || 'Admin';
  const roleLabel = ROLE_LABELS[user?.role] || 'Admin';
  const visibleTabs = mobileTabs.filter((tab) => canAccessPath(user, tab.path));

  const navList = (onNavigate) => (
    <nav className="sidebar-nav" ref={sidebarPill.ref}>
      <NavPill pill={sidebarPill.pill} ready={sidebarPill.ready} />
      {navGroups.map((group) => (
        <div key={group.title} className="nav-section">
          {!collapsed ? <div className="nav-section-title">{group.title}</div> : null}
          {group.hubs.map((hub) => {
            const active = navLocation?.hub.key === hub.key;
            const count = hubBadge(hub, navCounts);
            const pages = hub.tabs.map((tab) => tab.label).join(' · ');
            return (
              <Link
                key={hub.key}
                to={tabPath(hub.tabs[0])}
                title={`${hub.label}${hub.tabs.length > 1 ? ` — ${pages}` : ''}${count ? ` (${count} new)` : ''}`}
                onClick={onNavigate}
                className={`sidebar-item ${active ? 'sidebar-item-active' : 'sidebar-item-inactive'}`}
              >
                <span className="sidebar-icon"><MIcon name={hub.icon} filled={active} /></span>
                {!collapsed ? <span className="item-label">{hub.label}</span> : null}
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
            <MIcon name="close" />
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
          <MIcon name={collapsed ? 'chevron_right' : 'chevron_left'} />
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
              <MIcon name="menu" />
            </button>
            <button
              type="button"
              className="icon-btn appbar-collapse"
              onClick={() => setCollapsed((value) => !value)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <MIcon name={collapsed ? 'menu_open' : 'menu'} />
            </button>
            <nav className="crumbs" aria-label="Breadcrumb">
              <span className="crumb-muted">{navLocation?.hub.label || 'Dashboard'}</span>
              <MIcon name="chevron_right" className="crumb-sep" />
              <span className="crumb-current" key={currentTitle}>{currentTitle}</span>
            </nav>
          </div>

          <div className="appbar-center">
            <div className="appbar-search">
              <MIcon name="search" className="search-icon" />
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
              trigger={<MIcon name="notifications" />}
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
                  {canAccess(user, 'dashboard') ? (
                    <div className="dropdown-foot">
                      <Link to={adminPath('dashboard')} onClick={close} className="dropdown-link">
                        See all alerts on the dashboard
                      </Link>
                    </div>
                  ) : null}
                </>
              )}
            </Dropdown>

            {canFullscreen ? (
              <button
                type="button"
                className="icon-btn appbar-fullscreen"
                onClick={toggleFullscreen}
                title={fullscreen ? 'Exit full screen' : 'Full screen'}
                aria-label={fullscreen ? 'Exit full screen' : 'Full screen'}
                aria-pressed={fullscreen}
              >
                <MIcon key={fullscreen ? 'exit' : 'enter'} name={fullscreen ? 'fullscreen_exit' : 'fullscreen'} className="fullscreen-icon" />
              </button>
            ) : null}

            <button
              type="button"
              className="icon-btn"
              onClick={switchTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
              aria-label="Toggle theme"
            >
              <MIcon key={theme} name={theme === 'light' ? 'dark_mode' : 'light_mode'} className="theme-icon" />
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
                  <MIcon name="expand_more" className="chev" />
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
                      <MIcon name="admin_panel_settings" />
                      <span>Settings &amp; Roles</span>
                    </Link>
                  ) : null}
                  {canAccess(user, 'notifications') ? (
                    <Link to={adminPath('notifications')} onClick={close} className="dropdown-item">
                      <MIcon name="campaign" />
                      <span>Send announcement</span>
                    </Link>
                  ) : null}
                  <Link to={adminPath('account-security')} onClick={close} className="dropdown-item">
                    <MIcon name="lock" />
                    <span>My Security</span>
                  </Link>
                  <div className="dropdown-sep" />
                  <button type="button" className="dropdown-item danger" onClick={logout}>
                    <MIcon name="logout" />
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
            <HubHeader location={isUserDetail ? null : navLocation} counts={navCounts} />
            <div className="page-stage" key={location.pathname}>
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      <nav className="mkt-bottom-nav" aria-label="Admin navigation">
        {visibleTabs.map((tab) => {
          const active = isActivePath(location.pathname, tab.path)
            || Boolean(navLocation?.hub.tabs.some((item) => tabPath(item) === tab.path));
          return (
            <Link key={tab.path} to={tab.path} className={active ? 'is-active' : ''}>
              <MIcon name={tab.icon} filled={active} />
              {tab.label}
            </Link>
          );
        })}
        <button type="button" className="mkt-menu-btn" onClick={() => setSidebarOpen(true)}>
          <MIcon name="menu" />
          Menu
          <NavBadge count={Object.values(navCounts).reduce((sum, value) => sum + (Number(value) || 0), 0)} />
        </button>
      </nav>
    </div>
  );
};

export default Layout;
