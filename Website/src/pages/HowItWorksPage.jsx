import { Link } from 'react-router-dom';
import PageShell from '../components/PageShell';
import HowItWorks from '../components/HowItWorks';

export default function HowItWorksPage() {
  return (
    <PageShell
      label="How it works"
      title="From download to deal in four steps"
      subtitle="Whether you're selling one item or running a shop, KinBech keeps every deal simple and local."
    >
      <HowItWorks embedded />
      <div className="container">
        <section className="page-timeline-extra">
          <h2>What happens after you meet?</h2>
          <div className="page-steps-detail">
            <article>
              <strong>1. Inspect</strong>
              <p>Check the item carefully. Test phones, sit on furniture, start vehicles — whatever applies.</p>
            </article>
            <article>
              <strong>2. Pay</strong>
              <p>Agree on cash, eSewa, Khalti, or bank transfer. KinBech does not process payments between users.</p>
            </article>
            <article>
              <strong>3. Review</strong>
              <p>Leave a review for verified shops to help the community build trust.</p>
            </article>
          </div>
          <Link to="/download" className="btn btn-primary page-cta-btn">Download KinBech</Link>
        </section>
      </div>
    </PageShell>
  );
}
