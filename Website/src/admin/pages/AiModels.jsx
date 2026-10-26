import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, Bot, RefreshCw, TrendingUp } from 'lucide-react';
import api from '../services/api';

function formatReset(until) {
  if (!until) return '';
  const ms = new Date(until).getTime() - Date.now();
  if (ms <= 0) return 'soon';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.round((ms % 3600000) / 60000);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export default function AiModels() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [accountForm, setAccountForm] = useState({ label: '', apiKey: '' });
  const [replaceKeys, setReplaceKeys] = useState({});
  const [message, setMessage] = useState('');

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get('/ai/admin/models');
      setData(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not load AI accounts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(() => load({ quiet: true }), 30000);
    return () => clearInterval(timer);
  }, []);

  const save = async (patch) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await api.put('/ai/admin/models', patch);
      setData(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const accounts = data?.accounts || [];

  const addAccount = async () => {
    setSaving(true);
    setMessage('');
    try {
      const response = await api.post('/ai/admin/accounts', accountForm);
      setData(response.data);
      setAccountForm({ label: '', apiKey: '' });
      setMessage('Account added. The key is stored in the database and is not shown again.');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not add account');
    } finally {
      setSaving(false);
    }
  };

  const saveAccounts = async (next) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await api.put('/ai/admin/accounts', {
        accounts: next.map(({ id, label, enabled }) => ({ id, label, enabled })),
      });
      setData(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not save accounts');
    } finally {
      setSaving(false);
    }
  };

  const moveAccount = (index, delta) => {
    const next = [...accounts];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    saveAccounts(next);
  };

  const replaceAccountKey = async (id) => {
    const apiKey = String(replaceKeys[id] || '').trim();
    if (!apiKey) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await api.put(`/ai/admin/accounts/${id}/key`, { apiKey });
      setData(response.data);
      setReplaceKeys((current) => ({ ...current, [id]: '' }));
      setMessage('API key replaced');
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not replace key');
    } finally {
      setSaving(false);
    }
  };

  const testAccount = async (account) => {
    setTesting(account.id);
    setMessage('');
    try {
      const response = await api.post(`/ai/admin/accounts/${account.id}/test`);
      setData(response.data.overview);
      const result = response.data.result;
      setMessage(result.ok ? `${account.label}: working (${result.ms} ms)` : `${account.label}: ${result.message}`);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Account test failed');
    } finally {
      setTesting('');
    }
  };

  const clearAccountLimit = async (id) => {
    setSaving(true);
    try {
      const response = await api.post(`/ai/admin/accounts/${id}/clear-limit`);
      setData(response.data);
    } finally {
      setSaving(false);
    }
  };

  const totals = useMemo(() => {
    const models = data?.models || [];
    const today = models.reduce(
      (sum, model) => ({
        success: sum.success + model.today.success,
        failed: sum.failed + model.today.failed,
      }),
      { success: 0, failed: 0 }
    );
    const blocked = accounts.filter((account) => account.enabled && account.blockedUntil).length;
    return { ...today, blocked };
  }, [data, accounts]);

  if (loading && !data) return <div className="loading">Loading AI accounts...</div>;

  return (
    <div className="users-page ai-models-page">
      {!data?.keyConfigured ? (
        <div className="ai-alert">No Gemini account yet. Add an API key below, or set GEMINI_API_KEY on the server.</div>
      ) : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3>Gemini accounts</h3>
        </div>
        <p className="page-hint">
          Keys are saved in the database. The app tries account 1 first. When Gemini returns a
          limit or key error, the next enabled account is used automatically.
          {data?.activeAccount ? ` In use now: ${data.activeAccount}.` : ''}
        </p>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Account</th>
                <th>Key</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account, index) => {
                const status = !account.enabled
                  ? { label: 'Off', className: 'rejected' }
                  : account.blockedUntil
                    ? { label: `Limit reached · ${formatReset(account.blockedUntil)}`, className: 'suspended' }
                    : account.label === data?.activeAccount
                      ? { label: 'In use', className: 'active' }
                      : { label: 'Standby', className: 'pending' };
                return (
                  <tr key={account.id}>
                    <td>{index + 1}</td>
                    <td>
                      <input
                        className="ai-limit-input"
                        style={{ width: 160 }}
                        defaultValue={account.label}
                        key={`${account.id}-${account.label}`}
                        onBlur={(event) => {
                          const label = event.target.value.trim();
                          if (label && label !== account.label) {
                            saveAccounts(accounts.map((item, i) => (i === index ? { ...item, label } : item)));
                          }
                        }}
                      />
                      {account.lastError ? (
                        <div className="user-email ai-error-text" title={account.lastError}>{account.lastError}</div>
                      ) : null}
                    </td>
                    <td>{account.keyHint}</td>
                    <td><span className={`status-badge ${status.className}`}>{status.label}</span></td>
                    <td>
                      <div className="action-buttons">
                        <button type="button" className="action-btn" disabled={saving || index === 0} onClick={() => moveAccount(index, -1)}>
                          <ArrowUp className="item-icon" aria-hidden />
                        </button>
                        <button type="button" className="action-btn" disabled={saving || index === accounts.length - 1} onClick={() => moveAccount(index, 1)}>
                          <ArrowDown className="item-icon" aria-hidden />
                        </button>
                        <button type="button" className="action-btn" disabled={saving} onClick={() => saveAccounts(accounts.map((item, i) => (i === index ? { ...item, enabled: !item.enabled } : item)))}>
                          {account.enabled ? 'Turn off' : 'Turn on'}
                        </button>
                        <button type="button" className="action-btn" disabled={Boolean(testing)} onClick={() => testAccount(account)}>
                          {testing === account.id ? 'Testing…' : 'Test'}
                        </button>
                        {account.blockedUntil ? (
                          <button type="button" className="action-btn" disabled={saving} onClick={() => clearAccountLimit(account.id)}>
                            Clear limit
                          </button>
                        ) : null}
                        <input
                          type="password"
                          className="ai-limit-input"
                          style={{ width: 140 }}
                          placeholder="Replace key"
                          value={replaceKeys[account.id] || ''}
                          onChange={(event) => setReplaceKeys((current) => ({ ...current, [account.id]: event.target.value }))}
                        />
                        <button type="button" className="action-btn view" disabled={saving || !replaceKeys[account.id]} onClick={() => replaceAccountKey(account.id)}>
                          Save key
                        </button>
                        <button
                          type="button"
                          className="action-btn suspend"
                          disabled={saving}
                          onClick={() => {
                            if (window.confirm(`Remove ${account.label}?`)) {
                              saveAccounts(accounts.filter((item) => item.id !== account.id));
                            }
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
          {accounts.length === 0 ? <div className="empty-state">No accounts yet. The server env key is used until you add one.</div> : null}
        </div>
        <div className="ai-add-row" style={{ marginTop: 12 }}>
          <input
            className="ai-add-input"
            placeholder="Account name"
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
          <button
            type="button"
            className="action-btn view"
            disabled={saving || !accountForm.label.trim() || !accountForm.apiKey.trim()}
            onClick={addAccount}
          >
            + Add account
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Bot className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Account in use</h3>
            <p className="stat-value ai-stat-text">{data?.activeAccount || 'None available'}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><TrendingUp className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Requests today</h3>
            <p className="stat-value">{totals.success + totals.failed}</p>
            <div className="stat-trend">
              {totals.success} ok · {totals.failed} failed
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Ban className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Accounts at limit</h3>
            <p className="stat-value">{totals.blocked}</p>
            <div className="stat-trend">Quota day: {data?.quotaDay} (Pacific time)</div>
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
                onChange={(e) => save({ autoSwitch: e.target.checked })}
              />
              <span className="ai-switch-track" />
              <span className="ai-switch-label">{data?.autoSwitch ? 'On' : 'Off'}</span>
            </label>
            <div className="stat-trend">
              {data?.autoSwitch
                ? 'Switches to the next account when a limit error comes'
                : 'Only the first account is used'}
            </div>
          </div>
        </div>
      </div>

      <p className="page-hint">
        Add Gemini accounts here. They are tried from top to bottom. A quota or invalid-key
        error switches to the next account. Keys stay in the database and are never shown again.
      </p>

      {message ? <div className="ai-message">{message}</div> : null}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>Usage limits</h3>
          <span className="form-hint">{data?.usedToday ?? 0} AI photo fills used today (Nepal time)</span>
        </div>
        <form
          className="ai-limits"
          key={`${data?.userDailyLimit}-${data?.globalDailyCap}`}
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            save({
              userDailyLimit: Number(form.get('userDailyLimit')),
              globalDailyCap: Number(form.get('globalDailyCap')),
            });
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
          <button type="submit" className="btn btn-primary" disabled={saving}>Save limits</button>
        </form>
        <p className="form-hint">Users see &quot;AI limit reached today&quot; and can still fill details themselves. 0 turns AI fill off.</p>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3>Last 7 days</h3>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Successful</th>
              <th>Failed</th>
              <th>Limit hits</th>
            </tr>
          </thead>
          <tbody>
            {(data?.history || []).map((row) => (
              <tr key={row.day}>
                <td>{row.day}</td>
                <td>{row.success}</td>
                <td>{row.failed}</td>
                <td>{row.quotaHits}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
