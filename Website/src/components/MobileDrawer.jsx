import { Link, useLocation } from 'react-router-dom';
import { BRAND_TAGLINE } from '../content/brand';
import BrandMark from './BrandMark';
import ThemeToggle from './ThemeToggle';
import { DRAWER_LINKS } from '../config/navLinks';
import { useTheme } from '../theme/ThemeContext';
import {
  IconAlert,
  IconSearch,
  IconShield,
  IconShop,
  IconStar,
  IconPhone,
  IconMobile,
} from './Icons';

const ICONS = {
  Explore: IconSearch,
  Categories: IconSearch,
  Features: IconStar,
  'How it works': IconPhone,
  'For sellers': IconShop,
  Safety: IconShield,
  FAQ: IconAlert,
  Download: IconMobile,
};

export default function MobileDrawer({ open, onClose }) {
  const location = useLocation();
  const { isDark } = useTheme();

  return (
    <>
      <button
        type="button"
        className={`drawer-backdrop${open ? ' open' : ''}`}
        aria-label="Close menu"
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />

      <aside
        className={`mobile-drawer${open ? ' open' : ''}`}
        aria-hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="drawer-panel">
          <div className="drawer-header">
            <BrandMark variant="nav" showTagline />
            <button type="button" className="drawer-close" aria-label="Close menu" onClick={onClose}>
              <span />
              <span />
            </button>
          </div>

          <nav className="drawer-nav">
            {DRAWER_LINKS.map((link, index) => {
              const Icon = ICONS[link.label] || IconSearch;
              const active = location.pathname === link.path
                || (link.path === '/explore' && (
                  location.pathname.startsWith('/explore')
                  || location.pathname.startsWith('/listing/')
                  || location.pathname.startsWith('/seller/')
                ));
              return (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`drawer-link${active ? ' drawer-link--active' : ''}`}
                  style={{ '--drawer-i': index }}
                  onClick={onClose}
                >
                  <span className="drawer-link-icon">
                    <Icon width={20} height={20} />
                  </span>
                  <span className="drawer-link-text">
                    <strong>{link.label}</strong>
                    <small>{link.desc}</small>
                  </span>
                  <span className="drawer-link-arrow" aria-hidden>›</span>
                </Link>
              );
            })}
          </nav>

          <div className="drawer-footer">
            <div className="drawer-theme-row">
              <span>{isDark ? 'Dark mode' : 'Light mode'}</span>
              <ThemeToggle />
            </div>
            <Link to="/explore" className="btn btn-primary drawer-cta" onClick={onClose}>
              Explore listings
            </Link>
            <Link to="/download" className="btn btn-outline drawer-cta-secondary" onClick={onClose}>
              Download app
            </Link>
            <p className="drawer-footnote">Nepal&apos;s local marketplace · {BRAND_TAGLINE}</p>
          </div>
        </div>
      </aside>
    </>
  );
}
