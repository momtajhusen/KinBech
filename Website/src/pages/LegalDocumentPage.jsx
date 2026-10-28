import { Link, useParams } from 'react-router-dom';
import { getLegalDocument, LEGAL_COMPANY } from '../content/legalContent';
import Footer from '../components/Footer';
import { PageHero } from '../components/PageShell';
import SiteImage from '../components/SiteImage';

export default function LegalDocumentPage() {
  const { docId } = useParams();
  const document = getLegalDocument(docId);

  if (!document) {
    return (
      <div className="inner-page">
        <main className="container page-body">
          <div className="explore-empty">
            <SiteImage name="explore-empty" className="empty-art" />
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
      <PageHero
        trail={[{ to: '/legal', label: 'Legal & Policies' }, { label: document.title }]}
        label="Compliance"
        title={document.title}
        subtitle={`Last updated: ${document.lastUpdated} · ${LEGAL_COMPANY.name}`}
        image="legal-hero"
      />

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
