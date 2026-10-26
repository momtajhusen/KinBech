import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CalendarDays,
  CheckSquare,
  Clock,
  Eye,
  FileText,
  Flag,
  History,
  MapPin,
  Package,
  Phone,
  Search,
  ShieldAlert,
  Square,
  X,
} from 'lucide-react';
import api from '../services/api';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { adminPath } from '../routes';
import { mediaUrl } from '../../config';

const LIMIT = 12;
const CHECKS = [
  ['nameMatches', 'Shop / owner name matches the document'],
  ['panValid', 'PAN / VAT number is valid (checked on IRD)'],
  ['documentClear', 'Document is clear and not edited'],
  ['addressMatches', 'Address matches the shop location'],
  ['phoneReachable', 'Shop phone answered / reachable'],
];
const REJECT_REASONS = [
  'The document is blurry or unreadable.',
  'The name on the document does not match the shop.',
  'The PAN/VAT number could not be verified.',
  'The document is expired.',
  'This is not a business registration document.',
];
const HISTORY_LABELS = {
  submitted: 'Submitted by owner',
  approved: 'Approved',
  rejected: 'Rejected',
  revoked: 'Verification revoked',
  note: 'Note',
};

const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const fmtDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');
const fmtDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');
const waitingDays = (value) => (value ? Math.floor((Date.now() - new Date(value).getTime()) / 86400000) : null);

