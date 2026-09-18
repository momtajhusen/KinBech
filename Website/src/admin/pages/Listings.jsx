import { useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const Listings = () => {
  const { colors } = useTheme();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    try {
      const response = await api.get('/listings/admin/all');
      const listingsData = response.data.listings.map(listing => ({
        id: listing._id,
        title: listing.title,
        postDate: listing.createdAt,
        seller: { 
          name: listing.seller?.name || 'Unknown', 
          type: listing.sellerType 
        },
        shop: listing.shopId ? { name: listing.shopId.name } : null,
        category: listing.category,
        price: listing.price,
        status: listing.status,
        reportsCount: listing.reportsCount || 0,
      }));
      setListings(listingsData);
    } catch (error) {
      console.error('Failed to fetch listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = [
    { value: 'all', label: 'All Listings' },
    { value: 'reported', label: 'Reported' },
    { value: 'pending', label: 'Pending Review' },
    { value: 'sold', label: 'Sold' },
  ];

  const filteredListings = listings.filter(listing => {
    const matchesSearch =
      listing.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      listing.seller?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'reported' && listing.status === 'reported') ||
      (filter === 'pending' && listing.status === 'pending') ||
      (filter === 'sold' && listing.status === 'sold');

    return matchesSearch && matchesFilter;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="status-badge active">Active</span>;
      case 'reported':
        return <span className="status-badge reported">Reported ({0})</span>;
      case 'pending':
        return <span className="status-badge pending">Pending Review</span>;
      case 'sold':
        return <span className="status-badge sold">Sold</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const formatPrice = (price) => {
    return `₹${price.toLocaleString()}`;
  };

  const getCategoryColor = (category) => {
    return colors.category[category.toLowerCase()] || colors.primary;
  };

  const handleListingAction = async (listingId, action) => {
    try {
      let status;
      
      if (action === 'approve') {
        status = 'active';
      } else if (action === 'reject') {
        status = 'rejected';
      } else if (action === 'remove') {
        status = 'removed';
      }

      await api.patch(`/listings/admin/${listingId}/status`, { status });
      fetchListings(); // Refresh the list
    } catch (error) {
      console.error('Failed to update listing status:', error);
    }
  };

  return (
    <div className="listings-page">
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
          placeholder="Search listings by title, category, or seller..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {loading ? (
        <div className="loading">Loading listings...</div>
      ) : (
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Listing Title</th>
                <th>Post Date</th>
                <th>Seller/Shop</th>
                <th>Category</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredListings.map((listing) => (
                <tr key={listing.id}>
                  <td>
                    <div className="listing-title-cell">
                      <div className="listing-title">{listing.title}</div>
                      <div className="listing-id">#{listing.id}</div>
                    </div>
                  </td>
                  <td>{new Date(listing.postDate).toLocaleDateString()}</td>
                  <td>
                    <div className="seller-cell">
                      <div className="seller-name">{listing.seller?.name || 'N/A'}</div>
                      {listing.shop && (
                        <div className="shop-badge">🏪 {listing.shop.name}</div>
                      )}
                    </div>
                  </td>
                  <td>
                    <span
                      className="category-badge"
                      style={{ backgroundColor: `${getCategoryColor(listing.category)}15`, color: getCategoryColor(listing.category) }}
                    >
                      {listing.category}
                    </span>
                  </td>
                  <td className="price-cell">{formatPrice(listing.price)}</td>
                  <td>{getStatusBadge(listing.status)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn view">View</button>
                      {listing.status === 'pending' && (
                        <>
                          <button className="action-btn approve" onClick={() => handleListingAction(listing.id, 'approve')}>Approve</button>
                          <button className="action-btn reject" onClick={() => handleListingAction(listing.id, 'reject')}>Reject</button>
                        </>
                      )}
                      {listing.status === 'reported' && (
                        <button className="action-btn remove" onClick={() => handleListingAction(listing.id, 'remove')}>Remove</button>
                      )}
                      {listing.status === 'active' && (
                        <button className="action-btn remove" onClick={() => handleListingAction(listing.id, 'remove')}>Remove</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredListings.length === 0 && (
            <div className="empty-state">No listings found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Listings;