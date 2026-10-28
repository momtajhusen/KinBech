import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import MIcon from '../components/MIcon';
import { confirmAction, toast } from '../components/Feedback';
import ViewToggle, { useViewMode } from '../components/ViewToggle';
import Pagination from '../components/Pagination';
import useDebounce from '../utils/useDebounce';
import { adminPath } from '../routes';
import { mediaUrl } from '../../config';

const TYPES = [
  { value: '', label: 'All', countKey: 'all', icon: 'group' },
  { value: 'buyer', label: 'Buyers', countKey: 'buyer', icon: 'shopping_bag' },
  { value: 'individual', label: 'Individual sellers', countKey: 'individual', icon: 'person' },
  { value: 'shop', label: 'Shops', countKey: 'shop', icon: 'storefront' },
];

/** One-click presets for the most common admin questions. */
const QUICK_FILTERS = [
  { label: 'Suspended', key: 'status', value: 'suspended', icon: 'block' },
  { label: 'Has strikes', key: 'status', value: 'strikes', icon: 'warning' },
  { label: 'Posts waiting review', key: 'pending', value: 'yes', icon: 'pending_actions', for: ['', 'individual', 'shop'] },
  { label: 'Shop needs verification', key: 'verification', value: 'pending', icon: 'verified', for: ['', 'shop'] },
  { label: 'Active this week', key: 'activity', value: '7d', icon: 'trending_up' },
  { label: 'Inactive 30+ days', key: 'activity', value: 'idle30', icon: 'bedtime' },
  { label: 'On a paid plan', key: 'plan', value: 'paid', icon: 'workspace_premium' },
  { label: 'Test accounts', key: 'tester', value: 'only', icon: 'science' },
];

const SORTS = [
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['recently_active', 'Recently active'],
  ['active_listings', 'Most active listings'],
  ['recently_posted', 'Recently posted'],
  ['most_sold', 'Most items sold'],
  ['most_bought', 'Most items bought'],
  ['top_rated', 'Top rated'],
  ['trust', 'Highest trust score'],
];

const WINDOW_OPTIONS = [
  ['today', 'Today'],
  ['7d', 'Last 7 days'],
  ['30d', 'Last 30 days'],
  ['90d', 'Last 90 days'],
  ['idle30', 'Not in 30+ days'],
  ['idle90', 'Not in 90+ days'],
];

const TIER_LABELS = {
  top: 'Top seller',
  trusted: 'Trusted',
  standard: 'Standard',
  new: 'New',
  watch: 'Watch',
  restricted: 'Restricted',
};

const TIER_BADGE = {
  top: 'verified',
  trusted: 'active',
  standard: 'sent',
  watch: 'pending',
  restricted: 'suspended',
  new: 'under-review',
};

const VERIFICATION_BADGE = {
  approved: ['verified', 'Verified'],
  pending: ['pending', 'Waiting review'],
  rejected: ['rejected', 'Rejected'],
  none: ['', 'Not verified'],
};

/**
 * Advanced filters, grouped as shown in the panel. `options` = select, else an input of `type`.
 * `for` limits a group to the user types it applies to.
 */
