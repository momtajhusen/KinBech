import { Link } from 'react-router-dom';
import { IconLocation, IconEye } from './Icons';

export default function ProductCard({ item, onClick }) {
  if (!item) return null;

  const href = `/listing/${item.id}`;
  const inner = (
    <>
      <div className="product-card-image">
        {item.photo ? (
          <img src={item.photo} alt={item.title} loading="lazy" />
        ) : (
          <div className="product-card-placeholder">{item.category?.slice(0, 1) || '?'}</div>
        )}
        {item.category ? (
          <span className="product-card-category">{item.category}</span>
        ) : null}
        {item.distanceLabel ? (
          <span className="product-card-distance">
            <IconLocation width={12} height={12} />
            {item.distanceLabel}
          </span>
        ) : null}
      </div>
      <div className="product-card-body">
        <h3>{item.title}</h3>
        <p className="product-card-price">{item.price}</p>
        <div className="product-card-meta">
          {item.condition ? <span className="product-card-condition">{item.condition}</span> : null}
          {item.timeAgo ? <span>{item.timeAgo}</span> : null}
          {item.views > 0 ? (
            <span className="product-card-views">
              <IconEye width={11} height={11} />
              {item.views}
            </span>
          ) : null}
        </div>
        <div className="product-card-footer">
          <p className="product-card-seller">{item.sellerName}</p>
          {item.sellerType === 'shop' ? (
            <span className="product-card-badge">Shop</span>
          ) : null}
          {item.verificationLabel || item.verified ? (
            <span
              className={`product-card-badge product-card-badge-verified ${
                item.verificationKind === 'business'
                  ? 'product-card-badge-business'
                  : 'product-card-badge-phone'
              }`}
            >
              {item.verificationLabel ||
                (item.verificationKind === 'business' ? 'Business Verified' : 'Phone Verified')}
            </span>
          ) : null}
        </div>
        {item.location ? (
          <p className="product-card-location">{item.location}</p>
        ) : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <article
        className="product-card"
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
    <Link to={href} className="product-card product-card-link">
      {inner}
    </Link>
  );
}
