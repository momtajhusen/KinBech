import Reveal from './Reveal';
import { IconLocation, IconPhone, IconShop, IconStore } from './Icons';

const STATS = [
  {
    icon: IconLocation,
    value: 'Hyperlocal',
    label: 'Items sorted by distance in your district',
    tone: 'emerald',
  },
  {
    icon: IconPhone,
    value: '+977 OTP',
    label: 'Phone-verified accounts — no email needed',
    tone: 'blue',
  },
  {
    icon: IconStore,
    value: '15+ categories',
    label: 'Mobiles, furniture, vehicles & more',
    tone: 'violet',
  },
  {
    icon: IconShop,
    value: 'Shop + Individual',
    label: 'Sell once or run a full business page',
    tone: 'amber',
  },
];

export default function StatsStrip() {
  return (
    <section className="stats-strip" aria-label="KinBech highlights">
      <div className="container stats-strip-grid">
        {STATS.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Reveal
              key={stat.value}
              as="article"
              className={`stat-card stat-card--${stat.tone}`}
              delay={index * 90}
              variant="up"
            >
              <div className="stat-card-icon">
                <Icon width={22} height={22} />
              </div>
              <div>
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
