import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { toCardItem, toSellerCard } from '../utils/listing';
import { useGeolocation } from '../hooks/useGeolocation';
import ProductCard from '../components/ProductCard';
import Footer from '../components/Footer';
import { IconLocation, IconShield, IconStar } from '../components/Icons';

export default function SellerProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { coords } = useGeolocation();
  const fromStorefront = searchParams.get('source') === 'storefront';

  const [seller, setSeller] = useState(null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        const res = await api.getSeller(id, geoParams);
        const raw = res.seller;
        if (cancelled) return;

        const card = toSellerCard(raw);
        setSeller(card);

        if (raw.sellerType === 'shop' || raw.shopId) {
          const shopId = raw.shopId || raw.id || raw._id;
          const shopRes = await api.getShopListings(shopId);
          if (!cancelled) {
            setListings((shopRes.listings || []).map(toCardItem).filter(Boolean));
          }
        } else {
          const userId = raw.userId || raw.id || raw._id;
          const listRes = await api.getListings({ seller: userId, ...geoParams });
          if (!cancelled) {
            setListings((listRes.listings || []).map(toCardItem).filter(Boolean));
          }
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Seller not found');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id, geoParams]);

  const sellerName = seller?.name || 'Seller';

  return (
    <div className="detail-page seller-profile-page">
      {loading ? (
        <section className="seller-profile-hero seller-profile-hero--loading">
          <div className="container seller-profile-hero-inner">
            <div className="seller-profile-topbar skeleton-block" style={{ height: 36, borderRadius: 12 }} />
            <div className="seller-profile-hero-content">
              <div className="seller-profile-avatar skeleton-block" />
              <div className="seller-profile-intro" style={{ flex: 1 }}>
                <div className="skeleton-line wide" />
                <div className="skeleton-line" />
                <div className="skeleton-line short" />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!loading && !error && seller ? (
        <section className="seller-profile-hero">
          {seller.cover ? <img src={seller.cover} alt="" className="seller-profile-cover" /> : null}
          <div className="seller-profile-hero-shade" aria-hidden />
          <div className="container seller-profile-hero-inner">
            <div className="seller-profile-topbar detail-header-inner">
              <nav className="detail-breadcrumb seller-profile-breadcrumb" aria-label="Breadcrumb">
                <Link to="/">Home</Link>
                <span>/</span>
                <Link to="/explore">Explore</Link>
                <span>/</span>
                <span className="detail-breadcrumb-current">{sellerName}</span>
              </nav>
              <button type="button" className="detail-back-btn detail-back-btn-light" onClick={() => navigate(-1)}>
                ← Back
              </button>
            </div>

            <div className="seller-profile-hero-content">
              <div className="seller-profile-avatar">
                {seller.avatar ? <img src={seller.avatar} alt={seller.name} /> : <span>{seller.name.slice(0, 1)}</span>}
              </div>
              <div className="seller-profile-intro">
                <div className="seller-profile-title-row">
                  <h1>{seller.name}</h1>
                  {seller.verified ? (
                    <span className="seller-verified seller-verified-light">
                      <IconShield width={14} height={14} /> Verified
                    </span>
                  ) : null}
                </div>
                <p className="seller-profile-type">
                  {seller.sellerType === 'shop' ? 'Shop' : 'Individual seller'}
                  {seller.category ? ` · ${seller.category}` : ''}
                </p>
                <div className="seller-profile-stats">
                  {seller.rating > 0 ? (
                    <span><IconStar width={14} height={14} /> {seller.rating.toFixed(1)} ({seller.reviewsCount} reviews)</span>
                  ) : null}
                  <span>{listings.length || seller.listingCount} listings</span>
                  {seller.distanceLabel ? <span><IconLocation width={14} height={14} /> {seller.distanceLabel}</span> : null}
                  {seller.location ? <span>{seller.location}</span> : null}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <main className="container detail-main seller-profile-main">
        {error ? (
          <div className="explore-error">
            <p>{error}</p>
            <Link to="/explore" className="btn btn-primary">Back to Explore</Link>
          </div>
        ) : null}

        {!loading && !error && seller ? (
          <>
            {fromStorefront ? (
              <section className="storefront-scan-banner" aria-label="Scanned from shop QR">
                <div>
                  <p className="storefront-scan-kicker">Scanned at shop</p>
                  <h2>Follow {seller.name} on KinBech</h2>
                  <p>Browse listings, save this shop, and chat from the KinBech app.</p>
                </div>
                <Link to="/download" className="btn btn-primary">
                  Get the app
                </Link>
              </section>
            ) : null}

            {seller.description ? (
              <section className="detail-desc-block seller-profile-about">
                <h2>About</h2>
                <p>{seller.description}</p>
              </section>
            ) : null}

            {seller.openingHours ? (
              <section className="seller-profile-hours">
                <h2>Opening hours</h2>
                <p>{seller.openingHours}</p>
              </section>
            ) : null}

            <section className="seller-profile-listings">
              <div className="explore-section-head">
                <h2>Listings ({listings.length})</h2>
                <Link to="/explore" className="detail-related-link">Explore all</Link>
              </div>

              {listings.length ? (
                <div className="explore-grid">
                  {listings.map((item) => (
                    <ProductCard key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="explore-empty">
                  <h3>No active listings</h3>
                  <p>This seller has no items listed right now.</p>
                </div>
              )}
            </section>

            <div className="detail-actions seller-profile-actions">
              <Link to="/download" className="btn btn-primary detail-cta">
                Get app to contact seller
              </Link>
            </div>
          </>
        ) : null}
      </main>

      <Footer />
    </div>
  );
}
