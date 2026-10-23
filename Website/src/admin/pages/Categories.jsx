import { useEffect, useState, useCallback } from 'react';
import {
  Bike,
  BookOpen,
  Car,
  Cpu,
  Ellipsis,
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
} from 'lucide-react';
import CategoryImageField from '../components/CategoryImageField';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import Pagination from '../components/Pagination';
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

const Categories = () => {
  const [type, setType] = useState('product');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useViewMode('categories', 'card');

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchCategories = useCallback(async (nextType = type) => {
    setLoading(true);
    try {
      const response = await api.get('/categories/admin', { 
        params: { 
          type: nextType,
          page,
          limit
        } 
      });
      const { categories: data, total: totalCount, totalPages: pages } = response.data;
      setCategories(data || []);
      setTotal(totalCount || 0);
      setTotalPages(pages || 1);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  }, [type, page, limit]);

  useEffect(() => {
    fetchCategories(type);
  }, [fetchCategories, type]);

  // Reset to page 1 when type changes
  useEffect(() => {
    setPage(1);
  }, [type]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sortOrder: total });
    setShowForm(true);
  };

  const openEdit = (cat) => {
    setEditingId(cat.id);
    setForm({
      name: cat.name,
      icon: cat.icon,
      imageUrl: cat.imageUrl || '',
      color: cat.color || '#5B39C6',
      description: cat.description || '',
      sortOrder: cat.sortOrder || 0,
      isActive: cat.isActive !== false,
      requiresPreApproval: Boolean(cat.requiresPreApproval),
    });
    setShowForm(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await api.patch(`/categories/admin/${editingId}`, form);
      } else {
        await api.post('/categories/admin', { ...form, type });
      }
      setShowForm(false);
      await fetchCategories(type);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to save category');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await api.delete(`/categories/admin/${id}`);
      await fetchCategories(type);
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete category');
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
          <button className="action-btn view" onClick={openCreate}>
            + Add category
          </button>
        </div>
      </div>

      <p className="page-hint">
        These names and icons appear in the KinBech mobile app
        {type === 'product' ? ' (home, explore, post listing).' : ' (shop setup and explore stores).'}
      </p>

      {showForm && (
        <form className="invite-form category-form" onSubmit={handleSave}>
          <h3>{editingId ? 'Edit category' : `New ${type} category`}</h3>
          <div className="form-row">
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </label>
            <label>
              Icon
              <select
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
              >
                {ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {icon}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Color
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </label>
          </div>
          <div className="form-row">
            <CategoryImageField
              imageUrl={form.imageUrl}
              onChange={(imageUrl) => setForm((prev) => ({ ...prev, imageUrl }))}
            />
          </div>
          <div className="form-row">
            <label className="full">
              Description
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Shown on shop category cards"
              />
            </label>
          </div>
          {type === 'product' ? (
            <div className="form-row">
              <label className="full" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  checked={Boolean(form.requiresPreApproval)}
                  onChange={(e) =>
                    setForm({ ...form, requiresPreApproval: e.target.checked })
                  }
                />
                Requires admin pre-approval before listings go public
              </label>
            </div>
          ) : null}
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
                    <button className="action-btn suspend" onClick={() => handleDelete(cat.id)}>
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
                        <div className="user-name">{cat.name}</div>
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
                      <button className="action-btn suspend" onClick={() => handleDelete(cat.id)}>
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
};

export default Categories;
