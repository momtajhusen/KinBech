import { useEffect, useState, useCallback } from 'react';
import { Ban, ChevronDown, Clock, Filter, Search, ShieldAlert, X } from 'lucide-react';
import api from '../services/api';
import Modal, { ModalSwitch, OptionCards } from '../components/Modal';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';

const MATCH_FIELD_OPTIONS = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'brand', label: 'Brand' },
  { key: 'sku', label: 'SKU' },
  { key: 'location', label: 'Location' },
  { key: 'category', label: 'Category' },
];

const MATCH_MODES = [
  { value: 'contains', label: 'Contains', hint: '"gun" also matches "shotgun".' },
  { value: 'word', label: 'Whole word', hint: '"gun" matches "gun" but not "shotgun".' },
  { value: 'exact', label: 'Exact field', hint: 'The whole field must equal the keyword.' },
];

const SEVERITY_OPTIONS = [
  { value: 'hold', label: 'Hold for review', description: 'Listing waits in Pending Review until an admin approves it.', icon: Clock, tone: 'warning' },
  { value: 'block', label: 'Hard block', description: 'The post is rejected right away. The seller sees why.', icon: Ban, tone: 'danger' },
];

const emptyForm = {
  keyword: '',
  matchFields: ['title', 'description'],
  matchMode: 'contains',
  severity: 'hold',
  isActive: true,
  notes: '',
};

