import Reveal from './Reveal';

export default function SectionHeader({ label, title, titleNe, neFirst = false, subtitle, align = 'left' }) {
  const big = neFirst && titleNe;
  return (
    <Reveal as="header" className={`section-header section-header--${align}`} variant="up">
      <span className="section-label">{label}</span>
      {big ? (
        <>
          <h2 className="section-title ne-heading" lang="ne">{titleNe}</h2>
          <p className="en-title">{title}</p>
        </>
      ) : (
        <>
          <h2 className="section-title">{title}</h2>
          {titleNe ? <p className="ne-title" lang="ne">{titleNe}</p> : null}
        </>
      )}
      {subtitle ? <p className="section-sub">{subtitle}</p> : null}
    </Reveal>
  );
}
