import { useEffect, useState } from 'react';
import CategoryImageField from '../components/CategoryImageField';
import api from '../services/api';

const ICON_OPTIONS = [
  'phone-portrait-outline',
  'laptop-outline',
  'headset-outline',
  'file-tray-stacked-outline',
  'car-outline',
  'shirt-outline',
  'bicycle-outline',
  'basket-outline',
  'hardware-chip-outline',
  'home-outline',
  'medkit-outline',
  'restaurant-outline',
  'book-outline',
  'flower-outline',
  'diamond-outline',
  'construct-outline',
  'paw-outline',
  'game-controller-outline',
  'storefront-outline',
  'pricetag-outline',
  'ellipsis-horizontal-outline',
];

const emptyForm = {
  name: '',
  icon: 'pricetag-outline',
  imageUrl: '',
  color: '#5B39C6',
  description: '',
  sortOrder: 0,
  isActive: true,
};

const Categories = () => {
  const [type, setType] = useState('product');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);

  const fetchCategories = async (nextType = type) => {
    setLoading(true);
    try {
      const response = await api.get('/categories/admin', { params: { type: nextType } });
      setCategories(response.data.categories || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories(type);
  }, [type]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, sortOrder: categories.length });
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
        <button className="action-btn view" onClick={openCreate}>
          + Add category
        </button>
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
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Icon</th>
                <th>Description</th>
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
                    <code>{cat.icon}</code>
                  </td>
                  <td>{cat.description || '—'}</td>
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
          {categories.length === 0 && <div className="empty-state">No categories yet</div>}
        </div>
      )}
    </div>
  );
};

export default Categories;
