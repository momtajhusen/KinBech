import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import Features from '../components/Features';

export default function FeaturesPage() {
  return (
    <PageShell
      label="Features"
      title="Built for Nepal's local economy"
      subtitle="Everything you need to buy and sell face-to-face — no courier, no waiting, just meet and deal."
    >
      <Features embedded />
      <div className="container">
        <section className="page-info-card">
          <h3>Why local beats online shipping</h3>
          <div className="page-compare-grid">
            <div>
              <h4>KinBech (local)</h4>
              <ul>
                <li>See item before you pay</li>
                <li>No delivery fees</li>
                <li>Chat in-app, meet same day</li>
                <li>Prices in NPR, nearby sellers</li>
              </ul>
            </div>
            <div>
              <h4>Typical online marketplaces</h4>
              <ul>
                <li>Wait days for delivery</li>
                <li>Shipping + handling costs</li>
                <li>Hard to inspect before buying</li>
                <li>Often not optimized for Nepal</li>
              </ul>
            </div>
          </div>
          <Link to="/explore" className="btn btn-primary page-cta-btn">Start exploring</Link>
        </section>
      </div>
    </PageShell>
  );
}
