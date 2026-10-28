import { useCallback, useEffect, useState } from 'react';
import { Award, ChevronDown, EyeOff, Filter, Gauge, Package, RefreshCw, Search, ShieldAlert, Undo2 } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import { confirmAction, errorMessage, toast } from '../components/Feedback';
import Pagination from '../components/Pagination';
import PromptModal from '../components/PromptModal';
import RecordModal from '../components/RecordModal';
import useDebounce from '../utils/useDebounce';

const TABS = [
  { key: 'sellers', label: 'Sellers' },
  { key: 'hides', label: 'Auto-hide' },
  { key: 'stock', label: 'Store stock' },
  { key: 'clusters', label: 'Linked accounts' },
  { key: 'settings', label: 'Settings' },
];

const TIER_LABELS = {
  top: 'Top Seller',
  trusted: 'Trusted',
  standard: 'Standard',
  watch: 'Watch',
  restricted: 'Restricted',
  new: 'New',
};

const TIER_BADGE = {
  top: 'verified',
  trusted: 'active',
  standard: 'sent',
  watch: 'pending',
  restricted: 'suspended',
  new: 'under-review',
};

const PART_LABELS = {
  responsiveness: 'Responsiveness',
  quality: 'Listing quality',
  stock: 'Stock accuracy',
  reliability: 'Reliability',
  feedback: 'Buyer feedback',
  activity: 'Activity',
  verification: 'Verification',
};

const HIDE_REASONS = {
  not_available_reports: 'Buyers reported not available',
  likely_sold: 'Looked sold, no reply',
  seller_inactive: 'Seller inactive',
  expired: 'Old and unconfirmed',
  out_of_stock: 'Out of stock 7+ days',
  stock_check_failed: 'Stock check failed',
  stock_unconfirmed: 'Stock not confirmed',
  store_inactive: 'Store inactive',
  account_suspended: 'Account suspended',
};

const STOCK_STATES = {
  out_of_stock: 'Out of stock',
  unconfirmed: 'Not confirmed',
  under_check: 'Under check',
  low_stock: 'Low stock',
};

const SETTING_FIELDS = [
  ['autoHideEnabled', 'Auto-hide on', 'bool'],
  ['sellerScoreInRanking', 'Use seller score in ranking', 'bool'],
  ['promptAt', 'Ask seller "still available?" at score'],
  ['rankDownAt', 'Rank down at score'],
  ['hideAt', 'Auto-hide at score'],
  ['hideAfterHours', 'Hours to reply before hide'],
  ['notFoundHide', '"Not available" reports to hide (individual)'],
  ['sellerInactiveHideDays', 'Hide when seller inactive and buyers waiting (days)'],
  ['storeNotFoundCheck', '"Not available" reports to check store item'],
  ['storeCheckHours', 'Hours for store to confirm'],
  ['storeUnconfirmedDays', 'Store stock counts as unconfirmed after (days)'],
  ['storeConfirmHideDays', 'Hide unconfirmed store item with buyers waiting after (days)'],
  ['storeInactiveDays', 'Hide inactive store with buyers waiting after (days)'],
  ['stockReminderDays', 'Stock reminder every (days)'],
  ['watchDailyListings', 'Watch tier: listings per day'],
];

const POINT_LABELS = {
  unansweredBuyers: '3+ buyers unanswered',
  soldWord: 'Seller said "sold" in chat',
  notFound: '2+ "not available" reports',
  notFoundExtra: 'Each extra report',
  sellerInactive: 'Seller inactive 5+ days',
  stale: 'Old and unconfirmed',
  otherMeetup: 'Meetup scheduled with a buyer',
  confirmedRecently: 'Seller confirmed (minus)',
  responsive: 'Seller active and replying (minus)',
};

const STRIKE_REASONS = [
  'Repeated fake or misleading listings.',
  'Asked buyers for advance payment.',
  'Did not show up for confirmed meetups.',
  'Abusive messages to buyers.',
];

