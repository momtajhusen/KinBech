import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  Bot,
  ChevronDown,
  ChevronUp,
  Clock,
  FlaskConical,
  Gauge,
  History,
  KeyRound,
  Plus,
  Power,
  RefreshCw,
  Trash2,
  TrendingUp,
  TriangleAlert,
} from 'lucide-react';
import api from '../services/api';
import { confirmAction, toast } from '../components/Feedback';

function formatDuration(until) {
  if (!until) return '';
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatClock(date) {
  if (!date) return '';
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function timeAgo(date) {
  if (!date) return 'Never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(date).getTime()) / 1000));
  if (seconds < 60) return 'Just now';
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

function accountStatus(account, activeAccountId) {
  if (!account.enabled) return { key: 'off', label: 'Turned off', badge: 'rejected' };
  if (account.blockedUntil) return { key: 'limit', label: `At limit · back in ${formatDuration(account.blockedUntil)}`, badge: 'suspended' };
  if (account.id === activeAccountId) return { key: 'active', label: 'In use now', badge: 'active' };
  return { key: 'standby', label: 'Standby', badge: 'pending' };
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
  const [showModels, setShowModels] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const status = accountStatus(account, activeAccountId);
  const usage = account.usage || { today: {}, week: [], models: [], quota: {} };
  const modelsAtLimit = usage.models.filter((model) => model.remaining === 0).length;

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
            <span><Clock className="item-icon" aria-hidden /> Last used {timeAgo(usage.lastUsedAt)}</span>
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
            <div className="ai-acc-stats">
              <div><strong>{usage.today.ok || 0}</strong><span>Success today</span></div>
              <div><strong className={usage.today.failed ? 'is-bad' : ''}>{usage.today.failed || 0}</strong><span>Failed today</span></div>
              <div><strong className={usage.today.limitHits ? 'is-warn' : ''}>{usage.today.limitHits || 0}</strong><span>Limit hits</span></div>
            </div>
          </div>
          <div className="ai-acc-side">
            <span className="ai-acc-side-label">Requests, last 7 days</span>
            <WeekBars week={usage.week} />
          </div>
        </div>

        {account.lastError ? (
          <div className="ai-acc-error">
            <TriangleAlert className="item-icon" aria-hidden />
            <span>{account.lastError}</span>
          </div>
        ) : null}

        <button type="button" className="ai-acc-toggle" onClick={() => setShowModels((open) => !open)}>
          {showModels ? <ChevronUp className="item-icon" aria-hidden /> : <ChevronDown className="item-icon" aria-hidden />}
          Quota by model ({usage.models.length} models{modelsAtLimit ? `, ${modelsAtLimit} at limit` : ''})
        </button>
        {showModels ? (
          <div className="ai-acc-models">
            {usage.models.map((model) => (
              <div className="ai-acc-model" key={model.name}>
                <span className="ai-acc-model-name" title={model.name}>{model.name}</span>
                <LeftBar remaining={model.remaining} limit={model.limit} />
                <span className={`ai-acc-model-num ${model.remaining === 0 ? 'is-bad' : ''}`}>
                  {model.blockedUntil
                    ? `Limit reached · back in ${formatDuration(model.blockedUntil)}`
                    : `${model.remaining} of ${model.limit} left`}
                </span>
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
            <FlaskConical className="item-icon" aria-hidden /> {testing === account.id ? 'Testing…' : 'Test'}
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

export default function AiModels() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [accountForm, setAccountForm] = useState({ label: '', apiKey: '' });
  const [message, setMessage] = useState(null);

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
    const timer = setInterval(() => load({ quiet: true }), 30000);
    return () => clearInterval(timer);
  }, []);

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

  const testAccount = async (account) => {
    setTesting(account.id);
    try {
      const response = await api.post(`/ai/admin/accounts/${account.id}/test`);
      setData(response.data.overview);
      const result = response.data.result;
      if (result.ok) toast.success(`Answered in ${result.ms} ms`, { title: `${account.label} is working` });
      else toast.error(result.message, { title: `${account.label} failed the test` });
    } catch {
      /* the API layer shows the error */
    } finally {
      setTesting('');
    }
  };

  const summary = useMemo(() => {
    const today = (data?.models || []).reduce(
      (sum, model) => ({ success: sum.success + model.today.success, failed: sum.failed + model.today.failed }),
      { success: 0, failed: 0 }
    );
    const quota = accounts.reduce(
      (sum, account) => ({
        remaining: sum.remaining + (account.usage?.quota?.remaining || 0),
        limit: sum.limit + (account.enabled ? account.usage?.quota?.limit || 0 : 0),
      }),
      { remaining: 0, limit: 0 }
    );
    const atLimit = accounts.filter((account) => account.enabled && account.blockedUntil).length;
    return { ...today, quota, atLimit };
  }, [data, accounts]);

  if (loading && !data) return <div className="loading">Loading AI accounts...</div>;

  const resetAt = data?.quotaResetAt;
  const enabledModels = (data?.models || []).filter((model) => model.enabled);
  const historyAccounts = data?.historyAccounts || [];

  return (
    <div className="users-page ai-models-page">
      {!data?.keyConfigured ? (
        <div className="ai-alert">No Gemini account yet. Add an API key below, or set GEMINI_API_KEY on the server.</div>
      ) : null}
      {!data?.activeAccount && data?.keyConfigured ? (
        <div className="ai-alert">Every account is at its limit or turned off. AI fill is paused until a limit resets ({formatDuration(resetAt)}).</div>
      ) : null}

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
            <p className="stat-value">{summary.success + summary.failed}</p>
            <div className="stat-trend">{summary.success} ok · {summary.failed} failed</div>
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
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><RefreshCw className="item-icon" aria-hidden /></div>
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
              {data?.autoSwitch ? 'Moves to the next account on a limit' : 'Only the first account is used'}
            </div>
          </div>
        </div>
      </div>

      <ol className="ai-steps">
        <li><span>1</span>The app tries accounts from top to bottom. Use the arrows to change the order.</li>
        <li><span>2</span>When an account hits its limit or the key stops working, the next one takes over by itself.</li>
        <li><span>3</span>Gemini resets every limit daily at {formatClock(resetAt)} your time. &quot;Left today&quot; is an estimate from our own count.</li>
      </ol>

      {message ? <div className={message.tone === 'error' ? 'ai-alert' : 'ai-message'}>{message.text}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Gemini accounts ({accounts.length})</h3>
          <button type="button" className="action-btn view" onClick={() => setShowAdd((open) => !open)}>
            <Plus className="item-icon" aria-hidden /> Add account
          </button>
        </div>

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
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3><Activity className="item-icon" aria-hidden /> Recent AI requests</h3>
          <span className="form-hint">Last {data?.recentCalls?.length || 0} calls · which account answered each one</span>
        </div>
        <div className="table-container ai-table-plain">
          <table className="data-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Account</th>
                <th>Model</th>
                <th>Used for</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentCalls || []).map((call) => (
                <tr key={call.id}>
                  <td title={new Date(call.at).toLocaleString()}>{timeAgo(call.at)}</td>
                  <td><span className="user-name">{call.accountLabel}</span></td>
                  <td><code>{call.model}</code></td>
                  <td>{call.purpose}</td>
                  <td>
                    <span className={`status-badge ${call.result === 'ok' ? 'active' : call.result === 'limit' ? 'pending' : 'suspended'}`}>
                      {call.result === 'ok' ? `OK · ${(call.ms / 1000).toFixed(1)}s` : call.result === 'limit' ? 'Limit hit' : 'Failed'}
                    </span>
                    {call.error ? <div className="user-email ai-error-text" title={call.error}>{call.error}</div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.recentCalls?.length ? <div className="empty-state">No AI requests logged yet. New requests show up here.</div> : null}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3><History className="item-icon" aria-hidden /> Last 7 days</h3>
          <span className="form-hint">Requests per account (ok + failed)</span>
        </div>
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
      </div>

      <div className="card">
        <div className="card-header">
          <h3>Usage limits</h3>
          <span className="form-hint">{data?.usedToday ?? 0} AI photo fills used today (Nepal time)</span>
        </div>
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
              <p className="form-hint">Used to estimate &quot;left today&quot;. Match these to your Gemini plan.</p>
              <div className="ai-model-limit-grid">
                {enabledModels.map((model) => (
                  <label key={model.name} className="ai-model-limit">
                    <code>{model.name}</code>
                    <input name={`model:${model.name}`} type="number" min="0" className="ai-limit-input" defaultValue={model.dailyLimit} />
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={saving}>Save limits</button>
        </form>
        <p className="form-hint ai-limits-pad">Users see &quot;AI limit reached today&quot; and can still fill details themselves. 0 turns AI fill off.</p>
      </div>
    </div>
  );
}
