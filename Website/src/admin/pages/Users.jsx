import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, ChevronDown, Filter, Package, Phone, Search, Store, X } from 'lucide-react';
import api from '../services/api';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { useTheme } from '../context/ThemeContext';

const Users = () => {
  const { colors } = useTheme();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useViewMode('users', 'list');
  const debouncedSearch = useDebounce(searchTerm);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/auth/admin/users', {
        params: {
          status: filter === 'all' ? undefined : filter,
          q: debouncedSearch,
          page,
          limit
        }
      });
      
      const { users: data, total: totalCount, totalPages: pages } = response.data;
      setUsers(data);
      setTotal(totalCount || 0);
      setTotalPages(pages || 1);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, page, limit]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const filterOptions = [
    { value: 'all', label: 'All Users' },
    { value: 'verified', label: 'Verified' },
    { value: 'unverified', label: 'Unverified' },
    { value: 'suspended', label: 'Suspended' },
  ];

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

  const renderActions = (user) => (
    <div className="action-buttons">
      <button className="action-btn view">View</button>
      {user.status === 'verified' && (
        <button className="action-btn suspend" onClick={() => handleUserAction(user.id || user._id, 'suspend')}>Suspend</button>
      )}
      {user.status === 'suspended' && (
        <button className="action-btn reinstate" onClick={() => handleUserAction(user.id || user._id, 'reinstate')}>Reinstate</button>
      )}
    </div>
  );

  return (
    <div className="users-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>
        </div>
        <div className="filter-group right">
          <ViewToggle view={view} onChange={setView} />
          <div className="dropdown-filter">
            <Filter className="filter-icon" />
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              {filterOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown className="chev-icon" />
          </div>
          {(searchTerm || filter !== 'all') && (
            <button className="clear-btn" onClick={() => { setSearchTerm(''); setFilter('all'); }}>
              <X className="item-icon" /> Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading users...</div>
      ) : users.length === 0 ? (
        <div className="table-container">
          <div className="empty-state">No users found</div>
        </div>
      ) : (
        <>
          {view === 'card' ? (
            <div className="card-grid cols-5">
              {users.map((user) => (
                <article className="data-card" key={user.id || user._id}>
                  <div className="data-card-body">
                    <div className="data-card-head">
                      <span className="user-avatar-small">
                        {user.name?.charAt(0).toUpperCase()}
                      </span>
                      <div className="data-card-head-text">
                        <div className="data-card-title">{user.name}</div>
                        <div className="data-card-sub">{user.email || user.phone}</div>
                      </div>
                    </div>
                    <div className="data-card-pricerow">
                      <span className="data-card-sub">{getSellerTypeLabel(user.sellerType)}</span>
                      {getStatusBadge(user.status)}
                    </div>
                    <div className="data-card-meta">
                      <span>
                        <Phone className="item-icon" aria-hidden /> {user.phone}
                      </span>
                      <span>
                        <CalendarDays className="item-icon" aria-hidden />
                        {new Date(user.joinDate).toLocaleDateString()}
                      </span>
                      <span>
                        <Package className="item-icon" aria-hidden /> {user.listingsCount} listings
                      </span>
                    </div>
                    {user.sellerType === 'shop' && user.shopName ? (
                      <div className="shop-link">
                        <Store className="item-icon" aria-hidden /> {user.shopName}
                      </div>
                    ) : null}
                    <div className="data-card-actions">{renderActions(user)}</div>
                  </div>
                </article>
              ))}
            </div>
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
                  {users.map((user) => (
                    <tr key={user.id || user._id}>
                      <td>
                        <div className="user-cell">
                          <div className="user-avatar-small">
                            {user.name?.charAt(0).toUpperCase()}
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
                          <div className="shop-link"><Store className="item-icon" aria-hidden /> {user.shopName}</div>
                        )}
                      </td>
                      <td>{user.phone}</td>
                      <td>{new Date(user.joinDate).toLocaleDateString()}</td>
                      <td>{user.listingsCount}</td>
                      <td>{getStatusBadge(user.status)}</td>
                      <td>{renderActions(user)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <Pagination 
            page={page} 
            totalPages={totalPages} 
            total={total} 
            limit={limit} 
            onPageChange={setPage} 
          />
        </>
      )}
    </div>
  );
};

export default Users;