import { Link } from 'react-router-dom';
import { IconStar, IconShield } from './Icons';

export default function SellerCard({ seller, onClick }) {
  if (!seller) return null;

  const href = `/seller/${seller.id}`;
  const inner = (
    <>
      <div className="seller-card-mini-cover">
        {seller.cover ? <img src={seller.cover} alt="" /> : <div className="seller-card-mini-cover-fallback" />}
        <div className="seller-card-mini-avatar">
          {seller.avatar ? <img src={seller.avatar} alt={seller.name} /> : <span>{seller.name.slice(0, 1)}</span>}
        </div>
      </div>
      <div className="seller-card-mini-body">
        <div className="seller-card-mini-head">
          <h3>{seller.name}</h3>
          {seller.verified ? (
            <span className="seller-verified">
              <IconShield width={12} height={12} />{' '}
              {seller.verificationLabel ||
                (seller.sellerType === 'shop' ? 'Business Verified' : 'Phone Verified')}
            </span>
          ) : null}
        </div>
        <div className="seller-card-mini-stats">
          {seller.rating > 0 ? (
            <span><IconStar width={12} height={12} /> {seller.rating.toFixed(1)} ({seller.reviewsCount})</span>
          ) : null}
          <span>{seller.listingCount} listings</span>
        </div>
        <p className="seller-card-mini-loc">
          {seller.distanceLabel ? `${seller.distanceLabel} · ` : ''}{seller.location || 'Nepal'}
        </p>
        {seller.gallery?.length ? (
          <div className="seller-card-mini-gallery">
            {seller.gallery.slice(0, 4).map((src) => (
              <img key={src} src={src} alt="" loading="lazy" />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <article
        className="seller-card-mini"
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
    <Link to={href} className="seller-card-mini seller-card-link">
      {inner}
    </Link>
  );
}
