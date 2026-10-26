import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  Clock,
  EyeOff,
  MessageSquareOff,
  MessageSquareWarning,
  Package,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { adminPath } from '../routes';
import { mediaUrl } from '../../config';

const LIMIT = 20;
const CATEGORY_LABELS = {
  advance_payment: 'Advance payment',
  off_platform: 'Off-platform',
  otp_ask: 'OTP / PIN ask',
  fees: 'Fake fees',
  custom: 'Custom words',
};
const STATUS_TABS = [
  { value: 'open', label: 'Open' },
  { value: 'actioned', label: 'Actioned' },
  { value: 'dismissed', label: 'Dismissed' },
  { value: 'all', label: 'All' },
];
const REASON_PRESETS = {
  warn: ['Asked the buyer to pay in advance.', 'Tried to move the chat to WhatsApp/Viber.', 'Asked for an OTP or PIN.'],
  restrict_chat: ['Repeatedly asked for advance payment.', 'Asked for an OTP/PIN code.', 'Pushed buyers off-platform after a warning.'],
  strike: ['Advance-payment scam attempt.', 'OTP phishing attempt.', 'Fake courier/customs fee scam.'],
};
const ACTION_COPY = {
  warn: { title: 'Send safety warning', button: 'Send warning', hint: 'Sends an in-app warning only. No restriction. Good first step.' },
  restrict_chat: { title: 'Restrict chat', button: 'Restrict chat', hint: 'The sender cannot send messages until it ends. They get a notification.' },
  strike: { title: 'Add strike', button: 'Add strike', hint: '1 = warning, 2 = 7-day suspension, 3 = permanent suspension.' },
};

const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const fmtDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function Highlighted({ text, matches }) {
  const phrases = matches.flatMap((m) => m.phrases).filter(Boolean);
  if (!phrases.length) return text;
  const re = new RegExp(`(${phrases.map(escapeRegex).join('|')})`, 'gi');
  return text.split(re).map((part, index) => (
    index % 2 === 1 ? <mark key={index} className="scam-mark">{part}</mark> : <Fragment key={index}>{part}</Fragment>
  ));
}

