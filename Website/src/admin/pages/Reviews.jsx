import { useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from '../context/ThemeContext';

const Reviews = () => {
  const { colors } = useTheme();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('flagged');

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    try {
      const response = await api.get('/reviews/admin/all');
      const reviewsData = response.data.reviews.map(review => ({
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
    } catch (error) {
      console.error('Failed to fetch reviews:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = [
    { value: 'flagged', label: 'Flagged' },
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

  const filteredReviews = reviews.filter(review => {
    const matchesSearch =
      review.reviewText?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.reviewer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      review.reviewee?.name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter =
      filter === 'all' ||
      (filter === 'flagged' && review.status === 'flagged');

    return matchesSearch && matchesFilter;
  });

  const getStarRating = (rating) => {
    return '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  };

  const getFlagReasonBadge = (reason) => {
    if (!reason) return null;
    return (
      <span className="flag-reason-badge">
        🚩 {reason}
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

  return (
    <div className="reviews-page">
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
          placeholder="Search reviews by text, reviewer, or reviewee..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
      </div>

      {loading ? (
        <div className="loading">Loading reviews...</div>
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
              {filteredReviews.map((review) => (
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
                        {review.reviewee.type === 'shop' ? '🏪' : '👤'}
                      </span>
                      <span className="reviewee-name">{review.reviewee.name}</span>
                    </div>
                  </td>
                  <td>{review.reviewer?.name || 'N/A'}</td>
                  <td className="rating-cell">{review.rating}/5</td>
                  <td>{getFlagReasonBadge(review.flagReason)}</td>
                  <td>{formatTime(review.createdAt)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn view">View</button>
                      {review.status === 'flagged' && (
                        <>
                          <button className="action-btn keep" onClick={() => handleReviewAction(review.id, 'keep')}>Keep</button>
                          <button className="action-btn remove" onClick={() => handleReviewAction(review.id, 'remove')}>Remove</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredReviews.length === 0 && (
            <div className="empty-state">No reviews found</div>
          )}
        </div>
      )}
    </div>
  );
};

export default Reviews;