import { Link } from 'react-router-dom';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import NearMeOutlined from '@mui/icons-material/NearMeOutlined';
import PersonRounded from '@mui/icons-material/PersonRounded';
import StarRounded from '@mui/icons-material/StarRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import VerifiedRounded from '@mui/icons-material/VerifiedRounded';

const GENERIC_CATEGORIES = new Set(['', 'Other', 'General']);

export default function SellerCard({ seller, onClick }) {
  if (!seller) return null;

  const href = `/seller/${seller.id}`;
  const isShop = seller.sellerType === 'shop';
  const category = String(seller.category || '').trim();
  const subtitle = GENERIC_CATEGORIES.has(category)
    ? isShop ? 'Local Store' : 'Individual Seller'
    : category;
  const items = Number(seller.listingCount) || 0;
  const hasRating = isShop && seller.reviewsCount > 0 && seller.rating > 0;
  const TypeIcon = isShop ? StorefrontRounded : PersonRounded;
  const VerifiedIcon = isShop ? VerifiedRounded : CheckCircleRounded;
  const className = `seller-card-mini scard ${isShop ? 'scard--shop' : 'scard--person'}`;

  const inner = (
    <>
      <span className="scard-type">
        <TypeIcon />
        {isShop ? 'STORE' : 'INDIVIDUAL'}
      </span>
      <div className="scard-head">
        <div className="scard-logo">
          {seller.avatar ? <img src={seller.avatar} alt="" loading="lazy" /> : <TypeIcon />}
        </div>
        {hasRating ? (
          <span className="scard-rating" title={`${seller.reviewsCount} reviews`}>
            <StarRounded />
            {seller.rating.toFixed(1)}
          </span>
        ) : null}
      </div>
      <div className="scard-name-row">
        <h3>{seller.name}</h3>
        {seller.verified ? (
          <VerifiedIcon
            className="scard-verified"
            aria-label={seller.verificationLabel || (isShop ? 'Business Verified' : 'Verified account')}
          />
        ) : null}
      </div>
      <p className="scard-sub">{subtitle}</p>
      <span className="scard-divider" />
      <p className="scard-loc">
        <span className="scard-loc-icon"><LocationOnOutlined /></span>
        <span>{seller.location || 'Nepal'}</span>
      </p>
      <p className="scard-stats">
        <span><Inventory2Outlined />{items} {items === 1 ? 'item' : 'items'}</span>
        {seller.distanceLabel ? (
          <span><NearMeOutlined />{seller.distanceLabel}</span>
        ) : null}
      </p>
      <span className="scard-btn">View Profile</span>
    </>
  );

  if (onClick) {
    return (
      <article
        className={className}
        onClick={() => onClick(seller)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick(seller)}
      >
        {inner}
      </article>
    );
  }

  return (
    <Link to={href} className={`${className} seller-card-link`}>
      {inner}
    </Link>
  );
}
