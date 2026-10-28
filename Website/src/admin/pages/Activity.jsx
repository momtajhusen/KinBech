import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Filter, Search, X } from 'lucide-react';
import api from '../services/api';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { ROLE_LABELS } from '../utils/access';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

const GROUP_LABELS = {
  admin: 'Admin accounts',
  user: 'Users',
  listings: 'Listings',
  shops: 'Shops',
  reports: 'Reports',
  reviews: 'Reviews',
  categories: 'Categories',
  moderation: 'Moderation',
  notifications: 'Notifications',
  errors: 'Error log',
  ai: 'AI',
  settings: 'Settings',
  session: 'Sessions',
};

const isWarning = (action) => /failed|delete|suspend|reset|disable|new_ip/.test(action);

export default function Activity() {
  const [logs, setLogs] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm);
  const [selected, setSelected] = useState(null);
  const panelRef = useRef(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 30;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/admin/audit', {
        params: {
          action: group || undefined,
          q: debouncedSearch || undefined,
          from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
          to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
          page,
          limit,
        },
      });
      setLogs(response.data.logs || []);
      setGroups(response.data.actionGroups || []);
      setTotal(response.data.total || 0);
      setTotalPages(response.data.totalPages || 1);
    } catch (err) {
      console.error('Failed to load activity', err);
    } finally {
      setLoading(false);
    }
  }, [group, debouncedSearch, from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [group, debouncedSearch, from, to]);

  // On narrower screens the panel sits below the table, so bring it into view.
  useEffect(() => {
    const panel = panelRef.current;
    if (selected && panel && panel.getBoundingClientRect().top > window.innerHeight * 0.6) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selected]);

  const filtered = group || searchTerm || from || to;

  return (
    <div className="error-log-page activity-page">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>Activity</h2>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            Who changed what in the admin panel, with time and IP. {total ? `${total} entries` : ''}
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search by admin, action, target or IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        <div className="filter-group right">
          <div className="dropdown-filter">
            <Filter className="filter-icon" />
            <select value={group} onChange={(e) => setGroup(e.target.value)}>
              <option value="">All areas</option>
              {groups.map((name) => (
                <option key={name} value={name}>{GROUP_LABELS[name] || name}</option>
              ))}
            </select>
            <ChevronDown className="chev-icon" />
          </div>
          <input type="date" className="form-input activity-date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <input type="date" className="form-input activity-date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {filtered ? (
            <button className="clear-btn" onClick={() => { setGroup(''); setSearchTerm(''); setFrom(''); setTo(''); }}>
              <X className="item-icon" /> Clear
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading activity…</div>
      ) : (
        <div className="error-log-layout">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className={selected?.id === log.id ? 'row-selected' : ''}
                    onClick={() => setSelected(log)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{formatWhen(log.createdAt)}</td>
                    <td>
                      <div>{log.actorName || 'System'}</div>
                      <div className="form-hint">{ROLE_LABELS[log.actorRole] || log.actorRole || ''}</div>
                    </td>
                    <td>
                      <span className={`status-badge ${isWarning(log.action) ? 'severity-warning' : 'active'}`}>{log.action}</span>
                    </td>
                    <td><div className="error-msg-cell" title={log.summary}>{log.summary || '—'}</div></td>
                    <td><code className="error-path" title={log.ip || ''}>{log.ip || '—'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {logs.length === 0 ? <div className="empty-state">No activity found</div> : null}
            <Pagination page={page} totalPages={totalPages} total={total} limit={limit} onPageChange={setPage} />
          </div>

          <aside className="error-detail-panel" ref={panelRef}>
            {!selected ? (
              <div className="empty-state">Select an entry to see the full details</div>
            ) : (
              <>
                <div className="error-detail-head">
                  <h3>{selected.action}</h3>
                </div>
                <p className="error-detail-message">{selected.summary}</p>
                <dl className="error-meta-grid">
                  <div><dt>Admin</dt><dd>{selected.actorName || 'System'} ({ROLE_LABELS[selected.actorRole] || selected.actorRole || '—'})</dd></div>
                  <div><dt>When</dt><dd>{formatWhen(selected.createdAt)}</dd></div>
                  <div><dt>Target</dt><dd>{[selected.targetType, selected.targetId].filter(Boolean).join(' · ') || '—'}</dd></div>
                  <div><dt>IP</dt><dd>{selected.ip || '—'}</dd></div>
                </dl>
                {selected.meta && Object.keys(selected.meta).length ? (
                  <pre className="error-stack">{JSON.stringify(selected.meta, null, 2)}</pre>
                ) : null}
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