const FILTER_GROUPS = [
  {
    title: 'Account',
    icon: 'badge',
    fields: [
      { key: 'status', label: 'Account status', options: [['active', 'Active'], ['suspended', 'Suspended'], ['chat_locked', 'Chat locked'], ['strikes', 'Has strikes'], ['deleting', 'Deleting account']] },
      { key: 'trust', label: 'Trust level', options: Object.entries(TIER_LABELS) },
      { key: 'plan', label: 'Plan', options: [['paid', 'On a paid plan'], ['free', 'Free']] },
      { key: 'profile', label: 'Profile', options: [['complete', 'Complete'], ['incomplete', 'Incomplete']] },
      { key: 'tester', label: 'Test accounts', options: [['exclude', 'Hide test accounts'], ['only', 'Only test accounts']] },
    ],
  },
  {
    title: 'Activity & location',
    icon: 'location_on',
    fields: [
      { key: 'activity', label: 'Last active', options: WINDOW_OPTIONS },
      { key: 'location', label: 'Location', type: 'text', placeholder: 'City or area' },
      { key: 'joinedFrom', label: 'Joined from', type: 'date' },
      { key: 'joinedTo', label: 'Joined to', type: 'date' },
      { key: 'minBought', label: 'Items bought (min)', type: 'number' },
    ],
  },
  {
    title: 'Selling',
    icon: 'sell',
    for: ['', 'individual', 'shop'],
    fields: [
      { key: 'category', label: 'Sells in category', options: 'categories' },
      { key: 'minActive', label: 'Active listings (min)', type: 'number' },
      { key: 'maxActive', label: 'Active listings (max)', type: 'number' },
      { key: 'pending', label: 'Waiting for review', options: [['yes', 'Has pending posts']] },
      { key: 'hidden', label: 'Hidden or removed', options: [['yes', 'Has hidden or removed posts']] },
      { key: 'posted', label: 'Last posted', options: WINDOW_OPTIONS },
      { key: 'minSold', label: 'Items sold (min)', type: 'number' },
      { key: 'minRating', label: 'Rating', options: [['3', '3★ and up'], ['4', '4★ and up'], ['4.5', '4.5★ and up']] },
    ],
  },
  {
    title: 'Shop',
    icon: 'storefront',
    for: ['', 'shop'],
    fields: [
      { key: 'verification', label: 'Shop verification', options: [['approved', 'Verified'], ['pending', 'Waiting for review'], ['rejected', 'Rejected'], ['none', 'Not submitted']] },
      { key: 'shopStatus', label: 'Shop status', options: [['active', 'Open'], ['inactive', 'Paused'], ['suspended', 'Suspended']] },
    ],
  },
];

const FILTER_FIELDS = FILTER_GROUPS.flatMap((group) => group.fields);
const STATE_KEYS = ['q', 'type', 'sort', 'page', ...FILTER_FIELDS.map((field) => field.key)];
const PAGE_SIZE = 20;

const shortDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');

function timeAgo(value) {
  if (!value) return 'Never';
  const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return shortDate(value);
}

function readState(params) {
  const state = {};
  STATE_KEYS.forEach((key) => {
    state[key] = params.get(key) || '';
  });
  state.page = Math.max(1, parseInt(state.page, 10) || 1);
  return state;
}

function optionLabel(field, value) {
  if (!Array.isArray(field.options)) return value;
  return field.options.find(([optionValue]) => optionValue === value)?.[1] || value;
}

function Avatar({ user, className = 'user-avatar-small' }) {
  return user.avatarUrl
    ? <img className={className} src={mediaUrl(user.avatarUrl)} alt="" />
    : <span className={className}>{(user.name || user.phone || '?').charAt(0).toUpperCase()}</span>;
}

/** Visual kind of account: buyer, individual seller, or shop. */
function typeInfo(user) {
  if (user.type === 'buyer') return { kind: 'buyer', icon: 'shopping_bag', label: 'Buyer' };
  if (!user.shop) return { kind: 'seller', icon: 'person', label: 'Individual seller' };
  return { kind: 'shop', icon: 'storefront', label: user.type === 'both' ? 'Shop + individual' : 'Shop' };
}

function TypeChip({ user }) {
  const info = typeInfo(user);
  return <span className={`ud-type is-${info.kind}`}><MIcon name={info.icon} filled /> {info.label}</span>;
}

function UserType({ user }) {
  if (!user.shop || user.type === 'buyer') return <TypeChip user={user} />;
  const [badgeClass, badgeLabel] = VERIFICATION_BADGE[user.shop.verificationStatus] || VERIFICATION_BADGE.none;
  return (
    <div className="ud-shop">
      <TypeChip user={user} />
      <div className="ud-shop-name">
        {user.shop.name}
        {user.shop.isVerified ? <MIcon name="verified" filled className="ud-verified" title="Verified shop" /> : null}
      </div>
      <div className="ud-shop-meta">
        <span className={`status-badge ${badgeClass}`}>{badgeLabel}</span>
        {user.shop.status !== 'active' ? (
          <span className="status-badge suspended">{user.shop.status === 'inactive' ? 'Paused' : 'Suspended'}</span>
        ) : null}
      </div>
    </div>
  );
}

