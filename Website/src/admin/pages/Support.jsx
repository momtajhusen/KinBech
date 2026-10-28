import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Clock, LifeBuoy, Phone, RotateCcw, Search, Send, Trash2, X } from 'lucide-react';
import api from '../services/api';
import { confirmAction, toast } from '../components/Feedback';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { adminPath } from '../routes';

const LIMIT = 20;
const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const fmtDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');
const fmtDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');

function daysLeft(value) {
  if (!value) return null;
  return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000));
}

function TicketCard({ ticket, open, onToggle, onSaved }) {
  const [reply, setReply] = useState('');
  const [note, setNote] = useState(ticket.adminNote || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (body) => {
    setSaving(true);
    setError('');
    try {
      const response = await api.patch(`/auth/admin/support-tickets/${ticket.id}`, body);
      setReply('');
      onSaved(response.data.ticket);
    } catch (err) {
      setError(errorText(err, 'Could not update the ticket'));
    } finally {
      setSaving(false);
    }
  };

  const resolved = ticket.status === 'resolved';
  const noteChanged = note.trim() !== (ticket.adminNote || '');

  return (
    <article className={`card inbox-card ${resolved ? 'is-resolved' : ''} ${open ? 'is-open' : ''}`}>
      <button type="button" className="inbox-card-head" onClick={onToggle}>
        <span className={`inbox-dot ${resolved ? 'resolved' : 'open'}`} />
        <div className="inbox-card-main">
          <div className="inbox-card-title">{ticket.subject}</div>
          <div className="inbox-card-sub">
            {ticket.name || 'Unknown user'}{ticket.phone ? ` · ${ticket.phone}` : ''} · {fmtDateTime(ticket.createdAt)}
          </div>
          {!open ? <p className="inbox-card-preview">{ticket.message}</p> : null}
        </div>
        {ticket.reply ? <span className="status-badge sent">Replied</span> : null}
        <span className={`status-badge ${ticket.status}`}>{resolved ? 'Resolved' : 'Open'}</span>
      </button>

      {open ? (
        <div className="inbox-card-body">
          <p className="inbox-message">{ticket.message}</p>
          {ticket.userStatus === 'suspended' ? <div className="u360-banner danger compact">This user is suspended.</div> : null}

          {ticket.reply ? (
            <div className="inbox-reply">
              <div className="inbox-reply-head">
                Reply by {ticket.repliedByName || 'support'} · {fmtDateTime(ticket.repliedAt)}
              </div>
              <p>{ticket.reply}</p>
            </div>
          ) : null}

          <div className="form-group">
            <label>{ticket.reply ? 'Send another reply' : 'Reply to user'} (shown in the app's Contact Us screen)</label>
            <textarea className="form-textarea" rows={3} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply..." />
          </div>
          <div className="form-group">
            <label>Internal note (admins only)</label>
            <textarea className="form-textarea" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was checked, who handled it..." />
          </div>
          {error ? <div className="u360-error">{error}</div> : null}

          <div className="inbox-actions">
            {ticket.userId ? (
              <Link className="action-btn view" to={adminPath(`users/${ticket.userId}`)}>Open user</Link>
            ) : null}
            <span className="inbox-spacer" />
            {noteChanged ? (
              <button type="button" className="action-btn view" disabled={saving} onClick={() => save({ adminNote: note })}>Save note</button>
            ) : null}
            {resolved ? (
              <button type="button" className="action-btn dismiss" disabled={saving} onClick={() => save({ status: 'open', ...(noteChanged ? { adminNote: note } : {}) })}>
                <RotateCcw className="item-icon" aria-hidden /> Reopen
              </button>
            ) : (
              <button type="button" className="action-btn reinstate" disabled={saving} onClick={() => save({ status: 'resolved', ...(noteChanged ? { adminNote: note } : {}) })}>
                <CheckCircle2 className="item-icon" aria-hidden /> Resolve
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !reply.trim()}
              onClick={() => save({ reply: reply.trim(), status: 'resolved', ...(noteChanged ? { adminNote: note } : {}) })}
            >
              <Send className="item-icon" aria-hidden /> Reply & resolve
            </button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function TicketsTab({ initialQuery }) {
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState({ open: 0, resolved: 0 });
  const [status, setStatus] = useState('open');
  const [searchTerm, setSearchTerm] = useState(initialQuery);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  const debounced = useDebounce(searchTerm);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/admin/support-tickets', {
        params: { status: status === 'all' ? undefined : status, q: debounced || undefined, page, limit: LIMIT },
      });
      setTickets(response.data.tickets || []);
      setCounts(response.data.counts || { open: 0, resolved: 0 });
      setTotal(response.data.total || 0);
      setTotalPages(response.data.totalPages || 1);
    } catch (error) {
      console.error('Failed to load tickets:', error);
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

  const onSaved = (ticket) => {
    setTickets((prev) => prev.map((row) => (row.id === ticket.id ? ticket : row)));
    load();
  };

  const statusTabs = [
    { value: 'open', label: `Open (${counts.open})` },
    { value: 'resolved', label: `Resolved (${counts.resolved})` },
    { value: 'all', label: 'All' },
  ];

  return (
    <>
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search subject, message, name or phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>
        <div className="filter-group right">
          <div className="u360-chips">
            {statusTabs.map((tab) => (
              <button key={tab.value} type="button" className={`u360-chip ${status === tab.value ? 'on' : ''}`} onClick={() => setStatus(tab.value)}>{tab.label}</button>
            ))}
          </div>
          {searchTerm ? (
            <button type="button" className="clear-btn" onClick={() => setSearchTerm('')}><X className="item-icon" /> Clear</button>
          ) : null}
        </div>
      </div>

      {loading && !tickets.length ? (
        <div className="loading">Loading tickets...</div>
      ) : tickets.length === 0 ? (
        <div className="table-container"><div className="empty-state">{status === 'open' ? 'No open tickets. Inbox zero.' : 'No tickets found'}</div></div>
      ) : (
        <>
          <div className="inbox-list">
            {tickets.map((ticket) => (
              <TicketCard
                key={ticket.id}
                ticket={ticket}
                open={openId === ticket.id}
                onToggle={() => setOpenId(openId === ticket.id ? null : ticket.id)}
                onSaved={onSaved}
              />
            ))}
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
        </>
      )}
    </>
  );
}

function DeletionsTab() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, deleted: 0 });
  const [graceDays, setGraceDays] = useState(30);
  const [scope, setScope] = useState('pending');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/admin/deletions', { params: { scope, page, limit: LIMIT } });
      setRows(response.data.requests || []);
      setCounts(response.data.counts || { pending: 0, deleted: 0 });
      setGraceDays(response.data.graceDays || 30);
      setTotal(response.data.total || 0);
      setTotalPages(response.data.totalPages || 1);
    } catch (error) {
      console.error('Failed to load deletion requests:', error);
    } finally {
      setLoading(false);
    }
  }, [scope, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [scope]);

  const cancel = async (row) => {
    const name = row.name || row.phone;
    const ok = await confirmAction({
      title: `Cancel deletion for ${name}?`,
      message: 'The account stays, and their hidden listings and shops come back.',
      confirmLabel: 'Keep the account',
      cancelLabel: 'Go back',
      tone: 'primary',
      icon: 'restore',
    });
    if (!ok) return;
    setBusyId(row.id);
    try {
      await api.post(`/auth/admin/deletions/${row.id}/cancel`);
      toast.success(`${name}'s account is kept`, { title: 'Deletion cancelled' });
      await load();
    } catch {
      /* the API layer shows the error */
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="filter-bar">
        <div className="filter-group left">
          <p className="form-hint inbox-hint">
            Users can delete their account from the app. Listings and shops are hidden right away, and everything is purged after {graceDays} days unless they sign in again.
          </p>
        </div>
        <div className="filter-group right">
          <div className="u360-chips">
            <button type="button" className={`u360-chip ${scope === 'pending' ? 'on' : ''}`} onClick={() => setScope('pending')}>Scheduled ({counts.pending})</button>
            <button type="button" className={`u360-chip ${scope === 'deleted' ? 'on' : ''}`} onClick={() => setScope('deleted')}>Deleted ({counts.deleted})</button>
          </div>
        </div>
      </div>

      {loading && !rows.length ? (
        <div className="loading">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="table-container"><div className="empty-state">{scope === 'pending' ? 'No accounts are scheduled for deletion' : 'No deleted accounts'}</div></div>
      ) : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Requested</th>
                  <th>{scope === 'pending' ? 'Deletes on' : 'Deleted on'}</th>
                  <th>Listings</th>
                  <th>Shops</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const left = daysLeft(row.scheduledFor);
                  return (
                    <tr key={row.id}>
                      <td>
                        <div className="user-name">{row.name || 'Deleted user'}</div>
                        {row.phone ? <div className="user-email"><Phone className="item-icon" aria-hidden /> {row.phone}</div> : null}
                      </td>
                      <td>{fmtDate(row.requestedAt)}</td>
                      <td>
                        {scope === 'pending' ? (
                          <>
                            {fmtDate(row.scheduledFor)}
                            <div className={`inbox-days ${left <= 3 ? 'soon' : ''}`}><Clock className="item-icon" aria-hidden /> {left} day{left === 1 ? '' : 's'} left</div>
                          </>
                        ) : fmtDate(row.deletedAt)}
                      </td>
                      <td>{row.listingsCount}</td>
                      <td>{row.shopsCount}</td>
                      <td>
                        <div className="action-buttons">
                          <Link className="action-btn view" to={adminPath(`users/${row.id}`)}>Details</Link>
                          {scope === 'pending' ? (
                            <button type="button" className="action-btn reinstate" disabled={busyId === row.id} onClick={() => cancel(row)}>Cancel deletion</button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} limit={LIMIT} onPageChange={setPage} />
        </>
      )}
    </>
  );
}

export default function Support() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'deletions' ? 'deletions' : 'tickets';
  const setTab = (next) => setParams(next === 'tickets' ? {} : { tab: next });

  return (
    <div className="support-page">
      <div className="inbox-tabs">
        <button type="button" className={`inbox-tab ${tab === 'tickets' ? 'on' : ''}`} onClick={() => setTab('tickets')}>
          <LifeBuoy className="item-icon" aria-hidden /> Support tickets
        </button>
        <button type="button" className={`inbox-tab ${tab === 'deletions' ? 'on' : ''}`} onClick={() => setTab('deletions')}>
          <Trash2 className="item-icon" aria-hidden /> Deletion requests
        </button>
      </div>
      {tab === 'tickets' ? <TicketsTab initialQuery={params.get('q') || ''} /> : <DeletionsTab />}
    </div>
  );
}
