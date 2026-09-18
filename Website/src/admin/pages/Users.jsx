import { useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const Users = () => {
  const { colors } = useTheme();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/auth/admin/users');
      setUsers(response.data.users);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All Users' },
    { value: 'verified', label: 'Verified' },
    { value: 'unverified', label: 'Unverified' },
    { value: 'suspended', label: 'Suspended' },
  ];

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.includes(searchTerm);

    const matchesFilter =
      filter === 'all' ||
      (filter === 'verified' && user.status === 'verified') ||
      (filter === 'unverified' && user.status === 'unverified') ||
      (filter === 'suspended' && user.status === 'suspended');

    return matchesSearch && matchesFilter;
  });

  const getSellerTypeLabel = (type) => {
    switch (type) {
      case 'individual': return 'Individual Seller';
      case 'shop': return 'Shop Owner';
      case 'buyer': return 'Buyer Only';
      default: return type;
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'verified':
        return <span className="status-badge verified">Verified</span>;
      case 'unverified':
        return <span className="status-badge unverified">Unverified</span>;
      case 'suspended':
        return <span className="status-badge suspended">Suspended</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const handleUserAction = async (userId, action) => {
    try {
      await api.patch(`/auth/admin/users/${userId}/status`, { action });
      fetchUsers(); // Refresh the list
    } catch (error) {
      console.error('Failed to update user status:', error);
    }
  };

  return (
    <div className="users-page">
      <div className="page-header">
        <div className="page-filters">
          {filterOptions.map((option) => (
            <button
              key={option.value}
              className={`filter-chip ${filter === option.value ? 'active' : ''}`}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {loading ? (
        <div className="loading">Loading users...</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>User Name</th>
                <th>Seller Type</th>
                <th>Phone</th>
                <th>Join Date</th>
                <th>Listings</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="user-cell">
                      <div className="user-avatar-small">
                        {user.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="user-name">{user.name}</div>
                        <div className="user-email">{user.email || user.phone}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {getSellerTypeLabel(user.sellerType)}
                    {user.sellerType === 'shop' && user.shopName && (
                      <div className="shop-link">→ {user.shopName}</div>
                    )}
                  </td>
                  <td>{user.phone}</td>
                  <td>{new Date(user.joinDate).toLocaleDateString()}</td>
                  <td>{user.listingsCount}</td>
                  <td>{getStatusBadge(user.status)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn view">View</button>
                      {user.status === 'verified' && (
                        <button className="action-btn suspend" onClick={() => handleUserAction(user.id, 'suspend')}>Suspend</button>
                      )}
                      {user.status === 'suspended' && (
                        <button className="action-btn reinstate" onClick={() => handleUserAction(user.id, 'reinstate')}>Reinstate</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredUsers.length === 0 && (
            <div className="empty-state">No users found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Users;