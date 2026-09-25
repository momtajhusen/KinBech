import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function severityBadge(severity) {
  const s = severity || 'error';
  return <span className={`status-badge severity-${s}`}>{s}</span>;
}

function statusBadge(status) {
  const map = {
    open: 'open',
    acknowledged: 'under-review',
    resolved: 'resolved',
    ignored: 'rejected',
  };
  return <span className={`status-badge ${map[status] || status}`}>{status}</span>;
}

export default function ErrorLog() {
  const [errors, setErrors] = useState([]);
  const [stats, setStats] = useState({ openCount: 0, fatalCount: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('open');
  const [source, setSource] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchErrors = async () => {
    setLoading(true);
    try {
      const params = { status: filter, source, q: searchTerm || undefined, limit: 100 };
      const response = await api.get('/errors/admin', { params });
      setErrors(response.data.errors || []);
      setStats(response.data.stats || { openCount: 0, fatalCount: 0 });
    } catch (err) {
      console.error('Failed to fetch errors', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchErrors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, source]);

  const openDetail = async (id) => {
    try {
      const response = await api.get(`/errors/admin/${id}`);
      const err = response.data.error;
      setSelected(err);
      setNotes(err.notes || '');
    } catch (e) {
      console.error(e);
    }
  };

  const updateStatus = async (status) => {
    if (!selected?.id) return;
    setSaving(true);
    try {
      const response = await api.patch(`/errors/admin/${selected.id}`, { status, notes });
      setSelected(response.data.error);
      fetchErrors();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return errors;
    const q = searchTerm.toLowerCase();
    return errors.filter(
      (e) =>
        e.message?.toLowerCase().includes(q) ||
        e.path?.toLowerCase().includes(q) ||
        e.userLabel?.toLowerCase().includes(q) ||
        e.source?.toLowerCase().includes(q)
    );
  }, [errors, searchTerm]);

  return (
    <div className="error-log-page">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>Error & bug log</h2>
          <p className="page-subtitle" style={{ marginTop: 4 }}>
            Crashes and server failures for developers — stack, user, route, and fix hints.
            {stats.openCount != null ? (
              <span> · {stats.openCount} open · {stats.fatalCount} fatal</span>
            ) : null}
          </p>
        </div>
        <div className="page-filters">
          {[
            { value: 'open', label: 'Open' },
            { value: 'acknowledged', label: 'Acknowledged' },
            { value: 'resolved', label: 'Resolved' },
            { value: 'ignored', label: 'Ignored' },
            { value: 'all', label: 'All' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`filter-chip ${filter === opt.value ? 'active' : ''}`}
              onClick={() => setFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="page-header" style={{ marginTop: 0 }}>
        <div className="page-filters">
          {[
            { value: 'all', label: 'All sources' },
            { value: 'backend', label: 'Backend' },
            { value: 'mobile', label: 'Mobile' },
            { value: 'website', label: 'Website' },
            { value: 'admin', label: 'Admin' },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`filter-chip ${source === opt.value ? 'active' : ''}`}
              onClick={() => setSource(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          className="search-input"
          placeholder="Search message, path, user…"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && fetchErrors()}
        />
      </div>

      {loading ? (
        <div className="loading">Loading errors…</div>
      ) : (
        <div className="error-log-layout">
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th>Severity</th>
                  <th>Message</th>
                  <th>Route</th>
                  <th>×N</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((err) => (
                  <tr
                    key={err.id}
                    className={selected?.id === err.id ? 'row-selected' : ''}
                    onClick={() => openDetail(err.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{formatWhen(err.lastSeenAt || err.createdAt)}</td>
                    <td>{err.source}</td>
                    <td>{severityBadge(err.severity)}</td>
                    <td>
                      <div className="error-msg-cell" title={err.message}>
                        {err.message}
                      </div>
                    </td>
                    <td>
                      <code className="error-path">
                        {err.method ? `${err.method} ` : ''}
                        {err.path || err.route || '—'}
                      </code>
                    </td>
                    <td>{err.occurrenceCount || 1}</td>
                    <td>{statusBadge(err.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 ? <div className="empty-state">No errors found</div> : null}
          </div>

          <aside className="error-detail-panel">
            {!selected ? (
              <div className="empty-state">Select an error to see developer details</div>
            ) : (
              <>
                <div className="error-detail-head">
                  <h3>{selected.name || 'Error'}</h3>
                  <div className="error-detail-badges">
                    {severityBadge(selected.severity)}
                    {statusBadge(selected.status)}
                  </div>
                </div>

                <p className="error-detail-message">{selected.message}</p>

                {selected.developerHint ? (
                  <div className="error-hint">
                    <strong>Developer hint</strong>
                    <p>{selected.developerHint}</p>
                  </div>
                ) : null}

                <dl className="error-meta-grid">
                  <div>
                    <dt>Source</dt>
                    <dd>{selected.source}</dd>
                  </div>
                  <div>
                    <dt>HTTP</dt>
                    <dd>{selected.statusCode || '—'}</dd>
                  </div>
                  <div>
                    <dt>Route</dt>
                    <dd>
                      <code>
                        {selected.method} {selected.path || selected.route || '—'}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>URL</dt>
                    <dd className="break-all">{selected.url || '—'}</dd>
                  </div>
                  <div>
                    <dt>User</dt>
                    <dd>
                      {selected.user?.name || selected.userLabel || 'Anonymous'}
                      {selected.user?.phone ? ` · ${selected.user.phone}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Platform / app</dt>
                    <dd>
                      {[selected.platform, selected.appVersion, selected.device]
                        .filter(Boolean)
                        .join(' · ') || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Environment</dt>
                    <dd>
                      {selected.environment || '—'}
                      {selected.release ? ` · ${selected.release}` : ''}
                    </dd>
                  </div>
                  <div>
                    <dt>Seen</dt>
                    <dd>
                      first {formatWhen(selected.createdAt)} · last{' '}
                      {formatWhen(selected.lastSeenAt)} · ×{selected.occurrenceCount || 1}
                    </dd>
                  </div>
                  <div>
                    <dt>Sentry</dt>
                    <dd>{selected.sentryEventId || 'Not linked (set SENTRY_DSN)'}</dd>
                  </div>
                  <div>
                    <dt>User-Agent</dt>
                    <dd className="break-all">{selected.userAgent || '—'}</dd>
                  </div>
                </dl>

                <h4>Stack trace</h4>
                <pre className="error-stack">{selected.stack || 'No stack available'}</pre>

                {selected.extra && Object.keys(selected.extra).length ? (
                  <>
                    <h4>Extra context</h4>
                    <pre className="error-stack">{JSON.stringify(selected.extra, null, 2)}</pre>
                  </>
                ) : null}

                {selected.breadcrumbs?.length ? (
                  <>
                    <h4>Breadcrumbs</h4>
                    <pre className="error-stack">{JSON.stringify(selected.breadcrumbs, null, 2)}</pre>
                  </>
                ) : null}

                <h4>Notes</h4>
                <textarea
                  className="error-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What you found / fix PR link…"
                />

                <div className="action-buttons" style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="action-btn approve"
                    disabled={saving}
                    onClick={() => updateStatus('acknowledged')}
                  >
                    Acknowledge
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={saving}
                    onClick={() => updateStatus('resolved')}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="action-btn reject"
                    disabled={saving}
                    onClick={() => updateStatus('ignored')}
                  >
                    Ignore
                  </button>
                  <button
                    type="button"
                    className="action-btn"
                    disabled={saving}
                    onClick={() => updateStatus('open')}
                  >
                    Reopen
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
