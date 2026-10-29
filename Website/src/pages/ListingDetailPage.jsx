import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../services/api';
import {
  formatPrice,
  formatDistanceLabel,
  formatTimeAgo,
  getSellerIdFromListing,
  resolveMediaUrl,
  toCardItem,
} from '../utils/listing';
import { useGeolocation } from '../hooks/useGeolocation';
import ProductCard from '../components/ProductCard';
import VariantPicker, { getDefaultVariantSelection } from '../components/VariantPicker';
import Footer from '../components/Footer';
import { GooglePlayBadge } from '../components/Download';
import { IconLocation, IconShield, IconStar } from '../components/Icons';
import Breadcrumb from '../components/Breadcrumb';
import AutoAwesomeRounded from '@mui/icons-material/AutoAwesomeRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import CategoryRounded from '@mui/icons-material/CategoryRounded';
import ChatRounded from '@mui/icons-material/ChatRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import HandshakeRounded from '@mui/icons-material/HandshakeRounded';
import HealthAndSafetyRounded from '@mui/icons-material/HealthAndSafetyRounded';
import IosShareRounded from '@mui/icons-material/IosShareRounded';
import LocalOfferRounded from '@mui/icons-material/LocalOfferRounded';
import LocationCityRounded from '@mui/icons-material/LocationCityRounded';
import MapRounded from '@mui/icons-material/MapRounded';
import PersonRounded from '@mui/icons-material/PersonRounded';
import PhonelinkLockRounded from '@mui/icons-material/PhonelinkLockRounded';
import PlayArrowRounded from '@mui/icons-material/PlayArrowRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { formatListingPrice } from '../utils/listingVariants';

const RELATED_LIMIT = 8;

const STATUS_LABEL = { active: 'Available', pending: 'On hold', sold: 'Sold' };

const BUY_STEPS = [
  { title: 'Open it in the app', text: 'Sign in with Google in seconds.' },
  { title: 'Chat or call the seller', text: 'Ask questions, send a voice note, agree a price.' },
  { title: 'Meet nearby', text: 'Pick a busy public place and check the item.' },
  { title: 'Pay when you are happy', text: 'Cash, eSewa, Khalti or bank — face to face.' },
];

const isVideoUrl = (url) => /\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(String(url || '')) || String(url || '').includes('/video');

