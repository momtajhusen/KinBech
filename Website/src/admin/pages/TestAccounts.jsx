import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { FlaskConical, Search, Store, Trash2, Undo2, X } from 'lucide-react';
import api from '../services/api';
import { errorMessage, toast } from '../components/Feedback';
import InfiniteLoader from '../components/InfiniteLoader';
import PromptModal from '../components/PromptModal';
import useInfiniteList from '../utils/useInfiniteList';
import useDebounce from '../utils/useDebounce';
import { adminPath } from '../routes';
import { mediaUrl } from '../../config';

const LIMIT = 25;
const fmtDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function Avatar({ user }) {
  return user.avatarUrl
    ? <img className="user-avatar-small" src={mediaUrl(user.avatarUrl)} alt="" />
    : <span className="user-avatar-small">{(user.name || user.phone || '?').charAt(0).toUpperCase()}</span>;
}

function SellerCell({ user }) {
  return (
    <Link className="user-cell user-open" to={adminPath(`users/${user.id}`)}>
      <Avatar user={user} />
      <div>
        <div className="user-name">{user.name}</div>
        <div className="user-email">{user.phone || '—'}</div>
      </div>
    </Link>
  );
}

function ShopCell({ shop }) {
  if (!shop) return <span className="tester-muted">Individual</span>;
  return (
    <span className="tester-shop">
      <Store className="item-icon" aria-hidden /> {shop.name}
      {shop.status !== 'active' ? <span className="status-badge unverified">{shop.status}</span> : null}
    </span>
  );
}

function ConfirmDialog({ kind, user, onClose, onDone }) {
  if (kind === 'make') {
    return (
      <PromptModal
        icon={FlaskConical}
        title={`Make ${user.name} a tester?`}
        subtitle="They will only see other testers' data in the app, and the public will never see theirs."
        confirmLabel="Make tester"
        onClose={onClose}
        onConfirm={async () => {
          const response = await api.post(`/auth/admin/testers/${user.id}`);
          onDone(response.data.message);
        }}
      >
        {user.listings || user.shop ? (
          <div className="u360-banner warning compact">
            <div>
              <strong>Hidden from the public right away</strong>
              <span>{plural(user.listings || 0, 'listing')}{user.shop ? ` and the shop "${user.shop.name}"` : ''}.</span>
            </div>
          </div>
        ) : null}
        <p className="form-hint">You can undo this later with &quot;Return to public&quot;.</p>
      </PromptModal>
    );
  }

  if (kind === 'restore') {
    const plan = user.restore || {};
    return (
      <PromptModal
        icon={Undo2}
        title={`Return ${user.name} to public?`}
        subtitle="The account itself is kept."
        confirmLabel="Return to public"
        onClose={onClose}
        onConfirm={async () => {
          const response = await api.post(`/auth/admin/testers/${user.id}/restore`);
          const r = response.data.result || {};
          onDone(`${response.data.message} (${r.listingsBack || 0} listings and ${r.shopsBack || 0} shops back, ${r.listingsDeleted || 0} test listings deleted).`);
        }}
      >
        <div className="u360-banner success compact">
          <div>
            <strong>Comes back to the public</strong>
            <span>
              {plural(plan.listingsBack || 0, 'listing')}{plan.shopsBack ? ` and ${plural(plan.shopsBack, 'shop')}` : ''} they had before {fmtDate(user.testerSince)}.
            </span>
          </div>
        </div>
        <div className="u360-banner danger compact">
          <div>
            <strong>Deleted (created while testing)</strong>
            <span>
              {plan.listingsDropped || plan.shopsDropped
                ? `${plural(plan.listingsDropped || 0, 'listing')}${plan.shopsDropped ? ` and ${plural(plan.shopsDropped, 'shop')}` : ''}, plus chats, reviews and reports from the test period.`
                : 'Chats, reviews and reports from the test period.'}
            </span>
          </div>
        </div>
      </PromptModal>
    );
  }

  return (
    <PromptModal
      icon={Trash2}
      danger
      title={`Delete tester "${user.name}"?`}
      subtitle="This permanently removes the account and all of its data. It cannot be undone."
      confirmText="DELETE"
      confirmLabel="Delete tester & data"
      onClose={onClose}
      onConfirm={async () => {
        const response = await api.delete(`/auth/admin/testers/${user.id}`);
        const r = response.data.removed || {};
        onDone(`${response.data.message} (${r.listings || 0} listings, ${r.shops || 0} shops, ${r.chats || 0} chats, ${r.files || 0} files).`);
      }}
    >
      <div className="u360-banner danger compact">
        <div>
          <strong>What gets deleted</strong>
          <span>
            The account, {plural(user.listings || 0, 'listing')}{user.shop ? `, the shop "${user.shop.name}"` : ''}, chats, messages,
            reviews, reports, notifications and uploaded photos.
          </span>
        </div>
      </div>
    </PromptModal>
  );
}