function ReviewPanel({ shop, onSaved }) {
  const [checklist, setChecklist] = useState(shop.checklist);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [taxIds, setTaxIds] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canApprove = checklist.nameMatches && (checklist.panValid || checklist.documentClear);
  const approved = shop.verificationStatus === 'approved';

  const reveal = async () => {
    try {
      const { data } = await api.get(`/shops/admin/${shop.id}/tax-ids`);
      setTaxIds(data);
    } catch (err) {
      setError(errorText(err, 'Could not reveal tax IDs'));
    }
  };

  const decide = async (decision) => {
    if ((decision === 'reject' || decision === 'revoke') && !reason.trim()) {
      setError('Pick or write a reason. The owner will see it.');
      return;
    }
    if (decision === 'revoke' && !window.confirm(`Remove the verified badge from ${shop.name}?`)) return;
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/shops/admin/${shop.id}/verification`, {
        decision,
        checklist,
        note: note.trim(),
        reason: reason.trim(),
      });
      setNote('');
      setReason('');
      onSaved(data.shop, decision);
    } catch (err) {
      setError(errorText(err, 'Could not save'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sv-panel">
      <div className="sv-col">
        <h4 className="sv-h">Documents</h4>
        {shop.documents.length ? (
          <div className="sv-docs">
            {shop.documents.map((doc, index) => (
              <a key={`${doc.url}-${index}`} className="sv-doc" href={mediaUrl(doc.viewUrl || doc.url)} target="_blank" rel="noreferrer">
                <FileText className="item-icon" aria-hidden />
                <span>{doc.label || 'Business document'}</span>
                <span className="u360-li-sub">{fmtDate(doc.uploadedAt)}</span>
              </a>
            ))}
          </div>
        ) : (
          <div className="u360-empty">No documents uploaded</div>
        )}

        <h4 className="sv-h">Tax IDs</h4>
        <div className="sv-tax">
          <span>PAN: <strong>{taxIds ? taxIds.panNumber || '—' : shop.panMasked || '—'}</strong></span>
          <span>VAT: <strong>{taxIds ? taxIds.vatNumber || '—' : shop.vatMasked || '—'}</strong></span>
          {shop.hasTaxId && !taxIds ? (
            <button type="button" className="action-btn view" onClick={reveal}><Eye className="item-icon" aria-hidden /> Reveal (logged)</button>
          ) : null}
        </div>

        <h4 className="sv-h">Owner</h4>
        {shop.owner ? (
          <div className="sv-owner">
            <Link className="u360-li-title" to={adminPath(`users/${shop.owner.id}`)}>{shop.owner.name || shop.owner.phone}</Link>
            <span className="u360-li-sub">
              {shop.owner.phone} · joined {fmtDate(shop.owner.joinedAt)} · trust {shop.owner.trustTier}
            </span>
            <div className="user-badges">
              {shop.owner.status === 'suspended' ? <span className="status-badge suspended">Owner suspended</span> : null}
              {shop.owner.strikes ? <span className="status-badge pending"><ShieldAlert className="item-icon" aria-hidden /> {shop.owner.strikes} strikes</span> : null}
              {shop.ownerReports ? <span className="status-badge open"><Flag className="item-icon" aria-hidden /> {shop.ownerReports} reports</span> : null}
              <span className="status-badge"><Package className="item-icon" aria-hidden /> {shop.activeListings} active listings</span>
            </div>
          </div>
        ) : <div className="u360-empty">Owner account not found</div>}
      </div>

      <div className="sv-col">
        <h4 className="sv-h">Checklist</h4>
        <div className="sv-checks">
          {CHECKS.map(([key, label]) => (
            <button key={key} type="button" className={`sv-check ${checklist[key] ? 'on' : ''}`} onClick={() => setChecklist((prev) => ({ ...prev, [key]: !prev[key] }))}>
              {checklist[key] ? <CheckSquare className="item-icon" aria-hidden /> : <Square className="item-icon" aria-hidden />}
              {label}
            </button>
          ))}
        </div>
        <p className="form-hint">Approve needs "name matches" plus either "PAN/VAT valid" or "document clear".</p>

        <div className="form-group">
          <label>Internal note (admins only)</label>
          <textarea className="form-textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called the shop, owner confirmed address" />
        </div>
        <div className="form-group">
          <label>{approved ? 'Reason to revoke' : 'Reason if rejecting'} (shown to the owner)</label>
          <div className="u360-chips scam-presets">
            {REJECT_REASONS.map((preset) => (
              <button key={preset} type="button" className={`u360-chip ${reason === preset ? 'on' : ''}`} onClick={() => setReason(preset)}>{preset}</button>
            ))}
          </div>
          <textarea className="form-textarea" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {error ? <div className="u360-error">{error}</div> : null}
        <div className="inbox-actions">
          <button type="button" className="action-btn view" disabled={saving} onClick={() => decide('save')}>Save review</button>
          <span className="inbox-spacer" />
          {approved ? (
            <button type="button" className="btn u360-danger-btn" disabled={saving} onClick={() => decide('revoke')}>Revoke badge</button>
          ) : (
            <>
              <button type="button" className="btn u360-danger-btn" disabled={saving} onClick={() => decide('reject')}>Reject</button>
              <button type="button" className="btn btn-primary" disabled={saving || !canApprove} onClick={() => decide('approve')}>
                <BadgeCheck className="item-icon" aria-hidden /> Approve
              </button>
            </>
          )}
        </div>

        <h4 className="sv-h"><History className="item-icon" aria-hidden /> History</h4>
        {shop.history.length ? (
          <ul className="sv-history">
            {shop.history.map((row, index) => (
              <li key={`${row.at}-${index}`} className={`sv-h-${row.action}`}>
                <strong>{HISTORY_LABELS[row.action] || row.action}</strong>
                <span className="u360-li-sub">{row.byName ? `${row.byName} · ` : ''}{fmtDateTime(row.at)}</span>
                {row.note ? <p>{row.note}</p> : null}
              </li>
            ))}
          </ul>
        ) : <div className="u360-empty">No review history yet</div>}
      </div>
    </div>
  );
}

export default function ShopVerification() {
  const [status, setStatus] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const [notice, setNotice] = useState('');
  const debounced = useDebounce(searchTerm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/shops/admin/verification', { params: { status, q: debounced || undefined, page, limit: LIMIT } });
      setData(response.data);
    } catch (error) {
      setNotice(errorText(error, 'Could not load the queue'));
    } finally {
      setLoading(false);
    }
  }, [status, debounced, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, debounced]);

  const onSaved = (shop, decision) => {
    const copy = { save: 'Review saved', approve: `${shop.name} is now verified`, reject: `${shop.name} rejected, owner notified`, revoke: `Badge removed from ${shop.name}` };
    setNotice(copy[decision] || 'Saved');
    window.setTimeout(() => setNotice(''), 4000);
    if (decision === 'save') {
      setData((prev) => ({ ...prev, shops: prev.shops.map((row) => (row.id === shop.id ? { ...row, ...shop } : row)) }));
    } else {
      setOpenId(null);
      load();
    }
  };

  const counts = data?.counts || { pending: 0, approved: 0, rejected: 0 };
  const tabs = [
    ['pending', `Pending (${counts.pending})`],
    ['rejected', `Rejected (${counts.rejected})`],
    ['approved', `Verified (${counts.approved})`],
    ['all', 'All'],
  ];

  return (
    <div className="sv-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search shop name, location or phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {searchTerm ? <button type="button" className="clear-btn" onClick={() => setSearchTerm('')}><X className="item-icon" /> Clear</button> : null}
        </div>
        <div className="filter-group right">
          <div className="u360-chips">
            {tabs.map(([value, label]) => (
              <button key={value} type="button" className={`u360-chip ${status === value ? 'on' : ''}`} onClick={() => setStatus(value)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      {notice ? <div className="u360-notice">{notice}</div> : null}

      {loading && !data ? (
        <div className="loading">Loading verification queue...</div>
      ) : !data?.shops?.length ? (
        <div className="table-container"><div className="empty-state">{status === 'pending' ? 'No shops waiting for verification' : 'No shops here'}</div></div>
      ) : (
        <>
          <div className="inbox-list">
            {data.shops.map((shop) => {
              const open = openId === shop.id;
              const waited = waitingDays(shop.submittedAt);
              return (
                <article key={shop.id} className={`card inbox-card sv-card sv-${shop.verificationStatus} ${open ? 'is-open' : ''}`}>
                  <button type="button" className="inbox-card-head" onClick={() => setOpenId(open ? null : shop.id)}>
                    {shop.logo ? <img className="u360-thumb round" src={mediaUrl(shop.logo)} alt="" /> : <span className="u360-thumb round" />}
                    <div className="inbox-card-main">
                      <div className="inbox-card-title">{shop.name}</div>
                      <div className="inbox-card-sub sv-sub">
                        <span>{shop.owner?.name || shop.owner?.phone || 'Unknown owner'}</span>
                        {shop.location ? <span><MapPin className="item-icon" aria-hidden /> {shop.location}</span> : null}
                        {shop.phone ? <span><Phone className="item-icon" aria-hidden /> {shop.phone}</span> : null}
                        <span><CalendarDays className="item-icon" aria-hidden /> Shop since {fmtDate(shop.createdAt)}</span>
                      </div>
                    </div>
                    <div className="user-badges">
                      {shop.documents.length ? <span className="status-badge">{shop.documents.length} doc{shop.documents.length === 1 ? '' : 's'}</span> : null}
                      {shop.hasTaxId ? <span className="status-badge">PAN/VAT</span> : null}
                      {shop.verificationStatus === 'pending' && waited !== null ? (
                        <span className={`status-badge ${waited >= 3 ? 'open' : 'pending'}`}><Clock className="item-icon" aria-hidden /> {waited === 0 ? 'Today' : `${waited}d waiting`}</span>
                      ) : null}
                      <span className={`status-badge ${shop.verificationStatus === 'approved' ? 'verified' : shop.verificationStatus === 'rejected' ? 'rejected' : 'pending'}`}>
                        {shop.verificationStatus === 'approved' ? 'Verified' : shop.verificationStatus}
                      </span>
                    </div>
                  </button>
                  {shop.verificationStatus === 'rejected' && shop.verificationNotes && !open ? (
                    <p className="sv-reject-note">Owner sees: {shop.verificationNotes}</p>
                  ) : null}
                  {open ? <ReviewPanel shop={shop} onSaved={onSaved} /> : null}
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
