import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import BrandMark from './BrandMark';
import MobileDrawer from './MobileDrawer';
import ThemeToggle from './ThemeToggle';
import { IconChevronDown, IconChevronRight, IconMobile } from './Icons';
import { NAV_LINKS, NAV_MORE_LINKS, isNavActive } from '../config/navLinks';
import useActivePill, { NavPill } from '../utils/useActivePill';

const PILL_TARGET = ':scope > a.active, :scope > .nav-more > .active';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navRef = useRef(null);
  const moreRef = useRef(null);
  const { ref: trackRef, pill, ready } = useActivePill(PILL_TARGET, [location.pathname]);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 48);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      navRef.current?.style.setProperty('--nav-progress', max > 0 ? Math.min(window.scrollY / max, 1) : 0);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [location.pathname]);

  useEffect(() => {
    document.body.classList.toggle('drawer-open', drawerOpen);
    return () => document.body.classList.remove('drawer-open');
  }, [drawerOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setMoreOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!moreOpen) return undefined;
    const onPointer = (e) => {
      if (!moreRef.current?.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [moreOpen]);

  useEffect(() => {
    setDrawerOpen(false);
    setMoreOpen(false);
  }, [location.pathname]);

  const navClass = `nav scrolled${scrolled ? ' is-lifted' : ''}`;
  const moreActive = NAV_MORE_LINKS.some((link) => isNavActive(link.path, location.pathname));

  return (
    <>
      <header className={navClass} ref={navRef}>
        <div className="container nav-inner">
          <Link to="/" className="nav-brand" aria-label="KinBech home">
            <BrandMark variant="nav" showTagline />
          </Link>

          <nav className="nav-track nav-links--desktop" aria-label="Main" ref={trackRef}>
            <NavPill pill={pill} ready={ready} />
            {NAV_LINKS.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={isNavActive(path, location.pathname) ? 'active' : ''}
                aria-current={isNavActive(path, location.pathname) ? 'page' : undefined}
              >
                <Icon width={15} height={15} />
                {label}
              </Link>
            ))}

            <div
              ref={moreRef}
              className={`nav-more${moreOpen ? ' open' : ''}`}
              onMouseEnter={() => setMoreOpen(true)}
              onMouseLeave={() => setMoreOpen(false)}
            >
              <button
                type="button"
                className={`nav-more-trigger${moreActive ? ' active' : ''}`}
                aria-haspopup="true"
                aria-expanded={moreOpen}
                onClick={(e) => setMoreOpen((v) => (e.detail === 0 ? !v : true))}
              >
                More
                <IconChevronDown width={14} height={14} className="nav-more-caret" />
              </button>

              <div className="nav-more-menu">
                <div className="nav-more-grid">
                  {NAV_MORE_LINKS.map(({ path, label, desc, icon: Icon }) => (
                    <Link
                      key={path}
                      to={path}
                      className={`nav-more-item${isNavActive(path, location.pathname) ? ' active' : ''}`}
                    >
                      <span className="nav-more-icon">
                        <Icon width={18} height={18} />
                      </span>
                      <span className="nav-more-text">
                        <strong>{label}</strong>
                        <small>{desc}</small>
                      </span>
                    </Link>
                  ))}
                </div>
                <Link to="/download" className="nav-more-promo">
                  <span className="nav-more-promo-icon">
                    <IconMobile width={18} height={18} />
                  </span>
                  <span className="nav-more-text">
                    <strong>Get the KinBech app</strong>
                    <small>Chat, call and post · Android</small>
                  </span>
                  <IconChevronRight width={16} height={16} className="nav-more-promo-arrow" />
                </Link>
              </div>
            </div>
          </nav>

          <div className="nav-cta nav-cta--desktop">
            <ThemeToggle />
            <Link to="/download" className="btn btn-primary">
              <IconMobile width={16} height={16} />
              Download app
            </Link>
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
        <span className="nav-progress" aria-hidden />
      </header>

      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
