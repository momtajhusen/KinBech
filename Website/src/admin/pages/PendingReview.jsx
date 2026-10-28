import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Image as ImageIcon,
  MapPin,
  RefreshCw,
  Search,
  Store,
  Tag,
  User,
  X,
} from 'lucide-react';
import api from '../services/api';
import { errorMessage, toast } from '../components/Feedback';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { adminPath } from '../routes';
import { mediaUrl } from '../../config';
import { LISTING_REJECT_REASONS as REJECT_REASONS, heldReason as holdReason } from '../utils/moderationReasons';

const LIMIT = 12;

const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const formatPrice = (price) => `Rs ${Number(price || 0).toLocaleString('en-IN')}`;

function waitingLabel(value) {
  if (!value) return null;
  const hours = Math.floor((Date.now() - new Date(value).getTime()) / 3600000);
  if (hours < 1) return { text: 'Just now', late: false };
  if (hours < 24) return { text: `${hours}h waiting`, late: false };
  const days = Math.floor(hours / 24);
  return { text: `${days}d waiting`, late: days >= 2 };
}

function ReviewPanel({ listing, onDone }) {
  const [reason, setReason] = useState(holdReason(listing));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const seller = listing.seller && typeof listing.seller === 'object' ? listing.seller : null;
  const shop = listing.shopId && typeof listing.shopId === 'object' ? listing.shopId : null;

  const decide = async (decision) => {
    if (decision === 'reject' && !reason.trim()) {
      setError('Pick or write a reason. The seller will see it.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.patch(`/listings/admin/${listing.id}/status`, decision === 'approve'
        ? { status: 'active' }
        : { status: 'rejected', reason: reason.trim() });
      onDone(listing, decision);
    } catch (err) {
      setError(errorText(err, 'Could not update the listing'));
      setSaving(false);
    }
  };

  return (
    <div className="sv-panel">
      <div className="sv-col">
        <h4 className="sv-h">Photos</h4>
        {listing.photos?.length ? (
          <div className="pr-photos">
            {listing.photos.map((photo) => (
              <a key={photo} href={mediaUrl(photo)} target="_blank" rel="noreferrer">
                <img src={mediaUrl(photo)} alt="" loading="lazy" />
              </a>
            ))}
          </div>
        ) : <div className="u360-empty">No photos</div>}

        <h4 className="sv-h">Description</h4>
        <p className="pr-description">{listing.description || 'No description'}</p>

        <h4 className="sv-h">Seller</h4>
        <div className="sv-owner">
          {seller?.id || seller?._id ? (
            <Link className="u360-li-title" to={adminPath(`users/${seller.id || seller._id}`)}>{seller.name || 'Unnamed seller'}</Link>
          ) : <span className="u360-li-title">Unknown seller</span>}
          <span className="u360-li-sub">
            {listing.sellerType === 'shop' ? `Shop listing${shop?.name ? ` · ${shop.name}` : ''}` : 'Individual seller'}
            {` · posted ${new Date(listing.createdAt).toLocaleString()}`}
          </span>
        </div>
      </div>

      <div className="sv-col">
        <h4 className="sv-h">Why it was held</h4>
        <div className="u360-banner warning compact">
          <div>
            <strong>{holdReason(listing) || 'Held for manual review'}</strong>
            {listing.matchedKeywords?.length ? <span>Keywords: {listing.matchedKeywords.join(', ')}</span> : null}
          </div>
        </div>

        <div className="form-group">
          <label>Reason if rejecting (shown to the seller)</label>
          <div className="u360-chips scam-presets">
            {REJECT_REASONS.map((preset) => (
              <button key={preset} type="button" className={`u360-chip ${reason === preset ? 'on' : ''}`} onClick={() => setReason(preset)}>{preset}</button>
            ))}
          </div>
          <textarea className="form-textarea" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {error ? <div className="u360-error">{error}</div> : null}
        <div className="inbox-actions">
          <span className="inbox-spacer" />
          <button type="button" className="btn u360-danger-btn" disabled={saving} onClick={() => decide('reject')}>Reject</button>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => decide('approve')}>
            <CheckCircle2 className="item-icon" aria-hidden /> Approve
          </button>
        </div>
        <p className="form-hint">The seller gets a notification either way. Approved listings go live right away.</p>
      </div>
    </div>
  );
}

