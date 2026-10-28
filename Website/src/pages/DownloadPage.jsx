import { Link } from 'react-router-dom';
import AddPhotoAlternateRounded from '@mui/icons-material/AddPhotoAlternateRounded';
import AppShortcutRounded from '@mui/icons-material/AppShortcutRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import TravelExploreRounded from '@mui/icons-material/TravelExploreRounded';
import PageShell from '../components/PageShell';
import Download from '../components/Download';
import IconList, { IconTitle } from '../components/IconList';

const APP_FEATURES = [
  { icon: LoginRounded, text: 'One-tap sign in with your Google account', tone: 'blue' },
  { icon: TravelExploreRounded, text: 'Explore nearby listings & verified shops', ne: 'नजिकका सामान र प्रमाणित पसल', tone: 'green' },
  { icon: ForumRounded, text: 'In-app chat without sharing your number', ne: 'नम्बर नदिई एपमै च्याट', tone: 'violet' },
  { icon: AddPhotoAlternateRounded, text: 'Post listings with photos in minutes', ne: 'केही मिनेटमै फोटोसहित सामान राख्नुहोस्', tone: 'amber' },
  { icon: FavoriteRounded, text: 'Wishlist, notifications & seller profiles', ne: 'विशलिस्ट, सूचना र बिक्रेता प्रोफाइल', tone: 'rose' },
];

export default function DownloadPage() {
  return (
    <PageShell
      label="Get started"
      title="Download KinBech"
      titleNe="KinBech एप डाउनलोड गर्नुहोस्"
      subtitle="Join Nepal's local marketplace — browse, list, and deal face-to-face."
      image="download-hero"
      highlights={['Phone OTP login', 'Prices in NPR', 'Chat & meet locally']}
    >
      <Download embedded />
      <div className="container">
        <section className="page-info-card">
          <IconTitle icon={AppShortcutRounded} ne="एपमा के-के पाउनुहुन्छ?">What you get in the app</IconTitle>
          <IconList items={APP_FEATURES} className="icon-list--cards" />
          <Link to="/explore" className="btn btn-outline page-cta-btn">Preview listings on web</Link>
        </section>
      </div>
    </PageShell>
  );
}
