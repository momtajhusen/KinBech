import { Link } from 'react-router-dom';
import Footer from './Footer';

export default function PageShell({ label, title, subtitle, children }) {
  return (
    <div className="inner-page">
      <header className="page-hero">
        <div className="container page-hero-inner">
          <Link to="/" className="page-back">← Home</Link>
          <span className="section-label">{label}</span>
          <h1>{title}</h1>
          {subtitle ? <p className="page-hero-sub">{subtitle}</p> : null}
        </div>
      </header>
      <div className="page-body">{children}</div>
      <Footer />
    </div>
  );
}