function KeywordModal({ editingId, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const toggleField = (field) => {
    setForm((prev) => {
      const next = new Set(prev.matchFields);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return { ...prev, matchFields: next.size ? [...next] : ['title', 'description'] };
    });
  };

  const save = async () => {
    if (!form.keyword.trim()) {
      setError('Keyword is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) await api.patch(`/moderation/keywords/admin/${editingId}`, form);
      else await api.post('/moderation/keywords/admin', form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to save keyword');
      setSaving(false);
    }
  };

  const mode = MATCH_MODES.find((item) => item.value === form.matchMode) || MATCH_MODES[0];

  return (
    <Modal
      icon={ShieldAlert}
      tone={form.severity === 'block' ? 'danger' : 'warning'}
      title={editingId ? 'Edit restricted keyword' : 'New restricted keyword'}
      subtitle="New and edited listings are checked against this word."
      size="md"
      busy={saving}
      onClose={onClose}
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add keyword'}
          </button>
        </>
      )}
    >
      <div className="form-group">
        <label htmlFor="kw-keyword">Keyword or phrase *</label>
        <input id="kw-keyword" className="form-input" value={form.keyword} maxLength={80} onChange={(e) => set({ keyword: e.target.value })} placeholder="e.g. stolen, counterfeit, pistol" required />
      </div>

      <div className="form-group">
        <label>What happens on a match</label>
        <OptionCards value={form.severity} onChange={(severity) => set({ severity })} options={SEVERITY_OPTIONS} />
      </div>

      <div className="form-group">
        <label>Match mode</label>
        <div className="kb-segment">
          {MATCH_MODES.map((item) => (
            <button key={item.value} type="button" className={form.matchMode === item.value ? 'on' : ''} onClick={() => set({ matchMode: item.value })}>
              {item.label}
            </button>
          ))}
        </div>
        <p className="form-hint">{mode.hint}</p>
      </div>

      <div className="form-group">
        <label>Scan these fields</label>
        <div className="u360-chips">
          {MATCH_FIELD_OPTIONS.map((opt) => (
            <button key={opt.key} type="button" className={`u360-chip ${form.matchFields.includes(opt.key) ? 'on' : ''}`} onClick={() => toggleField(opt.key)}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="kw-notes">Internal note</label>
        <input id="kw-notes" className="form-input" value={form.notes} maxLength={200} onChange={(e) => set({ notes: e.target.value })} placeholder="Why this keyword is restricted" />
      </div>

      <ModalSwitch
        checked={form.isActive}
        onChange={(isActive) => set({ isActive })}
        label="Active"
        hint="Turn off to pause this rule without deleting it."
      />

      {error ? <div className="u360-error">{error}</div> : null}
    </Modal>
  );
}

export default function RestrictedKeywords() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query);
  const [view, setView] = useViewMode('restricted-keywords', 'list');
  const [stats, setStats] = useState({ all: 0, block: 0, hold: 0 });

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit
      };
      if (filter === 'hold' || filter === 'block') params.severity = filter;
      if (filter === 'active') params.active = 'true';
      if (filter === 'inactive') params.active = 'false';
      if (debouncedQuery.trim()) params.q = debouncedQuery.trim();
      const response = await api.get('/moderation/keywords/admin', { params });
      setKeywords(response.data.keywords || []);
      setTotal(response.data.total || 0);
      setTotalPages(response.data.totalPages || 1);
      if (response.data.stats) setStats(response.data.stats);
    } catch (error) {
      console.error('Failed to fetch keywords:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedQuery, page, limit]);

  useEffect(() => {
    fetchKeywords();
  }, [fetchKeywords]);

  // Reset to page 1 when filter or query changes
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedQuery]);

  const openCreate = () => {
    setModal({ id: null, form: { ...emptyForm } });
  };

  const openEdit = (item) => {
    setModal({
      id: item.id,
      form: {
        keyword: item.keyword || '',
        matchFields: item.matchFields?.length ? item.matchFields : ['title', 'description'],
        matchMode: item.matchMode || 'contains',
        severity: item.severity || 'hold',
        isActive: item.isActive !== false,
        notes: item.notes || '',
      },
    });
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this restricted keyword?')) return;
    try {
      await api.delete(`/moderation/keywords/admin/${id}`);
      await fetchKeywords();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete keyword');
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await api.patch(`/moderation/keywords/admin/${item.id}`, {
        isActive: !item.isActive,
      });
      await fetchKeywords();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to update keyword');
    }
  };

  return (
    <div className="users-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search keywords..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
              onKeyDown={(e) => e.key === 'Enter' && fetchKeywords()}
            />
          </div>
          <button className="action-btn view" onClick={openCreate} style={{ marginLeft: '0.5rem' }}>
            + Add keyword
          </button>
        </div>
        <div className="filter-group right">
          <ViewToggle view={view} onChange={setView} />
          <div className="dropdown-filter">
            <Filter className="filter-icon" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All Keywords ({stats.all})</option>
              <option value="hold">Hold for review ({stats.hold})</option>
              <option value="block">Hard block ({stats.block})</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <ChevronDown className="chev-icon" />
          </div>
          {(query || filter !== 'all') && (
            <button className="clear-btn" onClick={() => { setQuery(''); setFilter('all'); }}>
              <X className="item-icon" /> Clear
            </button>
          )}
        </div>
      </div>

      <p className="page-hint">
        Listings that match these words in title, description, brand, SKU, location, or category are
        automatically held for review or blocked. Sensitive categories can also require pre-approval
        from the Categories page.
      </p>

      {modal ? (
        <KeywordModal
          editingId={modal.id}
          initial={modal.form}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            fetchKeywords();
          }}
        />
      ) : null}

      {loading ? (
        <div className="loading">Loading keywords...</div>
      ) : keywords.length === 0 ? (
        <div className="table-container">
          <div className="empty-state">No restricted keywords yet</div>
        </div>
      ) : view === 'card' ? (
        <div className="card-grid">
          {keywords.map((item) => (
            <article className="data-card" key={item.id}>
              <div className="data-card-body">
                <div className="data-card-pricerow">
                  <div className="data-card-title">{item.keyword}</div>
                  <span
                    className={`status-badge ${
                      item.severity === 'block' ? 'suspended' : 'pending'
                    }`}
                  >
                    {item.severity === 'block' ? 'Block' : 'Hold'}
                  </span>
                </div>
                <div className="data-card-meta">
                  <span>
                    <Filter className="item-icon" aria-hidden /> {(item.matchFields || []).join(', ')}
                  </span>
                  <span>{item.matchMode}</span>
                </div>
                {item.notes ? <div className="data-card-desc">{item.notes}</div> : null}
                <div className="data-card-actions">
                  <div className="action-buttons">
                    <button
                      className={`action-btn ${item.isActive ? 'view' : ''}`}
                      onClick={() => handleToggleActive(item)}
                    >
                      {item.isActive ? 'On' : 'Off'}
                    </button>
                    <button className="action-btn view" onClick={() => openEdit(item)}>
                      Edit
                    </button>
                    <button className="action-btn suspend" onClick={() => handleDelete(item.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Keyword</th>
                <th>Fields</th>
                <th>Mode</th>
                <th>Severity</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keywords.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="user-name">{item.keyword}</div>
                    {item.notes ? <div className="user-email">{item.notes}</div> : null}
                  </td>
                  <td>
                    <code>{(item.matchFields || []).join(', ')}</code>
                  </td>
                  <td>{item.matchMode}</td>
                  <td>
                    <span
                      className={`status-badge ${
                        item.severity === 'block' ? 'suspended' : 'pending'
                      }`}
                    >
                      {item.severity === 'block' ? 'Block' : 'Hold'}
                    </span>
                  </td>
                  <td>
                    <button
                      className={`action-btn ${item.isActive ? 'view' : ''}`}
                      onClick={() => handleToggleActive(item)}
                    >
                      {item.isActive ? 'On' : 'Off'}
                    </button>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn view" onClick={() => openEdit(item)}>
                        Edit
                      </button>
                      <button
                        className="action-btn suspend"
                        onClick={() => handleDelete(item.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && keywords.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
