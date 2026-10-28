import Breadcrumb from './Breadcrumb';
import Footer from './Footer';
import SiteImage from './SiteImage';
import { IconCheck } from './Icons';

export function PageHero({ label, title, titleNe, neFirst = false, subtitle, image, trail, highlights }) {
  const big = neFirst && titleNe;
  return (
    <header className={`page-hero${image ? ' page-hero--media' : ''}`}>
      <div className="page-hero-deco" aria-hidden>
        <span className="page-hero-orb page-hero-orb--a" />
        <span className="page-hero-orb page-hero-orb--b" />
      </div>
      <div className="container page-hero-grid">
        <div className="page-hero-inner">
          <Breadcrumb trail={trail || [{ label }]} className="kb-crumbs--slab" />
          {big ? (
            <>
              <h1 className="ne-heading" lang="ne">{titleNe}</h1>
              <p className="en-title en-title--slab">{title}</p>
            </>
          ) : (
            <>
              <h1>{title}</h1>
              {titleNe ? <p className="ne-title ne-title--slab" lang="ne">{titleNe}</p> : null}
            </>
          )}
          {subtitle ? <p className="page-hero-sub">{subtitle}</p> : null}
          {highlights?.length ? (
            <ul className="page-hero-highlights">
              {highlights.map((item) => (
                <li key={item}>
                  <IconCheck width={14} height={14} />
                  {item}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {image ? (
          <div className="page-hero-art-wrap">
            <span className="page-hero-halo" aria-hidden />
            <SiteImage name={image} className="page-hero-art" priority />
          </div>
        ) : null}
      </div>
    </header>
  );
}

export default function PageShell({ label, title, titleNe, neFirst, subtitle, image, trail, highlights, children }) {
  return (
    <div className="inner-page">
      <PageHero
        label={label}
        title={title}
        titleNe={titleNe}
        neFirst={neFirst}
        subtitle={subtitle}
        image={image}
        trail={trail}
        highlights={highlights}
      />
      <div className="page-body">{children}</div>
      <Footer />
    </div>
  );
}