export default function PendingReview() {
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const debounced = useDebounce(searchTerm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/listings/admin/all', {
        params: { status: 'pending', sort: 'oldest', q: debounced || undefined, page, limit: LIMIT },
      });
      setData(response.data);
    } catch (error) {
      toast.error(errorMessage(error, 'Please refresh the page.'), { title: 'Could not load the review queue' });
    } finally {
      setLoading(false);
    }
  }, [debounced, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debounced]);

  const onDone = (listing, decision) => {
    if (decision === 'approve') toast.success(`"${listing.title}" is live in the app.`, { title: 'Listing approved' });
    else toast.success(`"${listing.title}" is hidden and the seller is told why.`, { title: 'Listing rejected' });
    setOpenId(null);
    load();
  };

  const listings = data?.listings || [];

  return (
    <div className="sv-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search title, category, location..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {searchTerm ? <button type="button" className="clear-btn" onClick={() => setSearchTerm('')}><X className="item-icon" /> Clear</button> : null}
        </div>
        <div className="filter-group right">
          <span className="status-badge pending">{data?.total || 0} waiting</span>
          <button type="button" className="action-btn view" onClick={load} disabled={loading}>
            <RefreshCw className="item-icon" aria-hidden /> Refresh
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="loading">Loading review queue...</div>
      ) : !listings.length ? (
        <div className="table-container">
          <div className="empty-state">{searchTerm ? 'No pending listings match this search' : 'Nothing waiting for review'}</div>
        </div>
      ) : (
        <>
          <div className="inbox-list">
            {listings.map((listing) => {
              const open = openId === listing.id;
              const waited = waitingLabel(listing.heldAt || listing.createdAt);
              const shop = listing.shopId && typeof listing.shopId === 'object' ? listing.shopId : null;
              return (
                <article key={listing.id} className={`card inbox-card sv-card sv-pending ${open ? 'is-open' : ''}`}>
                  <button type="button" className="inbox-card-head" onClick={() => setOpenId(open ? null : listing.id)}>
                    {listing.photos?.[0] ? (
                      <img className="u360-thumb" src={mediaUrl(listing.photos[0])} alt="" />
                    ) : (
                      <span className="u360-thumb pr-thumb-empty"><ImageIcon className="item-icon" aria-hidden /></span>
                    )}
                    <div className="inbox-card-main">
                      <div className="inbox-card-title">{listing.title}</div>
                      <div className="inbox-card-sub sv-sub">
                        <span>{formatPrice(listing.price)}</span>
                        <span><Tag className="item-icon" aria-hidden /> {listing.category}</span>
                        <span>
                          {shop ? <Store className="item-icon" aria-hidden /> : <User className="item-icon" aria-hidden />}
                          {' '}{shop?.name || listing.seller?.name || 'Unknown seller'}
                        </span>
                        {listing.location ? <span><MapPin className="item-icon" aria-hidden /> {listing.location}</span> : null}
                      </div>
                      {holdReason(listing) ? <div className="pr-reason">Hold: {holdReason(listing)}</div> : null}
                    </div>
                    <div className="user-badges">
                      {listing.photos?.length ? <span className="status-badge">{listing.photos.length} photo{listing.photos.length === 1 ? '' : 's'}</span> : null}
                      {waited ? (
                        <span className={`status-badge ${waited.late ? 'open' : 'pending'}`}><Clock className="item-icon" aria-hidden /> {waited.text}</span>
                      ) : null}
                    </div>
                  </button>
                  {open ? <ReviewPanel listing={listing} onDone={onDone} /> : null}
                </article>
              );
            })}
          </div>
          <Pagination page={page} totalPages={data.totalPages || 1} total={data.total || 0} limit={LIMIT} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
