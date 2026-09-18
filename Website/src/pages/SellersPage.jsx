import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import ForSellers from '../components/ForSellers';

export default function SellersPage() {
  return (
    <PageShell
      label="For sellers"
      title="Two ways to sell on KinBech"
      subtitle="Start as an individual, grow into a shop — switch anytime from your profile."
    >
      <ForSellers embedded />
      <div className="container">
        <section className="page-info-card">
          <h3>Seller checklist</h3>
          <div className="page-checklist">
            <div>
              <h4>Individual seller</h4>
              <ul>
                <li>Phone OTP verified account</li>
                <li>Up to 8 photos per listing</li>
                <li>Set city & district location</li>
                <li>Manage from My Listings</li>
              </ul>
            </div>
            <div>
              <h4>Shop owner</h4>
              <ul>
                <li>Shop logo & opening hours</li>
                <li>Category & business description</li>
                <li>Admin verification for badge</li>
                <li>Reviews & Explore visibility</li>
              </ul>
            </div>
          </div>
          <Link to="/explore" className="btn btn-primary page-cta-btn">See sellers on Explore</Link>
        </section>
      </div>
    </PageShell>
  );
}
