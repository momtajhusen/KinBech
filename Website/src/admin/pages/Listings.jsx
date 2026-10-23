import { useState, useEffect, useCallback } from 'react';
import { CalendarDays, ChevronDown, Filter, Image as ImageIcon, Search, Store, Tag, X } from 'lucide-react';
import api from '../services/api';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { useTheme } from '../context/ThemeContext';
import { mediaUrl } from '../../config';

const Listings = () => {
  const { colors } = useTheme();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [view, setView] = useViewMode('listings', 'card');
  const debouncedSearch = useDebounce(searchTerm);
  
  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active':
        return <span className="status-badge active">Active</span>;
      case 'reported':
        return <span className="status-badge reported">Reported</span>;
      case 'pending':
        return <span className="status-badge pending">Pending Review</span>;
      case 'sold':
        return <span className="status-badge sold">Sold</span>;
      default:
        return <span className="status-badge">{status}</span>;
    }
  };

  const fetchListings = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/listings/admin/all', {
        params: {
          status: filter,
          q: debouncedSearch,
          page,
          limit
        }
      });
      
      const { listings: data, total: totalCount, totalPages: pages } = response.data;
      
      const listingsData = data.map(listing => ({
        id: listing.id || listing._id,
        title: listing.title,
        postDate: listing.createdAt,
        seller: { 
          name: listing.seller?.name || 'Unknown', 
          type: listing.sellerType 
        },
        shop: listing.shopId ? { name: listing.shopId.name || listing.shopId } : null,
        category: listing.category,
        price: listing.price,
        photos: Array.isArray(listing.photos) ? listing.photos : [],
        location: listing.location || '',
        status: listing.status,
        reportsCount: listing.reportsCount || 0,
        moderationReason: listing.moderationReason || '',
        matchedKeywords: listing.matchedKeywords || [],
      }));
      
      setListings(listingsData);
      setTotal(totalCount || 0);
      setTotalPages(pages || 1);
    } catch (error) {
      console.error('Failed to fetch listings:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, page, limit]);

  useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const filterOptions = [
    { value: 'all', label: 'All Listings' },
    { value: 'reported', label: 'Reported' },
    { value: 'pending', label: 'Pending Review' },
    { value: 'sold', label: 'Sold' },
  ];

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

  const renderActions = (listing) => (
    <div className="action-buttons">
      <button className="action-btn view">View</button>
      {listing.status === 'pending' && (
        <>
          <button className="action-btn approve" onClick={() => handleListingAction(listing.id, 'approve')}>Approve</button>
          <button className="action-btn reject" onClick={() => handleListingAction(listing.id, 'reject')}>Reject</button>
        </>
      )}
      {(listing.status === 'reported' || listing.status === 'active') && (
        <button className="action-btn remove" onClick={() => handleListingAction(listing.id, 'remove')}>Remove</button>
      )}
    </div>
  );

  return (
    <div className="listings-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search listings..."
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
        <div className="loading">Loading listings...</div>
      ) : listings.length === 0 ? (
        <div className="table-container">
          <div className="empty-state">No listings found</div>
        </div>
      ) : (
        <>
          {view === 'card' ? (
            <div className="card-grid cols-5">
              {listings.map((listing) => (
                <article className="data-card" key={listing.id}>
                  <div className="data-card-media">
                    {listing.photos[0] ? (
                      <img src={mediaUrl(listing.photos[0])} alt={listing.title} loading="lazy" />
                    ) : (
                      <ImageIcon className="item-icon" aria-hidden />
                    )}
                  </div>
                  <div className="data-card-body">
                    <div className="data-card-title">{listing.title}</div>
                    <div className="data-card-pricerow">
                      <span className="data-card-price">{formatPrice(listing.price)}</span>
                      {getStatusBadge(listing.status)}
                    </div>
                    <div className="data-card-meta">
                      <span>
                        <Tag className="item-icon" aria-hidden /> {listing.category}
                      </span>
                      <span>
                        <Store className="item-icon" aria-hidden />
                        {listing.shop?.name || listing.seller?.name || 'N/A'}
                      </span>
                      <span>
                        <CalendarDays className="item-icon" aria-hidden />
                        {new Date(listing.postDate).toLocaleDateString()}
                      </span>
                      {listing.location ? (
                        <span>{listing.location}</span>
                      ) : null}
                    </div>
                    {listing.moderationReason ? (
                      <div className="data-card-sub">Hold: {listing.moderationReason}</div>
                    ) : null}
                    {listing.matchedKeywords?.length ? (
                      <div className="data-card-sub">
                        Keywords: {listing.matchedKeywords.join(', ')}
                      </div>
                    ) : null}
                    <div className="data-card-actions">{renderActions(listing)}</div>
                  </div>
                </article>
              ))}
            </div>
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
                  {listings.map((listing) => (
                    <tr key={listing.id}>
                      <td>
                        <div className="listing-title-cell">
                          <div className="listing-title">{listing.title}</div>
                          <div className="listing-id">#{listing.id}</div>
                          {listing.moderationReason ? (
                            <div className="user-email" style={{ marginTop: 4 }}>
                              Hold: {listing.moderationReason}
                            </div>
                          ) : null}
                          {listing.matchedKeywords?.length ? (
                            <div className="user-email">
                              Keywords: {listing.matchedKeywords.join(', ')}
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td>{new Date(listing.postDate).toLocaleDateString()}</td>
                      <td>
                        <div className="seller-cell">
                          <div className="seller-name">{listing.seller?.name || 'N/A'}</div>
                          {listing.shop && (
                            <div className="shop-badge">
                              <Store className="item-icon" aria-hidden /> {listing.shop.name}
                            </div>
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
                      <td>{renderActions(listing)}</td>
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

export default Listings;