import Reveal from './Reveal';

export default function SectionHeader({ label, title, subtitle, align = 'left' }) {
  return (
    <Reveal as="header" className={`section-header section-header--${align}`} variant="up">
      <span className="section-label">{label}</span>
      <h2 className="section-title">{title}</h2>
      {subtitle ? <p className="section-sub">{subtitle}</p> : null}
    </Reveal>
  );
}
