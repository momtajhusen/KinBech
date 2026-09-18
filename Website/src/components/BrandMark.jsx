import { BRAND_TAGLINE } from '../content/brand';
import { BRAND_ICON_SRC } from '../content/brandAssets';

export default function BrandMark({ variant = 'nav', showTagline = false }) {
  const className = ['brand-mark', `brand-mark--${variant}`].join(' ');

  return (
    <span className={className}>
      <img src={BRAND_ICON_SRC} alt="" aria-hidden className="brand-mark-logo" />
      <span className="brand-mark-text">
        <span className="brand-mark-name">
          Kin<span className="brand-mark-accent">Bech</span>
        </span>
        {showTagline ? (
          <span className="brand-mark-tagline">{BRAND_TAGLINE}</span>
        ) : null}
      </span>
    </span>
  );
}
