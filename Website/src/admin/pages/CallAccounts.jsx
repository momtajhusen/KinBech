import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, Clock, Phone, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { confirmAction, toast } from '../components/Feedback';

const EMPTY_FORM = { label: '', appId: '', appCertificate: '', monthlyLimitMinutes: 10000 };

function formatUntil(until) {
  if (!until) return '';
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
}

function accountStatus(account, activeAccount) {
  if (!account.enabled) return { label: 'Off', className: 'rejected' };
  if (account.blockedUntil) return { label: `Paused · ${formatUntil(account.blockedUntil)}`, className: 'suspended' };
  if (account.overLimit) return { label: `Limit reached · resets ${formatDate(account.resetsAt)}`, className: 'suspended' };
  if (account.label === activeAccount) return { label: 'In use', className: 'active' };
  return { label: 'Standby', className: 'pending' };
}

export default function CallAccounts() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [replacing, setReplacing] = useState({});
  const [message, setMessage] = useState('');

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get('/calls/admin/accounts');
      setData(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not load call accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ quiet: true }), 30000);
    return () => clearInterval(timer);
  }, []);

  const run = async (request, success = '') => {
    setSaving(true);
    try {
      const response = await request();
      setData(response.data);
      setMessage('');
      if (success) toast.success(success);
      return true;
    } catch {
      return false;
    } finally {
      setSaving(false);
    }
  };

  const accounts = data?.accounts || [];

  const saveAccounts = (next, success) => run(() => api.put('/calls/admin/accounts', {
    accounts: next.map(({ id, label, enabled, monthlyLimitMinutes }) => ({ id, label, enabled, monthlyLimitMinutes })),
  }), success);

  const updateAccount = (index, patch) => saveAccounts(accounts.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const moveAccount = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= accounts.length) return;
    const next = [...accounts];
    [next[index], next[target]] = [next[target], next[index]];
    saveAccounts(next);
  };

  const addAccount = async () => {
    const ok = await run(
      () => api.post('/calls/admin/accounts', { ...form, monthlyLimitMinutes: Number(form.monthlyLimitMinutes) }),
      'Account added. The App Certificate is stored encrypted and is not shown again.'
    );
    if (ok) setForm(EMPTY_FORM);
  };

  const replaceCredentials = async (id) => {
    const draft = replacing[id] || {};
    const ok = await run(
      () => api.put(`/calls/admin/accounts/${id}/credentials`, draft),
      'App ID and certificate replaced'
    );
    if (ok) setReplacing((current) => ({ ...current, [id]: undefined }));
  };

  const clearLimit = (id, resetUsage) => run(() => api.post(`/calls/admin/accounts/${id}/clear-limit`, { resetUsage }));

  const pausedCount = accounts.filter((a) => a.enabled && (a.blockedUntil || a.overLimit)).length;

  if (loading && !data) return <div className="loading">Loading call accounts...</div>;

  return (
    <div className="users-page ai-models-page">
      {accounts.length === 0 ? (
        <div className="ai-alert">
          {data?.envConfigured
            ? 'No Agora account added yet. Calls use the server env key until you add one.'
            : 'No Agora account yet. Voice calls are off until you add one below.'}
        </div>
      ) : null}

      <div className="card calls-card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Agora accounts</h3>
        </div>
        <p className="page-hint">
          Each new call uses the first account that is on and still has minutes this month. When an
          account reaches its monthly limit, or Agora rejects it, the next one takes new calls
          automatically. A call that has already started stays on its account.
          {data?.activeAccount ? ` In use now: ${data.activeAccount}.` : ''}
        </p>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Account</th>
                <th>App ID</th>
                <th>This month</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account, index) => {
                const status = accountStatus(account, data?.activeAccount);
                const draft = replacing[account.id];
                return (
                  <tr key={account.id}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        className="ai-limit-input"
                        style={{ width: 150 }}
                        defaultValue={account.label}
                        key={`${account.id}-${account.label}`}
                        onBlur={(event) => {
                          const label = event.target.value.trim();
                          if (label && label !== account.label) updateAccount(index, { label });
                        }}
                      />
                      {account.lastError ? (
                        <div className="user-email ai-error-text" title={account.lastError}>{account.lastError}</div>
                      ) : null}
                    </td>
                    <td>{account.appIdHint}</td>
                    <td>
                      <div>
                        {account.usedMinutes.toLocaleString()} /{' '}
                        <input
                          type="number"
                          min="0"
                          className="ai-limit-input"
                          style={{ width: 80 }}
                          title="Monthly minute limit (0 = no limit)"
                          defaultValue={account.monthlyLimitMinutes}
                          key={`${account.id}-limit-${account.monthlyLimitMinutes}`}
                          onBlur={(event) => {
                            const limit = Number(event.target.value);
                            if (Number.isFinite(limit) && limit >= 0 && limit !== account.monthlyLimitMinutes) {
                              updateAccount(index, { monthlyLimitMinutes: limit });
                            }
                          }}
                        />{' '}
                        min
                      </div>
                      <div className="user-email">{account.calls} calls</div>
                    </td>
                    <td><span className={`status-badge ${status.className}`}>{status.label}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button type="button" className="action-btn" disabled={saving || index === 0} onClick={() => moveAccount(index, -1)}>
                          <ArrowUp className="item-icon" aria-hidden />
                        </button>
                        <button type="button" className="action-btn" disabled={saving || index === accounts.length - 1} onClick={() => moveAccount(index, 1)}>
                          <ArrowDown className="item-icon" aria-hidden />
                        </button>
                        <button type="button" className="action-btn" disabled={saving} onClick={() => updateAccount(index, { enabled: !account.enabled })}>
                          {account.enabled ? 'Turn off' : 'Turn on'}
                        </button>
                        {account.blockedUntil ? (
                          <button type="button" className="action-btn" disabled={saving} onClick={() => clearLimit(account.id, false)}>
                            Resume
                          </button>
                        ) : null}
                        {account.overLimit ? (
                          <button
                            type="button"
                            className="action-btn"
                            disabled={saving}
                            onClick={async () => {
                              const ok = await confirmAction({
                                title: `Reset minutes for ${account.label}?`,
                                message: "This month's used minutes go back to zero, so the account takes calls again.",
                                details: ['Only do this if the Agora console still shows minutes left.'],
                                confirmLabel: 'Reset minutes',
                                tone: 'warning',
                                icon: 'restart_alt',
                              });
                              if (ok) clearLimit(account.id, true);
                            }}
                          >
                            Reset minutes
                          </button>
                        ) : null}
                        {draft ? (
                          <>
                            <input
                              className="ai-limit-input"
                              style={{ width: 130 }}
                              placeholder="New App ID"
                              value={draft.appId || ''}
                              onChange={(event) => setReplacing((current) => ({ ...current, [account.id]: { ...draft, appId: event.target.value } }))}
                            />
                            <input
                              type="password"
                              className="ai-limit-input"
                              style={{ width: 130 }}
                              placeholder="New certificate"
                              value={draft.appCertificate || ''}
                              onChange={(event) => setReplacing((current) => ({ ...current, [account.id]: { ...draft, appCertificate: event.target.value } }))}
                            />
                            <button
                              type="button"
                              className="action-btn view"
                              disabled={saving || !draft.appId || !draft.appCertificate}
                              onClick={() => replaceCredentials(account.id)}
                            >
                              Save
                            </button>
                            <button type="button" className="action-btn" onClick={() => setReplacing((current) => ({ ...current, [account.id]: undefined }))}>
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button type="button" className="action-btn" disabled={saving} onClick={() => setReplacing((current) => ({ ...current, [account.id]: {} }))}>
                            Replace keys
                          </button>
                        )}
                        <button
                          type="button"
                          className="action-btn suspend"
                          disabled={saving}
                          onClick={async () => {
                            const ok = await confirmAction({
                              title: `Remove ${account.label}?`,
                              message: 'New calls move to the next account. Calls already ringing on this one may fail.',
                              confirmLabel: 'Remove account',
                              tone: 'danger',
                            });
                            if (ok) saveAccounts(accounts.filter((item) => item.id !== account.id), `${account.label} removed`);
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="ai-add-row" style={{ marginTop: 12 }}>
          <input
            className="ai-add-input"
            placeholder="Account name"
            value={form.label}
            onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))}
          />
          <input
            className="ai-add-input"
            placeholder="Agora App ID"
            value={form.appId}
            onChange={(event) => setForm((current) => ({ ...current, appId: event.target.value }))}
          />
          <input
            type="password"
            className="ai-add-input"
            placeholder="Primary App Certificate"
            value={form.appCertificate}
            onChange={(event) => setForm((current) => ({ ...current, appCertificate: event.target.value }))}
          />
          <input
            type="number"
            min="0"
            className="ai-add-input"
            style={{ maxWidth: 140 }}
            title="Monthly minute limit"
            placeholder="Minutes / month"
            value={form.monthlyLimitMinutes}
            onChange={(event) => setForm((current) => ({ ...current, monthlyLimitMinutes: event.target.value }))}
          />
          <button
            type="button"
            className="action-btn view"
            disabled={saving || !form.label.trim() || !form.appId.trim() || !form.appCertificate.trim()}
            onClick={addAccount}
          >
            + Add account
          </button>
        </div>
        <p className="form-hint" style={{ marginTop: 8 }}>
          In the Agora console, create a project with &quot;Secured mode: App ID + Token&quot; and copy its App ID
          and primary certificate. The free plan gives 10,000 minutes a month.
        </p>
      </div>

      {message ? <div className="ai-message">{message}</div> : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Phone className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Account in use</h3>
            <p className="stat-value ai-stat-text">{data?.activeAccount || 'None available'}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Clock className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Minutes this month</h3>
            <p className="stat-value">{(data?.totals?.minutes ?? 0).toLocaleString()}</p>
            <div className="stat-trend">
              of {(data?.totals?.limit ?? 0).toLocaleString()} · {data?.totals?.calls ?? 0} calls · resets {formatDate(data?.resetsAt)}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Ban className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Accounts paused</h3>
            <p className="stat-value">{pausedCount}</p>
            <div className="stat-trend">At monthly limit or rejected by Agora</div>
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
                onChange={(e) => run(() => api.put('/calls/admin/settings', { autoSwitch: e.target.checked }))}
              />
              <span className="ai-switch-track" />
              <span className="ai-switch-label">{data?.autoSwitch ? 'On' : 'Off'}</span>
            </label>
            <div className="stat-trend">
              {data?.autoSwitch ? 'Moves to the next account when one is used up' : 'Only the first account is used'}
            </div>
          </div>
        </div>
      </div>

      <div className="card calls-card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>Daily call time per user</h3>
        </div>
        <form
          className="ai-limits"
          key={data?.dailyUserMinutes}
          onSubmit={(e) => {
            e.preventDefault();
            const minutes = Number(new FormData(e.currentTarget).get('dailyUserMinutes'));
            run(() => api.put('/calls/admin/settings', { dailyUserMinutes: minutes }), 'Daily call time saved');
          }}
        >
          <div className="form-group">
            <label htmlFor="dailyUserMinutes">Minutes per user per day</label>
            <input
              id="dailyUserMinutes"
              name="dailyUserMinutes"
              type="number"
              min="0"
              max="1440"
              className="form-input"
              defaultValue={data?.dailyUserMinutes ?? 10}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>Save</button>
        </form>
        <p className="form-hint">
          Only answered talk time counts, for both people. A call ends by itself when either person runs
          out. Resets at midnight Nepal time. Calls with KinBech Support are free. 0 means no limit.
        </p>
      </div>

      <p className="page-hint">
        Minutes are counted by KinBech: every person in a call counts per started minute, plus the
        caller&apos;s ringing time. Agora&apos;s own console is the final bill, so keep the limit a little
        under your real allowance.
      </p>
    </div>
  );
}
