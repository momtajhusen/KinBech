import { useState, useEffect, useCallback } from 'react';
import { Clock, Send, Users } from 'lucide-react';
import api from '../services/api';
import Pagination from '../components/Pagination';
import { useTheme } from '../context/ThemeContext';

const Notifications = () => {
  const { colors } = useTheme();
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    audience: 'all',
    deliveryMethod: 'both',
  });
  const [drafts, setDrafts] = useState([]);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const audienceOptions = [
    { value: 'all', label: 'All Users' },
    { value: 'buyers', label: 'Buyers Only' },
    { value: 'individual_sellers', label: 'Individual Sellers' },
    { value: 'shop_sellers', label: 'Shop Sellers' },
    { value: 'specific_city', label: 'Specific City' },
  ];

  const deliveryOptions = [
    { value: 'push', label: 'Push Notification' },
    { value: 'banner', label: 'In-App Banner' },
    { value: 'both', label: 'Both' },
  ];

  useEffect(() => {
    fetchRecentNotifications();
  }, [page]);

  const fetchRecentNotifications = useCallback(async () => {
    try {
      const response = await api.get('/notifications/admin/broadcasts', {
        params: { page, limit }
      });
      setRecentNotifications(response.data.broadcasts || []);
      setTotal(response.data.total || 0);
      setTotalPages(response.data.totalPages || 1);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }, [page, limit]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSaveDraft = () => {
    const newDraft = {
      id: Date.now(),
      ...formData,
      savedAt: new Date().toISOString(),
      status: 'draft',
    };
    setDrafts(prev => [newDraft, ...prev]);
    setFormData({ title: '', message: '', audience: 'all', deliveryMethod: 'both' });
    alert('Draft saved successfully!');
  };

  const handleSend = async () => {
    if (!formData.title || !formData.message) {
      alert('Please fill in all required fields');
      return;
    }

    try {
      await api.post('/notifications/admin/broadcast', formData);
      setFormData({ title: '', message: '', audience: 'all', deliveryMethod: 'both' });
      alert('Notification sent successfully!');
      fetchRecentNotifications(); // Refresh the list
    } catch (error) {
      console.error('Failed to send notification:', error);
      alert('Failed to send notification');
    }
  };

  const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 24) return `${diffHours} hours ago`;
    return `${diffDays} days ago`;
  };

  const getAudienceLabel = (value) => {
    return audienceOptions.find(opt => opt.value === value)?.label || value;
  };

  const getDeliveryLabel = (value) => {
    return deliveryOptions.find(opt => opt.value === value)?.label || value;
  };

  return (
    <div className="notifications-page">
      <div className="notifications-grid">
        <div className="compose-section">
          <div className="card">
            <div className="card-header">
              <h3>Compose Notification</h3>
            </div>
            <div className="compose-form">
              <div className="form-group">
                <label>Title *</label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="Enter notification title"
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label>Message *</label>
                <textarea
                  name="message"
                  value={formData.message}
                  onChange={handleInputChange}
                  placeholder="Enter notification message"
                  rows={4}
                  className="form-textarea"
                />
              </div>

              <div className="form-group">
                <label>Target Audience</label>
                <select
                  name="audience"
                  value={formData.audience}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  {audienceOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Delivery Method</label>
                <select
                  name="deliveryMethod"
                  value={formData.deliveryMethod}
                  onChange={handleInputChange}
                  className="form-select"
                >
                  {deliveryOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-actions">
                <button
                  onClick={handleSaveDraft}
                  className="btn btn-secondary"
                >
                  Save Draft
                </button>
                <button
                  onClick={handleSend}
                  className="btn btn-primary"
                >
                  Send Now
                </button>
              </div>
            </div>
          </div>

          {drafts.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3>Saved Drafts</h3>
              </div>
              <div className="drafts-list">
                {drafts.map(draft => (
                  <div key={draft.id} className="draft-item">
                    <div className="draft-content">
                      <h4>{draft.title}</h4>
                      <p>{draft.message.substring(0, 50)}...</p>
                      <div className="draft-meta">
                        <span>{getAudienceLabel(draft.audience)}</span>
                        <span>•</span>
                        <span>{formatTime(draft.savedAt)}</span>
                      </div>
                    </div>
                    <div className="draft-actions">
                      <button className="action-btn small">Edit</button>
                      <button className="action-btn small delete">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="history-section">
          <div className="card">
            <div className="card-header">
              <h3>Recently Sent</h3>
            </div>
            <div className="notifications-list">
              {recentNotifications.map(notification => (
                <div key={notification.id} className="notification-item">
                  <div className="notification-content">
                    <h4>{notification.title}</h4>
                    <p>{notification.message}</p>
                    <div className="notification-meta">
                      <span className="meta-item">
                        <span className="meta-icon"><Users className="item-icon" aria-hidden /></span>
                        {getAudienceLabel(notification.audience)}
                      </span>
                      <span className="meta-item">
                        <span className="meta-icon"><Send className="item-icon" aria-hidden /></span>
                        {getDeliveryLabel(notification.deliveryMethod)}
                      </span>
                      <span className="meta-item">
                        <span className="meta-icon"><Clock className="item-icon" aria-hidden /></span>
                        {formatTime(notification.sentAt)}
                      </span>
                    </div>
                  </div>
                  <div className="notification-status">
                    <span className="status-badge sent">Sent</span>
                  </div>
                </div>
              ))}
            </div>
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              limit={limit}
              onPageChange={setPage}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;