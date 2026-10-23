import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, Filter, Search, X } from 'lucide-react';
import api from '../services/api';
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

const emptyForm = {
  keyword: '',
  matchFields: ['title', 'description'],
  matchMode: 'contains',
  severity: 'hold',
  isActive: true,
  notes: '',
};

export default function RestrictedKeywords() {
  const [keywords, setKeywords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
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
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setForm({
      keyword: item.keyword || '',
      matchFields: item.matchFields?.length ? item.matchFields : ['title', 'description'],
      matchMode: item.matchMode || 'contains',
      severity: item.severity || 'hold',
      isActive: item.isActive !== false,
      notes: item.notes || '',
    });
    setShowForm(true);
  };

  const toggleField = (field) => {
    setForm((prev) => {
      const set = new Set(prev.matchFields);
      if (set.has(field)) set.delete(field);
      else set.add(field);
      const next = [...set];
      return {
        ...prev,
        matchFields: next.length ? next : ['title', 'description'],
      };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.keyword.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/moderation/keywords/admin/${editingId}`, form);
      } else {
        await api.post('/moderation/keywords/admin', form);
      }
      setShowForm(false);
      await fetchKeywords();
    } catch (error) {
      const message =
        error.response?.data?.message ||
        error.message ||
        'Failed to save keyword';
      alert(message);
    } finally {
      setSaving(false);
    }
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

      {showForm && (
        <form className="invite-form category-form" onSubmit={handleSave}>
          <h3>{editingId ? 'Edit restricted keyword' : 'New restricted keyword'}</h3>

          <div className="form-row">
            <label className="full">
              Keyword / phrase
              <input
                value={form.keyword}
                onChange={(e) => setForm({ ...form, keyword: e.target.value })}
                placeholder="e.g. stolen, counterfeit, pistol"
                required
              />
            </label>
          </div>

          <div className="form-row">
            <label>
              Severity
              <select
                value={form.severity}
                onChange={(e) => setForm({ ...form, severity: e.target.value })}
              >
                <option value="hold">Hold for review</option>
                <option value="block">Hard block (reject post)</option>
              </select>
            </label>
            <label>
              Match mode
              <select
                value={form.matchMode}
                onChange={(e) => setForm({ ...form, matchMode: e.target.value })}
              >
                <option value="contains">Contains</option>
                <option value="word">Whole word</option>
                <option value="exact">Exact field match</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={form.isActive ? 'active' : 'inactive'}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.value === 'active' })
                }
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
          </div>

          <div className="form-row">
            <label className="full">
              Scan these fields
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                {MATCH_FIELD_OPTIONS.map((opt) => {
                  const on = form.matchFields.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      className={`filter-chip ${on ? 'active' : ''}`}
                      onClick={() => toggleField(opt.key)}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </label>
          </div>

          <div className="form-row">
            <label className="full">
              Notes (internal)
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Why this keyword is restricted"
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit" className="action-btn view" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="action-btn" onClick={() => setShowForm(false)}>
              Cancel
            </button>
          </div>
        </form>
      )}

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
