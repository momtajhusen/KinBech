import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import Download from '../components/Download';

export default function DownloadPage() {
  return (
    <PageShell
      label="Get started"
      title="Download KinBech"
      subtitle="Join Nepal's local marketplace — browse, list, and deal face-to-face."
    >
      <Download embedded />
      <div className="container">
        <section className="page-info-card">
          <h3>What you get in the app</h3>
          <ul className="page-feature-list">
            <li>Phone OTP login (+977) — no email required</li>
            <li>Explore nearby listings & verified shops</li>
            <li>In-app chat without sharing your number</li>
            <li>Post listings with photos in minutes</li>
            <li>Wishlist, notifications & seller profiles</li>
          </ul>
          <Link to="/explore" className="btn btn-outline page-cta-btn">Preview listings on web</Link>
        </section>
      </div>
    </PageShell>
  );
}