function AccountBadges({ user, compact = false }) {
  return (
    <div className="user-badges">
      {user.status === 'suspended' ? (
        <span className="status-badge suspended">
          Suspended{user.suspendedUntil ? ` · ${shortDate(user.suspendedUntil)}` : ''}
        </span>
      ) : compact ? null : (
        <span className="status-badge active">Active</span>
      )}
      {user.status !== 'suspended' && !user.profileComplete ? <span className="status-badge unverified">Profile incomplete</span> : null}
      {user.plan ? <span className="status-badge verified" title={`Until ${shortDate(user.plan.endsAt)}`}>{user.plan.name}</span> : null}
      {user.isTester ? <span className="status-badge tester-badge">Tester</span> : null}
      {user.chatRestricted ? <span className="status-badge pending">Chat locked</span> : null}
      {user.deletionScheduledFor ? <span className="status-badge open">Deleting</span> : null}
      {user.strikes > 0 ? <span className="status-badge pending">{user.strikes} strike{user.strikes === 1 ? '' : 's'}</span> : null}
    </div>
  );
}

function ListingsSummary({ user }) {
  if (user.type === 'buyer') return <span className="ud-sub">Not selling</span>;
  return (
    <>
      <div><strong>{user.listings.active}</strong> active</div>
      <div className="ud-sub">
        {user.listings.pending ? <span className="ud-warn">{user.listings.pending} pending · </span> : null}
        {user.listings.hidden ? `${user.listings.hidden} hidden · ` : ''}
        posted {timeAgo(user.listings.lastPostedAt)}
      </div>
    </>
  );
}

function TrustSummary({ user }) {
  return (
    <>
      <span className={`status-badge ${TIER_BADGE[user.trustTier] || ''}`}>
        {TIER_LABELS[user.trustTier] || user.trustTier}
        {user.trustScore !== null ? ` · ${Math.round(user.trustScore)}` : ''}
      </span>
      {user.type !== 'buyer' ? (
        <div className="ud-sub ud-rating">
          <MIcon name="star" filled />
          {user.reviewCount ? `${user.ratingAverage.toFixed(1)} (${user.reviewCount})` : 'No reviews'}
        </div>
      ) : null}
    </>
  );
}

