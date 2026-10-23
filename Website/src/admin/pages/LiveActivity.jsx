import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  Activity,
  AlertTriangle,
  Bug,
  Clock,
  Flag,
  Handshake,
  LifeBuoy,
  Loader2,
  MessageSquare,
  Package,
  Pause,
  Play,
  Star,
  Store,
  Ticket,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';
import api from '../services/api';
import { API_BASE } from '../../config';
import ViewToggle, { useViewMode } from '../components/ViewToggle';

// Safety-net polling. Socket.IO is the primary realtime transport; polling only
// reconciles when the socket is down (or slowly, to heal missed events).
const POLL_MS = 15000;
const SOCKET_RECONCILE_MS = 60000;
const MAX_FEED = 250;
const HIGHLIGHT_MS = 8000;

const EVENT_ICONS = {
  user: UserPlus,
  listing: Package,
  shop: Store,
  report: Flag,
  review: Star,
  ticket: Ticket,
  error: Bug,
  alert: AlertTriangle,
};

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'user', label: 'Signups' },
  { value: 'listing', label: 'Listings' },
  { value: 'shop', label: 'Shops' },
  { value: 'report', label: 'Reports' },
  { value: 'review', label: 'Reviews' },
  { value: 'ticket', label: 'Tickets' },
  { value: 'error', label: 'Errors' },
  { value: 'alert', label: 'Alerts' },
];

const CONNECTION_LABELS = {
  connecting: 'Connecting…',
  live: 'Live · realtime',
  offline: 'Reconnecting…',
  error: 'Realtime unavailable',
};

