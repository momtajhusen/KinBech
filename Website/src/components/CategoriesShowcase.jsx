import { Link } from 'react-router-dom';
import SectionHeader from './SectionHeader';
import Reveal from './Reveal';
import {
  IconElectronics,
  IconFashion,
  IconFurniture,
  IconLaptop,
  IconMobile,
  IconVehicle,
} from './Icons';

const CATEGORIES = [
  { label: 'Mobiles', icon: IconMobile, color: '#047857', count: '2.4k+' },
  { label: 'Laptops', icon: IconLaptop, color: '#3B82F6', count: '890+' },
  { label: 'Electronics', icon: IconElectronics, color: '#8B5CF6', count: '1.1k+' },
  { label: 'Furniture', icon: IconFurniture, color: '#F59E0B', count: '760+' },
  { label: 'Vehicles', icon: IconVehicle, color: '#06B6D4', count: '540+' },
  { label: 'Fashion', icon: IconFashion, color: '#EC4899', count: '1.3k+' },
];

export default function CategoriesShowcase() {
  return (
    <section className="section section-categories" id="categories">
      <div className="container">
        <SectionHeader
          label="Browse categories"
          title="Find exactly what you need nearby"
          subtitle="From daily essentials to big-ticket items — explore listings across Nepal's most popular categories."
          align="center"
        />
        <div className="category-grid">
          {CATEGORIES.map((cat, index) => {
            const Icon = cat.icon;
            return (
              <Reveal
                key={cat.label}
                as="article"
                className="category-card"
                style={{ '--cat-color': cat.color }}
                delay={index * 70}
                variant="scale"
              >
                <Link to={`/explore?category=${encodeURIComponent(cat.label)}`} className="category-card-link">
                  <div className="category-card-glow" aria-hidden />
                  <div className="category-card-icon">
                    <Icon width={26} height={26} />
                  </div>
                  <div className="category-card-body">
                    <h3>{cat.label}</h3>
                    <span className="category-card-count">{cat.count} listings</span>
                  </div>
                  <span className="category-card-arrow" aria-hidden>→</span>
                </Link>
              </Reveal>
            );
          })}
        </div>
        <Reveal as="p" className="category-footnote" variant="fade" delay={420}>
          More categories inside the app — grocery, books, sports, beauty &amp; local shops.
        </Reveal>
      </div>
    </section>
  );
}
