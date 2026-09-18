import { Link } from 'react-router-dom';
import BrandMark from './BrandMark';

export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero-grid">
        <div>
          <div className="hero-badge">
            <span aria-hidden />
            Nepal&apos;s local marketplace
          </div>
          <h1>
            Buy &amp; sell near you.
            <br />
            No shipping. Just meet.
          </h1>
          <p className="hero-lead">
            KinBech connects buyers and sellers in your city — phones, furniture, vehicles,
            electronics, and more. Chat in-app, agree on a price, and meet at a safe public place.
          </p>
          <div className="hero-actions">
            <Link to="/download" className="btn btn-primary">
              Download app
            </Link>
            <Link to="/explore" className="btn btn-ghost">
              Explore listings
            </Link>
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

        <div className="phone-mock" aria-hidden>
          <div className="phone-frame">
            <div className="phone-screen">
              <div className="phone-header">
                <BrandMark variant="phone" />
                <span className="phone-menu-icon" aria-hidden>
                  <span /><span /><span />
                </span>
              </div>
              <p className="phone-header-sub">Kathmandu · Nearby items</p>
              <div className="phone-search">Search phones, bikes, furniture…</div>
              <div className="phone-cards">
                <div className="mini-card">
                  <div className="mini-thumb" />
                  <div>
                    <h4>iPhone 13 Pro</h4>
                    <p>Rs. 85,000</p>
                    <small>2.1 km away · Like new</small>
                  </div>
                </div>
                <div className="mini-card">
                  <div className="mini-thumb" />
                  <div>
                    <h4>Office chair</h4>
                    <p>Rs. 4,500</p>
                    <small>800 m away · Good</small>
                  </div>
                </div>
                <div className="mini-card">
                  <div className="mini-thumb" />
                  <div>
                    <h4>Honda Dio</h4>
                    <p>Rs. 1,45,000</p>
                    <small>5.3 km away · 2022</small>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
