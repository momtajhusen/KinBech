import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronDown, Filter, MapPin, Package, Search, Star, User, X } from 'lucide-react';
import api from '../services/api';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import InfiniteLoader from '../components/InfiniteLoader';
import useInfiniteList from '../utils/useInfiniteList';
import useDebounce from '../utils/useDebounce';
import { useTheme } from '../context/ThemeContext';
import { mediaUrl } from '../../config';
import RecordModal from '../components/RecordModal';
import { confirmAction, errorMessage, toast } from '../components/Feedback';

const Shops = () => {
  const { colors } = useTheme();
  const [params] = useSearchParams();
  const queryQ = params.get('q') || '';
  const [searchTerm, setSearchTerm] = useState(queryQ);
  const [selected, setSelected] = useState(null);
  const [taxIds, setTaxIds] = useState(null);
  const [revealing, setRevealing] = useState(false);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    setTaxIds(null);
  }, [selected]);

  const revealTaxIds = async () => {
    if (!selected?.id) return;
    setRevealing(true);
    try {
      const { data } = await api.get(`/shops/admin/${selected.id}/tax-ids`);
      setTaxIds(data);
    } catch (error) {
      toast.error(errorMessage(error, 'Please try again.'), { title: 'Could not load tax IDs' });
    } finally {
      setRevealing(false);
    }
  };
  const [view, setView] = useViewMode('shops', 'card');
  const debouncedSearch = useDebounce(searchTerm);

  const limit = 20;

  const fetchPage = useCallback(async (page) => {
    try {
      const params = {
        q: debouncedSearch,
        page,
        limit,
      };
      if (filter === 'verified') {
        params.isVerified = true;
      } else if (filter === 'pending') {
        params.isVerified = false;
        params.status = 'active';
      } else if (filter === 'rejected') {
        params.status = 'suspended';
      }

      const response = await api.get('/shops/admin/all', { params });
      
      const { shops: data, total: totalCount, totalPages: pages } = response.data;
      
      const shopsData = data.map(shop => ({
        id: shop._id,
        name: shop.name,
        logo: shop.logo || '',
        coverImage: shop.coverImage || '',
        category: shop.category,
        location: shop.location,
        owner: shop.owner,
        listingsCount: shop.listingsCount || 0,
        rating: shop.ratingAverage,
        reviewCount: shop.reviewCount,
        panMasked: shop.panMasked || '',
        vatMasked: shop.vatMasked || '',
        businessDocuments: Array.isArray(shop.businessDocuments) ? shop.businessDocuments : [],
        verificationStatus: shop.verificationStatus || 'none',
        status: shop.isVerified ? 'verified' : (shop.status === 'suspended' ? 'rejected' : 'pending'),
      }));
      
      return { items: shopsData, total: totalCount || 0, totalPages: pages || 1 };
    } catch (error) {
      console.error('Failed to fetch shops:', error);
      throw error;
    }
  }, [filter, debouncedSearch, limit]);

  const {
    items: shops, total, loading, loadingMore, hasMore, loadMore, reload: fetchShops,
  } = useInfiniteList(fetchPage);

  useEffect(() => {
    setSearchTerm(queryQ);
  }, [queryQ]);

  const filterOptions = [
    { value: 'all', label: 'All Shops' },
    { value: 'pending', label: 'Pending' },
    { value: 'verified', label: 'Verified' },
    { value: 'rejected', label: 'Suspended' },
  ];

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
    return colors.category[category?.toLowerCase()] || colors.primary;
  };

  const SHOP_ACTION_CONFIRM = {
    reject: (name) => ({
      title: `Reject ${name}?`,
      message: 'The shop stays hidden from buyers and is not verified.',
      confirmLabel: 'Reject shop',
      tone: 'danger',
      icon: 'storefront',
    }),
    suspend: (name) => ({
      title: `Suspend ${name}?`,
      message: 'The shop is hidden from buyers and loses its verified badge.',
      confirmLabel: 'Suspend shop',
      tone: 'danger',
      icon: 'block',
    }),
  };

  const SHOP_ACTION_DONE = {
    approve: ['Shop approved', (name) => `${name} is live and verified.`],
    reject: ['Shop rejected', (name) => `${name} is hidden from buyers.`],
    suspend: ['Shop suspended', (name) => `${name} is hidden from buyers.`],
  };

  const handleShopAction = async (shop, action) => {
    const shopId = shop.id;
    if (SHOP_ACTION_CONFIRM[action] && !(await confirmAction(SHOP_ACTION_CONFIRM[action](shop.name)))) return;
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
      const [title, text] = SHOP_ACTION_DONE[action];
      toast.success(text(shop.name), { title });
      fetchShops(); // Refresh the list
    } catch {
      /* the API layer shows the error */
    }
  };

  const renderActions = (shop) => (
    <div className="action-buttons">
      <button type="button" className="action-btn view" onClick={() => setSelected(shop)}>View</button>
      {shop.status === 'pending' && (
        <>
          <button className="action-btn approve" onClick={() => handleShopAction(shop, 'approve')}>Approve</button>
          <button className="action-btn reject" onClick={() => handleShopAction(shop, 'reject')}>Reject</button>
        </>
      )}
      {shop.status === 'verified' && (
        <button className="action-btn suspend" onClick={() => handleShopAction(shop, 'suspend')}>Suspend</button>
      )}
    </div>
  );

  return (
    <div className="shops-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search shops..."
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
        <div className="loading">Loading shops...</div>
      ) : shops.length === 0 ? (
        <div className="table-container">
          <div className="empty-state">No shops found</div>
        </div>
      ) : (
        <>
          {view === 'card' ? (
            <div className="card-grid cols-5">
              {shops.map((shop) => (
                <article className="data-card" key={shop.id}>
                  <div className="data-card-media">
                    {shop.logo ? (
                      <img
                        src={mediaUrl(shop.logo)}
                        alt={shop.name}
                        loading="lazy"
                      />
                    ) : (
                      <span className="data-card-letter">{shop.name?.charAt(0)}</span>
                    )}
                  </div>
                  <div className="data-card-body">
                    <div className="data-card-title">{shop.name}</div>
                    <div className="data-card-pricerow">
                      <span
                        className="category-badge"
                        style={{ backgroundColor: `${getCategoryColor(shop.category)}15`, color: getCategoryColor(shop.category) }}
                      >
                        {shop.category}
                      </span>
                      {getStatusBadge(shop.status)}
                    </div>
                    <div className="data-card-meta">
                      <span>
                        <User className="item-icon" aria-hidden /> {shop.owner?.name || 'N/A'}
                      </span>
                      <span>
                        <MapPin className="item-icon" aria-hidden /> {shop.location || '—'}
                      </span>
                      <span>
                        <Star className="star-icon filled" aria-hidden /> {shop.rating?.toFixed(1)} ({shop.reviewCount})
                      </span>
                      <span>
                        <Package className="item-icon" aria-hidden /> {shop.listingsCount} listings
                      </span>
                    </div>
                    <div className="data-card-sub">
                      {shop.panMasked ? `PAN: ${shop.panMasked}` : 'PAN: —'}
                      {' · '}
                      {shop.vatMasked ? `VAT: ${shop.vatMasked}` : 'VAT: —'}
                    </div>
                    {shop.businessDocuments?.length ? (
                      <div className="data-card-sub">{shop.businessDocuments.length} doc(s)</div>
                    ) : null}
                    {shop.verificationStatus && shop.verificationStatus !== 'none' ? (
                      <div className="data-card-sub">KYC: {shop.verificationStatus}</div>
                    ) : null}
                    <div className="data-card-actions">{renderActions(shop)}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Shop Name</th>
                    <th>Category</th>
                    <th>Owner</th>
                    <th>PAN / VAT</th>
                    <th>Location</th>
                    <th>Rating</th>
                    <th>Listings</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shops.map((shop) => (
                    <tr key={shop.id}>
                      <td>
                        <div className="shop-name-cell">
                          <div className="shop-avatar">{shop.name?.charAt(0)}</div>
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
                      <td>
                        <div className="tax-cell">
                          <div>{shop.panMasked ? `PAN: ${shop.panMasked}` : 'PAN: —'}</div>
                          <div>{shop.vatMasked ? `VAT: ${shop.vatMasked}` : 'VAT: —'}</div>
                          {shop.businessDocuments?.length ? (
                            <div className="doc-count">{shop.businessDocuments.length} doc(s)</div>
                          ) : null}
                          {shop.verificationStatus && shop.verificationStatus !== 'none' ? (
                            <div className="doc-count">KYC: {shop.verificationStatus}</div>
                          ) : null}
                        </div>
                      </td>
                      <td>{shop.location}</td>
                      <td>
                        <div className="rating-cell">
                          <span className="rating-stars">
                            <Star className="star-icon filled" aria-hidden /> {shop.rating?.toFixed(1)}
                          </span>
                          <span className="review-count">({shop.reviewCount})</span>
                        </div>
                      </td>
                      <td>{shop.listingsCount}</td>
                      <td>{getStatusBadge(shop.status)}</td>
                      <td>{renderActions(shop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          <InfiniteLoader
            shown={shops.length}
            total={total}
            hasMore={hasMore}
            loading={loadingMore}
            onLoadMore={loadMore}
            label="shops"
          />
        </>
      )}
      <RecordModal
        title={selected?.name}
        onClose={() => setSelected(null)}
        rows={selected ? [
          ['Owner', selected.owner?.name || selected.owner],
          ['Phone', selected.owner?.phone],
          ['Category', selected.category],
          ['Location', selected.location],
          ['PAN', taxIds ? taxIds.panNumber || '—' : selected.panMasked || '—'],
          ['VAT', taxIds ? taxIds.vatNumber || '—' : selected.vatMasked || '—'],
          ...(!taxIds && (selected.panMasked || selected.vatMasked) ? [[
            'Tax IDs',
            <button type="button" className="action-btn small" onClick={revealTaxIds} disabled={revealing}>
              {revealing ? 'Loading…' : 'Reveal PAN/VAT (logged)'}
            </button>,
          ]] : []),
          ['Verification', selected.verificationStatus],
          ['Documents', selected.businessDocuments?.length ? (
            <span className="doc-links">
              {selected.businessDocuments.map((doc, index) => (
                <a
                  key={`${doc.url}-${index}`}
                  href={mediaUrl(doc.viewUrl || doc.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="action-btn small"
                >
                  {doc.label || `Document ${index + 1}`}
                </a>
              ))}
            </span>
          ) : ''],
          ['Listings', String(selected.listingsCount || 0)],
          ['Rating', selected.rating != null ? `${Number(selected.rating).toFixed(1)} (${selected.reviewCount || 0})` : ''],
        ] : null}
      />
    </div>
  );
};

export default Shops;