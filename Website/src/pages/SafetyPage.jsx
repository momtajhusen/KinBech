import { Link } from 'react-router-dom';
import GppMaybeRounded from '@mui/icons-material/GppMaybeRounded';
import MobileOffRounded from '@mui/icons-material/MobileOffRounded';
import PasswordRounded from '@mui/icons-material/PasswordRounded';
import RequestQuoteRounded from '@mui/icons-material/RequestQuoteRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import WrongLocationRounded from '@mui/icons-material/WrongLocationRounded';
import PageShell from '../components/PageShell';
import Safety from '../components/Safety';
import IconList, { IconTitle } from '../components/IconList';
import SiteImage from '../components/SiteImage';

const RED_FLAGS = [
  { icon: RequestQuoteRounded, text: 'Seller asks for full payment before you see the item', ne: 'सामान नदेखाई पूरै पैसा माग्छ' },
  { icon: TimerRounded, text: 'Price too good to be true with pressure to decide fast', ne: 'पत्याउनै गाह्रो सस्तो मूल्य, छिटो निर्णयको दबाब' },
  { icon: MobileOffRounded, text: 'Requests to move chat off-app before any meetup', ne: 'भेट्नुअघि नै एपबाहिर कुरा गर्न भन्छ' },
  { icon: PasswordRounded, text: 'Asks for OTP, bank PIN, or eSewa/Khalti password', ne: 'OTP, बैंक PIN वा eSewa/Khalti पासवर्ड माग्छ' },
  { icon: WrongLocationRounded, text: 'Meetup location keeps changing to isolated areas', ne: 'भेट्ने ठाउँ बारम्बार सुनसान ठाउँतिर सार्छ' },
];

export default function SafetyPage() {
  return (
    <PageShell
      label="Trust & safety"
      title="Your safety comes first"
      titleNe="तपाईंको सुरक्षा, हाम्रो पहिलो प्राथमिकता"
      neFirst
      subtitle="KinBech connects buyers and sellers — you control every deal. Follow these guidelines for a safe experience."
      image="safety-hero"
      highlights={['Meet in public', 'Inspect before paying', 'Report & block']}
    >
      <Safety embedded />
      <div className="container">
        <section className="page-info-card page-warning-card page-info-card--media page-info-card--square">
          <SiteImage name="safety-red-flags" className="page-info-art" />
          <div>
            <IconTitle icon={GppMaybeRounded} tone="rose" ne="खतराका संकेत — देख्नासाथ रिपोर्ट गर्नुहोस्">Red flags — report immediately</IconTitle>
            <IconList items={RED_FLAGS} tone="rose" />
            <p>
              Use in-app Report & Block. KinBech will never ask for your OTP.
              <span className="ne-sub" lang="ne">KinBech ले कहिल्यै तपाईंको OTP माग्दैन।</span>
            </p>
            <Link to="/faq" className="btn btn-outline page-cta-btn">Read FAQ</Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
