import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Bell, BellRing, Clock, LayoutPanelTop, Layers, Megaphone, Plus, Send, Users } from 'lucide-react';
import api from '../services/api';
import Modal, { OptionCards } from '../components/Modal';
import { confirmAction, toast } from '../components/Feedback';
import Pagination from '../components/Pagination';
import { BRAND_ICON_SRC } from '../../content/brandAssets';

const TITLE_MAX = 100;
const MESSAGE_MAX = 500;

const audienceOptions = [
  { value: 'all', label: 'All Users' },
  { value: 'buyers', label: 'Buyers Only' },
  { value: 'individual_sellers', label: 'Individual Sellers' },
  { value: 'shop_sellers', label: 'Shop Sellers' },
  { value: 'specific_city', label: 'Specific City' },
];

const deliveryOptions = [
  { value: 'push', label: 'Push Notification', description: 'Phone notification', icon: BellRing },
  { value: 'banner', label: 'In-App Banner', description: 'Shown inside the app', icon: LayoutPanelTop },
  { value: 'both', label: 'Both', description: 'Push and banner', icon: Layers },
];

const emptyForm = { title: '', message: '', audience: 'all', deliveryMethod: 'both', city: '' };

const getAudienceLabel = (value) => audienceOptions.find((opt) => opt.value === value)?.label || value;
const getDeliveryLabel = (value) => deliveryOptions.find((opt) => opt.value === value)?.label || value;

function formatTime(dateString) {
  const date = new Date(dateString);
  const diffMs = Date.now() - date.getTime();
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffHours < 24) return `${diffHours} hours ago`;
  return `${diffDays} days ago`;
}

function ComposeModal({ draftId, initial, onClose, onDone }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setConfirming(false);
  };

  const validate = (sending) => {
    if (!form.title.trim() || !form.message.trim()) return 'Title and message are required';
    if (sending && form.audience === 'specific_city' && !form.city.trim()) return 'Enter a city';
    return '';
  };

  const submit = async (saveAsDraft) => {
    const problem = validate(!saveAsDraft);
    if (problem) {
      setError(problem);
      return;
    }
    if (!saveAsDraft && !confirming) {
      setError('');
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.post('/notifications/admin/broadcast', {
        ...form,
        id: draftId || undefined,
        ...(saveAsDraft ? { saveAsDraft: true } : {}),
      });
      onDone(saveAsDraft
        ? { title: 'Draft saved', text: 'Find it under Drafts and send it when ready.' }
        : { title: 'Notification sent', text: `"${form.title}" is on its way to users.` });
    } catch (err) {
      setError(err.response?.data?.message || (saveAsDraft ? 'Failed to save draft' : 'Failed to send notification'));
      setBusy(false);
    }
  };

  const audience = `${getAudienceLabel(form.audience)}${form.audience === 'specific_city' && form.city.trim() ? ` in ${form.city.trim()}` : ''}`;

  return (
    <Modal
      icon={Megaphone}
      title={draftId ? 'Edit draft' : 'New notification'}
      subtitle="Send an announcement to app users, or save it as a draft."
      size="lg"
      busy={busy}
      onClose={onClose}
      onSubmit={() => submit(false)}
      footer={(
        <>
          <button type="button" className="btn btn-secondary kb-foot-left" onClick={() => submit(true)} disabled={busy}>
            Save draft
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={`btn ${confirming ? 'u360-danger-btn' : 'btn-primary'}`} disabled={busy}>
            <Send className="item-icon" aria-hidden />
            {busy ? 'Sending…' : confirming ? 'Yes, send now' : 'Send now'}
          </button>
        </>
      )}
    >
      <div className="kb-field-grid">
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="nt-title">Title *</label>
          <input id="nt-title" className="form-input" value={form.title} maxLength={TITLE_MAX} onChange={(e) => set({ title: e.target.value })} placeholder="e.g. Dashain offers are live" />
          <span className="kb-counter">{form.title.length}/{TITLE_MAX}</span>
        </div>
        <div className="form-group" style={{ gridColumn: '1 / -1' }}>
          <label htmlFor="nt-message">Message *</label>
          <textarea id="nt-message" className="form-textarea" rows={3} value={form.message} maxLength={MESSAGE_MAX} onChange={(e) => set({ message: e.target.value })} placeholder="What should users know?" />
          <span className="kb-counter">{form.message.length}/{MESSAGE_MAX}</span>
        </div>
        <div className="form-group">
          <label htmlFor="nt-audience">Target audience</label>
          <select id="nt-audience" className="form-select" value={form.audience} onChange={(e) => set({ audience: e.target.value })}>
            {audienceOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        {form.audience === 'specific_city' ? (
          <div className="form-group">
            <label htmlFor="nt-city">City *</label>
            <input id="nt-city" className="form-input" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="Kathmandu" />
          </div>
        ) : null}
      </div>

      <div className="form-group">
        <label>Delivery</label>
        <OptionCards value={form.deliveryMethod} onChange={(deliveryMethod) => set({ deliveryMethod })} options={deliveryOptions} columns={3} />
      </div>

      <p className="kb-section-label">Preview</p>
      <div className="kb-push-preview">
        <img src={BRAND_ICON_SRC} alt="" />
        <div className="kb-push-preview-body">
          <span className="kb-push-preview-app">KinBech · now</span>
          <span className="kb-push-preview-title">{form.title.trim() || 'Notification title'}</span>
          <span className="kb-push-preview-text">{form.message.trim() || 'Your message will appear here.'}</span>
        </div>
      </div>

      {confirming ? (
        <div className="u360-banner warning compact">
          <AlertTriangle className="item-icon" aria-hidden />
          <div>
            <strong>Send to {audience} now?</strong>
            <span>This can&apos;t be undone. Press &quot;Yes, send now&quot; to confirm.</span>
          </div>
        </div>
      ) : null}
      {error ? <div className="u360-error">{error}</div> : null}
    </Modal>
  );
}

