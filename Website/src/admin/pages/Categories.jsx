import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Bike,
  BookOpen,
  Car,
  Cpu,
  Ellipsis,
  FolderPlus,
  FolderTree,
  Flower2,
  Gamepad2,
  Gem,
  Hammer,
  Headphones,
  HeartPulse,
  House,
  Laptop,
  Layers,
  PawPrint,
  Shirt,
  ShoppingBasket,
  Smartphone,
  Store,
  Tag,
  Utensils,
  Wand2,
} from 'lucide-react';
import CategoryImageField from '../components/CategoryImageField';
import Modal, { ModalSwitch } from '../components/Modal';
import { confirmAction, toast } from '../components/Feedback';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import InfiniteLoader from '../components/InfiniteLoader';
import useInfiniteList from '../utils/useInfiniteList';
import api from '../services/api';

// Ionicons names (used by the mobile app) mapped to their closest lucide icon
const CATEGORY_ICONS = {
  'phone-portrait-outline': Smartphone,
  'laptop-outline': Laptop,
  'headset-outline': Headphones,
  'file-tray-stacked-outline': Layers,
  'car-outline': Car,
  'shirt-outline': Shirt,
  'bicycle-outline': Bike,
  'basket-outline': ShoppingBasket,
  'hardware-chip-outline': Cpu,
  'home-outline': House,
  'medkit-outline': HeartPulse,
  'restaurant-outline': Utensils,
  'book-outline': BookOpen,
  'flower-outline': Flower2,
  'diamond-outline': Gem,
  'construct-outline': Hammer,
  'paw-outline': PawPrint,
  'game-controller-outline': Gamepad2,
  'storefront-outline': Store,
  'pricetag-outline': Tag,
  'ellipsis-horizontal-outline': Ellipsis,
};

const ICON_OPTIONS = Object.keys(CATEGORY_ICONS);
const COLOR_PRESETS = ['#5B39C6', '#047857', '#2563EB', '#DC2626', '#D97706', '#DB2777', '#0891B2', '#4B5563'];

const CategoryIcon = ({ name, color }) => {
  const Icon = CATEGORY_ICONS[name];
  if (!Icon) return null;
  return (
    <span
      className="category-icon"
      style={{ backgroundColor: `${color}1f`, color }}
      title={name}
    >
      <Icon className="item-icon" aria-label={name} />
    </span>
  );
};

const emptyForm = {
  name: '',
  icon: 'pricetag-outline',
  imageUrl: '',
  color: '#5B39C6',
  description: '',
  sortOrder: 0,
  isActive: true,
  requiresPreApproval: false,
};

