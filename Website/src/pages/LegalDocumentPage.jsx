import { Link, useParams } from 'react-router-dom';
import { getLegalDocument, LEGAL_COMPANY } from '../content/legalContent';
import Footer from '../components/Footer';

export default function LegalDocumentPage() {
  const { docId } = useParams();
  const document = getLegalDocument(docId);

  if (!document) {
    return (
      <div className="inner-page">
        <main className="container page-body">
          <div className="explore-empty">
            <h3>Document not found</h3>
            <Link to="/legal" className="btn btn-primary">Back to legal hub</Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="inner-page">
      <header className="page-hero">
        <div className="container page-hero-inner">
          <Link to="/legal" className="page-back">← Legal & Policies</Link>
          <span className="section-label">Compliance</span>
          <h1>{document.title}</h1>
          <p className="page-hero-sub">Last updated: {document.lastUpdated} · {LEGAL_COMPANY.name}</p>
        </div>
      </header>

      <main className="container page-body legal-doc-body">
        <article className="legal-doc-card">
          {document.sections.map((sec) => (
            <section key={sec.title} className="legal-doc-section">
              <h2>{sec.title}</h2>
              <p>{sec.body}</p>
            </section>
          ))}
        </article>

        {document.footer ? (
          <aside className="legal-doc-footer-box">
            <h3>{document.footer.title}</h3>
            <p>{document.footer.body}</p>
          </aside>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
