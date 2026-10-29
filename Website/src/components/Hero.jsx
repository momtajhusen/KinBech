import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import SiteImage from './SiteImage';
import {
  IconChat,
  IconFurniture,
  IconLaptop,
  IconLocation,
  IconMobile,
  IconSearch,
  IconShield,
  IconVehicle,
} from './Icons';

const POPULAR = [
  { name: 'Mobiles', icon: IconMobile },
  { name: 'Vehicles', icon: IconVehicle },
  { name: 'Furniture', icon: IconFurniture },
  { name: 'Laptops', icon: IconLaptop },
];

const HERO_SLIDES = [
  'home-hero',
  'categories-hero',
  'features-hero',
  'how-hero',
  'sellers-hero',
  'download-hero',
  'safety-hero',
  'faq-hero',
  'legal-hero',
  'security-hero',
];
const SLIDE_MS = 4500;
const SWIPE_PX = 40;

function HeroSlider() {
  const count = HERO_SLIDES.length;
  const [index, setIndex] = useState(0);
  const [prev, setPrev] = useState(-1);
  const [paused, setPaused] = useState(false);
  // Only the current and next slides are mounted, so the home page does not download every illustration up front.
  const [mounted, setMounted] = useState(() => new Set([0, 1]));
  const indexRef = useRef(0);
  const touchX = useRef(null);

  const go = useCallback((target) => {
    const next = (target + count) % count;
    if (next === indexRef.current) return;
    setPrev(indexRef.current);
    indexRef.current = next;
    setIndex(next);
    const ahead = (next + 1) % count;
    setMounted((set) => (set.has(next) && set.has(ahead) ? set : new Set([...set, next, ahead])));
  }, [count]);

  useEffect(() => {
    if (paused) return undefined;
    let timer;
    const tick = () => {
      if (document.hidden) timer = setTimeout(tick, SLIDE_MS);
      else go(indexRef.current + 1);
    };
    timer = setTimeout(tick, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [paused, go, index]);

  const onTouchStart = (e) => {
    touchX.current = e.touches[0]?.clientX ?? null;
  };

  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchX.current) - touchX.current;
    touchX.current = null;
    if (Math.abs(dx) > SWIPE_PX) go(indexRef.current + (dx < 0 ? 1 : -1));
  };

  return (
    <div
      className="hero-slider"
      aria-roledescription="carousel"
      aria-label="KinBech illustrations"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="hero-slides">
        {HERO_SLIDES.map((name, i) =>
          mounted.has(i) ? (
            <div
              key={name}
              className={`hero-slide${i === index ? ' is-active' : ''}${i === prev ? ' is-prev' : ''}`}
              aria-hidden={i !== index}
            >
              <SiteImage name={name} priority={i === 0} />
            </div>
          ) : null,
        )}
      </div>
      <div className="hero-slider-dots">
        {HERO_SLIDES.map((name, i) => (
          <button
            key={name}
            type="button"
            className={i === index ? 'is-active' : ''}
            aria-label={`Show illustration ${i + 1} of ${count}`}
            aria-current={i === index ? 'true' : undefined}
            onClick={() => go(i)}
          />
        ))}
      </div>
    </div>
  );
}

export default function Hero() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  function handleSearch(e) {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/explore?q=${encodeURIComponent(q)}` : '/explore');
  }

  return (
    <section className="hero">
      <div className="hero-deco" aria-hidden>
        <span className="hero-orb hero-orb--a" />
        <span className="hero-orb hero-orb--b" />
      </div>
      <div className="container hero-grid">
        <div className="hero-copy">
          <div className="hero-badge">
            <span aria-hidden />
            Nepal&apos;s local marketplace
            <span className="hero-badge-ne" lang="ne">नेपालको आफ्नै बजार</span>
          </div>
          <h1>
            Buy &amp; sell near you.
            <br />
            No shipping. <span className="hero-highlight">Just meet.</span>
          </h1>
          <p className="hero-ne" lang="ne">
            नजिकै किन्नुहोस्, नजिकै बेच्नुहोस् — डेलिभरी कुर्नु पर्दैन, <span>भेटेरै कारोबार गर्नुहोस्।</span>
          </p>
          <p className="hero-lead">
            KinBech connects buyers and sellers in your city — phones, furniture, vehicles,
            electronics, and more. Chat in-app, agree on a price, and meet at a safe public place.
          </p>

          <form className="hero-search" onSubmit={handleSearch} role="search">
            <IconSearch width={20} height={20} className="hero-search-icon" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Phones, bikes, sofas…"
              aria-label="Search listings"
            />
            <button type="submit" className="btn btn-primary">Search</button>
          </form>

          <div className="hero-popular">
            <span>Popular · <span lang="ne">लोकप्रिय</span>:</span>
            {POPULAR.map(({ name, icon: Icon }) => (
              <Link key={name} to={`/explore?category=${encodeURIComponent(name)}`} className="hero-popular-chip">
                <Icon width={15} height={15} />
                {name}
              </Link>
            ))}
          </div>

          <div className="hero-stats">
            <div className="hero-stat">
              <strong>1 tap</strong>
              <span>Google sign-in</span>
            </div>
            <div className="hero-stat">
              <strong>NPR</strong>
              <span>Local pricing</span>
            </div>
            <div className="hero-stat">
              <strong>2 modes</strong>
              <span>Individual &amp; shop</span>
            </div>
          </div>
        </div>

        <div className="hero-art">
          <div className="hero-radar" aria-hidden>
            <span />
            <span />
            <span />
          </div>
          <HeroSlider />
          <span className="hero-art-chip hero-art-chip--top">
            <IconLocation width={16} height={16} />
            800 m away
          </span>
          <span className="hero-art-chip hero-art-chip--side">
            <IconShield width={16} height={16} />
            Meet in public
          </span>
          <span className="hero-art-chip hero-art-chip--bottom">
            <IconChat width={16} height={16} />
            Is this still available?
          </span>
        </div>
      </div>
    </section>
  );
}
