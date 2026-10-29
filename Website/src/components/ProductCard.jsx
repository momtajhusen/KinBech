import { Link } from 'react-router-dom';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import PersonRounded from '@mui/icons-material/PersonRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';

const CONDITION_TONE = {
  New: 'success',
  'Like New': 'info',
  Good: 'primary',
  Fair: 'warning',
};

function shortAgo(date) {
  if (!date) return '';
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60000);
  if (!Number.isFinite(minutes)) return '';
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const cityOnly = (location) => String(location || '').split(',')[0].trim();

export default function ProductCard({ item, onClick, style }) {
  if (!item) return null;

  const href = `/listing/${item.id}`;
  const isShop = item.sellerType === 'shop';
  const ago = shortAgo(item.createdAt);
  const city = cityOnly(item.location);
  const SellerIcon = isShop ? StorefrontRounded : PersonRounded;

  const inner = (
    <>
      <div className="product-card-image">
        {item.photo ? (
          <img src={item.photo} alt={item.title} loading="lazy" />
        ) : (
          <div className="product-card-placeholder">{item.category?.slice(0, 1) || '?'}</div>
        )}
        {item.isFeatured ? (
          <span className="pcard-featured">
            <AutoAwesomeRounded />
            Featured
          </span>
        ) : null}
      </div>
      <div className="product-card-body pcard-body">
        <h3 className="pcard-title">{item.title}</h3>
        <div className="pcard-price-row">
          <strong className="pcard-price">{item.price}</strong>
          {item.distanceLabel ? (
            <span className="pcard-away">
              <LocationOnOutlined />
              {item.distanceLabel}
            </span>
          ) : null}
        </div>
        {item.condition || ago ? (
          <div className="pcard-detail-row">
            {item.condition ? (
              <span className={`pcard-cond pcard-cond--${CONDITION_TONE[item.condition] || 'primary'}`}>
                {item.condition}
              </span>
            ) : null}
            {ago ? (
              <span className="pcard-ago">
                <AccessTimeRounded />
                {ago}
              </span>
            ) : null}
          </div>
        ) : null}
        {city ? (
          <p className="pcard-meta">
            <LocationOnOutlined />
            <span>{city}</span>
          </p>
        ) : null}
        {item.sellerName ? (
          <p className="pcard-meta pcard-seller">
            <SellerIcon />
            <span>{item.sellerName}</span>
            {item.verificationKind === 'business' ? (
              <VerifiedRounded className="pcard-verified" aria-label="Business Verified" />
            ) : null}
            <ChevronRightRounded className="pcard-chevron" />
          </p>
        ) : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <article
        className="product-card pcard"
        style={style}
        onClick={() => onClick(item)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick(item)}
      >
        {inner}
      </article>
    );
  }

  return (
    <Link to={href} className="product-card product-card-link pcard" style={style}>
      {inner}
    </Link>
  );
}
