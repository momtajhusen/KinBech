import SectionHeader from './SectionHeader';
import Reveal from './Reveal';
import { IconCheck, IconShop, IconUser } from './Icons';

const INDIVIDUAL_FEATURES = [
  'List in under a minute with photos',
  'Set city & district location',
  'Choose public meetup preference',
  'Manage listings from My Listings',
];

const SHOP_FEATURES = [
  'Shop logo, category & opening hours',
  'Stock, SKU & brand on listings',
  'Verified badge after admin review',
  'Featured in Explore & search',
];

export default function ForSellers({ embedded = false }) {
  const grid = (
        <div className="seller-grid">
          <Reveal as="article" className="seller-card seller-card--individual" variant="left" delay={0}>
            <div className="seller-card-visual">
              <div className="seller-mock seller-mock--user">
                <IconUser width={32} height={32} />
              </div>
              <div className="seller-mock-pills">
                <span>Quick post</span>
                <span>1 item</span>
              </div>
            </div>
            <span className="seller-tag">Individual</span>
            <h3>Sell personal items</h3>
            <p>
              Perfect for one-off sales — phones, furniture, bikes, books. Quick listing flow,
              no business paperwork.
            </p>
            <ul className="seller-features">
              {INDIVIDUAL_FEATURES.map((item) => (
                <li key={item}>
                  <IconCheck width={16} height={16} />
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal as="article" className="seller-card seller-card--shop" variant="right" delay={120}>
            <div className="seller-card-visual">
              <div className="seller-mock seller-mock--shop">
                <IconShop width={32} height={32} />
              </div>
              <div className="seller-mock-pills">
                <span>Verified</span>
                <span>Catalog</span>
              </div>
            </div>
            <span className="seller-tag seller-tag--shop">Shop owner</span>
            <h3>Run your store</h3>
            <p>
              For mobile shops, electronics stores, and local businesses. Get a public shop page
              with reviews and verification.
            </p>
            <ul className="seller-features">
              {SHOP_FEATURES.map((item) => (
                <li key={item}>
                  <IconCheck width={16} height={16} />
                  {item}
                </li>
              ))}
            </ul>
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