const Users = () => {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState(() => readState(params));
  const [panelOpen, setPanelOpen] = useState(false);
  const [view, setView] = useViewMode('users', 'list');
  const [data, setData] = useState({ users: [], counts: {}, total: 0, totalPages: 1, categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const query = useDebounce(state, 300);
  const urlQ = params.get('q') || '';

  const update = (patch) => setState((current) => ({ ...current, page: 1, ...patch }));

  const changeType = (type) => {
    const dropped = FILTER_GROUPS
      .filter((group) => group.for && !group.for.includes(type))
      .flatMap((group) => group.fields.map((field) => [field.key, '']));
    update({ ...Object.fromEntries(dropped), type });
  };

  const visibleQuick = QUICK_FILTERS.filter((quick) => !quick.for || quick.for.includes(state.type));
  const visibleGroups = FILTER_GROUPS.filter((group) => !group.for || group.for.includes(state.type));
  const activeFilters = FILTER_FIELDS.filter((field) => state[field.key]);
  const hasAnyFilter = activeFilters.length > 0 || Boolean(state.q);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const request = { limit: PAGE_SIZE };
      Object.entries(query).forEach(([key, value]) => {
        if (value !== '' && value !== null) request[key] = value;
      });
      const response = await api.get('/auth/admin/user-directory', { params: request });
      setData(response.data);
    } catch (fetchError) {
      setError(fetchError?.response?.data?.message || 'Could not load users');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    const next = {};
    Object.entries(query).forEach(([key, value]) => {
      if (value && !(key === 'page' && value === 1)) next[key] = String(value);
    });
    setParams(next, { replace: true });
  }, [query, setParams]);

  // The top search bar links here with ?q=; pick that up while already on this page.
  useEffect(() => {
    setState((current) => (current.q === urlQ || query.q === urlQ ? current : { ...current, q: urlQ, page: 1 }));
  }, [urlQ]);

  const categoryOptions = useMemo(
    () => (data.categories || []).map((category) => [category, category]),
    [data.categories],
  );

  const clearAll = () => setState((current) => ({
    ...Object.fromEntries(STATE_KEYS.map((key) => [key, ''])),
    type: current.type,
    sort: current.sort,
    page: 1,
  }));

  const openUser = (user) => navigate(adminPath(`users/${user.id}`));

  const changeStatus = async (user, action) => {
    const name = user.name || user.phone || 'this user';
    if (action === 'suspend') {
      const ok = await confirmAction({
        title: `Suspend ${name}?`,
        message: 'They will be signed out of every device and cannot use KinBech until reinstated.',
        details: ['For a timed suspension with a reason, open Details instead.'],
        confirmLabel: 'Suspend',
        tone: 'danger',
        icon: 'block',
      });
      if (!ok) return;
    }
    setBusyId(user.id);
    try {
      await api.patch(`/auth/admin/users/${user.id}/status`, { action });
      toast.success(action === 'suspend' ? `${name} is suspended` : `${name} is active again`);
      await fetchUsers();
    } catch {
      /* the API layer shows the error */
    } finally {
      setBusyId(null);
    }
  };

  const renderActions = (user) => (
    <div className="action-buttons">
      <button type="button" className="action-btn view" onClick={() => openUser(user)}>
        <MIcon name="visibility" /> Details
      </button>
      {user.status === 'suspended' ? (
        <button type="button" className="action-btn reinstate" disabled={busyId === user.id} onClick={() => changeStatus(user, 'reinstate')}>
          <MIcon name="lock_open" /> Reinstate
        </button>
      ) : (
        <button type="button" className="action-btn suspend" disabled={busyId === user.id} onClick={() => changeStatus(user, 'suspend')}>
          <MIcon name="block" /> Suspend
        </button>
      )}
    </div>
  );

  const renderField = (field) => {
    const id = `ud-${field.key}`;
    const options = field.options === 'categories' ? categoryOptions : field.options;
    return (
      <label key={field.key} className="ud-field" htmlFor={id}>
        <span className="ud-field-label">{field.label}</span>
        {options ? (
          <select
            id={id}
            className="form-select ud-input"
            value={state[field.key]}
            onChange={(event) => update({ [field.key]: event.target.value })}
          >
            <option value="">Any</option>
            {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        ) : (
          <input
            id={id}
            type={field.type}
            min={field.type === 'number' ? 0 : undefined}
            className="form-input ud-input"
            placeholder={field.placeholder || (field.type === 'number' ? 'Any' : '')}
            value={state[field.key]}
            onChange={(event) => update({ [field.key]: event.target.value })}
          />
        )}
      </label>
    );
  };

  return (
    <div className="users-page users-directory">
      <div className="ud-topline">
        <div className="ud-types" role="tablist" aria-label="User type">
          {TYPES.map((type) => {
            const on = state.type === type.value;
            return (
              <button
                key={type.value || 'all'}
                type="button"
                role="tab"
                aria-selected={on}
                className={`ud-type-tab ${on ? 'is-on' : ''}`}
                onClick={() => changeType(type.value)}
              >
                <MIcon name={type.icon} filled={on} />
                <span className="ud-type-label">{type.label}</span>
                <span className="ud-count">{data.counts?.[type.countKey] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="ud-topline-end">
          <span className="ud-results">
            <MIcon name="person_search" />
            {data.total} result{data.total === 1 ? '' : 's'}
          </span>
          <ViewToggle view={view} onChange={setView} />
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-group left">
          <div className="search-box">
            <MIcon name="search" className="search-icon" />
            <input
              type="text"
              placeholder="Search name, phone, email or shop name..."
              value={state.q}
              onChange={(event) => update({ q: event.target.value })}
              className="search-input"
            />
          </div>
        </div>
        <div className="filter-group right">
          <div className="dropdown-filter ud-sort">
            <MIcon name="sort" className="ud-sort-icon" />
            <select value={state.sort || 'newest'} onChange={(event) => update({ sort: event.target.value })} aria-label="Sort users">
              {SORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <MIcon name="expand_more" className="chev-icon" />
          </div>
          <button
            type="button"
            className={`btn btn-secondary ud-filter-btn ${panelOpen ? 'is-open' : ''}`}
            onClick={() => setPanelOpen((open) => !open)}
            aria-expanded={panelOpen}
          >
            <MIcon name="tune" />
            Filters
            {activeFilters.length ? <span className="ud-count">{activeFilters.length}</span> : null}
          </button>
        </div>
      </div>

      <div className="ud-quick" aria-label="Quick filters">
        <span className="ud-quick-label"><MIcon name="bolt" filled /> Quick</span>
        {visibleQuick.map((quick) => {
          const on = state[quick.key] === quick.value;
          return (
            <button
              key={`${quick.key}-${quick.value}`}
              type="button"
              className={`ud-quick-chip ${on ? 'is-on' : ''}`}
              aria-pressed={on}
              onClick={() => update({ [quick.key]: on ? '' : quick.value })}
            >
              <MIcon name={on ? 'check_circle' : quick.icon} filled={on} />
              {quick.label}
            </button>
          );
        })}
      </div>

      {panelOpen ? (
        <div className="card ud-panel">
          {visibleGroups.map((group) => (
            <section key={group.title} className="ud-group">
              <h4 className="ud-group-title"><MIcon name={group.icon} /> {group.title}</h4>
              <div className="ud-grid">{group.fields.map(renderField)}</div>
            </section>
          ))}
          <div className="ud-panel-foot">
            <button type="button" className="clear-btn" onClick={clearAll} disabled={!hasAnyFilter}>
              <MIcon name="restart_alt" /> Reset filters
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setPanelOpen(false)}>
              Show {data.total} user{data.total === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      ) : null}

      {activeFilters.length ? (
        <div className="ud-active">
          {activeFilters.map((field) => (
            <button key={field.key} type="button" className="ud-active-chip" onClick={() => update({ [field.key]: '' })}>
              <span>{field.label}:</span> {optionLabel(field, state[field.key])}
              <MIcon name="close" title="Remove filter" />
            </button>
          ))}
          <button type="button" className="clear-btn" onClick={clearAll}>Clear all</button>
        </div>
      ) : null}

      {error ? (
        <div className="table-container"><div className="empty-state">{error}</div></div>
      ) : loading && !data.users.length ? (
        <div className="loading">Loading users...</div>
      ) : !data.users.length ? (
        <div className="table-container">
          <div className="empty-state ud-empty">
            <MIcon name="person_off" className="ud-empty-icon" />
            No users match these filters
            {hasAnyFilter ? <button type="button" className="btn btn-secondary" onClick={clearAll}>Clear filters</button> : null}
          </div>
        </div>
      ) : (
        <>
          {view === 'card' ? (
            <div className={`ud-card-grid ${loading ? 'ud-loading' : ''}`}>
              {data.users.map((user) => {
                const info = typeInfo(user);
                const selling = user.type !== 'buyer';
                return (
                  <article className={`ud-card is-${info.kind}`} key={user.id}>
                    <button type="button" className="ud-card-head user-open" onClick={() => openUser(user)}>
                      <Avatar user={user} className="ud-card-avatar" />
                      <span className="ud-card-id">
                        <span className="ud-card-name" title={user.name || ''}>{user.name || 'No name'}</span>
                        <TypeChip user={user} />
                      </span>
                    </button>

                    <div className="ud-card-lines">
                      <span className="ud-card-line" title={user.phone || user.email || ''}>
                        <MIcon name="call" /> <span>{user.phone || user.email || '—'}</span>
                      </span>
                      <span className="ud-card-line" title={user.location || ''}>
                        <MIcon name="location_on" /> <span>{user.location || 'No location'}</span>
                      </span>
                      <span className="ud-card-line">
                        <MIcon name="schedule" /> <span>Last active {timeAgo(user.lastActiveAt)}</span>
                      </span>
                      {user.shop ? (
                        <span className="ud-card-line is-shop" title={user.shop.name}>
                          <MIcon name="storefront" filled /> <span>{user.shop.name}</span>
                          {user.shop.isVerified ? <MIcon name="verified" filled className="ud-verified" title="Verified shop" /> : null}
                        </span>
                      ) : null}
                    </div>

                    <div className="ud-card-stats">
                      <div className="ud-stat" title="Active listings">
                        <MIcon name="inventory_2" />
                        <strong>{selling ? user.listings.active : '—'}</strong>
                        <span>Active</span>
                      </div>
                      <div className="ud-stat" title="Items sold">
                        <MIcon name="sell" />
                        <strong>{user.soldCount}</strong>
                        <span>Sold</span>
                      </div>
                      <div className="ud-stat" title="Items bought">
                        <MIcon name="shopping_bag" />
                        <strong>{user.boughtCount}</strong>
                        <span>Bought</span>
                      </div>
                    </div>

                    <div className="ud-card-chips">
                      <span className={`status-badge ${TIER_BADGE[user.trustTier] || ''}`}>
                        <MIcon name="verified_user" filled />
                        {TIER_LABELS[user.trustTier] || user.trustTier}
                        {user.trustScore !== null ? ` · ${Math.round(user.trustScore)}` : ''}
                      </span>
                      {selling ? (
                        <span className="ud-rating">
                          <MIcon name="star" filled />
                          {user.reviewCount ? `${user.ratingAverage.toFixed(1)} (${user.reviewCount})` : 'No reviews'}
                        </span>
                      ) : null}
                      <AccountBadges user={user} compact />
                    </div>

                    <div className="ud-card-foot">{renderActions(user)}</div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={`table-container ${loading ? 'ud-loading' : ''}`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Type</th>
                    <th>Listings</th>
                    <th>Deals</th>
                    <th>Trust & rating</th>
                    <th>Last active</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <button type="button" className="user-cell user-open" onClick={() => openUser(user)}>
                          <Avatar user={user} />
                          <div>
                            <div className="user-name">{user.name || 'No name'}</div>
                            <div className="user-email">{user.phone || user.email}</div>
                            {user.location ? <div className="ud-sub ud-loc"><MIcon name="location_on" /> {user.location}</div> : null}
                          </div>
                        </button>
                      </td>
                      <td><UserType user={user} /></td>
                      <td><ListingsSummary user={user} /></td>
                      <td>
                        <div>{user.soldCount} sold</div>
                        <div className="ud-sub">{user.boughtCount} bought</div>
                      </td>
                      <td><TrustSummary user={user} /></td>
                      <td>
                        <div className="ud-loc"><MIcon name="schedule" /> {timeAgo(user.lastActiveAt)}</div>
                        <div className="ud-sub">Joined {shortDate(user.joinDate)}</div>
                      </td>
                      <td><AccountBadges user={user} /></td>
                      <td>{renderActions(user)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Pagination
            page={state.page}
            totalPages={data.totalPages}
            total={data.total}
            limit={PAGE_SIZE}
            onPageChange={(page) => setState((current) => ({ ...current, page }))}
          />
        </>
      )}
    </div>
  );
};

export default Users;
