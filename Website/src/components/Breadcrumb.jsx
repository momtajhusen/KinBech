import { Link } from 'react-router-dom';
import { IconChevronRight, IconHome } from './Icons';

/** `trail` is the path after Home; the last entry is the current page and has no `to`. */
export default function Breadcrumb({ trail = [], className = '' }) {
  return (
    <nav className={`kb-crumbs${className ? ` ${className}` : ''}`} aria-label="Breadcrumb">
      <Link to="/" className="kb-crumbs-home">
        <IconHome width={15} height={15} />
        Home
      </Link>
      {trail.map((item) => (
        <span key={item.label} className="kb-crumbs-step">
          <IconChevronRight width={14} height={14} className="kb-crumbs-sep" />
          {item.to ? (
            <Link to={item.to}>{item.label}</Link>
          ) : (
            <span className="kb-crumbs-current" aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
