import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  Filter,
  FlaskConical,
  Gauge,
  History,
  Info,
  KeyRound,
  Pause,
  Play,
  Plus,
  Power,
  RefreshCw,
  ShieldCheck,
  Shuffle,
  Snowflake,
  Timer,
  Trash2,
  TrendingUp,
  TriangleAlert,
  User,
  Zap,
} from 'lucide-react';
import api from '../services/api';
import { confirmAction, toast } from '../components/Feedback';

const LIVE_EVERY_MS = 10000;
const IDLE_EVERY_MS = 60000;

const ERROR_TYPES = {
  quota_day: { label: 'Daily quota used', tone: 'warn', hint: 'This account used its daily Gemini quota for this model. It is skipped until the daily reset.' },
  quota_minute: { label: 'Per-minute limit', tone: 'warn', hint: 'Too many requests in one minute. This account + model is skipped for a few seconds.' },
  quota_zero: { label: 'No free quota (limit 0)', tone: 'bad', hint: 'Google gives this project 0 free requests for this model. Turn on billing for the project or turn this model off.' },
  spend_limit: { label: 'Spend cap reached', tone: 'warn', hint: 'The Google project hit its spend limit. The account is skipped for at least 10 minutes.' },
  overloaded: { label: 'Google overloaded', tone: 'warn', hint: 'Gemini is busy for everyone on this model. The model rests for a short time and other models answer.' },
  server_error: { label: 'Google server error', tone: 'bad', hint: 'Gemini returned a 5xx error. The next account or model was tried.' },
  timeout: { label: 'Too slow (timeout)', tone: 'warn', hint: 'No answer in time. The request moved to the next account or model.' },
  network: { label: 'Network error', tone: 'bad', hint: 'Our server could not reach Google.' },
  key_invalid: { label: 'Key rejected', tone: 'bad', hint: 'Google rejected this API key (wrong, deleted, or blocked). The account is skipped for 24h. Replace the key.' },
  model_missing: { label: 'Model not available', tone: 'bad', hint: 'This account cannot use this model. It is skipped for 12h on this account.' },
  bad_request: { label: 'Bad request', tone: 'bad', hint: 'Gemini could not read this request, usually the photo.' },
  bad_response: { label: 'Unreadable answer', tone: 'warn', hint: 'Gemini answered, but not in the format the app needs.' },
  safety_block: { label: 'Photo blocked', tone: 'info', hint: 'Gemini refused the photo for safety reasons.' },
  failed: { label: 'Failed', tone: 'bad', hint: 'The call failed for an unknown reason.' },
};

const RESULT_FILTERS = [
  { value: '', label: 'All results' },
  { value: 'ok', label: 'Worked' },
  { value: 'failed', label: 'Failed' },
  { value: 'limit', label: 'Only limits' },
];

const PURPOSE_FILTERS = [
  { value: '', label: 'All uses' },
  { value: 'listing', label: 'Listing photo fill' },
  { value: 'shop-categories', label: 'Shop categories' },
  { value: 'voice', label: 'Explore voice search' },
  { value: 'voice-tts', label: 'Voice helper speech' },
  { value: 'test', label: 'Admin tests' },
  { value: 'benchmark', label: 'Photo accuracy checks' },
];

const LIMIT_SOURCES = {
  catalog: "Google's free tier",
  google: "Learned from Google's limit error",
  admin: 'Set by you',
};

const SELLER_LEVELS = {
  new: { label: 'New seller', tone: 'ok' },
  regular: { label: 'Regular seller', tone: 'info' },
  heavy: { label: 'Heavy seller', tone: 'warn' },
};

const CATALOG_STATUS = {
  used: { label: 'Reads listing photos', tone: 'ok' },
  idea: { label: 'Free · can add', tone: 'info' },
  test: { label: 'Free · test first', tone: 'info' },
  limited: { label: 'Free · very small', tone: 'warn' },
  no: { label: 'Not useful here', tone: 'muted' },
  paid: { label: 'Paid only', tone: 'bad' },
};

const CATALOG_FILTERS = [
  { value: '', label: 'All models' },
  { value: 'used', label: 'Photo reading' },
  { value: 'free', label: 'Free, can add' },
  { value: 'limited', label: 'Very small free' },
  { value: 'no', label: 'Not useful' },
  { value: 'paid', label: 'Paid only' },
];

const KIND_LABELS = {
  vision: 'Photo + text',
  text: 'Text',
  embedding: 'Search vectors',
  live: 'Live voice',
  audio: 'Audio',
  agent: 'Agent',
  tool: 'Tool',
  image: 'Image',
  media: 'Video / music',
};

// Only the request log starts open; the rest show a one-line summary until clicked.
const SECTION_DEFAULTS = {
  log: true,
  models: false,
  accounts: false,
  levels: false,
  bench: false,
  history: false,
  limits: false,
  catalog: false,
};
const SECTIONS_KEY = 'adminAiSections';

function useSections() {
  const [open, setOpen] = useState(() => {
    try {
      return { ...SECTION_DEFAULTS, ...JSON.parse(localStorage.getItem(SECTIONS_KEY) || '{}') };
    } catch {
      return SECTION_DEFAULTS;
    }
  });
  const update = (next) => {
    setOpen(next);
    localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
  };
  return {
    section: (id) => ({ open: Boolean(open[id]), onToggle: () => update({ ...open, [id]: !open[id] }) }),
    setAll: (value) => update(Object.fromEntries(Object.keys(SECTION_DEFAULTS).map((id) => [id, value]))),
    allOpen: Object.keys(SECTION_DEFAULTS).every((id) => open[id]),
  };
}

function Section({ title, icon: Icon, hint, summary, actions, open, onToggle, children }) {
  return (
    <div className={`card ai-section ${open ? 'is-open' : 'is-closed'}`}>
      <div
        className="card-header ai-section-head"
        onClick={(event) => {
          if (event.target.closest('.ai-section-actions')) return;
          onToggle();
        }}
      >
        <h3>
          <button type="button" className="ai-section-toggle" aria-expanded={open}>
            <ChevronRight className="item-icon ai-section-chevron" aria-hidden />
            {Icon ? <Icon className="item-icon" aria-hidden /> : null}
            {title}
          </button>
        </h3>
        <span className="form-hint ai-section-hint">{open ? hint : summary}</span>
        {open && actions ? <div className="ai-section-actions">{actions}</div> : null}
      </div>
      {open ? <div className="ai-section-body">{children}</div> : null}
    </div>
  );
}

