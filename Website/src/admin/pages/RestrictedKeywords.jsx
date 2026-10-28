import { useEffect, useState, useCallback, useRef } from 'react';
import { Ban, ChevronDown, Clock, Download, FileUp, Filter, Search, ShieldAlert, Upload, X } from 'lucide-react';
import api from '../services/api';
import Modal, { ModalSwitch, OptionCards } from '../components/Modal';
import { confirmAction, errorMessage, toast } from '../components/Feedback';
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

const CSV_TEMPLATE = [
  'keyword,severity,match_mode,active,notes',
  'pistol,block,word,yes,Weapons are not allowed',
  'air gun,block,contains,yes,Weapons are not allowed',
  'counterfeit,hold,contains,yes,Check before publishing',
].join('\n');

const CSV_HEADER_KEYS = {
  keyword: 'keyword',
  word: 'keyword',
  severity: 'severity',
  match_mode: 'matchMode',
  matchmode: 'matchMode',
  mode: 'matchMode',
  active: 'active',
  is_active: 'active',
  notes: 'notes',
  note: 'notes',
  fields: 'matchFields',
  match_fields: 'matchFields',
};

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvToKeywordRows(text) {
  const table = parseCsv(String(text).replace(/^\uFEFF/, ''));
  const header = (table[0] || []).map((cell) => CSV_HEADER_KEYS[cell.trim().toLowerCase().replace(/\s+/g, '_')]);
  if (!header.includes('keyword')) {
    throw new Error('First row must be the header. Download the template and keep the "keyword" column.');
  }
  return table
    .slice(1)
    .map((cells, index) => {
      const item = { line: index + 2 };
      header.forEach((key, col) => {
        if (key) item[key] = (cells[col] || '').trim();
      });
      return item;
    })
    .filter((item) => Object.keys(item).some((key) => key !== 'line' && item[key]));
}

function downloadTemplate() {
  const blob = new Blob([`\uFEFF${CSV_TEMPLATE}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'kinbech-restricted-keywords-template.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ImportResultModal({ result, onClose }) {
  return (
    <Modal
      icon={FileUp}
      tone={result.errors?.length ? 'warning' : 'primary'}
      title="CSV import finished"
      subtitle={`${result.added} added, ${result.updated} updated, ${result.skipped} skipped`}
      size="md"
      onClose={onClose}
      onSubmit={onClose}
      footer={<button type="submit" className="btn btn-primary">Done</button>}
    >
      {result.errors?.length ? (
        <div className="form-group">
          <label>Rows that were skipped</label>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', maxHeight: 260, overflowY: 'auto' }}>
            {result.errors.map((item) => (
              <li key={`${item.line}-${item.keyword || ''}`}>
                Line {item.line}{item.keyword ? ` (${item.keyword})` : ''}: {item.message}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="form-hint">All rows were saved. New and edited listings are checked against them right away.</p>
      )}
    </Modal>
  );
}

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
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

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

  const handleDelete = async (item) => {
    const ok = await confirmAction({
      title: `Delete "${item.keyword}"?`,
      message: 'Listings will no longer be checked against this word. This cannot be undone.',
      confirmLabel: 'Delete keyword',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/moderation/keywords/admin/${item.id}`);
      toast.success(`"${item.keyword}" deleted`);
      await fetchKeywords();
    } catch {
      /* the API layer shows the error */
    }
  };

  const handleCsvFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const rows = csvToKeywordRows(await file.text());
      if (!rows.length) throw new Error('The file has no keyword rows');
      const response = await api.post('/moderation/keywords/admin/import', { rows }, { feedback: false });
      setImportResult(response.data);
      await fetchKeywords();
    } catch (error) {
      toast.error(errorMessage(error, 'Failed to import CSV'), { title: 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  const handleToggleActive = async (item) => {
    try {
      await api.patch(`/moderation/keywords/admin/${item.id}`, {
        isActive: !item.isActive,
      });
      toast.success(`"${item.keyword}" is ${item.isActive ? 'off' : 'on'}`);
      await fetchKeywords();
    } catch {
      /* the API layer shows the error */
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
          <button className="action-btn" onClick={downloadTemplate} style={{ marginLeft: '0.5rem' }} title="Download CSV template">
            <Download className="item-icon" /> Template
          </button>
          <button
            className="action-btn view"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            style={{ marginLeft: '0.5rem' }}
            title="Upload filled CSV"
          >
            <Upload className="item-icon" /> {importing ? 'Uploading…' : 'Upload CSV'}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleCsvFile} />
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

      {importResult ? (
        <ImportResultModal result={importResult} onClose={() => setImportResult(null)} />
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
                <div className={`data-card-desc ${item.notes ? '' : 'is-empty'}`} title={item.notes || ''}>
                  {item.notes || 'No notes'}
                </div>
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
                    <button className="action-btn suspend" onClick={() => handleDelete(item)}>
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
                        onClick={() => handleDelete(item)}
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
