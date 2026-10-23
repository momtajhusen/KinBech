import { useEffect, useMemo, useRef, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  Activity,
  Ban,
  Bell,
  Bug,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Flag,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
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
      { path: adminPath('shops'), label: 'Shops', icon: Store },
      { path: adminPath('listings'), label: 'Listings', icon: Package },
      { path: adminPath('categories'), label: 'Categories', icon: FolderTree },
    ],
  },
  {
    title: 'Trust & Safety',
    items: [
      { path: adminPath('reports'), label: 'Reports', icon: Flag },
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
      { path: adminPath('settings'), label: 'Settings & Roles', icon: Settings },
    ],
  },
];

const pageTitleMap = {
  [adminPath('dashboard')]: 'Dashboard',
  [adminPath('live-activity')]: 'Live Activity',
  [adminPath('users')]: 'Users',
  [adminPath('shops')]: 'Shops',
  [adminPath('listings')]: 'Listings',
  [adminPath('categories')]: 'Categories',
  [adminPath('restricted-keywords')]: 'Restricted Keywords',
  [adminPath('reports')]: 'Reports',
  [adminPath('error-log')]: 'Error Log',
  [adminPath('reviews')]: 'Reviews',
  [adminPath('notifications')]: 'Notifications',
  [adminPath('ai-models')]: 'AI Models',
  [adminPath('settings')]: 'Settings & Roles',
};

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
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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
    () => navSections.find((section) => section.items.some((item) => item.path === location.pathname)),
    [location.pathname],
  );

  const currentTitle = pageTitleMap[location.pathname] || 'Dashboard';
  const displayName = user?.name || 'Admin';
  const roleLabel = user?.role === 'admin' ? 'Super Admin' : (user?.role || 'Super Admin');

  const navList = (onNavigate) => (
    <nav className="sidebar-nav">
      {navSections.map((section) => (
        <div key={section.title} className="nav-section">
          {!collapsed ? <div className="nav-section-title">{section.title}</div> : null}
          {section.items.map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                title={item.label}
                onClick={onNavigate}
                className={`sidebar-item ${active ? 'sidebar-item-active' : 'sidebar-item-inactive'}`}
              >
                <Icon className="item-icon" aria-hidden />
                {!collapsed ? <span className="item-label">{item.label}</span> : null}
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
              />
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
                  <div className="dropdown-empty">No alerts right now.</div>
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
                  <Link to={adminPath('settings')} onClick={close} className="dropdown-item">
                    <Settings className="item-icon" aria-hidden />
                    <span>Settings &amp; Roles</span>
                  </Link>
                  <Link to={adminPath('notifications')} onClick={close} className="dropdown-item">
                    <Bell className="item-icon" aria-hidden />
                    <span>Notifications</span>
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
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>

      <nav className="mkt-bottom-nav" aria-label="Admin navigation">
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          const active = location.pathname === tab.path;
          return (
            <Link key={tab.path} to={tab.path} className={active ? 'is-active' : ''}>
              <Icon className="item-icon" aria-hidden />
              {tab.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setSidebarOpen(true)}>
          <ShieldCheck className="item-icon" aria-hidden />
          Menu
        </button>
      </nav>
    </div>
  );
};

export default Layout;
