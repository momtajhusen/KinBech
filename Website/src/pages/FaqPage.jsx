import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import FAQ from '../components/FAQ';

export default function FaqPage() {
  return (
    <PageShell
      label="FAQ"
      title="Common questions"
      subtitle="Everything you need to know before downloading KinBech."
    >
      <FAQ embedded />
      <div className="container">
        <section className="page-info-card">
          <h3>Still need help?</h3>
          <p>
            Open Help & Support inside the app to submit a ticket, or email{' '}
            <a href="mailto:support@kinbech.com">support@kinbech.com</a>.
          </p>
          <div className="page-cta-row">
            <Link to="/safety" className="btn btn-outline">Safety tips</Link>
            <Link to="/download" className="btn btn-primary">Download app</Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
