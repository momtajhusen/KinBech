import { Link } from 'react-router-dom';
import { LEGAL_COMPANY, LEGAL_LAST_UPDATED, LEGAL_LINKS } from '../content/legalContent';
import Footer from '../components/Footer';

export default function LegalHubPage() {
  return (
    <div className="inner-page">
      <header className="page-hero">
        <div className="container page-hero-inner">
          <Link to="/" className="page-back">← Home</Link>
          <span className="section-label">Legal</span>
          <h1>Legal & Policies</h1>
          <p className="page-hero-sub">
            Privacy, permissions, terms, and account deletion — required for Google Play and user transparency.
          </p>
        </div>
      </header>

      <main className="container page-body">
        <div className="legal-hub-grid">
          {LEGAL_LINKS.map((item) => (
            <Link key={item.key} to={`/legal/${item.key}`} className="legal-hub-card">
              <h2>{item.label}</h2>
              <p>{item.subtitle}</p>
              <span className="legal-hub-arrow">Read document →</span>
            </Link>
          ))}
        </div>

        <p className="legal-hub-meta">
          {LEGAL_COMPANY.name} · {LEGAL_COMPANY.address}
          <br />
          {LEGAL_COMPANY.supportEmail} · {LEGAL_COMPANY.privacyEmail}
          <br />
          Last updated: {LEGAL_LAST_UPDATED}
        </p>
      </main>

      <Footer />
    </div>
  );
}
