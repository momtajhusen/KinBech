import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import Safety from '../components/Safety';

export default function SafetyPage() {
  return (
    <PageShell
      label="Trust & safety"
      title="Your safety comes first"
      subtitle="KinBech connects buyers and sellers — you control every deal. Follow these guidelines for a safe experience."
    >
      <Safety embedded />
      <div className="container">
        <section className="page-info-card page-warning-card">
          <h3>Red flags — report immediately</h3>
          <ul>
            <li>Seller asks for full payment before you see the item</li>
            <li>Price too good to be true with pressure to decide fast</li>
            <li>Requests to move chat off-app before any meetup</li>
            <li>Asks for OTP, bank PIN, or eSewa/Khalti password</li>
            <li>Meetup location keeps changing to isolated areas</li>
          </ul>
          <p>Use in-app Report & Block. KinBech will never ask for your OTP.</p>
          <Link to="/faq" className="btn btn-outline page-cta-btn">Read FAQ</Link>
        </section>
      </div>
    </PageShell>
  );
}
