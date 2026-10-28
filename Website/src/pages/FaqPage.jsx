import { Link } from 'react-router-dom';
import SupportAgentRounded from '@mui/icons-material/SupportAgentRounded';
import PageShell from '../components/PageShell';
import FAQ from '../components/FAQ';
import { IconTitle } from '../components/IconList';
import SiteImage from '../components/SiteImage';

export default function FaqPage() {
  return (
    <PageShell
      label="FAQ"
      title="Common questions"
      titleNe="धेरै सोधिने प्रश्नहरू"
      neFirst
      subtitle="Everything you need to know before downloading KinBech."
      image="faq-hero"
      highlights={['Account & login', 'Buying & selling', 'Safety tips']}
    >
      <FAQ embedded />
      <div className="container">
        <section className="page-info-card page-info-card--media">
          <SiteImage name="faq-support" className="page-info-art" />
          <div>
            <IconTitle icon={SupportAgentRounded} ne="अझै सहयोग चाहियो?">Still need help?</IconTitle>
            <p>
              Open Help & Support inside the app to submit a ticket, or email{' '}
              <a href="mailto:support@kinbech.com">support@kinbech.com</a>.
            </p>
            <div className="page-cta-row">
              <Link to="/safety" className="btn btn-outline">Safety tips</Link>
              <Link to="/download" className="btn btn-primary">Download app</Link>
            </div>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