const Notifications = () => {
  const [recentNotifications, setRecentNotifications] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [compose, setCompose] = useState(null);

  // Pagination state
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  const fetchDrafts = useCallback(async () => {
    try {
      const response = await api.get('/notifications/admin/broadcasts', {
        params: { status: 'draft', page: 1, limit: 20 },
      });
      setDrafts(response.data.broadcasts || []);
    } catch (error) {
      console.error('Failed to fetch drafts:', error);
    }
  }, []);

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

  useEffect(() => {
    fetchRecentNotifications();
  }, [fetchRecentNotifications]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const editDraft = (draft) => {
    setCompose({
      id: draft.id,
      form: {
        title: draft.title || '',
        message: draft.message || '',
        audience: draft.audience || 'all',
        deliveryMethod: draft.deliveryMethod || 'both',
        city: draft.city || '',
      },
    });
  };

  const deleteDraft = async (draft) => {
    const ok = await confirmAction({
      title: 'Delete this draft?',
      message: draft.title ? `"${draft.title}" will be gone for good.` : 'It will be gone for good.',
      confirmLabel: 'Delete draft',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/notifications/admin/broadcasts/${draft.id}`);
      toast.success('Draft deleted');
      fetchDrafts();
    } catch {
      /* the API layer shows the error */
    }
  };

  const onDone = ({ title, text }) => {
    setCompose(null);
    toast.success(text, { title });
    fetchRecentNotifications();
    fetchDrafts();
  };

  return (
    <div className="notifications-page">
      <div className="filter-bar">
        <div className="filter-group left">
          <p className="page-hint" style={{ margin: 0 }}>Announcements go to users as a push notification, an in-app banner, or both.</p>
        </div>
        <div className="filter-group right">
          <button type="button" className="btn btn-primary" onClick={() => setCompose({ id: '', form: { ...emptyForm } })}>
            <Plus className="item-icon" aria-hidden /> New notification
          </button>
        </div>
      </div>

      {compose ? (
        <ComposeModal draftId={compose.id} initial={compose.form} onClose={() => setCompose(null)} onDone={onDone} />
      ) : null}

      <div className="notifications-grid">
        <div className="compose-section">
          <div className="card">
            <div className="card-header">
              <h3>Saved Drafts</h3>
              <span className="form-hint">{drafts.length}</span>
            </div>
            <div className="drafts-list">
              {drafts.length === 0 ? (
                <div className="empty-state">No drafts. Use &quot;Save draft&quot; in a new notification to keep it here.</div>
              ) : drafts.map((draft) => (
                <div key={draft.id} className="draft-item">
                  <div className="draft-content">
                    <h4>{draft.title}</h4>
                    <p>{(draft.message || '').substring(0, 80)}{(draft.message || '').length > 80 ? '…' : ''}</p>
                    <div className="draft-meta">
                      <span>{getAudienceLabel(draft.audience)}{draft.city ? ` · ${draft.city}` : ''}</span>
                      <span>•</span>
                      <span>{formatTime(draft.sentAt)}</span>
                    </div>
                  </div>
                  <div className="draft-actions">
                    <button type="button" className="action-btn small" onClick={() => editDraft(draft)}>Edit</button>
                    <button type="button" className="action-btn small delete" onClick={() => deleteDraft(draft)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="history-section">
          <div className="card">
            <div className="card-header">
              <h3>Recently Sent</h3>
            </div>
            <div className="notifications-list">
              {recentNotifications.length === 0 ? (
                <div className="empty-state"><Bell className="item-icon" aria-hidden /> Nothing sent yet</div>
              ) : recentNotifications.map((notification) => (
                <div key={notification.id} className="notification-item">
                  <div className="notification-content">
                    <h4>{notification.title}</h4>
                    <p>{notification.message}</p>
                    <div className="notification-meta">
                      <span className="meta-item">
                        <span className="meta-icon"><Users className="item-icon" aria-hidden /></span>
                        {getAudienceLabel(notification.audience)}{notification.city ? ` · ${notification.city}` : ''}
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
