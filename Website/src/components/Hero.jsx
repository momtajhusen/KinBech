import { useState } from 'react';
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
            नजिकै किन्नुहोस्, नजिकै बेच्नुहोस् — ढुवानी होइन, <span>भेटेरै कारोबार।</span>
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
              <strong>+977</strong>
              <span>Phone OTP login</span>
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
          <SiteImage name="home-hero" priority />
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
