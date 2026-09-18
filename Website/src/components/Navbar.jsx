import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import BrandMark from './BrandMark';
import MobileDrawer from './MobileDrawer';
import ThemeToggle from './ThemeToggle';
import { NAV_LINKS } from '../config/navLinks';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  const isInnerPage = location.pathname !== '/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [drawerOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const navClass = `nav${scrolled || isInnerPage ? ' scrolled' : ''}`;

  const isActive = (path) => {
    if (path === '/explore') {
      return location.pathname.startsWith('/explore')
        || location.pathname.startsWith('/listing/')
        || location.pathname.startsWith('/seller/');
    }
    return location.pathname === path;
  };

  return (
    <>
      <header className={navClass}>
        <div className="container nav-inner">
          <Link to="/" className="nav-brand" aria-label="KinBech home">
            <BrandMark variant="nav" showTagline />
          </Link>

          <ul className="nav-links nav-links--desktop">
            {NAV_LINKS.map((link) => (
              <li key={link.path}>
                <Link to={link.path} className={isActive(link.path) ? 'active' : ''}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="nav-cta nav-cta--desktop">
            <ThemeToggle />
            <Link to="/download" className="btn btn-primary">Download app</Link>
          </div>

          <button
            type="button"
            className={`nav-toggle${drawerOpen ? ' active' : ''}`}
            aria-label={drawerOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen((v) => !v)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
