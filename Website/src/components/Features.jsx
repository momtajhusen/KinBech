import SectionHeader from './SectionHeader';
import Reveal from './Reveal';
import {
  IconChat,
  IconHeart,
  IconLocation,
  IconShield,
  IconStar,
  IconStore,
} from './Icons';

const FEATURES = [
  {
    icon: IconLocation,
    tone: 'emerald',
    title: 'Hyperlocal discovery',
    text: 'See items sorted by distance. Browse by category, filter by price and condition, and find deals in your district.',
    chip: 'GPS-powered nearby feed',
    visual: ['2.1 km', '800 m', '5.3 km'],
  },
  {
    icon: IconChat,
    tone: 'blue',
    title: 'In-app chat',
    text: 'Message sellers without sharing your number first. Negotiate, ask questions, and coordinate meetups inside KinBech.',
    chip: 'Private until you share',
    visual: ['Hi, is this available?', 'Yes — meet at Civil Mall?'],
  },
  {
    icon: IconStore,
    tone: 'violet',
    title: 'Shops & individuals',
    text: 'Sell a single used phone as an individual, or run a verified shop with logo, hours, and a product catalog.',
    chip: 'Switch modes anytime',
    visual: ['Individual', 'Verified Shop'],
  },
  {
    icon: IconHeart,
    tone: 'pink',
    title: 'Wishlist & alerts',
    text: 'Save items you love and come back when you are ready to buy. Stay updated on listings near you.',
    chip: 'Save & track prices',
    visual: ['♥ Saved', 'Price drop'],
  },
  {
    icon: IconStar,
    tone: 'amber',
    title: 'Shop reviews',
    text: 'Rate verified shops after a deal. Build trust with real feedback from the community.',
    chip: 'Community trust score',
    visual: ['★ 4.8', '128 reviews'],
  },
  {
    icon: IconShield,
    tone: 'slate',
    title: 'Report & block',
    text: 'See something wrong? Report listings or users. Block people you do not want to hear from again.',
    chip: 'Moderated listings',
    visual: ['Report', 'Block user'],
  },
];

export default function Features({ embedded = false }) {
  const grid = (
        <div className="features-grid">
          {FEATURES.map((f, index) => {
            const Icon = f.icon;
            return (
              <Reveal
                key={f.title}
                as="article"
                className={`feature-card feature-card--${f.tone}`}
                delay={(index % 3) * 80 + Math.floor(index / 3) * 120}
                variant="up"
              >
                <div className="feature-card-top">
                  <div className="feature-icon">
                    <Icon width={24} height={24} />
                  </div>
                  <span className="feature-chip">{f.chip}</span>
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
                <div className="feature-visual" aria-hidden>
                  {f.visual.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </Reveal>
            );
          })}
        </div>
  );

  if (embedded) {
    return <section className="section section-embedded section-features"><div className="container">{grid}</div></section>;
  }

  return (
    <section className="section section-features" id="features">
      <div className="container">
        <SectionHeader
          label="Why KinBech"
          title="Built for Nepal's local economy"
          subtitle="No courier fees, no waiting weeks for delivery. KinBech is designed for face-to-face deals in Kathmandu, Lalitpur, Pokhara, and cities across Nepal."
        />
        {grid}
      </div>
    </section>
  );
}
