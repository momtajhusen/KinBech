import { Link } from 'react-router-dom';
import SectionHeader from './SectionHeader';
import Reveal from './Reveal';
import { IconAlert, IconBuilding, IconEye, IconLock, IconShield } from './Icons';

const TIPS = [
  {
    icon: IconBuilding,
    tone: 'emerald',
    title: 'Meet in public',
    text: 'Choose malls, busy markets, or police exchange zones — never isolated places for first meetings.',
  },
  {
    icon: IconEye,
    tone: 'blue',
    title: 'Inspect before paying',
    text: 'Check the item carefully. Do not send advance payments to strangers outside the app.',
  },
  {
    icon: IconLock,
    tone: 'violet',
    title: 'Keep chat in-app',
    text: 'Stay on KinBech chat so there is a record. Your phone stays private until you choose to share.',
  },
  {
    icon: IconAlert,
    tone: 'amber',
    title: 'Report problems',
    text: 'Use in-app report & block. Our team reviews flagged listings and accounts.',
  },
];

const TRUST_BADGES = [
  { label: 'Phone OTP', value: 'Verified' },
  { label: 'Shop badge', value: 'Admin reviewed' },
  { label: 'Report system', value: '24h review' },
];

export default function Safety({ embedded = false }) {
  const content = (
        <div className="safety-grid">
          <ul className="safety-list">
            {TIPS.map((tip, index) => {
              const Icon = tip.icon;
              return (
                <Reveal
                  key={tip.title}
                  as="li"
                  className={`safety-card safety-card--${tip.tone}`}
                  delay={index * 80}
                  variant="left"
                >
                  <span className="safety-icon">
                    <Icon width={22} height={22} />
                  </span>
                  <div>
                    <h4>{tip.title}</h4>
                    <p>{tip.text}</p>
                  </div>
                </Reveal>
              );
            })}
          </ul>

          <Reveal as="div" className="trust-panel" variant="scale" delay={200}>
            <div className="trust-panel-icon">
              <IconShield width={36} height={36} />
            </div>
            <h3>Phone verified sellers</h3>
            <p>
              Every account signs up with a verified Nepal mobile number. Shop sellers can earn
              an additional business verified badge after review.
            </p>
            <div className="trust-badges">
              {TRUST_BADGES.map((badge, index) => (
                <div key={badge.label} className="trust-badge" style={{ '--badge-delay': `${300 + index * 80}ms` }}>
                  <strong>{badge.value}</strong>
                  <span>{badge.label}</span>
                </div>
              ))}
            </div>
            <div className="trust-meter" aria-hidden>
              <div className="trust-meter-bar" />
            </div>
            <p className="trust-meter-label">Community trust score</p>
            <Link to="/download" className="btn btn-light">
              Join KinBech
            </Link>
          </Reveal>
        </div>
  );

  if (embedded) {
    return <section className="section section-embedded safety-section"><div className="container">{content}</div></section>;
  }

  return (
    <section className="section safety-section" id="safety">
      <div className="container">
        <SectionHeader
          label="Trust & safety"
          title="Your safety comes first"
          subtitle="KinBech is a meetup marketplace — we connect people, but you control every deal. Follow these guidelines for a smooth, safe experience."
        />
        {content}
      </div>
    </section>
  );
}
