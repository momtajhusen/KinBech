import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CalendarDays, ChevronDown, Filter, Package, Phone, Search, X } from 'lucide-react';
import api from '../services/api';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { adminPath } from '../routes';
import { mediaUrl } from '../../config';

const filterOptions = [
  { value: 'all', label: 'All Users' },
  { value: 'verified', label: 'Profile complete' },
  { value: 'unverified', label: 'Profile incomplete' },
  { value: 'suspended', label: 'Suspended' },
];

const SELLER_TYPE_LABELS = {
  individual: 'Individual Seller',
  shop: 'Shop Owner',
  both: 'Shop + Individual',
  buyer: 'Buyer Only',
};

const shortDate = (value) => (value ? new Date(value).toLocaleDateString() : '');

function UserBadges({ user }) {
  return (
    <div className="user-badges">
      {user.status === 'suspended' ? (
        <span className="status-badge suspended" title={user.suspendedUntil ? `Until ${shortDate(user.suspendedUntil)}` : 'Permanent'}>
          Suspended{user.suspendedUntil ? ` · ${shortDate(user.suspendedUntil)}` : ''}
        </span>
      ) : (
        <span className="status-badge active">Active</span>
      )}
      {user.status !== 'suspended' && !user.profileComplete ? (
        <span className="status-badge unverified">Profile incomplete</span>
      ) : null}
      {user.isTester ? <span className="status-badge tester-badge">Tester</span> : null}
      {user.chatRestricted ? <span className="status-badge pending">Chat locked</span> : null}
      {user.deletionScheduledFor ? <span className="status-badge open">Deleting</span> : null}
      {user.strikes > 0 ? <span className="status-badge pending">{user.strikes} strike{user.strikes === 1 ? '' : 's'}</span> : null}
    </div>
  );
}

const Users = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [params] = useSearchParams();
  const queryQ = params.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(queryQ);
  const [filter, setFilter] = useState('all');
  const [view, setView] = useViewMode('users', 'list');
  const [busyId, setBusyId] = useState(null);
  const debouncedSearch = useDebounce(searchTerm);

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
    setSearchTerm(queryQ);
  }, [queryQ]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const openUser = (user) => navigate(adminPath(`users/${user.id || user._id}`));

  const handleUserAction = async (user, action) => {
    const name = user.name || user.phone || 'this user';
    if (action === 'suspend' && !window.confirm(`Suspend ${name}? They will be signed out of every device. For a timed suspension with a reason, open Details.`)) {
      return;
    }
    const id = user.id || user._id;
    setBusyId(id);
    try {
      await api.patch(`/auth/admin/users/${id}/status`, { action });
      await fetchUsers();
    } catch (error) {
      window.alert(error?.response?.data?.message || 'Could not update this user');
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (user) => {
    const id = user.id || user._id;
    return (
      <div className="action-buttons">
        <button type="button" className="action-btn view" onClick={() => openUser(user)}>Details</button>
        {user.status === 'suspended' ? (
          <button type="button" className="action-btn reinstate" disabled={busyId === id} onClick={() => handleUserAction(user, 'reinstate')}>Reinstate</button>
        ) : (
          <button type="button" className="action-btn suspend" disabled={busyId === id} onClick={() => handleUserAction(user, 'suspend')}>Suspend</button>
        )}
      </div>
    );
  };

  const avatar = (user) => (
    user.avatarUrl
      ? <img className="user-avatar-small" src={mediaUrl(user.avatarUrl)} alt="" />
      : <span className="user-avatar-small">{(user.name || user.phone || '?').charAt(0).toUpperCase()}</span>
  );

  return (
    <div className="users-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search name, phone or email..."
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
                    <button type="button" className="data-card-head user-open" onClick={() => openUser(user)}>
                      {avatar(user)}
                      <div className="data-card-head-text">
                        <div className="data-card-title">{user.name || 'No name'}</div>
                        <div className="data-card-sub">{user.email || user.phone}</div>
                      </div>
                    </button>
                    <div className="data-card-sub">{SELLER_TYPE_LABELS[user.sellerType] || user.sellerType}</div>
                    <UserBadges user={user} />
                    <div className="data-card-meta">
                      <span>
                        <Phone className="item-icon" aria-hidden /> {user.phone}
                      </span>
                      <span>
                        <CalendarDays className="item-icon" aria-hidden /> {shortDate(user.joinDate)}
                      </span>
                      <span>
                        <Package className="item-icon" aria-hidden /> {user.listingsCount} active listings
                      </span>
                    </div>
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
                    <th>Active listings</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id || user._id}>
                      <td>
                        <button type="button" className="user-cell user-open" onClick={() => openUser(user)}>
                          {avatar(user)}
                          <div>
                            <div className="user-name">{user.name || 'No name'}</div>
                            <div className="user-email">{user.email || user.phone}</div>
                          </div>
                        </button>
                      </td>
                      <td>{SELLER_TYPE_LABELS[user.sellerType] || user.sellerType}</td>
                      <td>{user.phone}</td>
                      <td>{shortDate(user.joinDate)}</td>
                      <td>{user.listingsCount}</td>
                      <td><UserBadges user={user} /></td>
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