function CategoryModal({ type, editingId, initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const PreviewIcon = CATEGORY_ICONS[form.icon] || Tag;

  const save = async () => {
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editingId) await api.patch(`/categories/admin/${editingId}`, form);
      else await api.post('/categories/admin', { ...form, type });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save category');
      setSaving(false);
    }
  };

  return (
    <Modal
      icon={editingId ? FolderTree : FolderPlus}
      title={editingId ? 'Edit category' : `New ${type} category`}
      subtitle={type === 'product' ? 'Shown in the app on home, explore and post listing.' : 'Shown in shop setup and explore stores.'}
      size="md"
      busy={saving}
      onClose={onClose}
      onSubmit={save}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create category'}
          </button>
        </>
      )}
    >
      <div className="kb-preview">
        <span className="kb-preview-thumb" style={{ background: `${form.color}1f`, color: form.color }}>
          {form.imageUrl ? <img src={form.imageUrl} alt="" /> : <PreviewIcon aria-hidden />}
        </span>
        <span className="kb-preview-text">
          <span className="kb-preview-name">{form.name.trim() || 'Category name'}</span>
          <span className="kb-preview-sub">{form.description.trim() || 'Preview of how it looks in the app'}</span>
        </span>
      </div>

      <div className="kb-field-grid">
        <div className="form-group">
          <label htmlFor="cat-name">Name *</label>
          <input id="cat-name" className="form-input" value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Mobiles" required />
        </div>
        <div className="form-group">
          <label htmlFor="cat-order">Sort order</label>
          <input id="cat-order" className="form-input" type="number" min="0" value={form.sortOrder} onChange={(e) => set({ sortOrder: e.target.value })} />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="cat-desc">Description</label>
        <input id="cat-desc" className="form-input" value={form.description} maxLength={140} onChange={(e) => set({ description: e.target.value })} placeholder="Shown on shop category cards" />
      </div>

      <div className="form-group">
        <label>Icon</label>
        <div className="kb-icon-grid" style={{ '--icon-color': form.color }}>
          {ICON_OPTIONS.map((name) => {
            const Icon = CATEGORY_ICONS[name];
            return (
              <button key={name} type="button" title={name} className={form.icon === name ? 'on' : ''} onClick={() => set({ icon: name })}>
                <Icon aria-hidden />
              </button>
            );
          })}
        </div>
      </div>

      <div className="form-group">
        <label>Color</label>
        <div className="kb-color-row">
          {COLOR_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={color}
              className={`kb-color-dot ${form.color.toLowerCase() === color.toLowerCase() ? 'on' : ''}`}
              style={{ background: color }}
              onClick={() => set({ color })}
            />
          ))}
          <label className="kb-color-custom">
            <input type="color" value={form.color} onChange={(e) => set({ color: e.target.value })} />
            {form.color.toUpperCase()}
          </label>
        </div>
      </div>

      <CategoryImageField imageUrl={form.imageUrl} onChange={(imageUrl) => set({ imageUrl })} />

      <ModalSwitch
        checked={form.isActive}
        onChange={(isActive) => set({ isActive })}
        label="Visible in the app"
        hint="Turn off to hide this category without deleting it."
      />
      {type === 'product' ? (
        <ModalSwitch
          checked={form.requiresPreApproval}
          onChange={(requiresPreApproval) => set({ requiresPreApproval })}
          label="Requires admin pre-approval"
          hint="New listings in this category wait in Pending Review before going public."
        />
      ) : null}

      {error ? <div className="u360-error">{error}</div> : null}
    </Modal>
  );
}

const FIX_POLL_MS = 3000;

const timeText = (value) => (value ? new Date(value).toLocaleString() : '');

/** Runs the daily category check once and shows what it moved. */
function useCategoryFix(onCreated) {
  const [status, setStatus] = useState(null);
  const [starting, setStarting] = useState(false);
  const wasRunning = useRef(false);
  const running = Boolean(status?.manual?.running);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/categories/admin/fix-run');
      setStatus(data);
    } catch {
      /* the API layer shows the error */
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(load, FIX_POLL_MS);
    return () => clearInterval(timer);
  }, [running, load]);

  useEffect(() => {
    if (running) {
      wasRunning.current = true;
      return;
    }
    if (!wasRunning.current || !status?.manual) return;
    wasRunning.current = false;
    const { error, movedCount = 0, created = [] } = status.manual;
    if (error) toast.error(error);
    else toast.success(`Category check done: ${movedCount} moved, ${created.length} new`);
    if (created.length) onCreated();
  }, [running, status, onCreated]);

  const start = async () => {
    const ok = await confirmAction({
      title: 'Fix categories now?',
      message: 'Checks every live listing\'s title and keywords, moves items that sit in the wrong category, and lets AI create a new category when nothing fits. This is the same check that runs every day.',
      confirmLabel: 'Run check',
    });
    if (!ok) return;
    setStarting(true);
    try {
      const { data } = await api.post('/categories/admin/fix-run');
      wasRunning.current = true;
      setStatus(data);
    } catch {
      load();
    } finally {
      setStarting(false);
    }
  };

  return { status, running, starting, start };
}

