import { Link } from 'react-router-dom';
import EventAvailableRounded from '@mui/icons-material/EventAvailableRounded';
import FactCheckRounded from '@mui/icons-material/FactCheckRounded';
import PaymentsRounded from '@mui/icons-material/PaymentsRounded';
import RateReviewRounded from '@mui/icons-material/RateReviewRounded';
import PageShell from '../components/PageShell';
import HowItWorks from '../components/HowItWorks';
import { IconTitle } from '../components/IconList';
import SiteImage from '../components/SiteImage';

const AFTER_MEET = [
  {
    icon: FactCheckRounded,
    tone: 'blue',
    title: '1. Inspect',
    ne: 'जाँच्नुहोस्',
    text: 'Check the item carefully. Test phones, sit on furniture, start vehicles — whatever applies.',
  },
  {
    icon: PaymentsRounded,
    tone: 'green',
    title: '2. Pay',
    ne: 'तिर्नुहोस्',
    text: 'Agree on cash, eSewa, Khalti, or bank transfer. KinBech does not process payments between users.',
  },
  {
    icon: RateReviewRounded,
    tone: 'amber',
    title: '3. Review',
    ne: 'समीक्षा दिनुहोस्',
    text: 'Leave a review for verified shops to help the community build trust.',
  },
];

export default function HowItWorksPage() {
  return (
    <PageShell
      label="How it works"
      title="From download to deal in four steps"
      titleNe="चार सजिलो चरणमा किनबेच"
      neFirst
      subtitle="Whether you're selling one item or running a shop, KinBech keeps every deal simple and local."
      image="how-hero"
      highlights={['Google sign-in', 'Chat before you meet', 'Pay in person']}
    >
      <HowItWorks embedded />
      <div className="container">
        <section className="page-info-card page-info-card--media">
          <SiteImage name="how-after-meet" className="page-info-art" />
          <div>
            <IconTitle icon={EventAvailableRounded} ne="भेटेपछि के हुन्छ?">What happens after you meet?</IconTitle>
            <div className="page-steps-detail">
              {AFTER_MEET.map(({ icon: Icon, tone, title, ne, text }) => (
                <article key={title} className={`icon-tone--${tone}`}>
                  <span className="icon-tile">
                    <Icon aria-hidden />
                  </span>
                  <div>
                    <strong>{title} <span lang="ne" className="ne-inline">· {ne}</span></strong>
                    <p>{text}</p>
                  </div>
                </article>
              ))}
            </div>
            <Link to="/download" className="btn btn-primary page-cta-btn">Download KinBech</Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