function useNow(every = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

function formatDuration(until) {
  if (!until) return '';
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  if (ms < 90000) return `${Math.ceil(ms / 1000)}s`;
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatClock(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDay(date) {
  if (!date) return '';
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (value.toDateString() === today.toDateString()) return 'Today';
  if (value.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return value.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatMs(ms) {
  if (!ms) return '0 ms';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)}s`;
}

function timeAgo(date) {
  if (!date) return 'Never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 10) return 'Just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function dayLabel(day, short = false) {
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString([], short ? { weekday: 'short' } : { weekday: 'short', day: 'numeric', month: 'short' });
}

function percent(part, whole) {
  if (!whole) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

function errorInfo(type) {
  return ERROR_TYPES[type] || ERROR_TYPES.failed;
}

function accountStatus(account, activeAccountId) {
  if (!account.enabled) return { key: 'off', label: 'Turned off', badge: 'rejected' };
  if (account.blockedUntil) {
    const label = account.lastErrorType ? errorInfo(account.lastErrorType).label : 'At limit';
    return { key: 'limit', label: `${label} · back in ${formatDuration(account.blockedUntil)}`, badge: 'suspended' };
  }
  if (account.id === activeAccountId) return { key: 'active', label: 'In use now', badge: 'active' };
  return { key: 'standby', label: 'Standby', badge: 'pending' };
}

function ErrorTag({ type, status, compact = false }) {
  if (!type) return null;
  const info = errorInfo(type);
  return (
    <span className={`ai-tag is-${info.tone}`} title={info.hint}>
      {info.label}
      {status && !compact ? <em>HTTP {status}</em> : null}
    </span>
  );
}

function ResultBadge({ result, ms }) {
  if (result === 'ok') return <span className="status-badge active">OK{ms ? ` · ${formatMs(ms)}` : ''}</span>;
  if (result === 'limit') return <span className="status-badge pending">Limit hit</span>;
  return <span className="status-badge suspended">Failed</span>;
}

function LeftBar({ remaining, limit }) {
  const leftPct = percent(remaining, limit);
  const tone = leftPct <= 25 ? 'full' : leftPct <= 50 ? 'warn' : '';
  return (
    <div className={`ai-usage-bar ${remaining === 0 ? 'is-empty' : ''}`}>
      <span className={tone} style={{ width: `${leftPct}%` }} />
    </div>
  );
}

function QuotaBar({ used, limit, remaining }) {
  return (
    <div className="ai-quota">
      <div className="ai-quota-top">
        <span className="ai-quota-left">
          <strong>{remaining}</strong> of {limit} left today
        </span>
        <span className="ai-quota-used">{used} used</span>
      </div>
      <LeftBar remaining={remaining} limit={limit} />
    </div>
  );
}

function WeekBars({ week }) {
  const max = Math.max(1, ...week.map((row) => row.ok + row.failed));
  const ordered = [...week].reverse();
  return (
    <div className="ai-week" aria-label="Requests in the last 7 days">
      {ordered.map((row) => {
        const total = row.ok + row.failed;
        return (
          <div className="ai-week-col" key={row.day} title={`${dayLabel(row.day)}: ${row.ok} ok, ${row.failed} failed, ${row.limit} limit hits`}>
            <div className="ai-week-track">
              <span style={{ height: `${Math.max(total ? 8 : 0, percent(total, max))}%` }} />
            </div>
            <small>{dayLabel(row.day, true).slice(0, 2)}</small>
          </div>
        );
      })}
    </div>
  );
}

function AccountCard({
  account,
  index,
  count,
  activeAccountId,
  activeModel,
  saving,
  testing,
  onMove,
  onRename,
  onToggle,
  onTest,
  onClearLimit,
  onReplaceKey,
  onRemove,
}) {
  const usage = account.usage || { today: {}, week: [], models: [], quota: {} };
  const blockedModels = usage.models.filter((model) => model.blockedUntil).length;
  const [showModels, setShowModels] = useState(blockedModels > 0);
  const [showKey, setShowKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const status = accountStatus(account, activeAccountId);
  const modelsAtLimit = usage.models.filter((model) => model.remaining === 0).length;
  const rate = usage.today.successRate;

  return (
    <article className={`ai-acc is-${status.key}`}>
      <header className="ai-acc-head">
        <span className="ai-acc-rank" title="Order the app tries accounts in">#{index + 1}</span>
        <div className="ai-acc-title">
          <input
            className="ai-acc-name"
            defaultValue={account.label}
            key={`${account.id}-${account.label}`}
            title="Click to rename"
            onBlur={(event) => {
              const label = event.target.value.trim();
              if (label && label !== account.label) onRename(label);
            }}
          />
          <div className="ai-acc-sub">
            <span><KeyRound className="item-icon" aria-hidden /> Key {account.keyHint}</span>
            <span title={formatDateTime(usage.lastOkAt)}>
              <ShieldCheck className="item-icon" aria-hidden /> Last success {timeAgo(usage.lastOkAt)}
            </span>
            {usage.lastFailAt ? (
              <span className="is-bad" title={formatDateTime(usage.lastFailAt)}>
                <TriangleAlert className="item-icon" aria-hidden /> Last error {timeAgo(usage.lastFailAt)}
              </span>
            ) : null}
            {status.key === 'active' && activeModel ? (
              <span><Bot className="item-icon" aria-hidden /> {activeModel}</span>
            ) : null}
          </div>
        </div>
        <span className={`status-badge ${status.badge}`}>{status.label}</span>
      </header>

      <div className="ai-acc-body">
        <div className="ai-acc-grid">
          <div className="ai-acc-main">
            <QuotaBar used={usage.quota.used || 0} limit={usage.quota.limit || 0} remaining={usage.quota.remaining || 0} />
            <div className="ai-acc-stats ai-acc-stats-5">
              <div><strong>{usage.today.ok || 0}</strong><span>Success today</span></div>
              <div><strong className={usage.today.failed ? 'is-bad' : ''}>{usage.today.failed || 0}</strong><span>Failed today</span></div>
              <div><strong className={usage.today.limitHits ? 'is-warn' : ''}>{usage.today.limitHits || 0}</strong><span>Limit hits</span></div>
              <div>
                <strong className={rate !== null && rate !== undefined && rate < 70 ? 'is-warn' : ''}>
                  {rate === null || rate === undefined ? '—' : `${rate}%`}
                </strong>
                <span>Success rate</span>
              </div>
              <div><strong>{usage.today.avgMs ? formatMs(usage.today.avgMs) : '—'}</strong><span>Avg answer</span></div>
            </div>
          </div>
          <div className="ai-acc-side">
            <span className="ai-acc-side-label">Requests, last 7 days</span>
            <WeekBars week={usage.week} />
          </div>
        </div>

        {account.lastError ? (
          <div className={`ai-acc-error is-${errorInfo(account.lastErrorType).tone}`}>
            <TriangleAlert className="item-icon" aria-hidden />
            <div>
              <div className="ai-acc-error-head">
                <ErrorTag type={account.lastErrorType || 'failed'} compact />
                {account.lastErrorAt ? (
                  <span>
                    {formatDateTime(account.lastErrorAt)} · {timeAgo(account.lastErrorAt)}
                  </span>
                ) : null}
              </div>
              <p>{account.lastError}</p>
              {account.lastErrorType ? <small>{errorInfo(account.lastErrorType).hint}</small> : null}
            </div>
          </div>
        ) : null}

        <button type="button" className="ai-acc-toggle" onClick={() => setShowModels((open) => !open)}>
          {showModels ? <ChevronUp className="item-icon" aria-hidden /> : <ChevronDown className="item-icon" aria-hidden />}
          Quota by model ({usage.models.length} models{modelsAtLimit ? `, ${modelsAtLimit} not usable` : ''})
        </button>
        {showModels ? (
          <div className="ai-acc-models">
            {usage.models.map((model) => (
              <div className="ai-acc-model-wrap" key={model.name}>
                <div className="ai-acc-model">
                  <span className="ai-acc-model-name" title={model.name}>{model.name}</span>
                  <LeftBar remaining={model.remaining} limit={model.limit} />
                  <span className={`ai-acc-model-num ${model.blockedUntil ? 'is-bad' : model.cooling ? 'is-warn' : ''}`}>
                    {model.blockedUntil
                      ? `${model.blockType ? errorInfo(model.blockType).label : 'Limit reached'} · back in ${formatDuration(model.blockedUntil)}`
                      : model.cooling
                        ? `Resting · ${formatDuration(model.cooling)}`
                        : `${model.remaining} of ${model.limit} left · ${model.ok} ok${model.failed ? `, ${model.failed} failed` : ''}`}
                  </span>
                </div>
                {model.blockedUntil && model.blockReason ? <div className="ai-acc-model-reason">{model.blockReason}</div> : null}
              </div>
            ))}
            {!usage.models.length ? <div className="form-hint">No model is turned on.</div> : null}
          </div>
        ) : null}
      </div>

      <footer className="ai-acc-actions">
        <div className="action-buttons">
          <button type="button" className="action-btn" title="Try this account earlier" disabled={saving || index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="item-icon" aria-hidden />
          </button>
          <button type="button" className="action-btn" title="Try this account later" disabled={saving || index === count - 1} onClick={() => onMove(1)}>
            <ArrowDown className="item-icon" aria-hidden />
          </button>
          <button type="button" className="action-btn view" disabled={Boolean(testing)} onClick={onTest}>
            <FlaskConical className="item-icon" aria-hidden /> {testing === account.id || testing === 'all' ? 'Testing…' : 'Test'}
          </button>
          <button type="button" className="action-btn" disabled={saving} onClick={onToggle}>
            <Power className="item-icon" aria-hidden /> {account.enabled ? 'Turn off' : 'Turn on'}
          </button>
          {account.blockedUntil || account.modelBlocks?.length ? (
            <button type="button" className="action-btn" disabled={saving} onClick={onClearLimit} title="Use this account again before the limit resets">
              <RefreshCw className="item-icon" aria-hidden /> Clear limit
            </button>
          ) : null}
          <button type="button" className="action-btn" onClick={() => setShowKey((open) => !open)}>
            <KeyRound className="item-icon" aria-hidden /> Replace key
          </button>
        </div>
        <button type="button" className="action-btn suspend" disabled={saving} onClick={onRemove}>
          <Trash2 className="item-icon" aria-hidden /> Remove
        </button>
      </footer>

      {showKey ? (
        <div className="ai-add-row ai-acc-keyrow">
          <input
            type="password"
            className="ai-add-input"
            placeholder="Paste the new Gemini API key"
            value={newKey}
            onChange={(event) => setNewKey(event.target.value)}
          />
          <button
            type="button"
            className="action-btn view"
            disabled={saving || !newKey.trim()}
            onClick={async () => {
              if (await onReplaceKey(newKey)) {
                setNewKey('');
                setShowKey(false);
              }
            }}
          >
            Save key
          </button>
        </div>
      ) : null}
    </article>
  );
}

function sameModels(a, b) {
  const pick = (list) => list.filter((model) => model.enabled).map((model) => `${model.name}:${model.dailyLimit}`).join('|');
  return pick(a) === pick(b);
}

function ModelHealth({ data, saving, testing, onTest, onClear, onSaveModels }) {
  const [adding, setAdding] = useState('');
  const saved = data?.accounts || [];
  const accounts = saved.length
    ? saved.filter((account) => account.enabled)
    : data?.keyConfigured
      ? [{ id: 'env', label: 'Server key', modelBlocks: [] }]
      : [];
  const cooling = new Map((data?.cooling || []).map((row) => [row.name, row]));
  const all = data?.models || [];
  const enabled = all.filter((model) => model.enabled);
  const disabled = all.filter((model) => !model.enabled);
  const recommended = data?.recommendedModels || [];
  const recommendedNames = new Set(recommended.map((model) => model.name));
  const listed = new Set(all.map((model) => model.name));
  const addable = (data?.available || []).filter((name) => !listed.has(name));
  const usingRecommended = recommended.length > 0 && sameModels(all, recommended.map((model) => ({ ...model, enabled: true })));

  const plain = (list) => list.map(({ name, enabled: on, dailyLimit }) => ({ name, enabled: on, dailyLimit }));
  const move = (name, delta) => {
    const next = [...enabled];
    const from = next.findIndex((model) => model.name === name);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= next.length) return;
    [next[from], next[to]] = [next[to], next[from]];
    onSaveModels(plain([...next, ...disabled]));
  };
  const toggle = (name) => {
    const target = all.find((model) => model.name === name);
    const rest = all.filter((model) => model.name !== name);
    const flipped = { ...target, enabled: !target.enabled };
    const list = [...rest.filter((model) => model.enabled), flipped, ...rest.filter((model) => !model.enabled)];
    onSaveModels(plain(list), `${name} turned ${flipped.enabled ? 'on' : 'off'}`);
  };
  const applyRecommended = async () => {
    const ok = await confirmAction({
      title: 'Use the recommended models?',
      message: `Tried in this order: ${recommended.map((model) => `${model.name} (${model.dailyLimit}/day)`).join(', ')}. Every other model is turned off (not deleted).`,
      confirmLabel: 'Use recommended',
    });
    if (!ok) return;
    const others = all.filter((model) => !recommendedNames.has(model.name)).map((model) => ({ ...model, enabled: false }));
    onSaveModels(plain([...recommended.map((model) => ({ ...model, enabled: true })), ...others]), 'Recommended models are in use');
  };

  const renderRow = (model, index) => {
    const off = !model.enabled;
    const cool = cooling.get(model.name);
    const usedUp = (account) => account.usage?.models?.find((item) => item.name === model.name)?.remaining === 0;
    const usable = accounts.filter(
      (account) => !account.blockedUntil && !(account.modelBlocks || []).some((block) => block.name === model.name) && !usedUp(account)
    ).length;
    const pace = model.pace || {};
    const paceText = pace.rpm ? ` · ${pace.used}/${pace.rpm} this minute` : '';
    const limitText = model.limitSource === 'admin' ? `${model.dailyLimit}/day (your limit)` : `${model.dailyLimit}/day free each`;
    let state = { key: 'ready', label: `Ready on ${usable} of ${accounts.length} accounts · ${limitText}${paceText}` };
    if (off) state = { key: 'off', label: 'Turned off' };
    else if (!data?.autoSwitch && index > 0) state = { key: 'off', label: 'Not used while auto switch is off' };
    else if (model.blockedUntil) state = { key: 'blocked', label: `Off for all accounts · back in ${formatDuration(model.blockedUntil)}` };
    else if (cool) state = { key: 'cooling', label: `Resting ${formatDuration(cool.until)} · ${errorInfo(cool.type).label}` };
    else if (!usable && accounts.some(usedUp)) state = { key: 'blocked', label: `Today's ${model.dailyLimit} used on every account · back in ${formatDuration(data?.quotaResetAt)}` };
    else if (!usable) state = { key: 'blocked', label: 'No account can use it right now' };
    else if (pace.rpm && pace.used >= pace.rpm) {
      state = { key: 'cooling', label: `Per-minute cap reached (${pace.used}/${pace.rpm}) · next model answers, free again within a minute` };
    }
    const isActive = !off && model.name === data?.activeModel;

    return (
      <div className={`ai-health-row is-${state.key} ${isActive ? 'is-current' : ''}`} key={model.name}>
        <span className="ai-health-rank">{off ? '–' : index + 1}</span>
        <div className="ai-health-main">
          <div className="ai-health-name">
            <code>{model.name}</code>
            {isActive ? <span className="ai-tag is-ok">Answering now</span> : null}
            {recommendedNames.has(model.name) ? <span className="ai-tag is-info">Recommended</span> : null}
            {['no', 'paid'].includes(model.catalogStatus) ? (
              <span className="ai-tag" title={model.catalogNote}>
                <TriangleAlert className="item-icon" aria-hidden /> {model.catalogStatus === 'paid' ? 'Paid only' : 'Not recommended'}
              </span>
            ) : null}
            {model.limitSource === 'google' ? (
              <span
                className="ai-tag is-ok"
                title={`Google's limit error said ${model.dailyLimit} requests a day${model.limitLearnedAt ? ` (${formatDateTime(model.limitLearnedAt)})` : ''}. Saved automatically.`}
              >
                <ShieldCheck className="item-icon" aria-hidden /> {model.dailyLimit}/day from Google
              </span>
            ) : null}
            {model.limitSource === 'admin' ? (
              <span
                className="ai-tag is-warn"
                title={`You set ${model.dailyLimit} a day.${model.freeTierLimit > 0 ? ` Google's free tier gives ${model.freeTierLimit}.` : ''} Reset it under Usage limits.`}
              >
                Limit set by you{model.freeTierLimit > 0 && model.freeTierLimit !== model.dailyLimit ? ` · Google gives ${model.freeTierLimit}` : ''}
              </span>
            ) : null}
          </div>
              <div className="ai-health-state">
                {state.key === 'cooling' ? <Snowflake className="item-icon" aria-hidden /> : null}
                {state.key === 'blocked' ? <TriangleAlert className="item-icon" aria-hidden /> : null}
                {state.key === 'ready' ? <Zap className="item-icon" aria-hidden /> : null}
                <span>{state.label}</span>
              </div>
          {!off && (model.blockReason || cool?.reason) ? (
            <div className="ai-health-reason" title={model.blockReason || cool.reason}>{model.blockReason || cool.reason}</div>
          ) : null}
        </div>
        <div className="ai-health-today">
          <strong>{model.today.success}</strong> ok
          {model.today.failed ? <> · <strong className="is-bad">{model.today.failed}</strong> failed</> : null}
          {model.today.quotaHits ? <> · <strong className="is-warn">{model.today.quotaHits}</strong> limits</> : null}
        </div>
        <div className="action-buttons">
          {!off ? (
            <>
              <button type="button" className="action-btn" title="Try earlier" disabled={saving || index === 0} onClick={() => move(model.name, -1)}>
                <ArrowUp className="item-icon" aria-hidden />
              </button>
              <button
                type="button"
                className="action-btn"
                title="Try later"
                disabled={saving || index === enabled.length - 1}
                onClick={() => move(model.name, 1)}
              >
                <ArrowDown className="item-icon" aria-hidden />
              </button>
            </>
          ) : null}
          <button type="button" className="action-btn view" disabled={Boolean(testing)} onClick={() => onTest(model.name)}>
            <FlaskConical className="item-icon" aria-hidden /> {testing === `model:${model.name}` ? 'Testing…' : 'Test'}
          </button>
          {!off && (model.blockedUntil || cool) ? (
            <button type="button" className="action-btn" disabled={saving} onClick={() => onClear(model.name)}>
              <RefreshCw className="item-icon" aria-hidden /> Use now
            </button>
          ) : null}
          <button type="button" className="action-btn" disabled={saving} onClick={() => toggle(model.name)}>
            <Power className="item-icon" aria-hidden /> {off ? 'Turn on' : 'Turn off'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="ai-health">
      {recommended.length && !usingRecommended ? (
        <div className="ai-recommend">
          <Zap className="item-icon" aria-hidden />
          <div>
            <strong>Best setup for reading product photos</strong>
            <span>
              {recommended.map((model) => `${model.name} (${model.dailyLimit}/day)`).join(' → ')}. About{' '}
              {recommended.reduce((sum, model) => sum + model.dailyLimit, 0)} free photo reads a day on every Google project.
            </span>
          </div>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={applyRecommended}>
            Use recommended
          </button>
        </div>
      ) : null}

      {enabled.map((model, index) => renderRow(model, index))}
      {!enabled.length ? <div className="empty-state">No model is turned on, so AI fill is off.</div> : null}

      {disabled.length ? <div className="ai-health-divider">Turned off ({disabled.length})</div> : null}
      {disabled.map((model) => renderRow(model, -1))}

      {addable.length ? (
        <div className="ai-add-row ai-health-add">
          <select className="ai-select" value={adding} onChange={(event) => setAdding(event.target.value)}>
            <option value="">Add a model this key can use…</option>
            {addable.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <button
            type="button"
            className="action-btn view"
            disabled={saving || !adding}
            onClick={() => {
              onSaveModels(plain([...enabled, { name: adding, enabled: true, dailyLimit: null }, ...disabled]), `${adding} added`);
              setAdding('');
            }}
          >
            <Plus className="item-icon" aria-hidden /> Add
          </button>
          <span className="form-hint">Test a new model before relying on it. Its free limit is on the Google AI Studio rate-limit page.</span>
        </div>
      ) : null}
    </div>
  );
}

function shortModel(name) {
  return name.replace(/^gemini-/, '');
}

function SellerLevels({ data, saving, onSave, section }) {
  const levels = data?.sellerLevels;
  if (!levels) return null;
  const engine = data?.engine || {};
  const enabled = (data?.models || []).filter((model) => model.enabled);
  const names = enabled.map((model) => model.name);
  const bulk = enabled.filter((model) => model.bulk).map((model) => model.name);
  const heavyOrder = [...bulk, ...names.filter((name) => !bulk.includes(name))];
  const scarce = enabled.filter((model) => model.reservedForNew && !model.bulk);
  const { newUpTo, heavyFrom, reserve } = levels;

  const cards = [
    {
      key: 'new',
      who: newUpTo === 1 ? 'First listing' : `First ${newUpTo} listings (0–${newUpTo - 1} posted)`,
      order: names,
      gets: [
        'Fastest, most exact model first',
        `Can use the last ${reserve} calls of every model, kept only for them`,
        'Last per-minute slot kept free for them',
        `Waits up to ${engine.newSellerPaceWaitSec || 25}s for a free slot instead of failing`,
        "Not stopped by the app's daily cost cap",
      ],
    },
    {
      key: 'regular',
      who: `${newUpTo}–${heavyFrom - 1} listings`,
      order: names,
      gets: [
        'Same model order as new sellers',
        `Stops ${reserve} calls before each model's daily limit, then moves to the next model`,
        'Leaves 1 slot a minute for new sellers',
      ],
    },
    {
      key: 'heavy',
      who: `${heavyFrom}+ listings`,
      order: heavyOrder,
      gets: [
        `Starts on big-quota models (${engine.bulkDailyLimit || 100}+ a day), fast small-quota ones last`,
        `Also leaves the last ${reserve} calls and 1 slot a minute for new sellers`,
      ],
    },
  ];

  const fills = (key) => levels.today?.[key]?.requests || 0;

  return (
    <Section
      {...section}
      title="Seller levels"
      icon={User}
      hint="Level = listings posted or AI fills used in 60 days, whichever is higher. Checked on every photo fill."
      summary={`New under ${newUpTo} listings · Heavy ${heavyFrom}+ · ${reserve} calls a model kept for new · today ${fills('new')} new / ${fills('regular')} regular / ${fills('heavy')} heavy`}
    >
      <div className="ai-levels">
        {cards.map((card) => {
          const info = SELLER_LEVELS[card.key];
          const today = levels.today?.[card.key] || {};
          return (
            <div className={`ai-level is-${info.tone}`} key={card.key}>
              <div className="ai-level-head">
                <span className={`ai-tag is-${info.tone}`}>{info.label}</span>
                <span className="ai-level-who">{card.who}</span>
              </div>
              <div className="ai-level-order">
                {card.order.length ? card.order.map(shortModel).join(' → ') : 'No model turned on'}
              </div>
              <ul>
                {card.gets.map((line) => <li key={line}>{line}</li>)}
              </ul>
              <div className="ai-level-today">
                <div>
                  <strong>{today.requests || 0}</strong>
                  <span>fills today</span>
                </div>
                <div>
                  <strong className={today.failed ? 'is-bad' : ''}>{today.successRate ?? '—'}{today.successRate != null ? '%' : ''}</strong>
                  <span>worked</span>
                </div>
                <div>
                  <strong>{today.avgMs ? formatMs(today.avgMs) : '—'}</strong>
                  <span>avg time</span>
                </div>
              </div>
              {today.models?.length ? (
                <div className="ai-level-models">
                  Answered by {today.models.map((item) => `${shortModel(item.name)} ×${item.count}`).join(', ')}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {scarce.length ? (
        <p className="form-hint ai-bench-intro">
          Kept for new sellers on every account each day:{' '}
          {scarce.map((model) => `${shortModel(model.name)} ${model.reservedForNew} of ${model.dailyLimit}`).join(' · ')}.
        </p>
      ) : null}
      <form
        className="ai-level-form"
        key={`${newUpTo}-${heavyFrom}-${reserve}`}
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          onSave(
            {
              newSellerListings: Number(form.get('newSellerListings')),
              heavySellerListings: Number(form.get('heavySellerListings')),
              newSellerReserve: Number(form.get('newSellerReserve')),
            },
            'Seller levels saved'
          );
        }}
      >
        <label>
          New seller until
          <input name="newSellerListings" type="number" min="1" className="ai-limit-input" defaultValue={newUpTo} />
          listings
        </label>
        <label>
          Heavy seller from
          <input name="heavySellerListings" type="number" min="2" className="ai-limit-input" defaultValue={heavyFrom} />
          listings
        </label>
        <label>
          Keep
          <input name="newSellerReserve" type="number" min="0" className="ai-limit-input" defaultValue={reserve} />
          calls per model a day for new sellers
        </label>
        <button type="submit" className="btn btn-primary" disabled={saving}>Save levels</button>
      </form>
    </Section>
  );
}

/** Correct answers first (fastest first), then wrong answers, then models that did not answer. */
function rankBenchmark(results) {
  const group = (item) => (item.correct ? 0 : item.ok ? 1 : 2);
  return results
    .map((item, index) => ({ item, index }))
    .sort((a, b) => group(a.item) - group(b.item) || (group(a.item) < 2 ? a.item.ms - b.item.ms : a.index - b.index))
    .map(({ item }) => item);
}

function BenchmarkVerdict({ item }) {
  if (item.correct) return <span className="ai-tag is-ok"><ShieldCheck className="item-icon" aria-hidden /> Exact product</span>;
  if (item.ok) return <span className="ai-tag is-warn">Wrong product</span>;
  if (item.skipped) return <span className="ai-tag is-muted">Skipped</span>;
  return <ErrorTag type={item.type || 'failed'} />;
}

function PhotoBenchmark({ data, bench, running, saving, onRun, onApplyOrder, section }) {
  const enabled = (data?.models || []).filter((model) => model.enabled);
  const results = bench?.results || [];
  const ranked = rankBenchmark(results);
  const current = enabled.map((model) => model.name).join('|');
  const suggested = ranked.map((item) => item.model);
  const correct = results.filter((item) => item.correct).length;
  const canApply = results.length > 1 && suggested.join('|') !== current && suggested.every((name) => enabled.some((model) => model.name === name));

  return (
    <Section
      {...section}
      title="Photo accuracy check"
      icon={ShieldCheck}
      hint="Which model names the exact product fastest"
      summary={
        running
          ? `Checking ${enabled.length} models…`
          : results.length
            ? `${correct} of ${results.length} named the exact product · checked ${formatTime(bench.at)}`
            : 'Not run yet · open to check which model reads photos best'
      }
      actions={
        <button type="button" className="action-btn view" disabled={Boolean(running) || !enabled.length} onClick={onRun}>
          <FlaskConical className="item-icon" aria-hidden /> {running ? `Checking ${enabled.length} models…` : 'Check photo accuracy'}
        </button>
      }
    >
      <p className="form-hint ai-bench-intro">
        Sends one real product photo (a MacBook Air M2) to every turned-on model at the same time, with the same prompt and photo size
        the app uses, and checks that each one names the exact product and the Laptops category. Uses 1 request of each model&apos;s daily quota.
      </p>
      {results.length ? (
        <>
          <div className="table-container ai-table-plain">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Account</th>
                  <th>What it read</th>
                  <th>Time</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((item) => (
                  <tr key={item.model}>
                    <td><code>{item.model}</code></td>
                    <td>{item.account || '—'}</td>
                    <td className="ai-bench-answer">
                      {item.ok ? (
                        <>
                          <strong>{item.title}</strong>
                          <span>{item.category || 'No category'}{item.price ? ` · Rs ${Number(item.price).toLocaleString('en-IN')}` : ''}</span>
                        </>
                      ) : (
                        <span>{item.message}</span>
                      )}
                    </td>
                    <td>{item.ms ? formatMs(item.ms) : '—'}</td>
                    <td><BenchmarkVerdict item={item} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="ai-bench-foot">
            <span>
              <strong>{correct} of {results.length}</strong> named the exact product · checked {formatTime(bench.at)}.
              {suggested.length > 1 ? <> Best order: {suggested.map((name) => name.replace(/^gemini-/, '')).join(' → ')}.</> : null}
            </span>
            {canApply ? (
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => onApplyOrder(suggested)}>
                Use this order
              </button>
            ) : results.length > 1 ? (
              <span className="ai-tag is-ok">Models are already in this order</span>
            ) : null}
          </div>
          <p className="form-hint ai-bench-intro">One photo is a quick check, not proof. Run it again on another day before moving a slow model to the top.</p>
        </>
      ) : null}
    </Section>
  );
}

function formatLimit(value, unit) {
  if (value === null || value === undefined) return 'Unlimited';
  if (value === 0) return '0';
  return `${Number(value).toLocaleString('en-IN')}${unit}`;
}

function ModelCatalog({ catalog, section }) {
  const [filter, setFilter] = useState('');
  const rows = catalog.filter((entry) =>
    !filter ? true : filter === 'free' ? ['idea', 'test'].includes(entry.status) : entry.status === filter
  );
  const freeCount = catalog.filter((entry) => !['paid', 'no'].includes(entry.status)).length;

  return (
    <Section
      {...section}
      title="Gemini model catalog"
      icon={Bot}
      hint="Limits are per Google project, free tier"
      summary={`${catalog.length} models · ${freeCount} free ones that fit KinBech, with where to use them`}
    >
      <div className="ai-log-filters">
        <Filter className="item-icon" aria-hidden />
        {CATALOG_FILTERS.map((item) => (
          <button
            type="button"
            key={item.value}
            className={`action-btn ${filter === item.value ? 'view' : ''}`}
            onClick={() => setFilter(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="table-container ai-table-plain">
        <table className="data-table ai-catalog">
          <thead>
            <tr>
              <th>Model</th>
              <th>Type</th>
              <th>Free limit</th>
              <th>What it does</th>
              <th>Use in KinBech</th>
              <th>Status</th>
              <th>Your key</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              const status = CATALOG_STATUS[entry.status] || CATALOG_STATUS.no;
              return (
                <tr key={entry.label}>
                  <td>
                    <div className="ai-catalog-name">
                      <strong>{entry.label}</strong>
                      {entry.name ? <code>{entry.name}</code> : null}
                    </div>
                  </td>
                  <td>{KIND_LABELS[entry.kind] || entry.kind}</td>
                  <td className="ai-catalog-limit">
                    {entry.rpd === 0 ? (
                      <span className="is-bad">No free requests</span>
                    ) : (
                      <>
                        <strong>{formatLimit(entry.rpd, '/day')}</strong>
                        <span>{formatLimit(entry.rpm, '/min')}</span>
                      </>
                    )}
                  </td>
                  <td>{entry.job}</td>
                  <td className="ai-catalog-use">{entry.use}</td>
                  <td>
                    <div className="ai-catalog-status">
                      <span className={`ai-tag is-${status.tone}`}>{status.label}</span>
                      {entry.inUse ? <span className="ai-tag is-ok">In your model list</span> : null}
                    </div>
                  </td>
                  <td>
                    {entry.onKey === true ? <span className="ai-tag is-ok">Available</span> : null}
                    {entry.onKey === false ? <span className="ai-tag is-muted">Not listed</span> : null}
                    {entry.onKey === null || entry.onKey === undefined ? <span className="form-hint">—</span> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="form-hint ai-bench-intro">
        &quot;Your key&quot; comes from Google&apos;s model list for your first key. Live and embedding models do not show in that list and need their own code to use.
      </p>
    </Section>
  );
}

function AttemptChain({ attempts }) {
  return (
    <div className="ai-chain">
      {attempts.map((call, index) => (
        <Fragment key={call.id}>
          {index ? <ArrowRight className="ai-chain-arrow" aria-hidden /> : null}
          <span
            className={`ai-chain-step is-${call.result === 'ok' ? 'ok' : errorInfo(call.errorType).tone}`}
            title={`${call.accountLabel} · ${call.model}${call.errorType ? ` · ${errorInfo(call.errorType).label}` : ''}`}
          >
            {call.accountLabel}
            <small>{call.model.replace(/^gemini-/, '')}</small>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

function RequestRow({ row, open, onToggle }) {
  const who = row.user ? row.user.name || row.user.phone : row.purposeKey === 'test' ? 'Admin test' : row.userId ? 'Deleted user' : 'System';
  const failedAttempt = [...row.attempts].reverse().find((call) => call.result !== 'ok');

  return (
    <>
      <tr className={`ai-log-row ${open ? 'is-open' : ''}`} onClick={onToggle}>
        <td>
          <div className="ai-log-when">
            {open ? <ChevronDown className="item-icon" aria-hidden /> : <ChevronRight className="item-icon" aria-hidden />}
            <div>
              <strong>{formatTime(row.at)}</strong>
              <span>{formatDay(row.at)} · {timeAgo(row.at)}</span>
            </div>
          </div>
        </td>
        <td>
          <div className="ai-log-user">
            <span className="user-name">{who}</span>
            {row.user?.phone && row.user?.name ? <span className="user-email">{row.user.phone}</span> : null}
            <span className="user-email">{row.purpose}</span>
            {SELLER_LEVELS[row.level] ? (
              <span className={`ai-tag is-${SELLER_LEVELS[row.level].tone}`}>{SELLER_LEVELS[row.level].label}</span>
            ) : null}
          </div>
        </td>
        <td>
          <span className="user-name">{row.accountLabel}</span>
          <div className="user-email"><code>{row.model}</code></div>
        </td>
        <td>
          <AttemptChain attempts={row.attempts} />
          {row.switches ? (
            <div className="user-email ai-log-switch">
              <Shuffle className="item-icon" aria-hidden /> {row.switches} switch{row.switches > 1 ? 'es' : ''}
            </div>
          ) : null}
        </td>
        <td>
          <ResultBadge result={row.result} ms={row.totalMs} />
          {row.result !== 'ok' && failedAttempt ? (
            <div className="ai-log-reason"><ErrorTag type={failedAttempt.errorType || 'failed'} compact /></div>
          ) : null}
          {row.result === 'ok' && row.switches ? <div className="user-email">Saved by auto switch</div> : null}
        </td>
      </tr>
      {open ? (
        <tr className="ai-log-detail">
          <td colSpan={5}>
            <div className="ai-attempts">
              <div className="ai-attempts-meta">
                <span><Clock className="item-icon" aria-hidden /> Started {formatDateTime(row.at)}</span>
                <span><Timer className="item-icon" aria-hidden /> Total {formatMs(row.totalMs)}</span>
                <span><Shuffle className="item-icon" aria-hidden /> {row.attempts.length} call{row.attempts.length > 1 ? 's' : ''}</span>
                {row.user ? <span><User className="item-icon" aria-hidden /> {row.user.name || 'No name'} · {row.user.phone || 'no phone'}</span> : null}
                <span className="ai-attempts-id">Request {row.id}</span>
              </div>
              {row.attempts.map((call) => (
                <div className={`ai-attempt is-${call.result === 'ok' ? 'ok' : errorInfo(call.errorType).tone}`} key={call.id}>
                  <span className="ai-attempt-no">#{call.attempt}</span>
                  <div className="ai-attempt-main">
                    <div className="ai-attempt-top">
                      <strong>{call.accountLabel}</strong>
                      <code>{call.model}</code>
                      {call.result === 'ok' ? <span className="ai-tag is-ok">Answered</span> : <ErrorTag type={call.errorType || 'failed'} status={call.status} />}
                      <span className="ai-attempt-time">{formatTime(call.at)} · {formatMs(call.ms)}</span>
                      {call.retryMs ? <span className="ai-attempt-time">Google said retry in {formatMs(call.retryMs)}</span> : null}
                    </div>
                    {call.error ? <p className="ai-attempt-error">{call.error}</p> : null}
                    {call.result !== 'ok' && call.errorType ? <small>{errorInfo(call.errorType).hint}</small> : null}
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function RequestLog({ accounts, signal, section, summary }) {
  const [filters, setFilters] = useState({ result: '', accountId: '', purpose: '', level: '', errorType: '' });
  const [rows, setRows] = useState([]);
  const [next, setNext] = useState({ hasMore: false, before: null });
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState(() => new Set());
  const [pages, setPages] = useState(1);

  const query = (before) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
    params.set('limit', String(before ? 25 : Math.min(100, 25 * pages)));
    if (before) params.set('before', new Date(before).toISOString());
    return `/ai/admin/logs?${params.toString()}`;
  };

  const isOpen = Boolean(section?.open);
  useEffect(() => {
    if (!isOpen) return undefined;
    let alive = true;
    setLoading(true);
    api
      .get(query())
      .then((response) => {
        if (!alive) return;
        setRows(response.data.requests || []);
        setNext({ hasMore: response.data.hasMore, before: response.data.nextBefore });
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, signal, isOpen]);

  const loadMore = async () => {
    if (!next.before) return;
    setLoadingMore(true);
    try {
      const response = await api.get(query(next.before));
      setRows((current) => {
        const seen = new Set(current.map((row) => row.id));
        return [...current, ...(response.data.requests || []).filter((row) => !seen.has(row.id))];
      });
      setNext({ hasMore: response.data.hasMore, before: response.data.nextBefore });
      setPages((count) => count + 1);
    } catch {
      /* the API layer shows the error */
    } finally {
      setLoadingMore(false);
    }
  };

  const setFilter = (key, value) => {
    setPages(1);
    setOpen(new Set());
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const toggle = (id) =>
    setOpen((current) => {
      const nextOpen = new Set(current);
      if (nextOpen.has(id)) nextOpen.delete(id);
      else nextOpen.add(id);
      return nextOpen;
    });

  const filtered = Object.values(filters).some(Boolean);
  const shown = {
    ok: rows.filter((row) => row.result === 'ok').length,
    switched: rows.filter((row) => row.result === 'ok' && row.switches).length,
    failed: rows.filter((row) => row.result !== 'ok').length,
  };

  return (
    <Section
      {...section}
      title="AI request log"
      icon={Activity}
      hint={`${rows.length} shown · ${shown.ok} worked (${shown.switched} after a switch) · ${shown.failed} failed. Click a row to see every try.`}
      summary={summary}
    >
      <div className="ai-log-filters">
        <Filter className="item-icon" aria-hidden />
        <select className="ai-select" value={filters.result} onChange={(event) => setFilter('result', event.target.value)}>
          {RESULT_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select className="ai-select" value={filters.accountId} onChange={(event) => setFilter('accountId', event.target.value)}>
          <option value="">All accounts</option>
          {accounts.map((account) => <option key={account.id} value={account.id}>{account.label}</option>)}
          <option value="env">Server env key</option>
        </select>
        <select className="ai-select" value={filters.purpose} onChange={(event) => setFilter('purpose', event.target.value)}>
          {PURPOSE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <select className="ai-select" value={filters.level} onChange={(event) => setFilter('level', event.target.value)}>
          <option value="">All sellers</option>
          {Object.entries(SELLER_LEVELS).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
        </select>
        <select className="ai-select" value={filters.errorType} onChange={(event) => setFilter('errorType', event.target.value)}>
          <option value="">Any error type</option>
          {Object.entries(ERROR_TYPES).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
        </select>
        {filtered ? (
          <button
            type="button"
            className="action-btn"
            onClick={() => {
              setPages(1);
              setFilters({ result: '', accountId: '', purpose: '', level: '', errorType: '' });
            }}
          >
            Clear filters
          </button>
        ) : null}
        {loading ? <span className="form-hint">Updating…</span> : null}
      </div>

      <div className="table-container ai-table-plain">
        <table className="data-table ai-log-table">
          <thead>
            <tr>
              <th>When</th>
              <th>Who · used for</th>
              <th>Answered by</th>
              <th>Tries (account · model)</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RequestRow key={row.id} row={row} open={open.has(row.id)} onToggle={() => toggle(row.id)} />
            ))}
          </tbody>
        </table>
        {!rows.length && !loading ? (
          <div className="empty-state">{filtered ? 'No request matches these filters.' : 'No AI requests logged yet. New requests show up here.'}</div>
        ) : null}
      </div>
      {next.hasMore ? (
        <div className="ai-log-more">
          <button type="button" className="action-btn view" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? 'Loading…' : 'Load older requests'}
          </button>
        </div>
      ) : null}
    </Section>
  );
}

export default function AiModels() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [accountForm, setAccountForm] = useState({ label: '', apiKey: '' });
  const [message, setMessage] = useState(null);
  const [live, setLive] = useState(true);
  const [bench, setBench] = useState(null);
  const { section, setAll, allOpen } = useSections();
  useNow(5000);

  const notify = (text, tone = 'ok') => setMessage(text ? { text, tone } : null);

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get('/ai/admin/models');
      setData(response.data);
    } catch (error) {
      notify(error.response?.data?.message || 'Could not load AI accounts', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) load({ quiet: true });
    }, live ? LIVE_EVERY_MS : IDLE_EVERY_MS);
    return () => clearInterval(timer);
  }, [live]);

  const run = async (request, { success } = {}) => {
    setSaving(true);
    try {
      const response = await request();
      setData(response.data);
      notify(null);
      if (success) toast.success(success);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };

  const accounts = data?.accounts || [];

  const save = (patch, success) => run(() => api.put('/ai/admin/models', patch), { success });

  const saveAccounts = (next, success) =>
    run(
      () => api.put('/ai/admin/accounts', { accounts: next.map(({ id, label, enabled }) => ({ id, label, enabled })) }),
      { success }
    );

  const addAccount = async () => {
    const ok = await run(() => api.post('/ai/admin/accounts', accountForm), {
      success: 'Account added. The key is saved and will not be shown again.',
    });
    if (ok) {
      setAccountForm({ label: '', apiKey: '' });
      setShowAdd(false);
    }
  };

  const moveAccount = (index, delta) => {
    const next = [...accounts];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    saveAccounts(next);
  };

  const showTestResult = (label, result) => {
    if (result.ok) toast.success(`${result.model} answered in ${formatMs(result.ms)}`, { title: `${label} is working` });
    else toast.error(`${result.type ? `${errorInfo(result.type).label}: ` : ''}${result.message}`, { title: `${label} failed the test` });
  };

  const testAccount = async (account) => {
    setTesting(account.id);
    try {
      const response = await api.post(`/ai/admin/accounts/${account.id}/test`);
      setData(response.data.overview);
      showTestResult(account.label, response.data.result);
    } catch {
      /* the API layer shows the error */
    } finally {
      setTesting('');
    }
  };

  const testAll = async () => {
    setTesting('all');
    try {
      const response = await api.post('/ai/admin/accounts/test-all');
      setData(response.data.overview);
      const results = response.data.results || [];
      const failed = results.filter((item) => !item.ok);
      if (!results.length) toast.error('No account is turned on.');
      else if (!failed.length) toast.success(`All ${results.length} accounts answered.`, { title: 'Every account is working' });
      else
        toast.error(
          failed.map((item) => `${item.label}: ${item.type ? errorInfo(item.type).label : item.message}`).join(' · '),
          { title: `${results.length - failed.length} of ${results.length} accounts working` }
        );
    } catch {
      /* the API layer shows the error */
    } finally {
      setTesting('');
    }
  };

  const testModelNow = async (name) => {
    setTesting(`model:${name}`);
    try {
      const response = await api.post(`/ai/admin/models/${encodeURIComponent(name)}/test`);
      setData(response.data.overview);
      showTestResult(name, response.data.result);
    } catch {
      /* the API layer shows the error */
    } finally {
      setTesting('');
    }
  };

  const runBenchmark = async () => {
    const count = (data?.models || []).filter((model) => model.enabled).length;
    const ok = await confirmAction({
      title: 'Check photo accuracy?',
      message: `Sends one product photo to all ${count} turned-on models at once. Each model uses 1 request of today's quota. Takes up to 40 seconds.`,
      confirmLabel: 'Run check',
    });
    if (!ok) return;
    setTesting('benchmark');
    try {
      const response = await api.post('/ai/admin/models/benchmark');
      setData(response.data.overview);
      const results = response.data.results || [];
      setBench({ at: new Date(), results });
      const correct = results.filter((item) => item.correct).length;
      if (correct === results.length) toast.success(`All ${results.length} models named the exact product.`, { title: 'Photo check passed' });
      else toast.error(`${correct} of ${results.length} models named the exact product. See the table for the rest.`, { title: 'Photo check done' });
    } catch {
      /* the API layer shows the error */
    } finally {
      setTesting('');
    }
  };

  const applyBenchmarkOrder = (names) => {
    const all = data?.models || [];
    const byName = new Map(all.map((model) => [model.name, model]));
    const ordered = names.map((name) => byName.get(name)).filter(Boolean);
    const rest = all.filter((model) => !names.includes(model.name));
    save(
      { models: [...ordered, ...rest].map(({ name, enabled, dailyLimit }) => ({ name, enabled, dailyLimit })) },
      'Model order updated from the photo check'
    );
  };

  const summary = useMemo(() => {
    const quota = accounts.reduce(
      (sum, account) => ({
        remaining: sum.remaining + (account.usage?.quota?.remaining || 0),
        limit: sum.limit + (account.enabled ? account.usage?.quota?.limit || 0 : 0),
      }),
      { remaining: 0, limit: 0 }
    );
    const atLimit = accounts.filter((account) => account.enabled && account.blockedUntil).length;
    return { quota, atLimit };
  }, [accounts]);

  if (loading && !data) return <div className="loading">Loading AI accounts...</div>;

  const resetAt = data?.quotaResetAt;
  const enabledModels = (data?.models || []).filter((model) => model.enabled);
  const historyAccounts = data?.historyAccounts || [];
  const today = data?.requestsToday || {};
  const engine = data?.engine || {};
  const coolingCount = (data?.cooling || []).length;
  const workingAccounts = accounts.filter((account) => account.enabled && !account.blockedUntil).length;
  const week = data?.history || [];
  const weekFailed = week.reduce((sum, row) => sum + (row.failed || 0), 0);
  const weekLimits = week.reduce((sum, row) => sum + (row.quotaHits || 0), 0);
  const weekCalls = week.reduce((sum, row) => sum + (row.success || 0), 0) + weekFailed;

  return (
    <div className="users-page ai-models-page">
      {!data?.keyConfigured ? (
        <div className="ai-alert">No Gemini account yet. Add an API key below, or set GEMINI_API_KEY on the server.</div>
      ) : null}
      {!data?.activeAccount && data?.keyConfigured ? (
        <div className="ai-alert">Every account is at its limit or turned off. AI fill is paused until a limit resets ({formatDuration(resetAt)}).</div>
      ) : null}

      <div className="ai-live-bar">
        <span className={`ai-live-dot ${live ? 'is-on' : ''}`} />
        <span>{live ? `Live · updates every ${LIVE_EVERY_MS / 1000}s` : 'Paused · updates every minute'}</span>
        {data?.serverTime ? <span className="form-hint">Last update {formatTime(data.serverTime)}</span> : null}
        <div className="ai-howto" tabIndex={0}>
          <Info className="item-icon" aria-hidden /> How auto switch works
          <div className="ai-howto-pop" role="tooltip">
            <ol className="ai-steps">
              <li>
                <span>1</span>
                <p>Each request tries the best model on every account (top to bottom) first, then the next model. Use the arrows to change the order.</p>
              </li>
              <li>
                <span>2</span>
                <p>
                  Any error switches at once. A used-up quota parks that account + model until reset, a busy Google model rests {engine.overloadCooldownSec || 90}s,
                  a rejected key parks the account for 24h, and a model silent for {engine.callTimeoutSec || 30}s rests{' '}
                  {Math.round((engine.timeoutCooldownSec || 120) / 60)} min. One request never waits more than {engine.deadlineSec || 50}s.
                </p>
              </li>
              <li>
                <span>3</span>
                <p>
                  Per-minute caps are counted before calling Google: a model at its cap is skipped instead of failing, and if every model is at its cap the
                  request waits a few seconds for a free slot. When Google&apos;s limit error names the real limit, it is saved automatically.
                </p>
              </li>
              <li>
                <span>4</span>
                <p>
                  New sellers get the fastest model first plus calls kept only for them; heavy sellers start on big-quota models. See Seller levels.
                </p>
              </li>
              <li>
                <span>5</span>
                <p>
                  Gemini limits are per Google Cloud <strong>project</strong>, not per key, so make each key in its own project. Daily limits reset at{' '}
                  {formatClock(resetAt)} your time.
                </p>
              </li>
            </ol>
          </div>
        </div>
        <div className="ai-live-actions">
          <button type="button" className="action-btn" onClick={() => setAll(!allOpen)}>
            {allOpen ? <ChevronUp className="item-icon" aria-hidden /> : <ChevronDown className="item-icon" aria-hidden />}{' '}
            {allOpen ? 'Collapse all' : 'Expand all'}
          </button>
          <button type="button" className="action-btn" onClick={() => setLive((on) => !on)}>
            {live ? <Pause className="item-icon" aria-hidden /> : <Play className="item-icon" aria-hidden />} {live ? 'Pause' : 'Go live'}
          </button>
          <button type="button" className="action-btn" disabled={loading} onClick={() => load()}>
            <RefreshCw className="item-icon" aria-hidden /> Refresh
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--success-bg)' }}><Bot className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Working now</h3>
            <p className="stat-value ai-stat-text">{data?.activeAccount || 'None available'}</p>
            <div className="stat-trend">{data?.activeModel || 'No model available'}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--info-bg)' }}><TrendingUp className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Requests today</h3>
            <p className="stat-value">
              {today.requests || 0}
              <span className="ai-stat-sub"> · {today.successRate ?? '—'}{today.successRate !== null && today.successRate !== undefined ? '%' : ''} worked</span>
            </p>
            <div className="stat-trend">
              {today.ok || 0} ok · {today.failed || 0} failed · {today.rescued || 0} saved by switching
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Timer className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Avg answer time</h3>
            <p className="stat-value">{today.avgMs ? formatMs(today.avgMs) : '—'}</p>
            <div className="stat-trend">
              {today.calls || 0} Gemini calls for {today.requests || 0} requests
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--warning-bg)' }}><Gauge className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Quota left today</h3>
            <p className="stat-value">
              {summary.quota.remaining}
              <span className="ai-stat-sub"> / {summary.quota.limit}</span>
            </p>
            <div className="stat-trend">
              Resets in {formatDuration(resetAt)} ({formatClock(resetAt)}){summary.atLimit ? ` · ${summary.atLimit} at limit` : ''}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Shuffle className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Auto switch</h3>
            <label className="ai-switch">
              <input
                type="checkbox"
                checked={Boolean(data?.autoSwitch)}
                disabled={saving}
                onChange={(event) => save({ autoSwitch: event.target.checked })}
              />
              <span className="ai-switch-track" />
              <span className="ai-switch-label">{data?.autoSwitch ? 'On' : 'Off'}</span>
            </label>
            <div className="stat-trend">
              {data?.autoSwitch ? 'Any error moves to the next account or model' : 'Only the first account and model are used'}
            </div>
          </div>
        </div>
      </div>

      {message ? <div className={message.tone === 'error' ? 'ai-alert' : 'ai-message'}>{message.text}</div> : null}

      <RequestLog
        accounts={accounts}
        signal={data?.serverTime}
        section={section('log')}
        summary={`${today.requests || 0} requests today · ${today.ok || 0} worked · ${today.failed || 0} failed · open to see who, when and which model`}
      />

      <Section
        {...section('models')}
        title="Models"
        icon={Zap}
        hint="Tried top to bottom on every account. Busy, slow or blocked models are skipped automatically."
        summary={`${enabledModels.length} turned on · answering now: ${data?.activeModel || 'none'}${coolingCount ? ` · ${coolingCount} resting` : ''}`}
      >
        <ModelHealth
          data={data}
          saving={saving}
          testing={testing}
          onTest={testModelNow}
          onSaveModels={(models, success) => save({ models }, success)}
          onClear={(name) => run(() => api.post(`/ai/admin/models/${encodeURIComponent(name)}/clear-limit`), { success: `${name} can be used again` })}
        />
      </Section>

      <Section
        {...section('accounts')}
        title={`Gemini accounts (${accounts.length})`}
        icon={KeyRound}
        hint="Each key should be in its own Google project"
        summary={
          accounts.length
            ? `${workingAccounts} of ${accounts.length} working${summary.atLimit ? ` · ${summary.atLimit} at limit` : ''} · answering now: ${data?.activeAccount || 'none'}`
            : 'No accounts yet · the server env key is used'
        }
        actions={
          <div className="action-buttons">
            {accounts.length ? (
              <button type="button" className="action-btn" disabled={Boolean(testing)} onClick={testAll}>
                <FlaskConical className="item-icon" aria-hidden /> {testing === 'all' ? 'Testing all…' : 'Test all'}
              </button>
            ) : null}
            <button type="button" className="action-btn view" onClick={() => setShowAdd((open) => !open)}>
              <Plus className="item-icon" aria-hidden /> Add account
            </button>
          </div>
        }
      >
        {showAdd ? (
          <form
            className="ai-add-row ai-add-card"
            onSubmit={(event) => {
              event.preventDefault();
              addAccount();
            }}
          >
            <input
              className="ai-add-input"
              placeholder="Account name (e.g. KinBech Gmail 2)"
              value={accountForm.label}
              onChange={(event) => setAccountForm((current) => ({ ...current, label: event.target.value }))}
            />
            <input
              type="password"
              className="ai-add-input"
              placeholder="Paste Gemini API key"
              value={accountForm.apiKey}
              onChange={(event) => setAccountForm((current) => ({ ...current, apiKey: event.target.value }))}
            />
            <button type="submit" className="btn btn-primary" disabled={saving || !accountForm.label.trim() || !accountForm.apiKey.trim()}>
              Save account
            </button>
          </form>
        ) : null}

        <div className="ai-acc-list">
          {accounts.map((account, index) => (
            <AccountCard
              key={account.id}
              account={account}
              index={index}
              count={accounts.length}
              activeAccountId={data?.activeAccountId}
              activeModel={data?.activeModel}
              saving={saving}
              testing={testing}
              onMove={(delta) => moveAccount(index, delta)}
              onRename={(label) => saveAccounts(accounts.map((item, i) => (i === index ? { ...item, label } : item)))}
              onToggle={() => saveAccounts(accounts.map((item, i) => (i === index ? { ...item, enabled: !item.enabled } : item)))}
              onTest={() => testAccount(account)}
              onClearLimit={() => run(() => api.post(`/ai/admin/accounts/${account.id}/clear-limit`), {
                success: `${account.label} can take requests again`,
              })}
              onReplaceKey={(apiKey) =>
                run(() => api.put(`/ai/admin/accounts/${account.id}/key`, { apiKey: apiKey.trim() }), {
                  success: `Key replaced for ${account.label}`,
                })
              }
              onRemove={async () => {
                const ok = await confirmAction({
                  title: `Remove ${account.label}?`,
                  message: 'Requests move to the next account. Its usage history stays.',
                  confirmLabel: 'Remove account',
                  tone: 'danger',
                });
                if (ok) saveAccounts(accounts.filter((item) => item.id !== account.id), `${account.label} removed`);
              }}
            />
          ))}
          {accounts.length === 0 ? (
            <div className="empty-state">No accounts yet. The server env key is used until you add one.</div>
          ) : null}
        </div>
      </Section>

      <SellerLevels data={data} saving={saving} onSave={(patch, success) => save(patch, success)} section={section('levels')} />

      <PhotoBenchmark
        data={data}
        bench={bench}
        running={testing === 'benchmark'}
        saving={saving}
        onRun={runBenchmark}
        onApplyOrder={applyBenchmarkOrder}
        section={section('bench')}
      />

      <Section
        {...section('history')}
        title="Last 7 days"
        icon={History}
        hint="Gemini calls per account (ok + failed)"
        summary={`${weekCalls} Gemini calls in 7 days · ${weekFailed} failed · ${weekLimits} limit hits`}
      >
        <div className="table-container ai-table-plain">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                {historyAccounts.map((account) => <th key={account.id}>{account.label}</th>)}
                <th>Successful</th>
                <th>Failed</th>
                <th>Limit hits</th>
              </tr>
            </thead>
            <tbody>
              {(data?.history || []).map((row) => (
                <tr key={row.day}>
                  <td>{dayLabel(row.day)}</td>
                  {historyAccounts.map((account) => <td key={account.id}>{account.byDay[row.day] || 0}</td>)}
                  <td>{row.success}</td>
                  <td>{row.failed}</td>
                  <td>{row.quotaHits}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        {...section('limits')}
        title="Usage limits"
        icon={Gauge}
        hint={`${data?.usedToday ?? 0} AI photo fills used today (Nepal time)`}
        summary={`${data?.userDailyLimit ?? 15} per user a day · app cap ${data?.globalDailyCap ?? 500} · ${data?.usedToday ?? 0} used today`}
      >
        <form
          className="ai-limits ai-limits-pad"
          key={`${data?.userDailyLimit}-${data?.globalDailyCap}-${enabledModels.map((m) => m.dailyLimit).join('-')}`}
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            save(
              {
                userDailyLimit: Number(form.get('userDailyLimit')),
                globalDailyCap: Number(form.get('globalDailyCap')),
                models: (data?.models || []).map((model) => ({
                  name: model.name,
                  enabled: model.enabled,
                  dailyLimit: form.has(`model:${model.name}`) ? Number(form.get(`model:${model.name}`)) : model.dailyLimit,
                })),
              },
              'Limits saved'
            );
          }}
        >
          <div className="form-group">
            <label htmlFor="userDailyLimit">Per user per day</label>
            <input id="userDailyLimit" name="userDailyLimit" type="number" min="0" className="form-input" defaultValue={data?.userDailyLimit ?? 15} />
          </div>
          <div className="form-group">
            <label htmlFor="globalDailyCap">Whole app per day (cost cap)</label>
            <input id="globalDailyCap" name="globalDailyCap" type="number" min="0" className="form-input" defaultValue={data?.globalDailyCap ?? 500} />
          </div>
          {enabledModels.length ? (
            <div className="ai-model-limits">
              <label>Gemini free requests per model, per account, per day</label>
              <p className="form-hint">
                Filled from Google&apos;s free tier automatically and corrected when Google&apos;s limit error names a different number. When an account reaches
                it, requests switch to the next account or model without calling Google. 0 = no limit check.
              </p>
              <div className="ai-model-limit-grid">
                {enabledModels.map((model) => (
                  <label key={model.name} className="ai-model-limit">
                    <code>{model.name}</code>
                    <input name={`model:${model.name}`} type="number" min="0" className="ai-limit-input" defaultValue={model.dailyLimit} />
                    <small className={`ai-limit-source is-${model.limitSource || 'none'}`}>
                      {LIMIT_SOURCES[model.limitSource] || 'Not in Google’s free-tier table'}
                      {model.limitSource === 'admin' && model.freeTierLimit > 0 ? ` · Google gives ${model.freeTierLimit}` : ''}
                    </small>
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="action-buttons">
            <button type="submit" className="btn btn-primary" disabled={saving}>Save limits</button>
            {enabledModels.some((model) => model.limitSource === 'admin' || !model.limitSource) ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={saving}
                onClick={() =>
                  save(
                    { models: (data?.models || []).map(({ name, enabled }) => ({ name, enabled, dailyLimit: null })) },
                    "Limits reset to Google's free tier"
                  )
                }
              >
                Use Google&apos;s free limits
              </button>
            ) : null}
          </div>
        </form>
        <p className="form-hint ai-limits-pad">Users see &quot;AI limit reached today&quot; and can still fill details themselves. 0 turns AI fill off.</p>
      </Section>

      {data?.catalog?.length ? <ModelCatalog catalog={data.catalog} section={section('catalog')} /> : null}
    </div>
  );
}
