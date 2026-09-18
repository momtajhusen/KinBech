import { useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const Settings = () => {
  const { colors } = useTheme();
  const [admins, setAdmins] = useState([]);
  const [platformSettings, setPlatformSettings] = useState({
    listingExpiryDays: 30,
    minListingPrice: 100,
    defaultCurrency: 'NPR',
    supportEmail: 'support@kinbech.com',
  });
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    role: 'moderator',
  });

  useEffect(() => {
    fetchAdmins();
  }, []);

  const fetchAdmins = async () => {
    try {
      const response = await api.get('/auth/admin/all');
      setAdmins(response.data.admins);
    } catch (error) {
      console.error('Failed to fetch admins:', error);
    } finally {
      setLoading(false);
    }
  };

  const roleOptions = [
    { value: 'super_admin', label: 'Super Admin', description: 'Full access to all features' },
    { value: 'moderator', label: 'Moderator', description: 'Listings & reports management' },
    { value: 'support', label: 'Support', description: 'Users & tickets management' },
  ];

  const getRoleBadge = (role) => {
    switch (role) {
      case 'super_admin':
        return <span className="role-badge super-admin">Super Admin</span>;
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

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    try {
      // Generate a temporary password for the new admin
      const tempPassword = Math.random().toString(36).slice(-8);
      
      await api.post('/auth/admin/create', {
        email: inviteForm.email,
        password: tempPassword,
        role: inviteForm.role,
        name: inviteForm.email.split('@')[0],
      });
      
      setInviteForm({ email: '', role: 'moderator' });
      setShowInviteForm(false);
      alert('Admin created successfully! Temporary password: ' + tempPassword);
      fetchAdmins(); // Refresh the list
    } catch (error) {
      console.error('Failed to create admin:', error);
      alert('Failed to create admin');
    }
  };

  const handleSettingsChange = (e) => {
    const { name, value } = e.target;
    setPlatformSettings(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveSettings = async () => {
    try {
      // Simulated API call - replace with actual API call
      alert('Platform settings saved successfully!');
    } catch (error) {
      console.error('Failed to save settings:', error);
      alert('Failed to save settings');
    }
  };

  const handleRemoveAdmin = async (adminId) => {
    if (window.confirm('Are you sure you want to remove this admin?')) {
      try {
        await api.delete(`/auth/admin/${adminId}`);
        alert('Admin removed successfully');
        fetchAdmins(); // Refresh the list
      } catch (error) {
        console.error('Failed to remove admin:', error);
        alert('Failed to remove admin');
      }
    }
  };

  return (
    <div className="settings-page">
      <div className="settings-grid">
        <div className="admins-section">
          <div className="card">
            <div className="card-header">
              <h3>Admin Roles</h3>
              <button
                onClick={() => setShowInviteForm(true)}
                className="btn btn-primary"
              >
                + Invite Admin
              </button>
            </div>

            {showInviteForm && (
              <div className="invite-form-overlay">
                <div className="invite-form">
                  <div className="invite-form-header">
                    <h4>Invite New Admin</h4>
                    <button
                      onClick={() => setShowInviteForm(false)}
                      className="close-btn"
                    >
                      ✕
                    </button>
                  </div>
                  <form onSubmit={handleInviteSubmit}>
                    <div className="form-group">
                      <label>Email Address *</label>
                      <input
                        type="email"
                        value={inviteForm.email}
                        onChange={(e) => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="admin@kinbech.com"
                        className="form-input"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Role *</label>
                      <select
                        value={inviteForm.role}
                        onChange={(e) => setInviteForm(prev => ({ ...prev, role: e.target.value }))}
                        className="form-select"
                        required
                      >
                        {roleOptions.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="form-actions">
                      <button
                        type="button"
                        onClick={() => setShowInviteForm(false)}
                        className="btn btn-secondary"
                      >
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary">
                        Send Invitation
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            <div className="admins-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Admin</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Access</th>
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
                      <td>{new Date(admin.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div className="action-buttons">
                          <button className="action-btn small">Edit</button>
                          {admin.role !== 'super_admin' && (
                            <button
                              onClick={() => handleRemoveAdmin(admin.id)}
                              className="action-btn small delete"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="platform-settings-section">
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
                <p className="form-hint">Listings will be automatically removed after this period</p>
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
                <p className="form-hint">Set minimum price to prevent spam listings</p>
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
                <p className="form-hint">Email shown to users for support requests</p>
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
                    {role.value === 'super_admin' && (
                      <span className="access-item">✓ All Access</span>
                    )}
                    {role.value === 'moderator' && (
                      <>
                        <span className="access-item">✓ Listings Management</span>
                        <span className="access-item">✓ Reports Management</span>
                        <span className="access-item">✗ User Management</span>
                        <span className="access-item">✗ Settings Access</span>
                      </>
                    )}
                    {role.value === 'support' && (
                      <>
                        <span className="access-item">✓ User Management</span>
                        <span className="access-item">✓ Support Tickets</span>
                        <span className="access-item">✗ Listings Management</span>
                        <span className="access-item">✗ Reports Management</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;