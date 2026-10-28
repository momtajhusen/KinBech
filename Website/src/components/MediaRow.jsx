import { Link } from 'react-router-dom';
import Reveal from './Reveal';
import SiteImage from './SiteImage';
import IconList from './IconList';

/** `points` are `{ icon, text, tone? }` items for `IconList`. */
export default function MediaRow({ image, label, title, titleNe, neFirst = false, text, points = [], cta, reverse = false }) {
  const big = neFirst && titleNe;
  return (
    <div className={`media-row${reverse ? ' media-row--reverse' : ''}`}>
      <Reveal className="media-row-art" variant={reverse ? 'right' : 'left'}>
        <SiteImage name={image} />
      </Reveal>
      <Reveal className="media-row-copy" variant="up" delay={120}>
        {label ? <span className="section-label">{label}</span> : null}
        {big ? (
          <>
            <h2 className="ne-heading" lang="ne">{titleNe}</h2>
            <p className="en-title">{title}</p>
          </>
        ) : (
          <>
            <h2>{title}</h2>
            {titleNe ? <p className="ne-title" lang="ne">{titleNe}</p> : null}
          </>
        )}
        <p>{text}</p>
        {points.length ? <IconList items={points} className="media-row-points" /> : null}
        {cta ? <Link to={cta.to} className="btn btn-outline">{cta.label}</Link> : null}
      </Reveal>
    </div>
  );
}
