import { useState, useEffect, useCallback } from 'react';
import { Check, Copy, KeyRound, Store, User, UserCog, UserPlus, X } from 'lucide-react';
import api from '../services/api';
import Modal, { OptionCards } from '../components/Modal';
import { confirmAction, toast } from '../components/Feedback';
import Pagination from '../components/Pagination';
import PostLimitStepper, { PostLimitPresets, clampPosts, postLimitLabel } from '../components/PostLimitStepper';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { roleMenuAccess } from '../navigation';

const POST_LIMIT_ROWS = [
  {
    key: 'individualDailyListings',
    icon: User,
    title: 'Individual sellers',
    description: 'Posts from the Sell screen as a person',
  },
  {
    key: 'shopDailyListings',
    icon: Store,
    title: 'Stores',
    description: 'Posts added to a store, counted per owner',
  },
];

function DailyPostLimits({ settings, canEdit, onSaved }) {
  const saved = {
    individualDailyListings: clampPosts(settings.individualDailyListings),
    shopDailyListings: clampPosts(settings.shopDailyListings),
  };
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const changed = POST_LIMIT_ROWS.some(({ key }) => draft[key] !== saved[key]);

  useEffect(() => {
    setDraft({
      individualDailyListings: clampPosts(settings.individualDailyListings),
      shopDailyListings: clampPosts(settings.shopDailyListings),
    });
  }, [settings.individualDailyListings, settings.shopDailyListings]);

  const save = async () => {
    setBusy(true);
    try {
      const response = await api.put('/auth/admin/settings', draft);
      if (response.data.settings) onSaved(response.data.settings);
      toast.success('They apply from the next post.', { title: 'Daily post limits saved' });
    } catch {
      /* the API layer shows the error */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <h3>Daily post limits</h3>
          <p className="form-hint" style={{ margin: '0.2rem 0 0' }}>New listings one seller can post in 24 hours</p>
        </div>
      </div>
      <div className="post-limits">
        {POST_LIMIT_ROWS.map(({ key, icon: Icon, title, description }) => {
          const value = draft[key];
          return (
            <div className="post-limit-row" key={key}>
              <div className="post-limit-head">
                <div className="post-limit-icon"><Icon className="item-icon" aria-hidden /></div>
                <div className="post-limit-copy">
                  <label htmlFor={`limit-${key}`}>{title}</label>
                  <span>{description}</span>
                </div>
                <PostLimitStepper
                  id={`limit-${key}`}
                  value={value}
                  disabled={!canEdit || busy}
                  onChange={(next) => setDraft((prev) => ({ ...prev, [key]: next }))}
                />
              </div>
              <div className="post-limit-foot">
                <span className={`post-limit-status${value === 0 ? ' open' : ''}`}>{postLimitLabel(value)}</span>
                <PostLimitPresets
                  value={value}
                  disabled={!canEdit || busy}
                  onPick={(preset) => setDraft((prev) => ({ ...prev, [key]: preset }))}
                />
              </div>
            </div>
          );
        })}
        <p className="form-hint">
          0 means no limit. A seller who is both posts under each limit separately. New or unverified
          accounts stay at 5 a day, and Watch-tier sellers follow Trust → Settings, whichever is lower.
          Admin accounts are not limited. To give one person a different limit, open them in Users.
        </p>
        <div className="form-actions">
          <button type="button" className="btn btn-primary" onClick={save} disabled={!canEdit || busy || !changed}>
            {busy ? 'Saving…' : 'Save limits'}
          </button>
          {changed && !busy ? (
            <button type="button" className="btn btn-secondary" onClick={() => setDraft(saved)}>
              Reset
            </button>
          ) : null}
        </div>
        {!canEdit ? <p className="form-hint">Only a super admin or admin can change these limits.</p> : null}
      </div>
    </div>
  );
}

const Settings = () => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isFullAdmin = isSuperAdmin || user?.role === 'admin';
  const [admins, setAdmins] = useState([]);
  const [createdAdmin, setCreatedAdmin] = useState(null);
  const [platformSettings, setPlatformSettings] = useState({
    listingExpiryDays: 0,
    minListingPrice: 0,
    defaultCurrency: 'NPR',
    supportEmail: 'support@kinbech.com',
  });
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'moderator',
  });
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');
  const [copied, setCopied] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchAdmins = useCallback(async () => {
    try {
      const response = await api.get('/auth/admin/all', { params: { page, limit } });
      setAdmins(response.data.admins || []);
      setTotal(response.data.total || 0);
      setTotalPages(response.data.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch admins:', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit]);

  useEffect(() => {
    fetchAdmins();
  }, [fetchAdmins]);

  useEffect(() => {
    api.get('/auth/admin/settings')
      .then((response) => {
        if (response.data.settings) setPlatformSettings(response.data.settings);
      })
      .catch((error) => console.error('Failed to load platform settings:', error));
  }, []);

  const roleOptions = [
    { value: 'super_admin', label: 'Super Admin', description: 'Full access to all features' },
    { value: 'admin', label: 'Admin', description: 'Everything except managing admins' },
    { value: 'moderator', label: 'Moderator', description: 'Listings, shops, reports and reviews' },
    { value: 'support', label: 'Support', description: 'Users, support tickets and reports' },
  ];

  const getRoleBadge = (role) => {
    switch (role) {
      case 'super_admin':
        return <span className="role-badge super-admin">Super Admin</span>;
      case 'admin':
        return <span className="role-badge super-admin">Admin</span>;
      case 'moderator':
        return <span className="role-badge moderator">Moderator</span>;
      case 'support':
        return <span className="role-badge support">Support</span>;
      default:
        return <span className="role-badge">{role}</span>;
    }
  };

  const getAccessList = (access) => {
    if (access.includes('all')) return 'All Access';
    return access.map(a => a.charAt(0).toUpperCase() + a.slice(1)).join(', ');
  };

  const openInvite = () => {
    setInviteForm({ email: '', role: 'moderator' });
    setModalError('');
    setShowInviteForm(true);
  };

  const openEdit = (admin) => {
    setModalError('');
    setEditingAdmin({ id: admin.id, name: admin.name, role: admin.role, email: admin.email });
  };

  const handleInviteSubmit = async () => {
    if (!/^\S+@\S+\.\S+$/.test(inviteForm.email.trim())) {
      setModalError('Enter a valid email address');
      return;
    }
    setModalBusy(true);
    setModalError('');
    try {
      // The server generates a strong one-time password; the new admin must change it at first login.
      const response = await api.post('/auth/admin/create', {
        email: inviteForm.email.trim(),
        role: inviteForm.role,
        name: inviteForm.email.trim().split('@')[0],
      });

      setShowInviteForm(false);
      setCopied(false);
      setCreatedAdmin({
        email: response.data.admin?.email || inviteForm.email,
        password: response.data.temporaryPassword || '',
      });
      fetchAdmins();
    } catch (error) {
      setModalError(error.response?.data?.message || 'Failed to create admin');
    } finally {
      setModalBusy(false);
    }
  };

  const copyPassword = async () => {
    try {
      await navigator.clipboard?.writeText(createdAdmin.password);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setPlatformSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveSettings = async () => {
    try {
      const response = await api.put('/auth/admin/settings', platformSettings);
      if (response.data.settings) setPlatformSettings(response.data.settings);
      toast.success('Expiry, minimum price, currency and support email are updated.', { title: 'Platform settings saved' });
    } catch {
      /* the API layer shows the error */
    }
  };

  const handleEditAdmin = async () => {
    if (!editingAdmin.name.trim()) {
      setModalError('Name is required');
      return;
    }
    setModalBusy(true);
    setModalError('');
    try {
      await api.patch(`/auth/admin/${editingAdmin.id}`, {
        name: editingAdmin.name.trim(),
        role: editingAdmin.role,
      });
      setEditingAdmin(null);
      toast.success(`${editingAdmin.name.trim()} updated`);
      fetchAdmins();
    } catch (error) {
      setModalError(error.response?.data?.message || 'Failed to update admin');
    } finally {
      setModalBusy(false);
    }
  };

  const handleResetTwoFactor = async (admin) => {
    const ok = await confirmAction({
      title: 'Reset two-step verification?',
      message: `${admin.email} will be signed out and must set up their authenticator again.`,
      confirmLabel: 'Reset 2FA',
      tone: 'warning',
      icon: 'phonelink_lock',
    });
    if (!ok) return;
    try {
      const response = await api.post(`/auth/admin/${admin.id}/reset-2fa`);
      toast.success(response.data.message || `2FA reset for ${admin.email}`);
      fetchAdmins();
    } catch {
      /* the API layer shows the error */
    }
  };

  const handleRemoveAdmin = async (admin) => {
    const ok = await confirmAction({
      title: `Remove ${admin.name || admin.email}?`,
      message: 'They lose access to the admin panel right away. Their past actions stay in the activity log.',
      confirmLabel: 'Remove admin',
      tone: 'danger',
      icon: 'person_remove',
    });
    if (!ok) return;
    try {
      await api.delete(`/auth/admin/${admin.id}`);
      toast.success(`${admin.name || admin.email} no longer has admin access`, { title: 'Admin removed' });
      fetchAdmins();
    } catch {
      /* the API layer shows the error */
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <div className="admins-section">
          <div className="card">
            <div className="card-header">
              <h3>Admin Roles</h3>
              {isSuperAdmin ? (
                <button
                  onClick={openInvite}
                  className="btn btn-primary"
                >
                  + Invite Admin
                </button>
              ) : null}
            </div>

            {createdAdmin && (
              <Modal
                icon={KeyRound}
                title="Admin created"
                subtitle={`Share these sign-in details privately with ${createdAdmin.email}.`}
                size="sm"
                onClose={() => setCreatedAdmin(null)}
                footer={(
                  <>
                    <button type="button" className="btn btn-secondary" onClick={copyPassword}>
                      {copied ? <Check className="item-icon" aria-hidden /> : <Copy className="item-icon" aria-hidden />}
                      {copied ? 'Copied' : 'Copy password'}
                    </button>
                    <button type="button" className="btn btn-primary" onClick={() => setCreatedAdmin(null)}>Done</button>
                  </>
                )}
              >
                <div className="form-group">
                  <label>Email</label>
                  <div className="kb-secret"><span>{createdAdmin.email}</span></div>
                </div>
                <div className="form-group">
                  <label>One-time password</label>
                  <div className="kb-secret"><span>{createdAdmin.password}</span></div>
                </div>
                <div className="u360-banner warning compact">
                  <div>
                    <strong>Shown only once</strong>
                    <span>The new admin must change this password and set up two-step verification at first login.</span>
                  </div>
                </div>
              </Modal>
            )}

            {showInviteForm && (
              <Modal
                icon={UserPlus}
                title="Invite new admin"
                subtitle="A one-time password is created for them. You'll see it after you invite."
                size="md"
                busy={modalBusy}
                onClose={() => setShowInviteForm(false)}
                onSubmit={handleInviteSubmit}
                footer={(
                  <>
                    <button type="button" className="btn btn-secondary" onClick={() => setShowInviteForm(false)} disabled={modalBusy}>Cancel</button>
                    <button type="submit" className="btn btn-primary" disabled={modalBusy}>
                      {modalBusy ? 'Creating…' : 'Create admin'}
                    </button>
                  </>
                )}
              >
                <div className="form-group">
                  <label htmlFor="invite-email">Email address *</label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="name@company.com"
                    className="form-input"
                    required
                  />
                  <p className="form-hint">
                    If this is a Google (Gmail) address, they can also open the admin panel in the KinBech app with Google sign-in.
                  </p>
                </div>
                <div className="form-group">
                  <label>Role</label>
                  <OptionCards
                    value={inviteForm.role}
                    onChange={(role) => setInviteForm((prev) => ({ ...prev, role }))}
                    options={roleOptions.map((option) => ({ value: option.value, label: option.label, description: option.description }))}
                  />
                </div>
                {modalError ? <div className="u360-error">{modalError}</div> : null}
              </Modal>
            )}

            <div className="admins-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Access</th>
                    <th>2FA</th>
                    <th>Added</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((admin) => (
                    <tr key={admin.id}>
                      <td>
                        <div className="admin-cell">
                          <div className="admin-avatar">{admin.name.charAt(0).toUpperCase()}</div>
                          <span className="admin-name">{admin.name}</span>
                        </div>
                      </td>
                      <td>{admin.email}</td>
                      <td>{getRoleBadge(admin.role)}</td>
                      <td className="access-cell">{getAccessList(admin.access)}</td>
                      <td>
                        <span className={`status-badge ${admin.twoFactorEnabled ? 'active' : 'pending'}`}>
                          {admin.twoFactorEnabled ? 'On' : 'Off'}
                        </span>
                      </td>
                      <td>{new Date(admin.createdAt).toLocaleDateString()}</td>
                      <td>
                        {isSuperAdmin ? (
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="action-btn small"
                            onClick={() => openEdit(admin)}
                          >
                            Edit
                          </button>
                          {admin.twoFactorEnabled ? (
                            <button
                              type="button"
                              className="action-btn small"
                              onClick={() => handleResetTwoFactor(admin)}
                            >
                              Reset 2FA
                            </button>
                          ) : null}
                          {admin.role !== 'super_admin' && (
                            <button
                              onClick={() => handleRemoveAdmin(admin)}
                              className="action-btn small delete"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                        ) : <span className="form-hint">Super admin only</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </div>
        </div>

        <div className="platform-settings-section">
          <DailyPostLimits
            settings={platformSettings}
            canEdit={isFullAdmin}
            onSaved={(next) => setPlatformSettings((prev) => ({
              ...prev,
              individualDailyListings: next.individualDailyListings,
              shopDailyListings: next.shopDailyListings,
            }))}
          />

          <div className="card">
            <div className="card-header">
              <h3>Platform Settings</h3>
            </div>
            <div className="settings-form">
              <div className="form-group">
                <label>Listing Auto-Expiry (Days)</label>
                <input
                  type="number"
                  name="listingExpiryDays"
                  value={platformSettings.listingExpiryDays}
                  onChange={handleSettingsChange}
                  className="form-input"
                  min="1"
                />
                <p className="form-hint">0 keeps listings up. A number hides active listings older than that many days from the public app.</p>
              </div>

              <div className="form-group">
                <label>Minimum Listing Price (NPR)</label>
                <input
                  type="number"
                  name="minListingPrice"
                  value={platformSettings.minListingPrice}
                  onChange={handleSettingsChange}
                  className="form-input"
                  min="0"
                />
                <p className="form-hint">0 allows any price. New listings below this amount are rejected.</p>
              </div>

              <div className="form-group">
                <label>Default Currency</label>
                <select
                  name="defaultCurrency"
                  value={platformSettings.defaultCurrency}
                  onChange={handleSettingsChange}
                  className="form-select"
                >
                  <option value="NPR">NPR (Nepalese Rupee)</option>
                  <option value="USD">USD (US Dollar)</option>
                  <option value="EUR">EUR (Euro)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Support Contact Email</label>
                <input
                  type="email"
                  name="supportEmail"
                  value={platformSettings.supportEmail}
                  onChange={handleSettingsChange}
                  className="form-input"
                />
                <p className="form-hint">Saved with the other platform settings</p>
              </div>

              <div className="form-actions">
                <button
                  onClick={handleSaveSettings}
                  className="btn btn-primary"
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3>Role Permissions</h3>
            </div>
            <div className="role-permissions">
              {roleOptions.map((role) => (
                <div key={role.value} className="role-permission-item">
                  <div className="role-permission-header">
                    <h4>{role.label}</h4>
                    <span className="role-description">{role.description}</span>
                  </div>
                  <div className="role-access-list">
                    {roleMenuAccess(role.value).map((section) => (
                      <span
                        key={section.key}
                        className={`access-item ${section.allowed ? 'allowed' : 'denied'}`}
                        title={section.partial ? `Only: ${section.partial.join(', ')}` : undefined}
                      >
                        {section.allowed
                          ? <Check className="item-icon" aria-hidden />
                          : <X className="item-icon" aria-hidden />}
                        {section.label}
                        {section.partial ? <small className="access-partial">({section.partial.join(', ')})</small> : null}
                      </span>
                    ))}
                    <span className={`access-item ${role.value === 'super_admin' ? 'allowed' : 'denied'}`}>
                      {role.value === 'super_admin'
                        ? <Check className="item-icon" aria-hidden />
                        : <X className="item-icon" aria-hidden />}
                      Add or edit admins
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {editingAdmin ? (
        <Modal
          icon={UserCog}
          title="Edit admin"
          subtitle={editingAdmin.email}
          size="md"
          busy={modalBusy}
          onClose={() => setEditingAdmin(null)}
          onSubmit={handleEditAdmin}
          footer={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => setEditingAdmin(null)} disabled={modalBusy}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={modalBusy}>{modalBusy ? 'Saving…' : 'Save changes'}</button>
            </>
          )}
        >
          <div className="form-group">
            <label htmlFor="edit-admin-name">Name</label>
            <input
              id="edit-admin-name"
              className="form-input"
              value={editingAdmin.name}
              onChange={(e) => setEditingAdmin((prev) => ({ ...prev, name: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Role</label>
            <OptionCards
              value={editingAdmin.role}
              onChange={(role) => setEditingAdmin((prev) => ({ ...prev, role }))}
              options={roleOptions.map((option) => ({ value: option.value, label: option.label, description: option.description }))}
            />
          </div>
          {modalError ? <div className="u360-error">{modalError}</div> : null}
        </Modal>
      ) : null}
    </div>
  );
};

export default Settings;