function ListingGallery({ media, title }) {
  const [active, setActive] = useState(0);
  const items = media.length ? media : [null];
  const current = items[active];
  const step = (delta) => setActive((i) => (i + delta + items.length) % items.length);

  return (
    <div className="detail-gallery">
      {items.length > 1 ? (
        <div className="detail-gallery-thumbs" aria-label="Photo thumbnails">
          {items.map((item, i) => (
            <button
              key={item?.src || i}
              type="button"
              className={active === i ? 'active' : ''}
              onClick={() => setActive(i)}
              aria-label={item?.video ? `Video ${i + 1}` : `Photo ${i + 1}`}
            >
              {item?.video ? (
                <span className="detail-thumb-video"><PlayArrowRounded /></span>
              ) : item ? <img src={item.src} alt="" /> : <span>?</span>}
            </button>
          ))}
        </div>
      ) : null}
      <div className="detail-gallery-main">
        {current?.video ? (
          <video key={current.src} src={current.src} controls playsInline preload="metadata" />
        ) : current ? (
          <>
            <img className="detail-gallery-backdrop" src={current.src} alt="" aria-hidden />
            <img className="detail-gallery-photo" src={current.src} alt={title} />
          </>
        ) : (
          <div className="detail-gallery-placeholder">No photo available</div>
        )}
        {items.length > 1 ? (
          <>
            <button type="button" className="detail-gallery-nav is-prev" onClick={() => step(-1)} aria-label="Previous photo">
              <ChevronLeftRounded />
            </button>
            <button type="button" className="detail-gallery-nav is-next" onClick={() => step(1)} aria-label="Next photo">
              <ChevronRightRounded />
            </button>
            <span className="detail-gallery-count">{active + 1} / {items.length}</span>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ShareButton({ title }) {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <button type="button" className={`detail-share-btn${copied ? ' is-done' : ''}`} onClick={share}>
      {copied ? <CheckRounded /> : <IosShareRounded />}
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}

function RelatedSection({ title, sub, items, link }) {
  if (!items.length) return null;
  return (
    <section className="detail-related">
      <div className="detail-related-head">
        <div>
          <h2>{title}</h2>
          {sub ? <p>{sub}</p> : null}
        </div>
        {link ? <Link to={link.to} className="detail-related-link">{link.label} <ChevronRightRounded /></Link> : null}
      </div>
      <div className="detail-related-grid">
        {items.map((item) => <ProductCard key={item.id} item={item} />)}
      </div>
    </section>
  );
}

const cardsFrom = (res, excludeId) => (res?.listings || [])
  .map(toCardItem)
  .filter((item) => item && item.id !== excludeId);

export default function ListingDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { coords } = useGeolocation();

  const [listing, setListing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [variantSelection, setVariantSelection] = useState({});
  const [similar, setSimilar] = useState([]);
  const [sellerItems, setSellerItems] = useState([]);
  const [fresh, setFresh] = useState([]);
  const [relatedReady, setRelatedReady] = useState(false);
  const [categoryCounts, setCategoryCounts] = useState({});
  const loadedIdRef = useRef(null);

  const geoParams = useMemo(
    () => (coords ? { lat: coords.lat, lng: coords.lng } : {}),
    [coords],
  );

  useEffect(() => {
    let cancelled = false;
    if (loadedIdRef.current !== id) setLoading(true);
    setError('');
    api.getListing(id, geoParams)
      .then((res) => {
        if (cancelled) return;
        const raw = res.listing;
        setListing(raw);
        if (loadedIdRef.current !== id) {
          setVariantSelection(raw?.hasVariants ? getDefaultVariantSelection(raw) : {});
        }
        loadedIdRef.current = id;
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || 'Could not load listing');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, geoParams]);

  const listingKey = listing ? String(listing.id || listing._id) : '';

  useEffect(() => {
    if (!listing || listingKey !== id) return undefined;
    let cancelled = false;
    setRelatedReady(false);
    const sellerId = getSellerIdFromListing(listing);
    const shopId = listing.sellerType === 'shop'
      ? listing.shopId?.id || listing.shopId?._id || listing.shopId
      : null;

    const similarReq = api.getRelatedListings({
      title: listing.title,
      exclude: id,
      category: listing.category || '',
      limit: RELATED_LIMIT,
    }).catch(() => null);
    const sellerReq = shopId
      ? api.getShopListings(shopId).catch(() => null)
      : sellerId
        ? api.getListings({ seller: sellerId, ...geoParams, limit: RELATED_LIMIT + 1 }).catch(() => null)
        : Promise.resolve(null);

    Promise.all([similarReq, sellerReq]).then(async ([simRes, sellRes]) => {
      if (cancelled) return;
      const fromSeller = cardsFrom(sellRes, id).slice(0, RELATED_LIMIT);
      const sellerIds = new Set(fromSeller.map((item) => item.id));
      const alike = cardsFrom(simRes, id).filter((item) => !sellerIds.has(item.id));
      setSellerItems(fromSeller);
      setSimilar(alike);
      let latest = [];
      if (!fromSeller.length && !alike.length) {
        const res = await api.getListings({ ...geoParams, sort: 'newest', limit: RELATED_LIMIT + 1 }).catch(() => null);
        latest = cardsFrom(res, id).slice(0, RELATED_LIMIT);
      }
      if (cancelled) return;
      setFresh(latest);
      setRelatedReady(true);
    });
    return () => { cancelled = true; };
    // geoParams only adds distance labels; one fetch per listing is enough.
  }, [listingKey, id]);

  useEffect(() => {
    api.getCategoryCounts().then((res) => setCategoryCounts(res.counts || {})).catch(() => {});
  }, []);

  const card = useMemo(() => (listing ? toCardItem(listing) : null), [listing]);
  const sellerId = listing ? getSellerIdFromListing(listing) : null;
  const shop = listing?.shopId && typeof listing.shopId === 'object' ? listing.shopId : null;
  const seller = listing?.seller && typeof listing.seller === 'object' ? listing.seller : null;
  const media = useMemo(() => (listing?.photos || [])
    .map(resolveMediaUrl)
    .filter(Boolean)
    .map((src) => ({ src, video: isVideoUrl(src) })), [listing]);
  const distanceLabel = formatDistanceLabel(listing?.distanceKm);
  const isShop = listing?.sellerType === 'shop';
  const priceText = card ? card.price || formatListingPrice(listing, formatPrice) : '';
  const wasPrice = listing?.isOnSale && listing.originalPrice > listing.price
    ? formatPrice(listing.originalPrice, listing.currency)
    : '';
  const postedAgo = formatTimeAgo(listing?.createdAt);
  const postedDate = listing?.createdAt
    ? new Date(listing.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const categoryLink = card?.category ? `/explore?category=${encodeURIComponent(card.category)}` : '/explore';

  const facts = card ? [
    { icon: CategoryRounded, label: 'Category', value: card.category, to: categoryLink },
    { icon: AutoAwesomeRounded, label: 'Condition', value: card.condition },
    { icon: LocalOfferRounded, label: 'Brand', value: listing.brand },
    { icon: LocationCityRounded, label: 'Location', value: card.location },
    { icon: HandshakeRounded, label: 'Meetup', value: listing.meetupOption },
    { icon: isShop ? StorefrontRounded : PersonRounded, label: 'Sold by', value: isShop ? `Shop · ${card.sellerName}` : card.sellerName },
    { icon: CalendarMonthRounded, label: 'Posted', value: postedDate ? `${postedDate} · ${postedAgo}` : '' },
    { icon: VisibilityRounded, label: 'Views', value: listing.views ? listing.views.toLocaleString('en-IN') : '' },
  ].filter((f) => f.value) : [];

  const browseCategories = Object.entries(categoryCounts)
    .filter(([name, n]) => n > 0 && name !== card?.category)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const ready = !loading && !error && listing && card;

  return (
    <div className={`detail-page${ready ? ' has-sticky-bar' : ''}`}>
      <header className="detail-header">
        <div className="container detail-header-inner">
          <Breadcrumb
            trail={[
              { to: '/explore', label: 'Explore' },
              ...(card?.category ? [{ to: categoryLink, label: card.category }] : []),
              { label: card?.title || 'Item' },
            ]}
          />
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

        {ready ? (
          <>
            <div className="detail-layout">
              <section className="detail-panel detail-panel-gallery">
                <ListingGallery key={id} media={media} title={card.title} />
              </section>

              <section className="detail-panel detail-panel-info">
                <div className="detail-info-top">
                  <Link to={categoryLink} className="listing-modal-category">{card.category}</Link>
                  <ShareButton title={card.title} />
                </div>
                <h1>{card.title}</h1>
                {!listing.hasVariants ? (
                  <p className="detail-price">
                    {priceText}
                    {wasPrice ? <s className="detail-price-was">{wasPrice}</s> : null}
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
                  {card.condition ? <span><AutoAwesomeRounded aria-hidden /> {card.condition}</span> : null}
                  {listing.status ? (
                    <span className={`detail-status detail-status-${listing.status}`}>
                      {STATUS_LABEL[listing.status] || listing.status}
                    </span>
                  ) : null}
                  {distanceLabel ? <span><IconLocation width={14} height={14} /> {distanceLabel}</span> : null}
                  {card.location ? <span><LocationCityRounded aria-hidden /> {card.location}</span> : null}
                  {postedAgo ? <span><CalendarMonthRounded aria-hidden /> {postedAgo}</span> : null}
                </div>

                {listing.meetupOption ? (
                  <p className="detail-meetup">
                    <HandshakeRounded aria-hidden />
                    <span><strong>Meetup:</strong> {listing.meetupOption}</span>
                  </p>
                ) : null}

                <div className="detail-seller-card">
                  <h2>{isShop ? 'Store' : 'Seller'}</h2>
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
                        {isShop ? 'Shop seller' : 'Individual seller'}
                      </p>
                      <div className="detail-seller-badges">
                        {shop?.isVerified || card.verificationKind === 'business' ? (
                          <span className="seller-verified"><IconShield width={14} height={14} /> Business Verified</span>
                        ) : null}
                        {!shop && (card.verificationKind === 'phone' || card.verified || !isShop) ? (
                          <span className="seller-verified seller-verified-phone"><PhonelinkLockRounded aria-hidden /> Verified account</span>
                        ) : null}
                        {shop?.ratingAverage ? (
                          <span><IconStar width={14} height={14} /> {shop.ratingAverage} ({shop.reviewCount || 0} reviews)</span>
                        ) : null}
                      </div>
                    </div>
                    {sellerId ? (
                      <Link to={`/seller/${sellerId}`} className="btn btn-outline detail-seller-link">
                        {isShop ? 'View store' : 'View profile'}
                      </Link>
                    ) : null}
                  </div>
                </div>

                <div className="detail-actions">
                  <Link to="/download" className="btn btn-primary detail-cta">
                    <ChatRounded aria-hidden /> Chat with seller in app
                  </Link>
                  <Link to="/map" className="btn btn-ghost detail-cta-secondary">
                    <MapRounded aria-hidden /> See on map
                  </Link>
                </div>
                <p className="detail-cta-note">Chat, voice notes and calls are free in the KinBech app.</p>
              </section>
            </div>

            <div className="detail-more-layout">
              <section className="detail-panel detail-about">
                <h2>About this item</h2>
                {card.description ? <p className="detail-about-desc">{card.description}</p> : null}
                <dl className="detail-facts">
                  {facts.map(({ icon: FactIcon, label, value, to }) => (
                    <div key={label} className="detail-fact">
                      <dt><FactIcon aria-hidden /> {label}</dt>
                      <dd>{to ? <Link to={to}>{value}</Link> : value}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <aside className="detail-side">
                <Link to="/safety" className="detail-panel detail-safety">
                  <span className="detail-safety-icon"><HealthAndSafetyRounded /></span>
                  <span className="detail-safety-text">
                    <strong>Stay safe with each other</strong>
                    <small>Meet in a public place and check the item before you pay.</small>
                  </span>
                  <ChevronRightRounded className="detail-safety-chevron" />
                </Link>

                <section className="detail-panel detail-howto">
                  <h2>How to buy this</h2>
                  <ol>
                    {BUY_STEPS.map((s, i) => (
                      <li key={s.title}>
                        <span className="detail-howto-num">{i + 1}</span>
                        <span>
                          <strong>{s.title}</strong>
                          <small>{s.text}</small>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <GooglePlayBadge />
                </section>
              </aside>
            </div>

            <RelatedSection
              title="Similar items"
              sub={`More like this${card.category ? ` in ${card.category}` : ''}`}
              items={similar}
              link={card.category ? { to: categoryLink, label: `All ${card.category}` } : null}
            />
            <RelatedSection
              title={`More from ${card.sellerName}`}
              sub={isShop ? 'Other items in this store' : 'Other items from this seller'}
              items={sellerItems}
              link={sellerId ? { to: `/seller/${sellerId}`, label: isShop ? 'Visit store' : 'See all' } : null}
            />
            <RelatedSection
              title="Fresh on KinBech"
              sub="Just listed by people around Nepal"
              items={fresh}
              link={{ to: '/explore', label: 'Explore all' }}
            />
            {!relatedReady ? (
              <div className="detail-related-grid detail-related-loading" aria-hidden>
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton-block" />)}
              </div>
            ) : null}

            <section className="detail-panel detail-explore-more">
              <div>
                <h2>Keep exploring</h2>
                <p>Find more near you by category, on the map, or from local shops.</p>
              </div>
              <div className="detail-explore-chips">
                {browseCategories.map(([name, n]) => (
                  <Link key={name} to={`/explore?category=${encodeURIComponent(name)}`}>
                    {name} <span>{n}</span>
                  </Link>
                ))}
                <Link to="/explore" className="is-strong">All items</Link>
                <Link to="/map" className="is-strong"><MapRounded aria-hidden /> Map</Link>
                <Link to="/categories" className="is-strong"><CategoryRounded aria-hidden /> Categories</Link>
              </div>
            </section>
          </>
        ) : null}
      </main>

      {ready ? (
        <div className="detail-sticky-bar">
          <div className="detail-sticky-price">
            <small>{card.title}</small>
            <strong>{priceText}</strong>
          </div>
          <Link to="/download" className="btn btn-primary">
            <ChatRounded aria-hidden /> Chat in app
          </Link>
        </div>
      ) : null}

      <Footer />
    </div>
  );
}
