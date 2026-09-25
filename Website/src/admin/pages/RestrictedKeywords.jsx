import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

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

  const fetchKeywords = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'hold' || filter === 'block') params.severity = filter;
      if (filter === 'active') params.active = 'true';
      if (filter === 'inactive') params.active = 'false';
      if (query.trim()) params.q = query.trim();
      const response = await api.get('/moderation/keywords/admin', { params });
      setKeywords(response.data.keywords || []);
    } catch (error) {
      console.error('Failed to fetch keywords:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeywords();
  }, [filter]);

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

  const counts = useMemo(() => {
    const all = keywords.length;
    const block = keywords.filter((k) => k.severity === 'block').length;
    const hold = keywords.filter((k) => k.severity === 'hold').length;
    return { all, block, hold };
  }, [keywords]);

  return (
    <div className="users-page">
      <div className="page-header">
        <div className="page-filters">
          {[
            { key: 'all', label: `All (${counts.all})` },
            { key: 'hold', label: 'Hold for review' },
            { key: 'block', label: 'Hard block' },
            { key: 'active', label: 'Active' },
            { key: 'inactive', label: 'Inactive' },
          ].map((chip) => (
            <button
              key={chip.key}
              className={`filter-chip ${filter === chip.key ? 'active' : ''}`}
              onClick={() => setFilter(chip.key)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <button className="action-btn view" onClick={openCreate}>
          + Add keyword
        </button>
      </div>

      <p className="page-hint">
        Listings that match these words in title, description, brand, SKU, location, or category are
        automatically held for review or blocked. Sensitive categories can also require pre-approval
        from the Categories page.
      </p>

      <div className="page-header" style={{ marginTop: 8 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search keywords…"
          style={{
            flex: 1,
            maxWidth: 320,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid var(--border, #e5e7eb)',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') fetchKeywords();
          }}
        />
        <button className="action-btn" onClick={fetchKeywords}>
          Search
        </button>
      </div>

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
          {keywords.length === 0 && (
            <div className="empty-state">No restricted keywords yet</div>
          )}
        </div>
      )}
    </div>
  );
}
