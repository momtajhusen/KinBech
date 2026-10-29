import { Link } from 'react-router-dom';
import AddPhotoAlternateRounded from '@mui/icons-material/AddPhotoAlternateRounded';
import AppShortcutRounded from '@mui/icons-material/AppShortcutRounded';
import FavoriteRounded from '@mui/icons-material/FavoriteRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import TravelExploreRounded from '@mui/icons-material/TravelExploreRounded';
import PageShell from '../components/PageShell';
import Download from '../components/Download';
import IconList, { IconTitle } from '../components/IconList';

const APP_FEATURES = [
  { icon: LoginRounded, text: 'One-tap sign in with your Google account', ne: 'Google खाताबाट एकै ट्यापमा साइन इन', tone: 'blue' },
  { icon: TravelExploreRounded, text: 'Explore nearby listings & verified shops', ne: 'नजिकका सामान र प्रमाणित पसल', tone: 'green' },
  { icon: ForumRounded, text: 'Chat, voice notes & voice calls without sharing your number', ne: 'नम्बर नदिई च्याट, भ्वाइस नोट र कल', tone: 'violet' },
  { icon: AddPhotoAlternateRounded, text: 'Post with up to 4 photos and a 30-second video', ne: '४ फोटो र ३० सेकेन्डको भिडियोसहित पोस्ट', tone: 'amber' },
  { icon: StorefrontRounded, text: 'Run a shop page with your own QR code', ne: 'आफ्नै QR कोडसहित पसल पेज', tone: 'green' },
  { icon: FavoriteRounded, text: 'Wishlist, daily updates & seller reviews', ne: 'विशलिस्ट, दैनिक अपडेट र समीक्षा', tone: 'rose' },
];

export default function DownloadPage() {
  return (
    <PageShell
      label="Get started"
      title="Download KinBech"
      titleNe="KinBech एप डाउनलोड गर्नुहोस्"
      subtitle="Join Nepal's local marketplace — browse, list, and deal face-to-face."
      image="download-hero"
      highlights={['Android on Google Play', 'Google sign-in', 'Prices in NPR']}
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
