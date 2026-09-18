import { Link } from 'react-router-dom';
import Reveal from './Reveal';

const PAGES = [
  { path: '/explore', title: 'Explore', desc: 'Live products & sellers from API', accent: 'emerald' },
  { path: '/categories', title: 'Categories', desc: 'Mobiles, furniture, shops & more', accent: 'blue' },
  { path: '/features', title: 'Features', desc: 'Why KinBech for Nepal', accent: 'violet' },
  { path: '/how-it-works', title: 'How it works', desc: 'Sign up to meetup in 4 steps', accent: 'amber' },
  { path: '/sellers', title: 'For sellers', desc: 'Individual or shop owner', accent: 'pink' },
  { path: '/safety', title: 'Safety', desc: 'Trust & meetup guidelines', accent: 'slate' },
  { path: '/faq', title: 'FAQ', desc: 'Payments, cities, support', accent: 'emerald' },
  { path: '/download', title: 'Download', desc: 'Get the mobile app', accent: 'blue' },
];

export default function HomeQuickLinks() {
  return (
    <section className="section home-links-section">
      <div className="container">
        <Reveal as="header" className="section-header section-header--center" variant="up">
          <span className="section-label">Discover KinBech</span>
          <h2 className="section-title">Explore every part of the platform</h2>
          <p className="section-sub">Each section has its own page with full details — just like the mobile app.</p>
        </Reveal>
        <div className="home-links-grid">
          {PAGES.map((page, i) => (
            <Reveal key={page.path} delay={i * 50} variant="up">
              <Link to={page.path} className={`home-link-card home-link-card--${page.accent}`}>
                <h3>{page.title}</h3>
                <p>{page.desc}</p>
                <span className="home-link-arrow">Open page →</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