export default function TestAccounts() {
  const [testers, setTesters] = useState([]);
  const [scope, setScope] = useState('sellers');
  const [searchTerm, setSearchTerm] = useState('');
  const [confirm, setConfirm] = useState(null);
  const debounced = useDebounce(searchTerm);

  const fetchPage = useCallback(async (page) => {
    try {
      const response = await api.get('/auth/admin/testers', {
        params: { scope, q: debounced || undefined, page, limit: LIMIT },
      });
      setTesters(response.data.testers || []);
      return { items: response.data.sellers || [], total: response.data.total || 0, totalPages: response.data.totalPages || 1 };
    } catch (error) {
      toast.error(errorMessage(error, 'Please refresh the page.'), { title: 'Could not load accounts' });
      throw error;
    }
  }, [scope, debounced]);

  const {
    items: sellers, total, loading, loadingMore, hasMore, loadMore, reload: load,
  } = useInfiniteList(fetchPage);

  const onDone = (message) => {
    setConfirm(null);
    toast.success(message);
    load();
  };

  return (
    <div className="testers-page">
      <div className="u360-banner info">
        <FlaskConical className="item-icon" aria-hidden />
        <div>
          <strong>Tester sandbox.</strong> Testers use the live app, but their listings, shops and profiles are hidden from the public,
          and testers see only other testers&apos; data. Chats between testers and the public are blocked.
          <span>Made someone a tester by mistake? Return to public brings back what they had before; anything created while testing is deleted. Delete removes the account and all its data.</span>
        </div>
      </div>

      {confirm ? (
        <ConfirmDialog kind={confirm.kind} user={confirm.user} onClose={() => setConfirm(null)} onDone={onDone} />
      ) : null}

      <section className="card tester-card">
        <h3 className="tester-title">
          <FlaskConical className="item-icon" aria-hidden /> Testers ({testers.length})
        </h3>
        {testers.length === 0 ? (
          <div className="empty-state">No testers yet. Pick sellers below to make them testers.</div>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tester</th>
                  <th>Shop</th>
                  <th>Listings</th>
                  <th>Tester since</th>
                  <th>Last active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {testers.map((user) => (
                  <tr key={user.id}>
                    <td><SellerCell user={user} /></td>
                    <td><ShopCell shop={user.shop} /></td>
                    <td>
                      {user.activeListings} active / {user.listings}
                      <div className="tester-muted">
                        {user.restore?.listingsBack || 0} from before · {user.restore?.listingsDropped || 0} test
                      </div>
                    </td>
                    <td>{fmtDate(user.testerSince)}</td>
                    <td>{fmtDate(user.lastActiveAt)}</td>
                    <td>
                      <div className="action-buttons">
                        <button type="button" className="action-btn reinstate" onClick={() => setConfirm({ kind: 'restore', user })}>
                          <Undo2 className="item-icon" aria-hidden /> Return to public
                        </button>
                        <button type="button" className="action-btn suspend" onClick={() => setConfirm({ kind: 'delete', user })}>
                          <Trash2 className="item-icon" aria-hidden /> Delete tester & data
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card tester-card">
        <h3 className="tester-title">{scope === 'sellers' ? 'Sellers' : 'All users'} ({total})</h3>
        <div className="filter-bar">
          <div className="filter-group left">
            <div className="search-box">
              <Search className="search-icon" />
              <input className="search-input" placeholder="Search name or phone..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="filter-group right">
            <div className="u360-chips">
              <button type="button" className={`u360-chip ${scope === 'sellers' ? 'on' : ''}`} onClick={() => setScope('sellers')}>Sellers</button>
              <button type="button" className={`u360-chip ${scope === 'all' ? 'on' : ''}`} onClick={() => setScope('all')}>All users</button>
            </div>
            {searchTerm ? (
              <button type="button" className="clear-btn" onClick={() => setSearchTerm('')}><X className="item-icon" /> Clear</button>
            ) : null}
          </div>
        </div>

        {loading && !sellers.length ? (
          <div className="loading">Loading...</div>
        ) : sellers.length === 0 ? (
          <div className="empty-state">{debounced ? 'No matching accounts' : 'No sellers yet'}</div>
        ) : (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Seller</th>
                    <th>Shop</th>
                    <th>Listings</th>
                    <th>Joined</th>
                    <th>Last active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sellers.map((user) => (
                    <tr key={user.id}>
                      <td><SellerCell user={user} /></td>
                      <td><ShopCell shop={user.shop} /></td>
                      <td>{user.activeListings} active / {user.listings}</td>
                      <td>{fmtDate(user.createdAt)}</td>
                      <td>{fmtDate(user.lastActiveAt)}</td>
                      <td>
                        <div className="action-buttons">
                          <button type="button" className="action-btn view" onClick={() => setConfirm({ kind: 'make', user })}>
                            <FlaskConical className="item-icon" aria-hidden /> Make tester
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <InfiniteLoader shown={sellers.length} total={total} hasMore={hasMore} loading={loadingMore} onLoadMore={loadMore} label={scope === 'sellers' ? 'sellers' : 'users'} />
          </>
        )}
      </section>
    </div>
  );
}