function CategoryFixPanel({ status, running }) {
  const manual = status?.manual;
  const daily = status?.daily;
  if (!manual && !daily) {
    return status ? (
      <p className="page-hint">Category check runs every day at {status.dailyTime} (Nepal time).</p>
    ) : null;
  }
  const moved = manual?.moved || [];
  return (
    <div className="category-fix-panel">
      <p className="page-hint">
        Category check runs every day at {status.dailyTime} (Nepal time).
        {daily?.finishedAt ? ` Last daily run ${timeText(daily.finishedAt)}: ${daily.checked} checked, ${daily.moved} moved, ${daily.created} new.` : ''}
      </p>
      {running ? (
        <p className="category-fix-line">Checking listings… started {timeText(manual.startedAt)}</p>
      ) : null}
      {manual && !running && manual.finishedAt ? (
        <>
          <p className="category-fix-line">
            Last manual run {timeText(manual.finishedAt)}
            {manual.error
              ? `: failed (${manual.error})`
              : `: ${manual.checked} checked, ${manual.movedCount} moved, ${(manual.created || []).length} new categories${(manual.created || []).length ? ` (${manual.created.join(', ')})` : ''}`}
          </p>
          {moved.length ? (
            <ul className="category-fix-moves">
              {moved.map((m) => (
                <li key={m.id}>
                  <strong>{m.title}</strong> — {m.from || 'none'} → {m.to}
                  {m.ai ? <span className="category-fix-ai">AI</span> : null}
                </li>
              ))}
              {manual.movedCount > moved.length ? <li>…and {manual.movedCount - moved.length} more</li> : null}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const Categories = () => {
  const [type, setType] = useState('product');
  const [modal, setModal] = useState(null);
  const [view, setView] = useViewMode('categories', 'card');

  const limit = 20;

  const fetchPage = useCallback(async (page) => {
    try {
      const response = await api.get('/categories/admin', { 
        params: { 
          type,
          page,
          limit
        } 
      });
      const { categories: data, total: totalCount, totalPages: pages } = response.data;
      return { items: data || [], total: totalCount || 0, totalPages: pages || 1 };
    } catch (error) {
      console.error('Failed to fetch categories:', error);
      throw error;
    }
  }, [type, limit]);

  const {
    items: categories, total, loading, loadingMore, hasMore, loadMore, reload: fetchCategories,
  } = useInfiniteList(fetchPage);

  const categoryFix = useCategoryFix(fetchCategories);

  const openCreate = () => {
    setModal({ id: null, form: { ...emptyForm, sortOrder: total } });
  };

  const openEdit = (cat) => {
    setModal({
      id: cat.id,
      form: {
        name: cat.name,
        icon: cat.icon,
        imageUrl: cat.imageUrl || '',
        color: cat.color || '#5B39C6',
        description: cat.description || '',
        sortOrder: cat.sortOrder || 0,
        isActive: cat.isActive !== false,
        requiresPreApproval: Boolean(cat.requiresPreApproval),
      },
    });
  };

  const handleDelete = async (cat) => {
    const ok = await confirmAction({
      title: `Delete "${cat.name}"?`,
      message: 'Sellers can no longer pick this category for new posts.',
      confirmLabel: 'Delete category',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/categories/admin/${cat.id}`);
      toast.success(`"${cat.name}" deleted`);
      await fetchCategories();
    } catch {
      /* the API layer shows the error */
    }
  };

  return (
    <div className="users-page">
      <div className="page-header">
        <div className="page-filters">
          <button
            className={`filter-chip ${type === 'product' ? 'active' : ''}`}
            onClick={() => setType('product')}
          >
            Product categories
          </button>
          <button
            className={`filter-chip ${type === 'shop' ? 'active' : ''}`}
            onClick={() => setType('shop')}
          >
            Shop categories
          </button>
        </div>
        <div className="page-header-actions">
          <ViewToggle view={view} onChange={setView} />
          {type === 'product' ? (
            <button
              className="action-btn view"
              onClick={categoryFix.start}
              disabled={categoryFix.running || categoryFix.starting}
            >
              <Wand2 size={15} /> {categoryFix.running ? 'Fixing…' : 'Fix categories now'}
            </button>
          ) : null}
          <button className="action-btn view" onClick={openCreate}>
            + Add category
          </button>
        </div>
      </div>

      <p className="page-hint">
        These names and icons appear in the KinBech mobile app
        {type === 'product' ? ' (home, explore, post listing).' : ' (shop setup and explore stores).'}
      </p>
      {type === 'product' ? <CategoryFixPanel status={categoryFix.status} running={categoryFix.running} /> : null}

      {modal ? (
        <CategoryModal
          type={type}
          editingId={modal.id}
          initial={modal.form}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            fetchCategories();
          }}
        />
      ) : null}

      {loading ? (
        <div className="loading">Loading categories...</div>
      ) : categories.length === 0 ? (
        <div className="table-container">
          <div className="empty-state">No categories yet</div>
        </div>
      ) : view === 'card' ? (
        <div className="card-grid cols-5">
          {categories.map((cat) => (
            <article className="data-card" key={cat.id}>
              <div className="data-card-media">
                {cat.imageUrl ? (
                  <img src={cat.imageUrlFull || cat.imageUrl} alt="" loading="lazy" />
                ) : (
                  <span className="data-card-letter">{cat.name.charAt(0)}</span>
                )}
              </div>
              <div className="data-card-body">
                <div className="data-card-title">{cat.name}</div>
                <div className="data-card-pricerow">
                  <CategoryIcon name={cat.icon} color={cat.color} />
                  {cat.isActive === false ? <span className="status-badge suspended">Hidden</span> : null}
                  {type === 'product' ? (
                    <span
                      className={`status-badge ${
                        cat.requiresPreApproval ? 'pending' : 'verified'
                      }`}
                    >
                      {cat.requiresPreApproval ? 'Required' : 'Auto'}
                    </span>
                  ) : null}
                </div>
                <div className="data-card-desc">{cat.description || '—'}</div>
                <div className="data-card-meta">
                  <span>
                    <span className="data-card-color" style={{ backgroundColor: cat.color }} />
                    {cat.color}
                  </span>
                </div>
                <div className="data-card-actions">
                  <div className="action-buttons">
                    <button className="action-btn view" onClick={() => openEdit(cat)}>
                      Edit
                    </button>
                    <button className="action-btn suspend" onClick={() => handleDelete(cat)}>
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
                <th>Category</th>
                <th>Icon</th>
                <th>Description</th>
                <th>Pre-approval</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    <div className="user-cell">
                      <div
                        className="category-thumb"
                        style={{ background: `${cat.color}22`, borderColor: cat.color }}
                      >
                        {cat.imageUrl ? (
                          <img src={cat.imageUrlFull || cat.imageUrl} alt="" />
                        ) : (
                          <span style={{ color: cat.color }}>{cat.name.charAt(0)}</span>
                        )}
                      </div>
                      <div>
                        <div className="user-name">
                          {cat.name}
                          {cat.isActive === false ? <span className="status-badge suspended" style={{ marginLeft: 6 }}>Hidden</span> : null}
                        </div>
                        <div className="user-email">{cat.color}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <CategoryIcon name={cat.icon} color={cat.color} />
                  </td>
                  <td>{cat.description || '—'}</td>
                  <td>
                    {type === 'product' ? (
                      <span
                        className={`status-badge ${
                          cat.requiresPreApproval ? 'pending' : 'verified'
                        }`}
                      >
                        {cat.requiresPreApproval ? 'Required' : 'Auto'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn view" onClick={() => openEdit(cat)}>
                        Edit
                      </button>
                      <button className="action-btn suspend" onClick={() => handleDelete(cat)}>
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

      {!loading && categories.length > 0 && (
        <InfiniteLoader
          shown={categories.length}
          total={total}
          hasMore={hasMore}
          loading={loadingMore}
          onLoadMore={loadMore}
          label="categories"
        />
      )}
    </div>
  );
};

export default Categories;