const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const when = (value) => (value ? new Date(value).toLocaleString() : '—');

function OverrideModal({ row, onClose, onSaved }) {
  const [score, setScore] = useState(row.override?.score != null ? String(row.override.score) : '');
  const [note, setNote] = useState(row.override?.note || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const clearing = score.trim() === '';

  const save = async () => {
    const value = Number(score);
    if (!clearing && (!Number.isFinite(value) || value < 0 || value > 100)) {
      setError('Score must be between 0 and 100');
      return;
    }
    if (!clearing && !note.trim()) {
      setError('Write why. It is saved in the audit log.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.patch(`/moderation/trust/sellers/${row.id}/override`, { score: clearing ? null : value, note: clearing ? '' : note.trim() });
      onSaved(clearing ? `Override cleared for ${row.name}` : `Score for ${row.name} set to ${value}`);
    } catch (err) {
      setError(errorText(err, 'Override failed'));
      setBusy(false);
    }
  };

  return (
    <Modal
      icon={Gauge}
      title={`Override score: ${row.shop?.name || row.name}`}
      subtitle={`Computed score is ${row.score}. An override replaces it until you clear it.`}
      size="sm"
      busy={busy}
      onClose={onClose}
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : clearing ? 'Clear override' : 'Save override'}
          </button>
        </>
      )}
    >
      <div className="form-group">
        <label htmlFor="ov-score">New score (0–100)</label>
        <input id="ov-score" className="form-input" type="number" min="0" max="100" value={score} onChange={(e) => setScore(e.target.value)} placeholder="Leave empty to clear the override" />
      </div>
      {!clearing ? (
        <div className="form-group">
          <label htmlFor="ov-note">Why? (saved in the audit log)</label>
          <textarea id="ov-note" className="form-textarea" rows={3} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Verified shop, score low only because it is new" />
        </div>
      ) : null}
      {error ? <div className="u360-error">{error}</div> : null}
    </Modal>
  );
}

function StatCard({ icon: Icon, title, value, hint, color }) {
  return (
    <div className="stat-card" style={{ '--stat-accent': color }}>
      <div className="stat-icon" style={{ backgroundColor: `${color}18`, color }}>
        <Icon className="item-icon" aria-hidden />
      </div>
      <div className="stat-content">
        <h3>{title}</h3>
        <p className="stat-value">{value}</p>
        {hint ? <div className="stat-trend">{hint}</div> : null}
      </div>
    </div>
  );
}

