import { Link } from 'react-router-dom';
import { BRAND_TAGLINE } from '../content/brand';
import BrandMark from './BrandMark';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div className="footer-brand">
            <BrandMark variant="footer" showTagline />
            <p>
              KinBech — {BRAND_TAGLINE}. Nepal&apos;s trusted local marketplace for face-to-face
              deals without shipping hassle.
            </p>
          </div>
          <div>
            <h4>Product</h4>
            <ul>
              <li><Link to="/explore">Explore</Link></li>
              <li><Link to="/categories">Categories</Link></li>
              <li><Link to="/features">Features</Link></li>
              <li><Link to="/how-it-works">How it works</Link></li>
              <li><Link to="/sellers">For sellers</Link></li>
              <li><Link to="/download">Download</Link></li>
            </ul>
          </div>
          <div>
            <h4>Legal</h4>
            <ul>
              <li><Link to="/legal">All policies</Link></li>
              <li><Link to="/legal/privacy">Privacy Policy</Link></li>
              <li><Link to="/legal/terms">Terms & Conditions</Link></li>
              <li><Link to="/legal/permissions">App permissions</Link></li>
              <li><Link to="/legal/accountDeletion">Account deletion</Link></li>
              <li><Link to="/safety">Safety tips</Link></li>
              <li><Link to="/faq">FAQ</Link></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li><a href="mailto:support@kinbech.com">support@kinbech.com</a></li>
              <li><span>Kathmandu, Nepal</span></li>
              <li><span>+977 support line — coming soon</span></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {year} KinBech. All rights reserved.</span>
          <span>Made for Coders Alpha</span>
        </div>
      </div>
    </footer>
  );
}
