import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import {
  formatPrice,
  formatDistanceLabel,
  getSellerIdFromListing,
  resolveMediaUrl,
  toCardItem,
} from '../utils/listing';
import { useGeolocation } from '../hooks/useGeolocation';
import ProductCard from '../components/ProductCard';
import VariantPicker, { getDefaultVariantSelection } from '../components/VariantPicker';
import Footer from '../components/Footer';
import { IconLocation, IconShield, IconStar } from '../components/Icons';
import { formatListingPrice } from '../utils/listingVariants';

function ListingGallery({ photos, title }) {
  const [active, setActive] = useState(0);
  const items = photos.length ? photos : [null];

  return (
    <div className="detail-gallery">
      {items.length > 1 ? (
        <div className="detail-gallery-thumbs" aria-label="Photo thumbnails">
          {items.map((src, i) => (
            <button
              key={src || i}
              type="button"
              className={active === i ? 'active' : ''}
              onClick={() => setActive(i)}
              aria-label={`Photo ${i + 1}`}
            >
              {src ? <img src={src} alt="" /> : <span>?</span>}
            </button>
          ))}
        </div>
      ) : null}
      <div className="detail-gallery-main">
        {items[active] ? (
          <img src={items[active]} alt={title} />
        ) : (
          <div className="detail-gallery-placeholder">No photo available</div>
        )}
      </div>
    </div>
  );
}

export default function ListingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { coords } = useGeolocation();

  const [listing, setListing] = useState(null);
  const [related, setRelated] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [variantSelection, setVariantSelection] = useState({});

  const geoParams = useMemo(
    () => (coords ? { lat: coords.lat, lng: coords.lng } : {}),
    [coords],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await api.getListing(id, geoParams);
        const raw = res.listing;
        if (cancelled) return;
        setListing(raw);
        if (raw?.hasVariants) {
          setVariantSelection(getDefaultVariantSelection(raw));
        } else {
          setVariantSelection({});
        }

        const sellerId = getSellerIdFromListing(raw);
        if (!sellerId) return;

        if (raw.sellerType === 'shop') {
          const shopId = raw.shopId?.id || raw.shopId?._id || raw.shopId;
          if (shopId) {
            const shopRes = await api.getShopListings(shopId);
            if (!cancelled) {
              setRelated(
                (shopRes.listings || [])
                  .map(toCardItem)
                  .filter((item) => item && item.id !== String(raw.id || raw._id))
                  .slice(0, 4),
              );
            }
          }
        } else {
          const listRes = await api.getListings({ seller: sellerId, ...geoParams });
          if (!cancelled) {
            setRelated(
              (listRes.listings || [])
                .map(toCardItem)
                .filter((item) => item && item.id !== String(raw.id || raw._id))
                .slice(0, 4),
            );
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load listing');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id, geoParams]);

  const card = useMemo(() => (listing ? toCardItem(listing) : null), [listing]);
  const sellerId = listing ? getSellerIdFromListing(listing) : null;
  const shop = listing?.shopId && typeof listing.shopId === 'object' ? listing.shopId : null;
  const seller = listing?.seller && typeof listing.seller === 'object' ? listing.seller : null;
  const photos = (listing?.photos || []).map(resolveMediaUrl).filter(Boolean);
  const distanceLabel = formatDistanceLabel(listing?.distanceKm);

  return (
    <div className="detail-page">
      <header className="detail-header">
        <div className="container detail-header-inner">
          <nav className="detail-breadcrumb" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            <span>/</span>
            <Link to="/explore">Explore</Link>
            <span>/</span>
            <span className="detail-breadcrumb-current">{card?.title || 'Item'}</span>
          </nav>
          <button type="button" className="detail-back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      </header>

      <main className="container detail-main">
        {loading ? (
          <div className="detail-loading">
            <div className="detail-loading-gallery skeleton-block" />
            <div className="detail-loading-info">
              <div className="skeleton-line wide" />
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="explore-error">
            <p>{error}</p>
            <Link to="/explore" className="btn btn-primary">Back to Explore</Link>
          </div>
        ) : null}

        {!loading && !error && listing && card ? (
          <div className="detail-layout">
            <section className="detail-panel detail-panel-gallery">
              <ListingGallery photos={photos} title={card.title} />
            </section>

            <section className="detail-panel detail-panel-info">
              <span className="listing-modal-category">{card.category}</span>
              <h1>{card.title}</h1>
              {!listing.hasVariants ? (
                <p className="detail-price">
                  {card.price || formatListingPrice(listing, formatPrice)}
                </p>
              ) : null}

              {listing.hasVariants ? (
                <VariantPicker
                  listing={listing}
                  selection={variantSelection}
                  onChangeSelection={setVariantSelection}
                />
              ) : null}

              <div className="listing-modal-chips">
                {card.condition ? <span>{card.condition}</span> : null}
                {listing.status ? <span className={`detail-status detail-status-${listing.status}`}>{listing.status}</span> : null}
                {distanceLabel ? <span><IconLocation width={14} height={14} /> {distanceLabel}</span> : null}
                {card.location ? <span>{card.location}</span> : null}
                {listing.views ? <span>{listing.views} views</span> : null}
              </div>

              {listing.meetupOption ? (
                <p className="detail-meetup">
                  <strong>Meetup:</strong> {listing.meetupOption}
                </p>
              ) : null}

              {card.description || listing.description ? (
                <div className="detail-desc-block">
                  <h2>Description</h2>
                  <p>{card.description || listing.description}</p>
                </div>
              ) : null}

              <div className="detail-seller-card">
                <h2>Seller</h2>
                <div className="detail-seller-row">
                  <div className="detail-seller-avatar">
                    {shop?.logo || seller?.avatarUrl ? (
                      <img src={resolveMediaUrl(shop?.logo || seller?.avatarUrl)} alt="" />
                    ) : (
                      <span>{card.sellerName.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className="detail-seller-meta">
                    <p className="detail-seller-name">{card.sellerName}</p>
                    <p className="detail-seller-type">
                      {listing.sellerType === 'shop' ? 'Shop seller' : 'Individual seller'}
                    </p>
                    <div className="detail-seller-badges">
                      {shop?.isVerified ? (
                        <span className="seller-verified"><IconShield width={14} height={14} /> Verified shop</span>
                      ) : null}
                      {shop?.ratingAverage ? (
                        <span><IconStar width={14} height={14} /> {shop.ratingAverage} ({shop.reviewCount || 0} reviews)</span>
                      ) : null}
                    </div>
                  </div>
                  {sellerId ? (
                    <Link to={`/seller/${sellerId}`} className="btn btn-outline detail-seller-link">
                      View profile
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="detail-actions">
                <Link to="/download" className="btn btn-primary detail-cta">
                  Get app to chat & meetup
                </Link>
                <Link to="/explore" className="btn btn-ghost detail-cta-secondary">
                  Browse more items
                </Link>
              </div>
            </section>
          </div>
        ) : null}

        {!loading && !error && related.length ? (
          <section className="detail-related">
            <div className="explore-section-head">
              <h2>More from this seller</h2>
              {sellerId ? <Link to={`/seller/${sellerId}`} className="detail-related-link">See all</Link> : null}
            </div>
            <div className="explore-grid">
              {related.map((item) => (
                <ProductCard key={item.id} item={item} />
              ))}
            </div>
          </section>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
