import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CalendarDays,
  Clock,
  Fingerprint,
  Flag,
  MessageSquareWarning,
  Gift,
  History,
  LifeBuoy,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquareOff,
  Package,
  Phone,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Star,
  Store,
  Trash2,
} from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import { adminPath } from '../routes';
import { mediaUrl } from '../../config';

const DAY_OPTIONS = [1, 3, 7, 14, 30];

const errorText = (error, fallback) => error?.response?.data?.message || fallback;
const fmtDate = (value) => (value ? new Date(value).toLocaleDateString() : '—');
const fmtDateTime = (value) => (value ? new Date(value).toLocaleString() : '—');
const npr = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

function timeAgo(value) {
  if (!value) return 'never';
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(value);
}

const SECTION_ICONS = { listings: Package, shops: Store, reports: Flag, strikes: ShieldAlert, sessions: Smartphone, tickets: LifeBuoy, audit: History, linked: Fingerprint };

function LinkedGroup({ label, hint, users }) {
  if (!users?.length) return null;
  return (
    <div className="u360-linked">
      <div className="u360-linked-head"><strong>{label}</strong><span className="u360-li-sub">{hint}</span></div>
      <div className="fraud-line">
        {users.map((linkedUser) => (
          <Link key={linkedUser.id} className="fraud-chip" to={adminPath(`users/${linkedUser.id}`)}>
            <span className="fraud-chip-name">{linkedUser.name || linkedUser.phone || 'No name'}</span>
            {linkedUser.name && linkedUser.phone ? <span className="fraud-chip-sub">{linkedUser.phone}</span> : null}
            {linkedUser.status === 'suspended' ? <span className="status-badge suspended">Suspended</span> : null}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Section({ id, title, count, children, empty }) {
  const Icon = SECTION_ICONS[id];
  return (
    <section className="card u360-section">
      <header className="u360-section-head">
        {Icon ? <Icon className="item-icon" aria-hidden /> : null}
        <h3>{title}</h3>
        {count != null ? <span className="u360-count">{count}</span> : null}
      </header>
      {empty ? <div className="u360-empty">{empty}</div> : children}
    </section>
  );
}

function ActionModal({ action, user, onClose, onDone }) {
  const [days, setDays] = useState(action === 'suspend' ? 7 : 3);
  const [reason, setReason] = useState('');
  const [credits, setCredits] = useState(String(user.featuredCredits || 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const config = {
    suspend: { title: 'Suspend account', button: 'Suspend', danger: true, icon: Ban, hint: 'Signs the user out everywhere. Timed suspensions lift automatically.' },
    restrict_chat: { title: 'Restrict chat', button: 'Restrict chat', danger: true, icon: MessageSquareOff, hint: 'The user can browse and post, but cannot send messages until it ends. They get a notification.' },
    strike: { title: 'Add strike', button: 'Add strike', danger: true, icon: ShieldAlert, hint: `Strike ${(user.strikes || 0) + 1}: 1 = warning, 2 = 7-day suspension, 3 = permanent suspension.` },
    set_credits: { title: 'Featured credits', button: 'Save credits', danger: false, icon: Gift, hint: 'Each credit features one listing. Adding credits notifies the user.' },
  }[action];

  const needsReason = action !== 'set_credits';
  const showDays = action === 'suspend' || action === 'restrict_chat';

  const submit = async () => {
    if (needsReason && !reason.trim()) {
      setError('Reason is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (action === 'strike') {
        await api.post(`/moderation/trust/sellers/${user.id}/strike`, { reason: reason.trim() });
      } else {
        await api.post(`/auth/admin/users/${user.id}/moderate`, {
          action,
          reason: reason.trim(),
          days: showDays ? days : undefined,
          credits: action === 'set_credits' ? Number(credits) : undefined,
        });
      }
      onDone();
    } catch (err) {
      setError(errorText(err, 'Action failed'));
      setSaving(false);
    }
  };

  return (
    <Modal
      icon={config.icon}
      tone={config.danger ? 'danger' : 'primary'}
      title={`${config.title}: ${user.name || user.phone || 'user'}`}
      subtitle={config.hint}
      size="sm"
      busy={saving}
      onClose={onClose}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" className={`btn ${config.danger ? 'u360-danger-btn' : 'btn-primary'}`} disabled={saving}>
            {saving ? 'Saving…' : config.button}
          </button>
        </>
      )}
    >
      {showDays ? (
        <div className="form-group">
          <label>Duration</label>
          <div className="u360-chips">
            {DAY_OPTIONS.map((option) => (
              <button key={option} type="button" className={`u360-chip ${days === option ? 'on' : ''}`} onClick={() => setDays(option)}>
                {option} day{option === 1 ? '' : 's'}
              </button>
            ))}
            {action === 'suspend' ? (
              <button type="button" className={`u360-chip ${days === 0 ? 'on' : ''}`} onClick={() => setDays(0)}>Permanent</button>
            ) : null}
          </div>
        </div>
      ) : null}

      {action === 'set_credits' ? (
        <div className="form-group">
          <label htmlFor="ud-credits">Credits balance</label>
          <input id="ud-credits" className="form-input" type="number" min="0" max="1000" step="1" value={credits} onChange={(e) => setCredits(e.target.value)} />
        </div>
      ) : null}

      {needsReason ? (
        <div className="form-group">
          <label htmlFor="ud-reason">Reason (saved in the audit log{action !== 'suspend' ? ' and shown to the user' : ''})</label>
          <textarea id="ud-reason" className="form-textarea" rows={3} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Repeated fake listings after warning" />
        </div>
      ) : null}

      {error ? <div className="u360-error">{error}</div> : null}
    </Modal>
  );
}

export default function UserDetail() {
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await api.get(`/auth/admin/users/${userId}`);
      setData(response.data);
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load this user'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const flash = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 4000);
  };

  const quick = async (action, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      const response = action === 'cancel_deletion'
        ? await api.post(`/auth/admin/deletions/${userId}/cancel`)
        : await api.post(`/auth/admin/users/${userId}/moderate`, { action });
      flash(response.data?.summary || 'Done');
      await load();
    } catch (err) {
      flash(errorText(err, 'Action failed'));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="loading">Loading user...</div>;
  if (error || !data) {
    return (
      <div className="u360">
        <Link className="u360-back" to={adminPath('users')}><ArrowLeft className="item-icon" aria-hidden /> Users</Link>
        <div className="card u360-empty">{error || 'User not found'}</div>
      </div>
    );
  }

  const { user, restrictions, deletion, stats } = data;
  const isAdmin = user.role !== 'user';
  const deleted = Boolean(deletion.deletedAt);
  const canModerate = !isAdmin && !deleted;
  const modalUser = { ...user, strikes: restrictions.strikes.length };

  const statCards = [
    { label: 'Listings', value: stats.listings.total, hint: `${stats.listings.active} active · ${stats.listings.sold} sold`, icon: Package, color: '#047857' },
    { label: 'Deals', value: user.dealsCompleted, hint: `${user.soldCount} sold · ${user.boughtCount} bought`, icon: ShieldCheck, color: '#2563EB' },
    { label: 'Rating', value: stats.rating.avg ?? '—', hint: `${stats.rating.count} review${stats.rating.count === 1 ? '' : 's'}`, icon: Star, color: '#D97706' },
    { label: 'Reports against', value: stats.reports.against, hint: `${stats.reports.pending} pending · ${stats.reports.filed} filed by user`, icon: Flag, color: stats.reports.pending ? '#DC2626' : '#6B7280' },
    { label: 'Chats', value: stats.chats, hint: 'Conversations', icon: MessageCircle, color: '#7C3AED' },
    { label: 'Scam flags', value: stats.scamFlags30d || 0, hint: 'Flagged messages, 30 days', icon: MessageSquareWarning, color: stats.scamFlags30d ? '#DC2626' : '#6B7280' },
    { label: 'Trust', value: user.trustScore ?? '—', hint: `Tier: ${user.trustTier}`, icon: ShieldCheck, color: '#0891B2' },
    { label: 'Featured credits', value: user.featuredCredits, hint: user.rankBoost ? `Rank boost ${user.rankBoost}` : 'Unused credits', icon: Gift, color: '#DB2777' },
    { label: 'Referrals', value: user.referralsCount, hint: user.referralCode ? `Code ${user.referralCode}` : 'No code yet', icon: Gift, color: '#65A30D' },
  ];

  return (
    <div className="u360">
      <Link className="u360-back" to={adminPath('users')}><ArrowLeft className="item-icon" aria-hidden /> Users</Link>

      <section className="card u360-hero">
        <div className="u360-identity">
          {user.avatarUrl
            ? <img className="u360-avatar" src={mediaUrl(user.avatarUrl)} alt="" />
            : <span className="u360-avatar">{(user.name || user.phone || '?').charAt(0).toUpperCase()}</span>}
          <div className="u360-id-text">
            <div className="u360-name-row">
              <h2>{user.name || 'No name'}</h2>
              {restrictions.suspended
                ? <span className="status-badge suspended">Suspended</span>
                : <span className="status-badge active">Active</span>}
              {!user.profileComplete ? <span className="status-badge unverified">Profile incomplete</span> : null}
              {isAdmin ? <span className="status-badge pending">{user.role.replace('_', ' ')}</span> : null}
            </div>
            <div className="u360-meta">
              {user.phone ? <span><Phone className="item-icon" aria-hidden /> {user.phone}</span> : null}
              {user.email ? <span><Mail className="item-icon" aria-hidden /> {user.email}</span> : null}
              {user.location ? <span><MapPin className="item-icon" aria-hidden /> {user.location}</span> : null}
              <span><CalendarDays className="item-icon" aria-hidden /> Joined {fmtDate(user.joinedAt)}</span>
              <span><Clock className="item-icon" aria-hidden /> Active {timeAgo(user.lastActiveAt)}</span>
            </div>
            {user.bio ? <p className="u360-bio">{user.bio}</p> : null}
            {user.referredBy ? (
              <p className="u360-bio">Referred by <Link to={adminPath(`users/${user.referredBy.id}`)}>{user.referredBy.name}</Link></p>
            ) : null}
          </div>
        </div>

        {canModerate ? (
          <div className="u360-actions">
            {restrictions.suspended ? (
              <button type="button" className="action-btn reinstate" disabled={busy} onClick={() => quick('reinstate', `Reinstate ${user.name || 'this user'}?`)}>
                <RotateCcw className="item-icon" aria-hidden /> Reinstate
              </button>
            ) : (
              <button type="button" className="action-btn suspend" onClick={() => setModal('suspend')}>
                <Ban className="item-icon" aria-hidden /> Suspend
              </button>
            )}
            {restrictions.chatRestricted ? (
              <button type="button" className="action-btn reinstate" disabled={busy} onClick={() => quick('lift_chat')}>
                <MessageCircle className="item-icon" aria-hidden /> Lift chat lock
              </button>
            ) : (
              <button type="button" className="action-btn dismiss" onClick={() => setModal('restrict_chat')}>
                <MessageSquareOff className="item-icon" aria-hidden /> Restrict chat
              </button>
            )}
            <button type="button" className="action-btn dismiss" onClick={() => setModal('strike')}>
              <ShieldAlert className="item-icon" aria-hidden /> Add strike
            </button>
            <button type="button" className="action-btn view" disabled={busy} onClick={() => quick('force_logout', 'Sign this user out of every device?')}>
              <LogOut className="item-icon" aria-hidden /> Force logout
            </button>
            <button type="button" className="action-btn view" onClick={() => setModal('set_credits')}>
              <Gift className="item-icon" aria-hidden /> Credits
            </button>
          </div>
        ) : (
          <div className="u360-note">
            {deleted ? 'This account was deleted.' : 'Admin accounts are managed from Settings & Roles.'}
          </div>
        )}
      </section>

      {notice ? <div className="u360-notice">{notice}</div> : null}

      {user.isTester ? (
        <div className="u360-banner info">
          <div>
            <strong>Tester account</strong>
            <span>Their listings, shops and profile are visible only to other testers. Manage it in <Link to={adminPath('testers')}>Test Accounts</Link>.</span>
          </div>
        </div>
      ) : null}

      {deletion.scheduledFor && !deleted ? (
        <div className="u360-banner danger">
          <Trash2 className="item-icon" aria-hidden />
          <div>
            <strong>Account deletion scheduled for {fmtDate(deletion.scheduledFor)}</strong>
            <span>Requested {fmtDateTime(deletion.requestedAt)}. Listings and shops are hidden until then.</span>
          </div>
          <button type="button" className="action-btn reinstate" disabled={busy} onClick={() => quick('cancel_deletion', 'Cancel this deletion and restore their listings and shops?')}>
            Cancel deletion
          </button>
        </div>
      ) : null}
      {restrictions.suspended ? (
        <div className="u360-banner danger">
          <Ban className="item-icon" aria-hidden />
          <div>
            <strong>{restrictions.suspendedUntil ? `Suspended until ${fmtDateTime(restrictions.suspendedUntil)}` : 'Suspended permanently'}</strong>
            {restrictions.restrictionReason ? <span>{restrictions.restrictionReason}</span> : null}
          </div>
        </div>
      ) : null}
      {restrictions.chatRestricted ? (
        <div className="u360-banner warning">
          <MessageSquareOff className="item-icon" aria-hidden />
          <div>
            <strong>Chat locked until {fmtDateTime(restrictions.chatRestrictedUntil)}</strong>
            {restrictions.restrictionReason ? <span>{restrictions.restrictionReason}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="stats-grid u360-stats">
        {statCards.map((stat) => (
          <div key={stat.label} className="stat-card" style={{ '--stat-accent': stat.color }}>
            <div className="stat-icon" style={{ backgroundColor: `${stat.color}18`, color: stat.color }}>
              <stat.icon className="item-icon" aria-hidden />
            </div>
            <div className="stat-content">
              <h3>{stat.label}</h3>
              <p className="stat-value">{stat.value}</p>
              <div className="stat-trend">{stat.hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="u360-grid">
        {data.linked ? (
          <Section
            id="linked"
            title="Linked accounts"
            count={data.linked.sameInstall.length + data.linked.sameNetwork.length + data.linked.samePhotos.length}
            empty={null}
          >
            <LinkedGroup label="Same phone" hint="Signed in on the same app install. Strong signal." users={data.linked.sameInstall} />
            <LinkedGroup label="Same network + phone model" hint="Last 30 days. Medium signal, carriers share IPs." users={data.linked.sameNetwork} />
            <LinkedGroup label="Same listing photo" hint="Uploaded an identical photo." users={data.linked.samePhotos} />
            {!data.linked.sameInstall.length && !data.linked.sameNetwork.length && !data.linked.samePhotos.length ? (
              <div className="u360-empty">No linked accounts found</div>
            ) : null}
            <div className="u360-otp">
              <span>OTP last 7 days:</span>
              <span>{data.linked.otp7d.sent} sent</span>
              <span className={data.linked.otp7d.failed >= 5 ? 'fraud-hot' : ''}>{data.linked.otp7d.failed} wrong</span>
              <span>{data.linked.otp7d.verified} signed in</span>
              {data.linked.otp7d.blocked ? <span className="fraud-hot">{data.linked.otp7d.blocked} blocked (suspended)</span> : null}
            </div>
            {stats.scamFlags30d ? (
              <Link className="u360-more" to={`${adminPath('scam-monitor')}`}>Open Scam Monitor</Link>
            ) : null}
          </Section>
        ) : null}
        <Section id="listings" title="Recent listings" count={stats.listings.total} empty={data.listings.length ? null : 'No listings yet'}>
          <ul className="u360-list">
            {data.listings.map((listing) => (
              <li key={listing.id}>
                {listing.photo ? <img className="u360-thumb" src={mediaUrl(listing.photo)} alt="" /> : <span className="u360-thumb" />}
                <div className="u360-li-main">
                  <Link to={`${adminPath('listings')}?q=${encodeURIComponent(listing.title)}`} className="u360-li-title">{listing.title}</Link>
                  <span className="u360-li-sub">{npr(listing.price)} · {listing.views} views · {fmtDate(listing.createdAt)}</span>
                </div>
                {listing.featured ? <span className="status-badge pending">Featured</span> : null}
                <span className={`status-badge ${listing.status}`}>{listing.status}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="reports" title="Reports against this user" count={stats.reports.against} empty={data.reports.length ? null : 'No reports'}>
          <ul className="u360-list">
            {data.reports.map((report) => (
              <li key={report.id}>
                <AlertTriangle className="item-icon u360-li-icon" aria-hidden />
                <div className="u360-li-main">
                  <span className="u360-li-title">{report.reason.replace(/-/g, ' ')}</span>
                  <span className="u360-li-sub">by {report.reporter} · {fmtDate(report.createdAt)}{report.details ? ` · ${report.details}` : ''}</span>
                </div>
                <span className={`status-badge ${report.status === 'pending' ? 'open' : 'resolved'}`}>{report.status}</span>
              </li>
            ))}
          </ul>
          {stats.reports.against > data.reports.length ? (
            <Link className="u360-more" to={adminPath('reports')}>Open Reports</Link>
          ) : null}
        </Section>

        <Section id="shops" title="Shops" count={data.shops.length} empty={data.shops.length ? null : 'No shop'}>
          <ul className="u360-list">
            {data.shops.map((shop) => (
              <li key={shop.id}>
                {shop.logo ? <img className="u360-thumb round" src={mediaUrl(shop.logo)} alt="" /> : <span className="u360-thumb round" />}
                <div className="u360-li-main">
                  <Link to={`${adminPath('shops')}?q=${encodeURIComponent(shop.name)}`} className="u360-li-title">{shop.name}</Link>
                  <span className="u360-li-sub">Since {fmtDate(shop.createdAt)}{shop.isVerified ? ' · Verified' : ''}</span>
                </div>
                <span className={`status-badge ${shop.status === 'active' ? 'active' : 'suspended'}`}>{shop.status}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="strikes" title="Strikes" count={restrictions.strikes.length} empty={restrictions.strikes.length ? null : 'No strikes'}>
          <ul className="u360-list">
            {restrictions.strikes.map((strike, index) => (
              <li key={`${strike.at}-${index}`}>
                <span className="u360-strike-no">{index + 1}</span>
                <div className="u360-li-main">
                  <span className="u360-li-title">{strike.reason || 'No reason'}</span>
                  <span className="u360-li-sub">{fmtDateTime(strike.at)}{strike.by ? ` · by ${strike.by}` : ''}</span>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="sessions" title="Signed-in devices" count={data.sessions.length} empty={data.sessions.length ? null : 'No active sessions'}>
          <ul className="u360-list">
            {data.sessions.map((session) => (
              <li key={session.id}>
                <Smartphone className="item-icon u360-li-icon" aria-hidden />
                <div className="u360-li-main">
                  <span className="u360-li-title">{session.deviceName}</span>
                  <span className="u360-li-sub">
                    {[session.platform, session.appVersion && `v${session.appVersion}`, session.ip].filter(Boolean).join(' · ')}
                    {` · seen ${timeAgo(session.lastSeenAt)}`}
                  </span>
                </div>
                {session.integrityLevel && !['unevaluated', 'strong', 'device'].includes(session.integrityLevel)
                  ? <span className="status-badge open">{session.integrityLevel}</span>
                  : null}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="tickets" title="Support tickets" count={data.tickets.length} empty={data.tickets.length ? null : 'No support tickets'}>
          <ul className="u360-list">
            {data.tickets.map((ticket) => (
              <li key={ticket.id}>
                <LifeBuoy className="item-icon u360-li-icon" aria-hidden />
                <div className="u360-li-main">
                  <span className="u360-li-title">{ticket.subject}</span>
                  <span className="u360-li-sub">{fmtDate(ticket.createdAt)} · {ticket.message}</span>
                </div>
                <span className={`status-badge ${ticket.status}`}>{ticket.status}</span>
              </li>
            ))}
          </ul>
          {data.tickets.length ? <Link className="u360-more" to={`${adminPath('support')}?q=${encodeURIComponent(user.phone || user.name)}`}>Open in Support Inbox</Link> : null}
        </Section>

        <Section id="audit" title="Admin history" count={data.audit.length} empty={data.audit.length ? null : 'No admin actions on this account yet'}>
          <ul className="u360-list">
            {data.audit.map((row) => (
              <li key={row.id}>
                <History className="item-icon u360-li-icon" aria-hidden />
                <div className="u360-li-main">
                  <span className="u360-li-title">{row.summary || row.action}</span>
                  <span className="u360-li-sub">{row.actorName || 'System'}{row.actorRole ? ` (${row.actorRole.replace('_', ' ')})` : ''} · {fmtDateTime(row.createdAt)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      {modal ? (
        <ActionModal
          action={modal}
          user={modalUser}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            flash('Saved');
            load();
          }}
        />
      ) : null}
    </div>
  );
}
