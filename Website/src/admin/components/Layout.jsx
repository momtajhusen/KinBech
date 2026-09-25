import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { adminPath } from '../routes';
import { BRAND_TAGLINE } from '../../content/brand';
import { BRAND_ICON_SRC } from '../../content/brandAssets';

const Layout = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navSections = [
    {
      title: 'Overview',
      items: [{ path: adminPath('dashboard'), label: 'Dashboard', icon: '📊' }],
    },
    {
      title: 'Marketplace',
      items: [
        { path: adminPath('users'), label: 'Users', icon: '👥' },
        { path: adminPath('shops'), label: 'Shops', icon: '🏪', badge: 3 },
        { path: adminPath('listings'), label: 'Listings', icon: '📦' },
        { path: adminPath('categories'), label: 'Categories', icon: '🗂️' },
      ],
    },
    {
      title: 'Trust & Safety',
      items: [
        { path: adminPath('reports'), label: 'Reports', icon: '🚩' },
        { path: adminPath('error-log'), label: 'Error Log', icon: '🐛' },
        { path: adminPath('reviews'), label: 'Reviews', icon: '⭐' },
        { path: adminPath('restricted-keywords'), label: 'Restricted Keywords', icon: '🚫' },
      ],
    },
    {
      title: 'System',
      items: [
        { path: adminPath('notifications'), label: 'Notifications', icon: '🔔' },
        { path: adminPath('settings'), label: 'Settings & Roles', icon: '⚙️' },
      ],
    },
  ];

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

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

  return (
    <div className={`layout ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <button
        type="button"
        className="sidebar-backdrop"
        aria-label="Close menu"
        onClick={() => setSidebarOpen(false)}
      />

      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="logo">
            <img src={BRAND_ICON_SRC} alt="" className="logo-mark" />
            <div>
              <h1>KinBech</h1>
              <p className="logo-tagline">{BRAND_TAGLINE}</p>
              <p className="logo-subtitle">Admin Console</p>
            </div>
          </div>
          <button
            type="button"
            className="sidebar-close"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            ✕
          </button>
        </div>

        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.title} className="nav-section">
              <div className="nav-section-title">{section.title}</div>
              {section.items.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                >
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                  {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">
              {user?.name?.charAt(0).toUpperCase() || 'A'}
            </div>
            <div className="user-info">
              <div className="user-name">{user?.name || 'Admin'}</div>
              <div className="user-role">Super Admin</div>
            </div>
          </div>
          <button type="button" onClick={logout} className="logout-btn">
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="top-bar">
          <div className="top-bar-left">
            <button
              type="button"
              className="menu-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <div className="page-info">
              <h1>{getPageTitle(location.pathname)}</h1>
              <p className="page-description">{getPageDescription(location.pathname)}</p>
            </div>
          </div>
          <div className="top-bar-actions">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search users, shops, listings..."
                className="search-input"
              />
            </div>
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
            >
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
            <button type="button" className="notification-btn" title="Notifications">
              <span className="notification-icon">🔔</span>
              <span className="notification-badge">3</span>
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
};

const pageTitleMap = {
  [adminPath('dashboard')]: 'Dashboard',
  [adminPath('users')]: 'Users',
  [adminPath('shops')]: 'Shops',
  [adminPath('listings')]: 'Listings',
  [adminPath('categories')]: 'Categories',
  [adminPath('restricted-keywords')]: 'Restricted Keywords',
  [adminPath('reports')]: 'Reports',
  [adminPath('reviews')]: 'Reviews',
  [adminPath('notifications')]: 'Notifications',
  [adminPath('settings')]: 'Settings & Roles',
};

const pageDescriptionMap = {
  [adminPath('dashboard')]: 'Overview of platform health and key metrics',
  [adminPath('users')]: 'Manage user accounts and permissions',
  [adminPath('shops')]: 'Manage shop verification and business profiles',
  [adminPath('listings')]: 'Moderate product listings and content',
  [adminPath('categories')]: 'Manage product and shop categories',
  [adminPath('restricted-keywords')]:
    'Block or hold listings that use prohibited words in title, description, and other fields',
  [adminPath('reports')]: 'Review and resolve user reports',
  [adminPath('reviews')]: 'Moderate ratings and written reviews',
  [adminPath('notifications')]: 'Send platform-wide announcements',
  [adminPath('settings')]: 'Configure system settings and admin roles',
};

function getPageTitle(path) {
  return pageTitleMap[path] || 'Dashboard';
}

function getPageDescription(path) {
  return pageDescriptionMap[path] || '';
}

export default Layout;