function relativeTime(dateString) {
  if (!dateString) return '';
  const diff = Date.now() - new Date(dateString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Optimistically bump the counters a freshly-streamed event affects. */
function bumpPulse(pulse, event) {
  const next = { ...pulse };
  switch (event.type) {
    case 'user':
      next.signupsToday = (next.signupsToday || 0) + 1;
      next.activeToday = (next.activeToday || 0) + 1;
      break;
    case 'listing':
      next.listingsToday = (next.listingsToday || 0) + 1;
      break;
    case 'error':
      next.errorsLastHour = (next.errorsLastHour || 0) + 1;
      break;
    case 'report':
      next.pendingReports = (next.pendingReports || 0) + 1;
      break;
    case 'shop':
      next.pendingShops = (next.pendingShops || 0) + 1;
      break;
    case 'review':
      next.pendingReviews = (next.pendingReviews || 0) + 1;
      break;
    case 'ticket':
      next.openTickets = (next.openTickets || 0) + 1;
      break;
    case 'alert':
      next.openAlerts = (next.openAlerts || 0) + 1;
      break;
    default:
      break;
  }
  return next;
}

const LiveActivity = () => {
  const [pulse, setPulse] = useState({});
  const [events, setEvents] = useState([]);
  const [counts, setCounts] = useState({});
  const [type, setType] = useState('all');
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [socketStatus, setSocketStatus] = useState('connecting');
  const [socketMessage, setSocketMessage] = useState('');
  const [liveCount, setLiveCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastLiveAt, setLastLiveAt] = useState(null);
  const [highlight, setHighlight] = useState(() => new Set());
  const [view, setView] = useViewMode('live-activity', 'card');

  const pausedRef = useRef(false);
  const socketStatusRef = useRef('connecting');
  const pendingRef = useRef([]);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    socketStatusRef.current = socketStatus;
  }, [socketStatus]);

  const fetchActivity = useCallback(async ({ silent } = {}) => {
    if (!silent) setRefreshing(true);
    try {
      const response = await api.get('/auth/admin/live-activity', {
        params: { type: 'all', limit: 120 },
      });
      setPulse(response.data.pulse || {});
      setEvents(response.data.events || []);
      setCounts(response.data.counts || {});
      setGeneratedAt(response.data.generatedAt || new Date().toISOString());
    } catch (error) {
      console.error('Failed to fetch live activity:', error);
    } finally {
      lastFetchRef.current = Date.now();
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  /** Prepend a streamed event, dedupe, bump counters, highlight it. */
  const applyIncoming = useCallback((incoming) => {
    setEvents((prev) => {
      if (prev.some((e) => e.id === incoming.id)) return prev;
      return [incoming, ...prev].slice(0, MAX_FEED);
    });
    setCounts((prev) => ({
      ...prev,
      all: (prev.all || 0) + 1,
      [incoming.type]: (prev[incoming.type] || 0) + 1,
    }));
    setPulse((prev) => bumpPulse(prev, incoming));
    setHighlight((prev) => {
      const next = new Set(prev);
      next.add(incoming.id);
      return next;
    });
    window.setTimeout(() => {
      setHighlight((prev) => {
        if (!prev.has(incoming.id)) return prev;
        const next = new Set(prev);
        next.delete(incoming.id);
        return next;
      });
    }, HIGHLIGHT_MS);
  }, []);

  const handleIncoming = useCallback(
    (incoming) => {
      if (!incoming || !incoming.id) return;
      setLastLiveAt(Date.now());
      setLiveCount((n) => n + 1);

      if (pausedRef.current) {
        pendingRef.current.push(incoming);
        setPendingCount(pendingRef.current.length);
        return;
      }
      applyIncoming(incoming);
    },
    [applyIncoming],
  );

  // Socket.IO: primary realtime channel (admin-authenticated handshake).
  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    if (!token) {
      setSocketStatus('error');
      setSocketMessage('Admin session required for realtime');
      return undefined;
    }

    const options = {
      auth: { token },
      transports: ['websocket', 'polling'],
    };
    const socket = API_BASE ? io(API_BASE, options) : io(options);

    socket.on('connect', () => {
      setSocketStatus('live');
      setSocketMessage('');
    });
    socket.on('realtime:ready', () => {
      setSocketStatus('live');
      setSocketMessage('');
    });
    socket.on('disconnect', () => setSocketStatus('offline'));
    socket.on('connect_error', (error) => {
      setSocketStatus('error');
      setSocketMessage(error?.message || 'Realtime unavailable');
    });
    socket.on('activity:new', handleIncoming);
    socket.on('pulse:update', (next) => setPulse((prev) => ({ ...prev, ...next })));

    return () => {
      socket.off('activity:new', handleIncoming);
      socket.disconnect();
    };
  }, [handleIncoming]);

  // Reconciliation polling — fast when the socket is down, slow when healthy.
  useEffect(() => {
    const tick = () => {
      if (pausedRef.current || document.visibilityState !== 'visible') return;
      const isLive = socketStatusRef.current === 'live';
      const since = Date.now() - lastFetchRef.current;
      if (isLive && since < SOCKET_RECONCILE_MS) return;
      fetchActivity({ silent: true });
    };
    const id = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchActivity]);

  const flushPending = useCallback(() => {
    const buffered = pendingRef.current;
    if (!buffered.length) return;
    pendingRef.current = [];
    setPendingCount(0);
    setEvents((prev) => {
      const seen = new Set(prev.map((e) => e.id));
      const fresh = buffered.filter((e) => !seen.has(e.id));
      return [...fresh, ...prev].slice(0, MAX_FEED);
    });
    setCounts((prev) => {
      const next = { ...prev };
      buffered.forEach((e) => {
        next.all = (next.all || 0) + 1;
        next[e.type] = (next[e.type] || 0) + 1;
      });
      return next;
    });
    setPulse((prev) => buffered.reduce((acc, e) => bumpPulse(acc, e), prev));
  }, []);

  const togglePause = () => {
    if (paused) {
      setPaused(false);
      flushPending();
    } else {
      setPaused(true);
    }
  };

  const primaryCards = [
    { title: 'Online now', value: pulse.onlineNow || 0, icon: Activity, color: '#2563eb', hint: 'active in last 15 min' },
    { title: 'Active today', value: pulse.activeToday || 0, icon: Users, color: '#0f766e', hint: 'users seen today' },
    { title: 'Sign-ups today', value: pulse.signupsToday || 0, icon: UserPlus, color: '#059669', hint: 'new accounts' },
    { title: 'New listings', value: pulse.listingsToday || 0, icon: Package, color: '#7c3aed', hint: 'posted today' },
    { title: 'Sold today', value: pulse.soldToday || 0, icon: Handshake, color: '#d97706', hint: 'completed deals' },
    { title: 'Messages', value: pulse.messagesLastHour || 0, icon: MessageSquare, color: '#0891b2', hint: 'last hour' },
  ];

  const opsCards = [
    { title: 'Errors (1h)', value: pulse.errorsLastHour || 0, icon: Bug, color: '#dc2626', hint: 'needs triage', link: '/admin/error-log' },
    { title: 'Pending reports', value: pulse.pendingReports || 0, icon: Flag, color: '#b91c1c', hint: 'awaiting review', link: '/admin/reports' },
    { title: 'Shops to verify', value: pulse.pendingShops || 0, icon: Store, color: '#d97706', hint: 'verification queue', link: '/admin/shops' },
    { title: 'Reviews to moderate', value: pulse.pendingReviews || 0, icon: Star, color: '#7c3aed', hint: 'moderation queue', link: '/admin/reviews' },
    { title: 'Open tickets', value: pulse.openTickets || 0, icon: LifeBuoy, color: '#0891b2', hint: 'support requests', link: null },
    { title: 'Open alerts', value: pulse.openAlerts || 0, icon: AlertTriangle, color: '#dc2626', hint: 'anomalies detected', link: '/admin/dashboard' },
  ];

  const visibleEvents = useMemo(
    () => (type === 'all' ? events : events.filter((event) => event.type === type)),
    [events, type],
  );

  const liveBadge = paused
    ? `Paused${pendingCount ? ` · ${pendingCount} buffered` : ''}`
    : CONNECTION_LABELS[socketStatus] || 'Connecting…';

  if (loading) {
    return <div className="loading">Loading live activity...</div>;
  }

  const renderDetails = (event) =>
    Array.isArray(event.details) && event.details.length ? (
      <div className="live-details">
        {event.details.map((detail) => (
          <span key={`${event.id}-${detail.label}`} className="live-chip">
            <span className="live-chip-label">{detail.label}</span>
            <span className="live-chip-value">{detail.value}</span>
          </span>
        ))}
      </div>
    ) : null;

  const renderCard = (event) => {
    const Icon = EVENT_ICONS[event.type] || Activity;
    const isNew = highlight.has(event.id);
    return (
      <article
        key={event.id}
        className={`live-card sev-${event.severity || 'info'}${isNew ? ' is-new' : ''}`}
      >
        <header className="live-card-head">
          <span className={`activity-icon ${event.type}`}>
            <Icon className="item-icon" aria-hidden />
          </span>
          <div className="live-card-titles">
            <p className="live-card-title">{event.title}</p>
            <span className="live-card-time">{relativeTime(event.time)}</span>
          </div>
          {isNew ? <span className="live-new-dot" title="Just arrived">NEW</span> : null}
        </header>

        {event.message ? <p className="live-card-body">{event.message}</p> : null}
        {renderDetails(event)}

        <footer className="live-card-foot">
          <div className="live-card-who">
            {event.actor ? <span className="live-actor">{event.actor}</span> : null}
            {event.meta ? <span className="live-meta">{event.meta}</span> : null}
          </div>
          <div className="live-card-tags">
            {event.severity ? <span className={`live-sev ${event.severity}`}>{event.severity}</span> : null}
            {event.link ? (
              <Link to={event.link} className="live-jump">
                Open
              </Link>
            ) : null}
          </div>
        </footer>
      </article>
    );
  };

  const renderRow = (event) => {
    const Icon = EVENT_ICONS[event.type] || Activity;
    const isNew = highlight.has(event.id);
    return (
      <div key={event.id} className={`activity-item live-event${isNew ? ' is-new' : ''}`}>
        <div className={`activity-icon ${event.type}`}>
          <Icon className="item-icon" aria-hidden />
        </div>
        <div className="activity-content">
          <div className="live-event-head">
            <p className="activity-message">{event.title}</p>
            {isNew ? <span className="live-new-dot">NEW</span> : null}
            {event.severity ? <span className={`live-sev ${event.severity}`}>{event.severity}</span> : null}
          </div>
          {event.message ? <p className="live-event-body">{event.message}</p> : null}
          {renderDetails(event)}
          <div className="live-event-foot">
            {event.actor ? <span className="live-actor">{event.actor}</span> : null}
            {event.meta ? <span className="live-meta">{event.meta}</span> : null}
            <span className="activity-time">{relativeTime(event.time)}</span>
            {event.link ? (
              <Link to={event.link} className="live-jump">
                Open
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard">
      <div className="bi-live-bar">
        <div>
          <h2 className="bi-title">Live activity</h2>
          <p className="bi-subtitle">
            {liveBadge}
            {lastLiveAt ? ` · last event ${relativeTime(new Date(lastLiveAt).toISOString())}` : ''}
            {generatedAt ? ` · synced ${new Date(generatedAt).toLocaleTimeString()}` : ''}
            {refreshing ? ' · refreshing…' : ''}
          </p>
        </div>
        <div className="live-actions">
          <span
            className={`live-status is-${socketStatus}${paused ? ' is-held' : ''}`}
            title={socketMessage || CONNECTION_LABELS[socketStatus]}
          >
            {socketStatus === 'live' && !paused ? (
              <Wifi className="item-icon" aria-hidden />
            ) : socketStatus === 'connecting' ? (
              <Loader2 className="item-icon spin" aria-hidden />
            ) : (
              <WifiOff className="item-icon" aria-hidden />
            )}
            {paused ? 'Paused' : socketStatus === 'live' ? 'Realtime' : CONNECTION_LABELS[socketStatus]}
          </span>
          <span className="live-counter" title="Events received live this session">
            <Zap className="item-icon" aria-hidden />
            {liveCount} live
          </span>
          <button
            type="button"
            className={`live-toggle ${paused ? 'is-paused' : 'is-live'}`}
            onClick={togglePause}
          >
            {paused ? <Play className="item-icon" aria-hidden /> : <Pause className="item-icon" aria-hidden />}
            {paused ? 'Resume' : 'Live'}
          </button>
          <button type="button" className="view-report-btn" onClick={() => fetchActivity()}>
            Refresh now
          </button>
        </div>
      </div>

      <div className="stats-grid">
        {primaryCards.map((stat) => (
          <div key={stat.title} className="stat-card" style={{ '--stat-accent': stat.color }}>
            <div className="stat-icon" style={{ backgroundColor: `${stat.color}18`, color: stat.color }}>
              <stat.icon className="item-icon" aria-hidden />
            </div>
            <div className="stat-content">
              <h3>{stat.title}</h3>
              <p className="stat-value">{Number(stat.value).toLocaleString()}</p>
              <div className="stat-trend trend-up">{stat.hint}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="stats-grid live-ops-grid">
        {opsCards.map((stat) => {
          const card = (
            <div className="stat-card stat-card-ops" style={{ '--stat-accent': stat.color }}>
              <div className="stat-icon" style={{ backgroundColor: `${stat.color}18`, color: stat.color }}>
                <stat.icon className="item-icon" aria-hidden />
              </div>
              <div className="stat-content">
                <h3>{stat.title}</h3>
                <p className={`stat-value${stat.value > 0 ? ' has-alert' : ''}`}>
                  {Number(stat.value).toLocaleString()}
                </p>
                <div className={`stat-trend ${stat.value > 0 ? 'trend-down' : 'trend-up'}`}>{stat.hint}</div>
              </div>
            </div>
          );
          return stat.link ? (
            <Link key={stat.title} to={stat.link} className="live-ops-link">
              {card}
            </Link>
          ) : (
            <div key={stat.title}>{card}</div>
          );
        })}
      </div>

      <div className="activity-card live-feed">
        <div className="card-header live-feed-head">
          <div>
            <h3>Activity feed</h3>
            <span className="bi-baseline">
              {visibleEvents.length} shown · {events.length} buffered
              <Clock className="item-icon inline-icon" aria-hidden />
            </span>
          </div>
          <ViewToggle view={view} onChange={setView} />
        </div>

        <div className="page-filters live-filters">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`filter-chip ${type === f.value ? 'active' : ''}`}
              onClick={() => setType(f.value)}
            >
              {f.label}
              {counts[f.value] ? ` (${counts[f.value]})` : ''}
            </button>
          ))}
        </div>

        {visibleEvents.length === 0 ? (
          <div className="empty-state compact">No activity for this filter yet</div>
        ) : view === 'card' ? (
          <div className="live-grid">{visibleEvents.map(renderCard)}</div>
        ) : (
          <div className="activity-list">{visibleEvents.map(renderRow)}</div>
        )}
      </div>
    </div>
  );
};

export default LiveActivity;