function SellersTab() {
  const [rows, setRows] = useState([]);
  const [tiers, setTiers] = useState({});
  const [loading, setLoading] = useState(true);
  const [tier, setTier] = useState('all');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState('high');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const search = useDebounce(q);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/moderation/trust/sellers', {
        params: { tier, type, sort: sort === 'low' ? 'low' : undefined, q: search || undefined, page, limit: 25 },
      });
      setRows(data.sellers || []);
      setTiers(data.tiers || {});
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      toast.error(errorMessage(error, 'Please refresh the page.'), { title: 'Could not load sellers' });
    } finally {
      setLoading(false);
    }
  }, [tier, type, sort, search, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [tier, type, sort, search]);

  const recomputeAll = async () => {
    const ok = await confirmAction({
      title: 'Recompute every seller score?',
      message: 'Scores normally update every night. A full run can take a minute.',
      confirmLabel: 'Recompute now',
      tone: 'primary',
      icon: 'model_training',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { data } = await api.post('/moderation/trust/recompute');
      toast.success(`Scored ${data.count} sellers`, { title: 'Seller scores updated' });
      load();
    } catch {
      /* the API layer shows the error */
    } finally {
      setBusy(false);
    }
  };

  const [overrideRow, setOverrideRow] = useState(null);
  const [strikeRow, setStrikeRow] = useState(null);

  const strike = async (reason) => {
    const { data } = await api.post(`/moderation/trust/sellers/${strikeRow.id}/strike`, { reason });
    toast.success(`${strikeRow.name}: ${data.action.replace('_', ' ')}`, { title: `Strike ${data.strikes} added` });
    setStrikeRow(null);
    setSelected(null);
    load();
  };

  return (
    <>
      <div className="stats-grid">
        {['top', 'trusted', 'standard', 'watch', 'restricted', 'new'].map((key) => (
          <button
            type="button"
            key={key}
            className="stat-card"
            style={{ cursor: 'pointer', textAlign: 'left', outline: tier === key ? '2px solid var(--primary)' : 'none' }}
            onClick={() => setTier(tier === key ? 'all' : key)}
          >
            <div className="stat-content">
              <h3>{TIER_LABELS[key]}</h3>
              <p className="stat-value">{tiers[key] || 0}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input className="search-input" placeholder="Search name or phone..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="filter-group right">
          <div className="dropdown-filter">
            <Filter className="filter-icon" />
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All sellers</option>
              <option value="individual">Individual</option>
              <option value="shop">Store</option>
            </select>
            <ChevronDown className="chev-icon" />
          </div>
          <div className="dropdown-filter">
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="high">Highest score</option>
              <option value="low">Lowest score</option>
            </select>
            <ChevronDown className="chev-icon" />
          </div>
          <button type="button" className="clear-btn" onClick={recomputeAll} disabled={busy}>
            <RefreshCw className="item-icon" /> {busy ? 'Scoring…' : 'Recompute'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading sellers...</div>
      ) : rows.length === 0 ? (
        <div className="table-container"><div className="empty-state">No scored sellers yet. Scores are built every night.</div></div>
      ) : (
        <>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Seller</th>
                  <th>Type</th>
                  <th>Score</th>
                  <th>Tier</th>
                  <th>Why</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="reported-item">{row.shop?.name || row.name}</div>
                      <div className="item-id">{row.phone}{row.strikes ? ` · ${row.strikes} strike${row.strikes > 1 ? 's' : ''}` : ''}</div>
                    </td>
                    <td>{row.sellerType === 'shop' ? 'Store' : 'Individual'}</td>
                    <td>
                      <strong>{row.score}</strong>
                      {row.override ? <span className="item-id"> (override)</span> : null}
                      <div className="item-id">{Math.round((row.confidence || 0) * 100)}% data</div>
                    </td>
                    <td>
                      <span className={`status-badge ${TIER_BADGE[row.tier] || ''}`}>{TIER_LABELS[row.tier] || row.tier}</span>
                      {row.pendingTier ? <div className="item-id">→ {TIER_LABELS[row.pendingTier]}?</div> : null}
                    </td>
                    <td className="reason-cell">{(row.reasons || []).slice(0, 2).join(' · ') || '—'}</td>
                    <td>
                      <div className="action-buttons">
                        <button type="button" className="action-btn view" onClick={() => setSelected(row)}>Breakdown</button>
                        <button type="button" className="action-btn take-action" onClick={() => setOverrideRow(row)}>Override</button>
                        <button type="button" className="action-btn dismiss" onClick={() => setStrikeRow(row)}>Strike</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={totalPages} total={total} limit={25} onPageChange={setPage} />
        </>
      )}

      {overrideRow ? (
        <OverrideModal
          row={overrideRow}
          onClose={() => setOverrideRow(null)}
          onSaved={(message) => {
            toast.success(message);
            setOverrideRow(null);
            setSelected(null);
            load();
          }}
        />
      ) : null}
      {strikeRow ? (
        <PromptModal
          icon={ShieldAlert}
          danger
          title={`Strike ${strikeRow.strikes + 1} for ${strikeRow.shop?.name || strikeRow.name}`}
          subtitle="1 = warning, 2 = 7-day suspension, 3 = permanent suspension. The seller is notified."
          field={{ label: 'Reason (shown to the seller)', presets: STRIKE_REASONS, multiline: true, required: true }}
          confirmLabel="Add strike"
          onConfirm={strike}
          onClose={() => setStrikeRow(null)}
        />
      ) : null}
      <RecordModal
        title={selected ? `${selected.shop?.name || selected.name} — ${selected.score}` : ''}
        onClose={() => setSelected(null)}
        rows={selected ? [
          ...Object.entries(PART_LABELS).map(([key, label]) => [label, selected.parts?.[key] == null ? 'No data' : `${selected.parts[key]}/100`]),
          ['Raw score', `${selected.rawScore} (pulled toward 50 at ${Math.round((selected.confidence || 0) * 100)}% data)`],
          ['Reply rate', selected.signals?.replyRate == null ? '—' : `${Math.round(selected.signals.replyRate * 100)}%`],
          ['Median reply', selected.signals?.replyMinutes == null ? '—' : `${selected.signals.replyMinutes} min`],
          ['Deals (90 days)', String(selected.signals?.dealsCompleted ?? 0)],
          ['Auto-hides (90 days)', String(selected.signals?.autoHides ?? 0)],
          ['Active days (30)', String(selected.signals?.activeDays ?? 0)],
          ['Override', selected.override ? `${selected.override.score} — ${selected.override.note}` : '—'],
          ['Why', (selected.reasons || []).join(' · ')],
          ['Computed', when(selected.computedAt)],
        ] : null}
      />
    </>
  );
}

function HidesTab() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/moderation/trust/auto-hides', { params: { days } })
      .then(({ data: body }) => { if (alive) setData(body); })
      .catch((error) => toast.error(errorMessage(error, 'Please refresh the page.'), { title: 'Could not load the auto-hide report' }))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days]);

  if (loading || !data) return <div className="loading">Loading auto-hide report...</div>;
  const highRestore = data.restoreRate > 15;
  return (
    <>
      <div className="filter-bar">
        <div className="filter-group right">
          <div className="dropdown-filter">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <ChevronDown className="chev-icon" />
          </div>
        </div>
      </div>
      <div className="stats-grid">
        <StatCard icon={EyeOff} title="Auto-hidden" value={data.hidden} color="#F59E0B" />
        <StatCard icon={Undo2} title="Restored by seller" value={data.restored} color="#3B82F6" />
        <StatCard
          icon={ShieldAlert}
          title="Restore rate"
          value={`${data.restoreRate}%`}
          hint={highRestore ? 'Above 15%: loosen the thresholds' : 'Healthy (under 15%)'}
          color={highRestore ? '#EF4444' : '#22C55E'}
        />
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr><th>Reason</th><th>Hidden</th><th>Restored</th><th>Still hidden</th><th>Restore rate</th></tr>
          </thead>
          <tbody>
            {data.byReason.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">Nothing was auto-hidden in this period</td></tr>
            ) : data.byReason.map((row) => (
              <tr key={row.reason}>
                <td>{HIDE_REASONS[row.reason] || row.reason}</td>
                <td>{row.hidden}</td>
                <td>{row.restored}</td>
                <td>{row.stillHidden}</td>
                <td>{row.restoreRate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Recent</h3>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr><th>Listing</th><th>Seller</th><th>Reason</th><th>Signals</th><th>Hidden</th><th>Restored</th></tr>
          </thead>
          <tbody>
            {data.recent.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="reported-item">{row.title}</div>
                  <div className="item-id">{row.sellerType === 'shop' ? 'Store' : 'Individual'} · {row.status}</div>
                </td>
                <td>{row.seller?.name || '—'}<div className="item-id">{row.seller?.phone}</div></td>
                <td>{HIDE_REASONS[row.reason] || row.reason}</td>
                <td className="reason-cell">{row.signals.join(' · ') || '—'}</td>
                <td>{when(row.at)}</td>
                <td>{row.restoredAt ? when(row.restoredAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function StockTab() {
  const [state, setState] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.get('/moderation/trust/stock', { params: { state: state || undefined } })
      .then(({ data: body }) => { if (alive) setData(body); })
      .catch((error) => toast.error(errorMessage(error, 'Please refresh the page.'), { title: 'Could not load store stock' }))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [state]);

  if (loading || !data) return <div className="loading">Loading store stock...</div>;
  return (
    <>
      <div className="stats-grid">
        {Object.entries(STOCK_STATES).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className="stat-card"
            style={{ cursor: 'pointer', textAlign: 'left', outline: state === key ? '2px solid var(--primary)' : 'none' }}
            onClick={() => setState(state === key ? '' : key)}
          >
            <div className="stat-content">
              <h3>{label}</h3>
              <p className="stat-value">{data.counts[key] || 0}</p>
            </div>
          </button>
        ))}
      </div>
      {data.worstShops.length ? (
        <>
          <h3 style={{ margin: '0 0 0.5rem' }}>Stores with the most stock problems</h3>
          <div className="table-container" style={{ marginBottom: '1rem' }}>
            <table className="data-table">
              <thead><tr><th>Store</th><th>Items</th><th>Problems</th><th>Accuracy</th></tr></thead>
              <tbody>
                {data.worstShops.map((shop) => (
                  <tr key={shop.id}>
                    <td>{shop.name}</td>
                    <td>{shop.total}</td>
                    <td>{shop.bad}</td>
                    <td>{shop.accuracy}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Item</th><th>Store</th><th>Stock</th><th>State</th><th>Last confirmed</th></tr></thead>
          <tbody>
            {data.listings.length === 0 ? (
              <tr><td colSpan={5} className="empty-state">No store items in this state</td></tr>
            ) : data.listings.map((row) => (
              <tr key={row.id}>
                <td>
                  <div className="reported-item">{row.title}</div>
                  {row.hiddenReason ? <div className="item-id">Hidden: {HIDE_REASONS[row.hiddenReason] || row.hiddenReason}</div> : null}
                </td>
                <td>{row.shop?.name || '—'}</td>
                <td>{row.stock}</td>
                <td>{STOCK_STATES[row.stockState] || row.stockState || '—'}</td>
                <td>{when(row.stockConfirmedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function UserList({ users }) {
  return (
    <div>
      {users.map((u) => (
        <div key={u.id} className="item-id">
          {u.name} {u.phone ? `· ${u.phone}` : ''} {u.status === 'suspended' ? '· suspended' : ''} {u.tier ? `· ${TIER_LABELS[u.tier] || u.tier}` : ''}
        </div>
      ))}
    </div>
  );
}

function ClustersTab() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/moderation/trust/clusters')
      .then(({ data: body }) => setData(body))
      .catch((error) => toast.error(errorMessage(error, 'Please refresh the page.'), { title: 'Could not load linked accounts' }));
  }, []);

  if (!data) return <div className="loading">Loading linked accounts...</div>;
  return (
    <>
      <p className="item-id" style={{ marginBottom: '0.75rem' }}>
        Signals only. Many people in Nepal share a mobile IP, so check the chats and listings before acting.
      </p>
      <h3 style={{ margin: '0 0 0.5rem' }}>Same IP and phone model (30 days)</h3>
      <div className="table-container" style={{ marginBottom: '1rem' }}>
        <table className="data-table">
          <thead><tr><th>Device</th><th>IP</th><th>Accounts</th></tr></thead>
          <tbody>
            {data.devices.length === 0 ? (
              <tr><td colSpan={3} className="empty-state">No linked devices</td></tr>
            ) : data.devices.map((group) => (
              <tr key={`${group.ip}-${group.device}`}>
                <td>{group.device}<div className="item-id">{group.platform}</div></td>
                <td>{group.ip}</td>
                <td><strong>{group.count}</strong><UserList users={group.users} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 style={{ margin: '0 0 0.5rem' }}>Same photo on different accounts</h3>
      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>Photo</th><th>Accounts</th></tr></thead>
          <tbody>
            {data.photos.length === 0 ? (
              <tr><td colSpan={2} className="empty-state">No shared photos</td></tr>
            ) : data.photos.map((group) => (
              <tr key={group.hash}>
                <td className="item-id">{group.file}</td>
                <td><strong>{group.count}</strong><UserList users={group.users} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SettingsTab() {
  const [form, setForm] = useState(null);
  const [defaults, setDefaults] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/moderation/trust/settings')
      .then(({ data }) => { setForm(data.settings); setDefaults(data.defaults); })
      .catch((error) => toast.error(errorMessage(error, 'Please refresh the page.'), { title: 'Could not load trust settings' }));
  }, []);

  if (!form) return <div className="loading">Loading settings...</div>;

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put('/moderation/trust/settings', form);
      setForm(data.settings);
      toast.success('They apply on the next hourly check.', { title: 'Trust settings saved' });
    } catch {
      /* the API layer shows the error */
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="table-container" style={{ padding: '1rem' }} onSubmit={save}>
      <p className="item-id" style={{ marginBottom: '1rem' }}>
        Changes apply on the next hourly check. Keep &quot;ask&quot; ≤ &quot;rank down&quot; ≤ &quot;auto-hide&quot;.
        Listings are never hidden for age alone: a hide needs buyers waiting for a reply or &quot;not available&quot; reports.
        Turn on seller-score ranking only after the scores look right for a few weeks.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
        {SETTING_FIELDS.map(([key, label, kind]) => (
          <div className="form-group" key={key}>
            <label htmlFor={`trust-${key}`}>{label}</label>
            {kind === 'bool' ? (
              <select
                id={`trust-${key}`}
                value={form[key] ? 'on' : 'off'}
                onChange={(e) => setForm({ ...form, [key]: e.target.value === 'on' })}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            ) : (
              <input
                id={`trust-${key}`}
                type="number"
                min="0"
                value={form[key]}
                placeholder={String(defaults?.[key] ?? '')}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            )}
          </div>
        ))}
      </div>
      <h3 style={{ margin: '1.25rem 0 0.5rem' }}>Sold-likelihood points</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
        {Object.entries(POINT_LABELS).map(([key, label]) => (
          <div className="form-group" key={key}>
            <label htmlFor={`trust-point-${key}`}>{label}</label>
            <input
              id={`trust-point-${key}`}
              type="number"
              value={form.points?.[key] ?? ''}
              placeholder={String(defaults?.points?.[key] ?? '')}
              onChange={(e) => setForm({ ...form, points: { ...form.points, [key]: e.target.value } })}
            />
          </div>
        ))}
      </div>
      <button type="submit" className="btn-primary" style={{ marginTop: '1rem' }} disabled={saving}>
        {saving ? 'Saving…' : 'Save trust settings'}
      </button>
    </form>
  );
}

export default function Trust() {
  const [tab, setTab] = useState('sellers');
  return (
    <div className="reports-page">
      <div className="filter-bar">
        <div className="filter-group left" style={{ gap: '0.5rem' }}>
          {TABS.map((item) => (
            <button
              type="button"
              key={item.key}
              className={tab === item.key ? 'btn-primary' : 'clear-btn'}
              onClick={() => setTab(item.key)}
            >
              {item.key === 'sellers' ? <Award className="item-icon" /> : null}
              {item.key === 'hides' ? <EyeOff className="item-icon" /> : null}
              {item.key === 'stock' ? <Package className="item-icon" /> : null}
              {' '}{item.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'sellers' ? <SellersTab /> : null}
      {tab === 'hides' ? <HidesTab /> : null}
      {tab === 'stock' ? <StockTab /> : null}
      {tab === 'clusters' ? <ClustersTab /> : null}
      {tab === 'settings' ? <SettingsTab /> : null}
    </div>
  );
}