function ActionModal({ flag, action, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [days, setDays] = useState(3);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const copy = ACTION_COPY[action];

  const submit = async () => {
    if (!reason.trim()) {
      setError('Reason is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const { data } = await api.post(`/moderation/scam/${flag.id}/action`, {
        action,
        reason: reason.trim(),
        days: action === 'restrict_chat' ? days : undefined,
      });
      onDone(data.summary);
    } catch (err) {
      setError(errorText(err, 'Action failed'));
      setSaving(false);
    }
  };

  return (
    <Modal
      icon={action === 'warn' ? AlertTriangle : action === 'restrict_chat' ? MessageSquareOff : ShieldAlert}
      tone={action === 'warn' ? 'warning' : 'danger'}
      title={`${copy.title}: ${flag.sender.name || flag.sender.phone}`}
      subtitle={`${copy.hint} All open flags from this sender will be marked actioned.`}
      size="sm"
      busy={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className={`btn ${action === 'warn' ? 'btn-primary' : 'u360-danger-btn'}`} disabled={saving}>
            {saving ? 'Saving…' : copy.button}
          </button>
        </>
      )}
    >
      {action === 'restrict_chat' ? (
        <div className="form-group">
          <label>Duration</label>
          <div className="u360-chips">
            {[1, 3, 7, 14, 30].map((option) => (
              <button key={option} type="button" className={`u360-chip ${days === option ? 'on' : ''}`} onClick={() => setDays(option)}>
                {option} day{option === 1 ? '' : 's'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="form-group">
        <label htmlFor="scam-reason">Reason (shown to the user)</label>
        <div className="u360-chips scam-presets">
          {REASON_PRESETS[action].map((preset) => (
            <button key={preset} type="button" className={`u360-chip ${reason === preset ? 'on' : ''}`} onClick={() => setReason(preset)}>{preset}</button>
          ))}
        </div>
        <textarea id="scam-reason" className="form-textarea" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {error ? <div className="u360-error">{error}</div> : null}
    </Modal>
  );
}

function FlagCard({ flag, onAction, onReview, busy }) {
  const reviewed = flag.review.status;
  return (
    <article className={`card scam-card ${reviewed ? `is-${reviewed}` : ''}`}>
      <header className="scam-card-head">
        <div className="scam-sender">
          {flag.sender.avatarUrl
            ? <img className="user-avatar-small" src={mediaUrl(flag.sender.avatarUrl)} alt="" />
            : <span className="user-avatar-small">{(flag.sender.name || flag.sender.phone || '?').charAt(0).toUpperCase()}</span>}
          <div>
            {flag.sender.id
              ? <Link className="user-name scam-link" to={adminPath(`users/${flag.sender.id}`)}>{flag.sender.name || 'No name'}</Link>
              : <span className="user-name">{flag.sender.name}</span>}
            <div className="user-email">{flag.sender.phone}</div>
          </div>
        </div>
        <div className="user-badges">
          {flag.sender.status === 'suspended' ? <span className="status-badge suspended">Suspended</span> : null}
          {flag.sender.chatRestricted ? <span className="status-badge pending">Chat locked</span> : null}
          {flag.sender.strikes ? <span className="status-badge pending">{flag.sender.strikes} strike{flag.sender.strikes === 1 ? '' : 's'}</span> : null}
          {flag.chatFlags > 1 ? <span className="status-badge open">{flag.chatFlags} flags in this chat</span> : null}
        </div>
      </header>

      <div className="scam-bubble">
        <Highlighted text={flag.text} matches={flag.matches} />
        {flag.deleted ? <span className="scam-meta-tag">deleted by sender</span> : null}
        {flag.edited ? <span className="scam-meta-tag">edited</span> : null}
      </div>

      <div className="scam-meta">
        {flag.matches.map((match) => (
          <span key={match.category} className="scam-cat">
            <AlertTriangle className="item-icon" aria-hidden /> {CATEGORY_LABELS[match.category] || match.category}
          </span>
        ))}
        <span><Clock className="item-icon" aria-hidden /> {fmtDateTime(flag.createdAt)}</span>
        {flag.recipient ? <span>to {flag.recipient.name || 'user'}</span> : null}
        {flag.listing ? <span><Package className="item-icon" aria-hidden /> {flag.listing.title}</span> : null}
      </div>

      {reviewed ? (
        <div className={`scam-review ${reviewed}`}>
          {reviewed === 'actioned' ? <ShieldCheck className="item-icon" aria-hidden /> : <EyeOff className="item-icon" aria-hidden />}
          <span>
            {reviewed === 'actioned' ? 'Actioned' : 'Dismissed'}{flag.review.by ? ` by ${flag.review.by}` : ''} · {fmtDateTime(flag.review.at)}
            {flag.review.note ? ` · ${flag.review.note}` : ''}
          </span>
          <button type="button" className="action-btn dismiss" disabled={busy} onClick={() => onReview(flag, '')}>
            <RotateCcw className="item-icon" aria-hidden /> Reopen
          </button>
        </div>
      ) : (
        <div className="scam-actions">
          <button type="button" className="action-btn dismiss" disabled={busy} onClick={() => onReview(flag, 'dismissed')}>
            <EyeOff className="item-icon" aria-hidden /> False alarm
          </button>
          <span className="inbox-spacer" />
          {flag.sender.id ? (
            <>
              <button type="button" className="action-btn view" onClick={() => onAction(flag, 'warn')}>
                <ShieldAlert className="item-icon" aria-hidden /> Warn
              </button>
              {!flag.sender.chatRestricted ? (
                <button type="button" className="action-btn suspend" onClick={() => onAction(flag, 'restrict_chat')}>
                  <MessageSquareOff className="item-icon" aria-hidden /> Restrict chat
                </button>
              ) : null}
              <button type="button" className="action-btn suspend" onClick={() => onAction(flag, 'strike')}>
                <Ban className="item-icon" aria-hidden /> Strike
              </button>
            </>
          ) : null}
        </div>
      )}
    </article>
  );
}

export default function ScamMonitor() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('open');
  const [days, setDays] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');
  const [sender, setSender] = useState(null);
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const debounced = useDebounce(searchTerm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/moderation/scam', {
        params: { status, days, q: debounced || undefined, sender: sender?.id, page, limit: LIMIT },
      });
      setData(response.data);
    } catch (error) {
      setNotice(errorText(error, 'Could not load flagged chats'));
    } finally {
      setLoading(false);
    }
  }, [status, days, debounced, sender, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [status, days, debounced, sender]);

  const flash = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4000);
  };

  const review = async (flag, next) => {
    setBusyId(flag.id);
    try {
      await api.patch(`/moderation/scam/${flag.id}`, { status: next });
      flash(next === 'dismissed' ? 'Marked as false alarm' : 'Reopened');
      await load();
    } catch (error) {
      flash(errorText(error, 'Could not update the flag'));
    } finally {
      setBusyId(null);
    }
  };

  const summary = data?.summary || { open: 0, last24h: 0, byCategory: {} };
  const categories = Object.entries(summary.byCategory || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="scam-page">
      <div className="u360-banner info">
        <EyeOff className="item-icon" aria-hidden />
        <div>
          <strong>Only flagged messages are shown, never the full chat.</strong>
          <span>Messages are flagged automatically when they mention advance payment, WhatsApp/Viber, OTP/PIN, or courier fees. Every view is recorded in the Activity log.</span>
        </div>
      </div>

      <div className="stats-grid u360-stats">
        <div className="stat-card" style={{ '--stat-accent': '#DC2626' }}>
          <div className="stat-icon" style={{ backgroundColor: '#DC262618', color: '#DC2626' }}><MessageSquareWarning className="item-icon" aria-hidden /></div>
          <div className="stat-content"><h3>Open flags</h3><p className="stat-value">{summary.open}</p><div className="stat-trend">Last {summary.windowDays || days} days</div></div>
        </div>
        <div className="stat-card" style={{ '--stat-accent': '#D97706' }}>
          <div className="stat-icon" style={{ backgroundColor: '#D9770618', color: '#D97706' }}><Clock className="item-icon" aria-hidden /></div>
          <div className="stat-content"><h3>Last 24 hours</h3><p className="stat-value">{summary.last24h}</p><div className="stat-trend">New flagged messages</div></div>
        </div>
        {categories.slice(0, 2).map(([key, count]) => (
          <div key={key} className="stat-card" style={{ '--stat-accent': '#7C3AED' }}>
            <div className="stat-icon" style={{ backgroundColor: '#7C3AED18', color: '#7C3AED' }}><AlertTriangle className="item-icon" aria-hidden /></div>
            <div className="stat-content"><h3>{CATEGORY_LABELS[key] || key}</h3><p className="stat-value">{count}</p><div className="stat-trend">Messages in window</div></div>
          </div>
        ))}
      </div>

      {notice ? <div className="u360-notice">{notice}</div> : null}

      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search sender name or phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {sender ? (
            <button type="button" className="clear-btn" onClick={() => setSender(null)}>
              <X className="item-icon" /> Sender: {sender.name || sender.phone}
            </button>
          ) : null}
        </div>
        <div className="filter-group right">
          <div className="u360-chips">
            {STATUS_TABS.map((tab) => (
              <button key={tab.value} type="button" className={`u360-chip ${status === tab.value ? 'on' : ''}`} onClick={() => setStatus(tab.value)}>{tab.label}</button>
            ))}
          </div>
          <select className="form-select scam-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={1}>24 hours</option>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      <div className="scam-layout">
        <div className="scam-list">
          {loading && !data ? (
            <div className="loading">Loading flagged chats...</div>
          ) : !data?.flags?.length ? (
            <div className="table-container"><div className="empty-state">{status === 'open' ? 'No open scam flags. All clear.' : 'Nothing here'}</div></div>
          ) : (
            <>
              {data.flags.map((flag) => (
                <FlagCard key={flag.id} flag={flag} busy={busyId === flag.id} onReview={review} onAction={(f, action) => setModal({ flag: f, action })} />
              ))}
              <Pagination page={page} totalPages={data.totalPages || 1} total={data.total || 0} limit={LIMIT} onPageChange={setPage} />
            </>
          )}
        </div>

        <aside className="card u360-section scam-aside">
          <header className="u360-section-head">
            <ShieldAlert className="item-icon" aria-hidden />
            <h3>Most flagged senders</h3>
          </header>
          {data?.topSenders?.length ? (
            <ul className="u360-list">
              {data.topSenders.map((row) => (
                <li key={row.id}>
                  <button type="button" className="scam-top-btn" onClick={() => setSender(row)}>
                    <div className="u360-li-main">
                      <span className="u360-li-title">{row.name || row.phone || 'No name'}</span>
                      <span className="u360-li-sub">{row.flags} open flag{row.flags === 1 ? '' : 's'} · {row.chats} chat{row.chats === 1 ? '' : 's'}</span>
                    </div>
                    {row.status === 'suspended' ? <span className="status-badge suspended">Suspended</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="u360-empty">No repeat senders</div>
          )}
        </aside>
      </div>

      {modal ? (
        <ActionModal
          flag={modal.flag}
          action={modal.action}
          onClose={() => setModal(null)}
          onDone={(summaryText) => {
            setModal(null);
            flash(summaryText || 'Done');
            load();
          }}
        />
      ) : null}
    </div>
  );
}
