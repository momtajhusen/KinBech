import { Link } from 'react-router-dom';
import CompareArrowsRounded from '@mui/icons-material/CompareArrowsRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import HourglassBottomRounded from '@mui/icons-material/HourglassBottomRounded';
import LocalShippingRounded from '@mui/icons-material/LocalShippingRounded';
import MoneyOffRounded from '@mui/icons-material/MoneyOffRounded';
import NearMeRounded from '@mui/icons-material/NearMeRounded';
import PublicOffRounded from '@mui/icons-material/PublicOffRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import PageShell from '../components/PageShell';
import Features from '../components/Features';
import IconList, { IconTitle } from '../components/IconList';
import SiteImage from '../components/SiteImage';

const LOCAL = [
  { icon: VisibilityRounded, text: 'See item before you pay', ne: 'तिर्नुअघि सामान आफैं हेर्नुहोस्' },
  { icon: MoneyOffRounded, text: 'No delivery fees', ne: 'ढुवानी शुल्क लाग्दैन' },
  { icon: ForumRounded, text: 'Chat in-app, meet same day', ne: 'आजै कुरा, आजै भेट' },
  { icon: NearMeRounded, text: 'Prices in NPR, nearby sellers', ne: 'नेपाली रुपैयाँमा मूल्य, नजिकका बिक्रेता' },
];

const ONLINE = [
  { icon: HourglassBottomRounded, text: 'Wait days for delivery', ne: 'डेलिभरीका लागि दिनौं पर्खाइ' },
  { icon: LocalShippingRounded, text: 'Shipping + handling costs', ne: 'ढुवानी र ह्यान्डलिङ खर्च' },
  { icon: VisibilityOffRounded, text: 'Hard to inspect before buying', ne: 'किन्नुअघि जाँच्न गाह्रो' },
  { icon: PublicOffRounded, text: 'Often not optimized for Nepal', ne: 'प्रायः नेपालका लागि बनेको हुँदैन' },
];

export default function FeaturesPage() {
  return (
    <PageShell
      label="Features"
      title="Built for Nepal's local economy"
      titleNe="नेपालको स्थानीय बजारका लागि बनाइएको"
      subtitle="Everything you need to buy and sell face-to-face — no courier, no waiting, just meet and deal."
      image="features-hero"
      highlights={['Distance-sorted feed', 'In-app chat & calls', 'Individual & shop sellers']}
    >
      <Features embedded />
      <div className="container">
        <section className="page-info-card page-info-card--media">
          <SiteImage name="features-local" className="page-info-art" />
          <div>
            <IconTitle icon={CompareArrowsRounded} ne="अनलाइन ढुवानीभन्दा स्थानीय किन राम्रो?">Why local beats online shipping</IconTitle>
            <div className="page-compare-grid">
              <div>
                <h4>KinBech (local)</h4>
                <IconList items={LOCAL} />
              </div>
              <div>
                <h4 className="page-compare-muted">Typical online marketplaces</h4>
                <IconList items={ONLINE} tone="rose" />
              </div>
            </div>
            <Link to="/explore" className="btn btn-primary page-cta-btn">Start exploring</Link>
          </div>
        </section>
      </div>
    </PageShell>
  );
}
