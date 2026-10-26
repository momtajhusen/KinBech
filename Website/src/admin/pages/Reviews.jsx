import { useState, useEffect, useCallback } from 'react';
import { ChevronDown, Clock, Filter, Flag, Search, Star, Store, User, X } from 'lucide-react';
import api from '../services/api';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { useTheme } from '../context/ThemeContext';
import RecordModal from '../components/RecordModal';

const Reviews = () => {
  const { colors } = useTheme();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [view, setView] = useViewMode('reviews', 'list');
  const debouncedSearch = useDebounce(searchTerm);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get('/reviews/admin/all', {
        params: {
          status: filter === 'all' ? undefined : filter,
          q: debouncedSearch,
          page,
          limit
        }
      });
      
      const { reviews: data, total: totalCount, totalPages: pages } = response.data;
      
      const reviewsData = data.map(review => ({
        id: review._id,
        reviewText: review.review || 'No text provided',
        reviewer: review.reviewer,
        reviewee: { 
          name: review.shopId?.name || 'Unknown', 
          type: 'shop' 
        },
        rating: review.rating,
        flagReason: review.status === 'pending' ? 'Pending approval' : null,
        createdAt: review.createdAt,
        status: review.status === 'pending' ? 'flagged' : (review.status === 'approved' ? 'published' : 'rejected'),
      }));
      
      setReviews(reviewsData);
      setTotal(totalCount || 0);
      setTotalPages(pages || 1);
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, debouncedSearch, page, limit]);

  useEffect(() => {
    fetchReviews();
  }, [fetchReviews]);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [filter, debouncedSearch]);

  const filterOptions = [
    { value: 'pending', label: 'Flagged' },
    { value: 'all', label: 'All Reviews' },
  ];

  const handleReviewAction = async (reviewId, action) => {
    try {
      let status;
      
      if (action === 'keep') {
        status = 'approved';
      } else if (action === 'remove') {
        status = 'rejected';
      }

      await api.patch(`/reviews/admin/${reviewId}/status`, { status });
      fetchReviews(); // Refresh the list
    } catch (error) {
      console.error('Failed to update review status:', error);
    }
  };

  const getStarRating = (rating) => {
    return (
      <span className="rating-stars" aria-label={`${rating} out of 5`}>
        {Array.from({ length: 5 }).map((_, index) => (
          <Star
            key={index}
            className={`star-icon ${index < rating ? 'filled' : 'empty'}`}
            aria-hidden
          />
        ))}
      </span>
    );
  };

  const getFlagReasonBadge = (reason) => {
    if (!reason) return null;
    return (
      <span className="flag-reason-badge">
        <Flag className="item-icon" aria-hidden /> {reason}
      </span>
    );
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} mins ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  const renderActions = (review) => (
    <div className="action-buttons">
      <button type="button" className="action-btn view" onClick={() => setSelected(review)}>View</button>
      {review.status === 'flagged' && (
        <>
          <button className="action-btn keep" onClick={() => handleReviewAction(review.id, 'keep')}>Keep</button>
          <button className="action-btn remove" onClick={() => handleReviewAction(review.id, 'remove')}>Remove</button>
        </>
      )}
    </div>
  );

  return (
    <div className="reviews-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <Search className="search-icon" />
            <input
              type="text"
              placeholder="Search reviews..."
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
          {(searchTerm || filter !== 'pending') && (
            <button className="clear-btn" onClick={() => { setSearchTerm(''); setFilter('pending'); }}>
              <X className="item-icon" /> Clear
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading reviews...</div>
      ) : reviews.length === 0 ? (
        <div className="table-container">
          <div className="empty-state">No reviews found</div>
        </div>
      ) : (
        <>
          {view === 'card' ? (
            <div className="card-grid cols-5">
              {reviews.map((review) => (
                <article className="data-card" key={review.id}>
                  <div className="data-card-body">
                    <div className="data-card-head">
                      <span className="user-avatar-small">
                        {(review.reviewer?.name || 'N').charAt(0).toUpperCase()}
                      </span>
                      <div className="data-card-head-text">
                        <div className="data-card-title">{review.reviewer?.name || 'N/A'}</div>
                        <div className="data-card-sub">About: {review.reviewee?.name || 'Unknown'}</div>
                      </div>
                    </div>
                    <div className="data-card-pricerow">
                      {getStarRating(review.rating)}
                      <span className="data-card-sub">{review.rating}/5</span>
                    </div>
                    <div className="data-card-desc">{review.reviewText}</div>
                    <div className="data-card-meta">
                      <span>
                        <Clock className="item-icon" aria-hidden /> {formatTime(review.createdAt)}
                      </span>
                      {getFlagReasonBadge(review.flagReason)}
                    </div>
                    <div className="data-card-actions">{renderActions(review)}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Review</th>
                    <th>About</th>
                    <th>By</th>
                    <th>Rating</th>
                    <th>Flag Reason</th>
                    <th>Time</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={review.id}>
                      <td>
                        <div className="review-text-cell">
                          <div className="review-text">{review.reviewText}</div>
                          <div className="review-rating">{getStarRating(review.rating)}</div>
                        </div>
                      </td>
                      <td>
                        <div className="reviewee-cell">
                          <span className="reviewee-type">
                            {review.reviewee.type === 'shop'
                              ? <Store className="item-icon" aria-hidden />
                              : <User className="item-icon" aria-hidden />}
                          </span>
                          <span className="reviewee-name">{review.reviewee.name}</span>
                        </div>
                      </td>
                      <td>{review.reviewer?.name || 'N/A'}</td>
                      <td className="rating-cell">{review.rating}/5</td>
                      <td>{getFlagReasonBadge(review.flagReason)}</td>
                      <td>{formatTime(review.createdAt)}</td>
                      <td>{renderActions(review)}</td>
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
      <RecordModal
        title={selected?.reviewee?.name || 'Review'}
        onClose={() => setSelected(null)}
        rows={selected ? [
          ['Reviewer', selected.reviewer?.name],
          ['Shop', selected.reviewee?.name],
          ['Rating', `${selected.rating || 0} / 5`],
          ['Review', selected.reviewText],
          ['Status', selected.status],
          ['When', selected.createdAt ? formatTime(selected.createdAt) : ''],
        ] : null}
      />
    </div>
  );
};

export default Reviews;