import AddAPhotoRounded from '@mui/icons-material/AddAPhotoRounded';
import HandshakeRounded from '@mui/icons-material/HandshakeRounded';
import Inventory2Rounded from '@mui/icons-material/Inventory2Rounded';
import PinDropRounded from '@mui/icons-material/PinDropRounded';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';
import SectionHeader from './SectionHeader';
import Reveal from './Reveal';
import SiteImage from './SiteImage';
import IconList from './IconList';

const INDIVIDUAL_FEATURES = [
  { icon: AddAPhotoRounded, text: 'List in under a minute with photos' },
  { icon: PinDropRounded, text: 'Set city & district location' },
  { icon: HandshakeRounded, text: 'Choose public meetup preference' },
  { icon: Inventory2Rounded, text: 'Manage listings from My Listings' },
];

const SHOP_FEATURES = [
  { icon: StorefrontRounded, text: 'Shop logo, category & opening hours' },
  { icon: QrCode2Rounded, text: 'Shop QR code customers can scan' },
  { icon: Inventory2Rounded, text: 'Stock, SKU & brand on listings' },
  { icon: VerifiedRounded, text: 'Verified badge after admin review' },
  { icon: TrendingUpRounded, text: 'Featured in Explore & search' },
];

export default function ForSellers({ embedded = false }) {
  const grid = (
        <div className="seller-grid">
          <Reveal as="article" className="seller-card seller-card--individual" variant="left" delay={0}>
            <SiteImage name="sellers-individual" className="seller-card-art" />
            <span className="seller-tag">Individual</span>
            <h3>Sell personal items</h3>
            <p className="ne-sub ne-sub--card" lang="ne">आफ्ना पुराना सामान बेच्नुहोस्</p>
            <p>
              Perfect for one-off sales — phones, furniture, bikes, books. Quick listing flow,
              no business paperwork.
            </p>
            <IconList items={INDIVIDUAL_FEATURES} tone="blue" className="seller-features" />
          </Reveal>

          <Reveal as="article" className="seller-card seller-card--shop" variant="right" delay={120}>
            <SiteImage name="sellers-shop" className="seller-card-art" />
            <span className="seller-tag seller-tag--shop">Shop owner</span>
            <h3>Run your store</h3>
            <p className="ne-sub ne-sub--card" lang="ne">आफ्नो पसल अनलाइन चलाउनुहोस्</p>
            <p>
              For mobile shops, electronics stores, and local businesses. Get a public shop page
              with reviews and verification.
            </p>
            <IconList items={SHOP_FEATURES} className="seller-features" />
          </Reveal>
        </div>
  );

  if (embedded) {
    return <section className="section section-embedded section-sellers"><div className="container">{grid}</div></section>;
  }

  return (
    <section className="section section-sellers" id="sellers">
      <div className="container">
        <SectionHeader
          label="For sellers"
          title="Two ways to sell on KinBech"
          subtitle="Pick the mode that fits you. Switch anytime from your profile — many users start as individuals and open a shop later."
          align="center"
        />
        {grid}
      </div>
    </section>
  );
}
