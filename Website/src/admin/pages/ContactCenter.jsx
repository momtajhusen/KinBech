import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  BellOff,
  CheckCheck,
  Headphones,
  MessageCircle,
  Mic,
  MicOff,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  PhoneOff,
  PhoneOutgoing,
  Radio,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  Store,
  User,
  X,
} from 'lucide-react';
import api from '../services/api';
import useDebounce from '../utils/useDebounce';
import { mediaUrl } from '../../config';
import { BRAND_ICON_SRC } from '../../content/brandAssets';

const FILTERS = [
  { value: 'all', label: 'All users' },
  { value: 'sellers', label: 'Sellers' },
  { value: 'shops', label: 'Shops' },
  { value: 'individual', label: 'Individual' },
];

const TABS = [
  { value: 'message', label: 'Message', icon: MessageCircle },
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'notify', label: 'Notification', icon: Bell },
];

const CALL_LABELS = {
  connecting: 'Connecting…',
  calling: 'Calling…',
  ringing: 'Ringing on their phone…',
  active: 'On call',
  ended: 'Call ended',
};

const CALL_STATUS_LABELS = {
  answered: 'Answered',
  missed: 'Missed',
  rejected: 'Declined',
  cancelled: 'Cancelled',
};

function timeAgo(value) {
  if (!value) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function clock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function errorText(error, fallback) {
  return error?.response?.data?.message || fallback;
}

function Avatar({ name, src, size = 40 }) {
  const initials = String(name || '?').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  return src ? (
    <img className="cc-avatar" src={mediaUrl(src)} alt="" style={{ width: size, height: size }} />
  ) : (
    <span className="cc-avatar cc-avatar-initials" style={{ width: size, height: size, fontSize: size * 0.38 }}>
      {initials || '?'}
    </span>
  );
}

function PushBadge({ contact }) {
  if (!contact.pushReady) return <span className="cc-chip danger"><Smartphone aria-hidden /> No push</span>;
  if (!contact.notificationsOn) return <span className="cc-chip warning"><BellOff aria-hidden /> Muted</span>;
  return <span className="cc-chip success"><Smartphone aria-hidden /> Push ready</span>;
}

function pushFailureText({ pushReady, pushSent, pushReason }) {
  if (!pushReady || pushReason === 'no_token') {
    return 'Their phone has no push token, so it only rings while the app is open.';
  }
  if (pushSent !== false) return '';
  if (pushReason === 'firebase_not_configured') {
    return 'Push is off on the server (FIREBASE_SERVICE_ACCOUNT_JSON is missing), so it only rings while the app is open.';
  }
  if (pushReason === 'firebase_invalid') {
    return 'The server Firebase key is invalid, so it only rings while the app is open.';
  }
  if (pushReason === 'messaging/mismatched-credential' || pushReason === 'messaging/sender-id-mismatch') {
    return 'The server Firebase key belongs to a different project than the app, so the push was rejected.';
  }
  if (pushReason === 'messaging/registration-token-not-registered' || pushReason === 'messaging/invalid-registration-token') {
    return 'Their saved push token is from an old install (app reinstalled or data cleared). It is saved again when they open the app signed in to this account.';
  }
  return `Push to their phone failed (${pushReason || 'unknown'}), so it only rings while the app is open.`;
}

function CallRow({ call, focusId }) {
  const outgoing = focusId ? call.caller.id === focusId : true;
  const Icon = call.status === 'answered' ? (outgoing ? PhoneOutgoing : PhoneIncoming) : PhoneMissed;
  return (
    <div className="cc-row">
      <span className={`cc-row-icon ${call.status === 'answered' ? 'success' : 'danger'}`}><Icon aria-hidden /></span>
      <div className="cc-row-body">
        <strong>{call.caller.name} → {call.receiver.name}</strong>
        <span>
          {CALL_STATUS_LABELS[call.status] || call.status}
          {call.status === 'answered' ? ` · ${clock(call.durationSec)}` : ''}
        </span>
      </div>
      <span className="cc-row-time">{timeAgo(call.createdAt)}</span>
    </div>
  );
}

function NotificationRow({ note, showUser }) {
  return (
    <div className="cc-row">
      <span className={`cc-row-icon ${note.type === 'call' ? 'info' : note.type === 'chat' ? 'success' : 'warning'}`}>
        {note.type === 'call' ? <Phone aria-hidden /> : note.type === 'chat' ? <MessageCircle aria-hidden /> : <Bell aria-hidden />}
      </span>
      <div className="cc-row-body">
        <strong>{showUser && note.user ? `${note.user.name} · ` : ''}{note.title}</strong>
        <span>{note.body}</span>
      </div>
      <div className="cc-row-side">
        <span className="cc-row-time">{timeAgo(note.createdAt)}</span>
        {note.unread ? <span className="cc-dot" title="Not opened yet" /> : <CheckCheck className="cc-read" aria-label="Opened" />}
      </div>
    </div>
  );
}

function ActivityOverview({ feed, onRefresh, onOpenUser }) {
  return (
    <div className="cc-overview">
      <div className="card cc-card">
        <div className="cc-card-head">
          <h3><Radio aria-hidden /> Live calls</h3>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh}>
            <RefreshCw className="item-icon" aria-hidden /> Refresh
          </button>
        </div>
        {feed.live.length === 0 ? (
          <div className="empty-state">Nobody is on a call right now.</div>
        ) : feed.live.map((call) => (
          <div key={call.chatId} className="cc-row">
            <span className={`cc-row-icon ${call.state === 'active' ? 'success' : 'info'} cc-pulse`}><Phone aria-hidden /></span>
            <div className="cc-row-body">
              <strong>
                <button type="button" className="cc-link" onClick={() => onOpenUser(call.caller.id)}>{call.caller.name}</button>
                {' → '}
                <button type="button" className="cc-link" onClick={() => onOpenUser(call.receiver.id)}>{call.receiver.name}</button>
              </strong>
              <span>{call.state === 'active' ? `Talking · started ${timeAgo(call.answeredAt)}` : CALL_LABELS[call.state]}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="cc-overview-grid">
        <div className="card cc-card">
          <div className="cc-card-head"><h3><Phone aria-hidden /> Recent calls</h3></div>
          {feed.calls.length === 0 ? <div className="empty-state">No calls yet.</div> : feed.calls.map((call) => <CallRow key={call.id} call={call} />)}
        </div>
        <div className="card cc-card">
          <div className="cc-card-head"><h3><Bell aria-hidden /> Recent notifications</h3></div>
          {feed.notifications.length === 0
            ? <div className="empty-state">No notifications yet.</div>
            : feed.notifications.map((note) => <NotificationRow key={note.id} note={note} showUser />)}
        </div>
      </div>
    </div>
  );
}

function MessagePanel({ detail, onSent }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [detail.messages.length]);

  const send = async (event) => {
    event.preventDefault();
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/chats/admin/users/${detail.contact.id}/messages`, { text: clean });
      setText('');
      onSent();
    } catch (err) {
      setError(errorText(err, 'Message not sent'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc-panel">
      <div className="cc-thread" ref={listRef}>
        {detail.messages.length === 0 ? (
          <div className="empty-state">
            No messages yet. They will see your message in their chats as <strong>KinBech Support</strong>.
          </div>
        ) : detail.messages.map((message) => (
          <div key={message.id} className={`cc-bubble ${message.mine ? 'mine' : ''} ${message.kind === 'call' ? 'call' : ''}`}>
            {message.kind === 'call' ? <Phone className="cc-bubble-icon" aria-hidden /> : null}
            <span>{message.kind === 'voice' ? 'Voice message' : message.text}</span>
            <time>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              {message.mine ? (message.viewedAt ? ' · Seen' : ' · Sent') : ''}
            </time>
          </div>
        ))}
      </div>
      <form className="cc-composer" onSubmit={send}>
        <textarea
          className="form-textarea"
          rows={2}
          value={text}
          maxLength={2000}
          placeholder={`Message ${detail.contact.name}…`}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) send(event);
          }}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
          <Send className="item-icon" aria-hidden /> {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
      {error ? <div className="u360-error">{error}</div> : null}
    </div>
  );
}

/** Voice call from the browser to the user's phone, over the same Agora channel the app uses. */
function CallPanel({ detail, onChanged }) {
  const [phase, setPhase] = useState('idle');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const callRef = useRef({ client: null, mic: null, chatId: '', poll: null, timer: null, answeredAt: 0 });

  const cleanup = useCallback(async () => {
    const call = callRef.current;
    clearInterval(call.poll);
    clearInterval(call.timer);
    call.poll = null;
    call.timer = null;
    try {
      call.mic?.close();
    } catch {
      /* already closed */
    }
    try {
      await call.client?.leave();
    } catch {
      /* already left */
    }
    call.client = null;
    call.mic = null;
  }, []);

  const finish = useCallback(async ({ notifyServer = true, message = '' } = {}) => {
    const { chatId } = callRef.current;
    await cleanup();
    if (notifyServer && chatId) await api.post(`/chats/${chatId}/call/end`).catch(() => {});
    callRef.current.chatId = '';
    setPhase('ended');
    setError(message);
    onChanged();
  }, [cleanup, onChanged]);

  useEffect(() => () => {
    const { chatId } = callRef.current;
    cleanup();
    if (chatId) api.post(`/chats/${chatId}/call/end`).catch(() => {});
  }, [cleanup]);

  const markActive = () => {
    const call = callRef.current;
    if (call.answeredAt) return;
    call.answeredAt = Date.now();
    setPhase('active');
    call.timer = setInterval(() => setSeconds((Date.now() - call.answeredAt) / 1000), 1000);
  };

  const start = async () => {
    setError('');
    setMuted(false);
    setSeconds(0);
    setPhase('connecting');
    const call = callRef.current;
    call.answeredAt = 0;
    let mic = null;
    try {
      const { default: AgoraRTC } = await import('agora-rtc-sdk-ng');
      AgoraRTC.setLogLevel(3);
      mic = await AgoraRTC.createMicrophoneAudioTrack();
      const { data } = await api.post(`/chats/admin/users/${detail.contact.id}/call`);
      call.chatId = data.chatId;
      call.mic = mic;
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
      call.client = client;
      client.on('user-published', async (remote, mediaType) => {
        await client.subscribe(remote, mediaType);
        if (mediaType === 'audio') remote.audioTrack?.play();
        markActive();
      });
      client.on('user-left', () => finish({ message: 'They hung up.' }));
      const { session } = data;
      await client.join(session.appId, session.channel, session.token, session.uid);
      await client.publish([mic]);
      setPhase('calling');
      const pushProblem = pushFailureText(data);
      if (pushProblem) setError(pushProblem);
      call.poll = setInterval(async () => {
        try {
          const { data: status } = await api.get(`/chats/${call.chatId}/call`);
          if (status.status === 'ended') {
            finish({ notifyServer: false, message: call.answeredAt ? 'Call ended.' : 'No answer or declined.' });
          } else if (status.status === 'active') {
            markActive();
          } else if (!call.answeredAt) {
            setPhase(status.status);
          }
        } catch {
          /* keep polling */
        }
      }, 2000);
    } catch (err) {
      try {
        mic?.close();
      } catch {
        /* never opened */
      }
      const denied = err?.name === 'NotAllowedError' || /permission/i.test(String(err?.message || ''));
      const policy = document.permissionsPolicy || document.featurePolicy;
      const blockedBySite = Boolean(policy?.allowsFeature) && !policy.allowsFeature('microphone');
      let message = errorText(err, err?.message || 'Call failed');
      if (blockedBySite) message = 'The site blocks the microphone (Permissions-Policy header). Update .htaccess and redeploy.';
      else if (denied) message = 'Allow microphone access in the browser to call.';
      await finish({ notifyServer: Boolean(call.chatId), message });
    }
  };

  const toggleMute = async () => {
    const mic = callRef.current.mic;
    if (!mic) return;
    await mic.setEnabled(muted);
    setMuted(!muted);
  };

  const inCall = ['connecting', 'calling', 'ringing', 'active'].includes(phase);
  const busyElsewhere = !inCall && detail.contact.onCall && detail.supportCall == null;

  return (
    <div className="cc-panel">
      <div className={`cc-call ${inCall ? `is-${phase}` : ''}`}>
        <div className="cc-call-ring">
          <Avatar name={detail.contact.name} src={detail.contact.avatarUrl} size={88} />
        </div>
        <h3>{detail.contact.name}</h3>
        <p className="cc-call-state">
          {phase === 'active' ? `On call · ${clock(seconds)}` : inCall ? CALL_LABELS[phase] : 'Rings as “KinBech Support” with the full-screen call on their phone.'}
        </p>
        <div className="cc-call-actions">
          {inCall ? (
            <>
              <button type="button" className={`cc-round ${muted ? 'muted' : ''}`} onClick={toggleMute} disabled={phase === 'connecting'} title={muted ? 'Unmute' : 'Mute'}>
                {muted ? <MicOff aria-hidden /> : <Mic aria-hidden />}
              </button>
              <button type="button" className="cc-round hangup" onClick={() => finish({ message: '' })} title="Hang up">
                <PhoneOff aria-hidden />
              </button>
            </>
          ) : (
            <button type="button" className="cc-round answer" onClick={start} disabled={detail.contact.status === 'suspended'} title="Call">
              <Phone aria-hidden />
            </button>
          )}
        </div>
        {busyElsewhere ? <div className="u360-banner warning compact">They are on another call right now.</div> : null}
        {error ? <div className={phase === 'ended' ? 'u360-error' : 'u360-banner warning compact'}>{error}</div> : null}
      </div>
      <div className="cc-subhead">Their recent calls</div>
      {detail.calls.length === 0
        ? <div className="empty-state">No calls yet.</div>
        : detail.calls.map((call) => <CallRow key={call.id} call={call} focusId={detail.contact.id} />)}
    </div>
  );
}

function NotifyPanel({ detail, onSent }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const send = async (event) => {
    event.preventDefault();
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post(`/chats/admin/users/${detail.contact.id}/notify`, { title, body });
      setResult({
        ok: true,
        text: data.pushed ? 'Sent to their phone and saved in their in-app notifications.' : 'Saved in their in-app notifications. Push was not delivered (no push token or notifications turned off).',
      });
      setTitle('');
      setBody('');
      onSent();
    } catch (err) {
      setResult({ ok: false, text: errorText(err, 'Notification not sent') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cc-panel">
      <form className="cc-notify" onSubmit={send}>
        <div className="form-group">
          <label htmlFor="cc-title">Title</label>
          <input id="cc-title" className="form-input" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Your shop is verified" />
        </div>
        <div className="form-group">
          <label htmlFor="cc-body">Message</label>
          <textarea id="cc-body" className="form-textarea" rows={3} maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} placeholder="What should they know?" />
        </div>
        <div className="kb-push-preview">
          <img src={BRAND_ICON_SRC} alt="" />
          <div className="kb-push-preview-body">
            <span className="kb-push-preview-app">KinBech · now</span>
            <span className="kb-push-preview-title">{title.trim() || 'Notification title'}</span>
            <span className="kb-push-preview-text">{body.trim() || 'Your message will appear here.'}</span>
          </div>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || !title.trim() || !body.trim()}>
          <Send className="item-icon" aria-hidden /> {busy ? 'Sending…' : `Send to ${detail.contact.name}`}
        </button>
        {result ? <div className={result.ok ? 'u360-notice' : 'u360-error'}>{result.text}</div> : null}
      </form>
      <div className="cc-subhead">Their notifications</div>
      {detail.notifications.length === 0
        ? <div className="empty-state">No notifications yet.</div>
        : detail.notifications.map((note) => <NotificationRow key={note.id} note={note} />)}
    </div>
  );
}

function ContactDetail({ detail, tab, setTab, onClose, onRefresh }) {
  const { contact } = detail;
  return (
    <div className="cc-detail">
      <div className="card cc-profile">
        <Avatar name={contact.name} src={contact.avatarUrl} size={64} />
        <div className="cc-profile-main">
          <div className="cc-profile-name">
            <h2>{contact.name}</h2>
            <span className={`cc-chip ${contact.sellerType === 'shop' ? 'info' : 'neutral'}`}>
              {contact.sellerType === 'shop' ? <Store aria-hidden /> : <User aria-hidden />}
              {contact.sellerType === 'shop' ? 'Shop' : 'Individual'}
            </span>
            {contact.isTester ? <span className="cc-chip warning">Tester</span> : null}
            {contact.status === 'suspended' ? <span className="cc-chip danger">Suspended</span> : null}
          </div>
          <p className="cc-profile-meta">
            {[contact.phone, contact.email, contact.location].filter(Boolean).join(' · ') || 'No contact details'}
          </p>
          {contact.shop ? <p className="cc-profile-meta"><Store aria-hidden /> {contact.shop.name} ({contact.shop.status})</p> : null}
          <div className="cc-profile-chips">
            <PushBadge contact={contact} />
            <span className="cc-chip neutral">Active {timeAgo(contact.lastActiveAt)}</span>
            <span className="cc-chip neutral">{contact.listingCount} listings · {contact.soldCount} sold</span>
            {contact.onCall ? <span className="cc-chip info cc-pulse"><Phone aria-hidden /> {contact.onCall === 'active' ? 'On a call' : 'Ringing'}</span> : null}
          </div>
        </div>
        <div className="cc-profile-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onRefresh} title="Refresh"><RefreshCw className="item-icon" aria-hidden /></button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} title="Close"><X className="item-icon" aria-hidden /></button>
        </div>
      </div>

      <div className="cc-tabs" role="tablist">
        {TABS.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" role="tab" aria-selected={tab === value} className={`cc-tab ${tab === value ? 'active' : ''}`} onClick={() => setTab(value)}>
            <Icon aria-hidden /> {label}
          </button>
        ))}
      </div>

      <div className="card cc-card">
        {tab === 'message' ? <MessagePanel detail={detail} onSent={onRefresh} /> : null}
        {/* Stays mounted so switching tabs never drops a live call. */}
        <div hidden={tab !== 'call'}>
          <CallPanel detail={detail} onChanged={onRefresh} />
        </div>
        {tab === 'notify' ? <NotifyPanel detail={detail} onSent={onRefresh} /> : null}
      </div>
    </div>
  );
}

export default function ContactCenter() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('sellers');
  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [feed, setFeed] = useState({ live: [], calls: [], notifications: [] });
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('message');
  const [error, setError] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const selectedRef = useRef('');
  selectedRef.current = selectedId;

  useEffect(() => {
    let cancelled = false;
    setLoadingContacts(true);
    api.get('/chats/admin/contacts', { params: { q: debouncedQuery, type: filter } })
      .then(({ data }) => {
        if (!cancelled) setContacts(data.contacts || []);
      })
      .catch((err) => {
        if (!cancelled) setError(errorText(err, 'Could not load users'));
      })
      .finally(() => {
        if (!cancelled) setLoadingContacts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, filter]);

  const loadFeed = useCallback(() => {
    api.get('/chats/admin/feed').then(({ data }) => setFeed(data)).catch(() => {});
  }, []);

  const loadDetail = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const { data } = await api.get(`/chats/admin/users/${userId}`);
      if (selectedRef.current !== userId) return;
      setDetail(data);
      setError('');
    } catch (err) {
      setError(errorText(err, 'Could not load this user'));
    }
  }, []);

  useEffect(() => {
    if (selectedId) return undefined;
    loadFeed();
    const timer = setInterval(loadFeed, 10000);
    return () => clearInterval(timer);
  }, [selectedId, loadFeed]);

  useEffect(() => {
    if (!selectedId) return undefined;
    setDetail(null);
    loadDetail(selectedId);
    const timer = setInterval(() => loadDetail(selectedId), 5000);
    return () => clearInterval(timer);
  }, [selectedId, loadDetail]);

  const openUser = (userId, nextTab) => {
    if (!userId) return;
    setSelectedId(userId);
    if (nextTab) setTab(nextTab);
  };

  return (
    <div className="cc-page">
      <aside className="card cc-sidebar">
        <div className="cc-search">
          <Search aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, phone, email or ID" />
        </div>
        <div className="cc-filters">
          {FILTERS.map((option) => (
            <button key={option.value} type="button" className={`cc-filter ${filter === option.value ? 'active' : ''}`} onClick={() => setFilter(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="cc-contacts">
          {loadingContacts && contacts.length === 0 ? <div className="empty-state">Loading…</div> : null}
          {!loadingContacts && contacts.length === 0 ? <div className="empty-state">No users found.</div> : null}
          {contacts.map((contact) => (
            <div key={contact.id} className={`cc-contact ${selectedId === contact.id ? 'active' : ''}`}>
              <button type="button" className="cc-contact-main" onClick={() => openUser(contact.id)}>
                <Avatar name={contact.name} src={contact.avatarUrl} />
                <span className="cc-contact-text">
                  <strong>{contact.shop?.name || contact.name}</strong>
                  <span>{contact.shop ? contact.name : contact.phone || contact.email || contact.location || '—'}</span>
                </span>
                <span className={`cc-status-dot ${contact.pushReady && contact.notificationsOn ? 'ok' : 'off'}`} title={contact.pushReady ? 'Push ready' : 'No push token'} />
              </button>
              <div className="cc-contact-quick">
                <button type="button" title="Message" onClick={() => openUser(contact.id, 'message')}><MessageCircle aria-hidden /></button>
                <button type="button" title="Call" onClick={() => openUser(contact.id, 'call')}><Phone aria-hidden /></button>
                <button type="button" title="Notify" onClick={() => openUser(contact.id, 'notify')}><Bell aria-hidden /></button>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <section className="cc-main">
        {error ? <div className="u360-error" style={{ marginBottom: 12 }}>{error}</div> : null}
        {!selectedId ? (
          <>
            <div className="cc-intro card">
              <Headphones aria-hidden />
              <div>
                <h3>Contact center</h3>
                <p>Pick a user on the left to message, call or notify them. Users see you as <strong>KinBech Support</strong>.</p>
              </div>
            </div>
            <ActivityOverview feed={feed} onRefresh={loadFeed} onOpenUser={(id) => openUser(id)} />
          </>
        ) : detail ? (
          <ContactDetail
            detail={detail}
            tab={tab}
            setTab={setTab}
            onClose={() => {
              setSelectedId('');
              setDetail(null);
            }}
            onRefresh={() => loadDetail(selectedId)}
          />
        ) : (
          <div className="card empty-state">Loading…</div>
        )}
      </section>
    </div>
  );
}
