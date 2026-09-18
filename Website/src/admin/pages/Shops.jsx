import { useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const Shops = () => {
  const { colors } = useTheme();
  const [shops, setShops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchShops();
  }, []);

  const fetchShops = async () => {
    try {
      const response = await api.get('/shops/admin/all');
      const shopsData = response.data.shops.map(shop => ({
        id: shop._id,
        name: shop.name,
        category: shop.category,
        location: shop.location,
        owner: shop.owner,
        listingsCount: shop.listingsCount || 0,
        rating: shop.ratingAverage,
        reviewCount: shop.reviewCount,
        status: shop.isVerified ? 'verified' : (shop.status === 'suspended' ? 'rejected' : 'pending'),
      }));
      setShops(shopsData);
    } catch (error) {
      console.error('Failed to fetch shops:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All Shops' },
    { value: 'pending', label: 'Pending' },
    { value: 'verified', label: 'Verified' },
    { value: 'rejected', label: 'Suspended' },
  ];

  const filteredShops = shops.filter(shop => {
    const matchesSearch =
      shop.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shop.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      shop.location?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'pending' && shop.status === 'pending') ||
      (filter === 'verified' && shop.status === 'verified') ||
      (filter === 'rejected' && shop.status === 'rejected');

    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'verified':
        return <span className="status-badge verified">Verified</span>;
      case 'pending':
        return <span className="status-badge pending">Pending</span>;
      case 'rejected':
        return <span className="status-badge rejected">Rejected</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const getCategoryColor = (category) => {
    return colors.category[category.toLowerCase()] || colors.primary;
  };

  const handleShopAction = async (shopId, action) => {
    try {
      let status, isVerified;
      
      if (action === 'approve') {
        status = 'active';
        isVerified = true;
      } else if (action === 'reject') {
        status = 'suspended';
        isVerified = false;
      } else if (action === 'suspend') {
        status = 'suspended';
        isVerified = false;
      }

      await api.patch(`/shops/admin/${shopId}/status`, { status, isVerified });
      fetchShops(); // Refresh the list
    } catch (error) {
      console.error('Failed to update shop status:', error);
    }
  };

  return (
    <div className="shops-page">
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
          placeholder="Search shops by name, category, or location..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {loading ? (
        <div className="loading">Loading shops...</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Shop Name</th>
                <th>Category</th>
                <th>Owner</th>
                <th>Location</th>
                <th>Rating</th>
                <th>Listings</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredShops.map((shop) => (
                <tr key={shop.id}>
                  <td>
                    <div className="shop-name-cell">
                      <div className="shop-avatar">{shop.name.charAt(0)}</div>
                      <div>
                        <div className="shop-name">{shop.name}</div>
                        <div className="shop-location">{shop.location}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span
                      className="category-badge"
                      style={{ backgroundColor: `${getCategoryColor(shop.category)}15`, color: getCategoryColor(shop.category) }}
                    >
                      {shop.category}
                    </span>
                  </td>
                  <td>{shop.owner?.name || 'N/A'}</td>
                  <td>{shop.location}</td>
                  <td>
                    <div className="rating-cell">
                      <span className="rating-stars">⭐ {shop.rating?.toFixed(1)}</span>
                      <span className="review-count">({shop.reviewCount})</span>
                    </div>
                  </td>
                  <td>{shop.listingsCount}</td>
                  <td>{getStatusBadge(shop.status)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn view">View</button>
                      {shop.status === 'pending' && (
                        <>
                          <button className="action-btn approve" onClick={() => handleShopAction(shop.id, 'approve')}>Approve</button>
                          <button className="action-btn reject" onClick={() => handleShopAction(shop.id, 'reject')}>Reject</button>
                        </>
                      )}
                      {shop.status === 'verified' && (
                        <button className="action-btn suspend" onClick={() => handleShopAction(shop.id, 'suspend')}>Suspend</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredShops.length === 0 && (
            <div className="empty-state">No shops found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Shops;