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

function formatTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function modelStatus(model, activeModel) {
  if (!model.enabled) return { label: 'Off', className: 'rejected' };
  if (model.blockedUntil) {
    return { label: `Limit reached · resets in ${formatReset(model.blockedUntil)}`, className: 'suspended' };
  }
  if (model.name === activeModel) return { label: 'In use', className: 'active' };
  return { label: 'Standby', className: 'pending' };
}

export default function AiModels() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [newModel, setNewModel] = useState('');
  const [message, setMessage] = useState('');

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await api.get('/ai/admin/models');
      setData(response.data);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Could not load AI models');
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

  const models = data?.models || [];
  const saveModels = (next) =>
    save({ models: next.map(({ name, enabled, dailyLimit }) => ({ name, enabled, dailyLimit })) });

  const move = (index, delta) => {
    const next = [...models];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    saveModels(next);
  };

  const makePrimary = (index) => {
    const next = [...models];
    const [picked] = next.splice(index, 1);
    next.unshift({ ...picked, enabled: true });
    saveModels(next);
  };

  const toggleModel = (index) => {
    saveModels(models.map((model, i) => (i === index ? { ...model, enabled: !model.enabled } : model)));
  };

  const setLimit = (index, value) => {
    const limit = Math.max(0, Number(value) || 0);
    saveModels(models.map((model, i) => (i === index ? { ...model, dailyLimit: limit } : model)));
  };

  const removeModel = (index) => {
    if (!window.confirm(`Remove ${models[index].name} from the list?`)) return;
    saveModels(models.filter((_, i) => i !== index));
  };

  const addModel = () => {
    const name = newModel.trim();
    if (!name || models.some((model) => model.name === name)) return;
    saveModels([...models, { name, enabled: true, dailyLimit: 20 }]);
    setNewModel('');
  };

  const clearLimit = async (name) => {
    setSaving(true);
    try {
      const response = await api.post(`/ai/admin/models/${encodeURIComponent(name)}/clear-limit`);
      setData(response.data);
    } finally {
      setSaving(false);
    }
  };

  const testModel = async (name) => {
    setTesting(name);
    setMessage('');
    try {
      const response = await api.post(`/ai/admin/models/${encodeURIComponent(name)}/test`);
      const { result, overview } = response.data;
      setData(overview);
      setMessage(
        result.ok
          ? `${name}: working (${result.ms} ms)`
          : `${name}: failed — ${result.message}`
      );
    } catch (error) {
      setMessage(error.response?.data?.message || 'Test failed');
    } finally {
      setTesting('');
    }
  };

  const totals = useMemo(() => {
    const today = models.reduce(
      (sum, model) => ({
        success: sum.success + model.today.success,
        failed: sum.failed + model.today.failed,
      }),
      { success: 0, failed: 0 }
    );
    const capacity = models
      .filter((model) => model.enabled)
      .reduce((sum, model) => sum + (model.dailyLimit || 0), 0);
    const blocked = models.filter((model) => model.enabled && model.blockedUntil).length;
    return { ...today, capacity, blocked };
  }, [models]);

  const addable = (data?.available || []).filter((name) => !models.some((model) => model.name === name));

  if (loading && !data) return <div className="loading">Loading AI models...</div>;

  return (
    <div className="users-page ai-models-page">
      {!data?.keyConfigured ? (
        <div className="ai-alert">GEMINI_API_KEY is not set on the server. AI auto-fill will not work.</div>
      ) : null}

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Bot className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Model in use now</h3>
            <p className="stat-value ai-stat-text">{data?.activeModel || 'None available'}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><TrendingUp className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Requests today</h3>
            <p className="stat-value">
              {totals.success + totals.failed}
              <span className="ai-stat-sub"> / {totals.capacity}</span>
            </p>
            <div className="stat-trend">
              {totals.success} ok · {totals.failed} failed
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{ background: 'var(--background-secondary)' }}><Ban className="item-icon" aria-hidden /></div>
          <div className="stat-content">
            <h3>Models at limit</h3>
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
                ? 'Moves to the next model when one runs out'
                : 'Only the first model is used'}
            </div>
          </div>
        </div>
      </div>

      <p className="page-hint">
        Models are tried from top to bottom. The free Gemini plan gives each model its own daily
        limit, so with auto switch on, AI keeps working until every enabled model is used up.
        Limits reset at midnight Pacific time.
      </p>

      {message ? <div className="ai-message">{message}</div> : null}

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Model</th>
              <th>Used today</th>
              <th>Daily limit</th>
              <th>Status</th>
              <th>Last used</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {models.map((model, index) => {
              const used = model.today.success + model.today.failed;
              const pct = model.dailyLimit ? Math.min(100, Math.round((used / model.dailyLimit) * 100)) : 0;
              const status = modelStatus(model, data?.activeModel);
              return (
                <tr key={model.name} className={model.enabled ? '' : 'ai-row-off'}>
                  <td>{index + 1}</td>
                  <td>
                    <div className="user-name">{model.name}</div>
                    {model.today.lastError ? (
                      <div className="user-email ai-error-text" title={model.today.lastError}>
                        {model.today.lastError}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <div className="ai-usage">
                      <div className="ai-usage-bar">
                        <span
                          style={{ width: `${pct}%` }}
                          className={pct >= 100 || model.blockedUntil ? 'full' : pct >= 75 ? 'warn' : ''}
                        />
                      </div>
                      <span className="ai-usage-text">
                        {used}/{model.dailyLimit}
                        {model.today.failed ? ` · ${model.today.failed} failed` : ''}
                      </span>
                    </div>
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      className="ai-limit-input"
                      defaultValue={model.dailyLimit}
                      key={`${model.name}-${model.dailyLimit}`}
                      onBlur={(e) => {
                        if (Number(e.target.value) !== model.dailyLimit) setLimit(index, e.target.value);
                      }}
                    />
                  </td>
                  <td>
                    <span className={`status-badge ${status.className}`}>{status.label}</span>
                  </td>
                  <td>{formatTime(model.today.lastUsedAt)}</td>
                  <td>
                    <div className="action-buttons">
                      <button className="action-btn" disabled={saving || index === 0} onClick={() => move(index, -1)} title="Move up">
                        <ArrowUp className="item-icon" aria-hidden />
                      </button>
                      <button
                        className="action-btn"
                        disabled={saving || index === models.length - 1}
                        onClick={() => move(index, 1)}
                        title="Move down"
                      >
                        <ArrowDown className="item-icon" aria-hidden />
                      </button>
                      {index !== 0 ? (
                        <button className="action-btn view" disabled={saving} onClick={() => makePrimary(index)}>
                          Use first
                        </button>
                      ) : null}
                      <button className="action-btn" disabled={saving} onClick={() => toggleModel(index)}>
                        {model.enabled ? 'Turn off' : 'Turn on'}
                      </button>
                      <button
                        className="action-btn"
                        disabled={Boolean(testing)}
                        onClick={() => testModel(model.name)}
                        title="Sends one tiny request (uses 1 of today's limit)"
                      >
                        {testing === model.name ? 'Testing…' : 'Test'}
                      </button>
                      {model.blockedUntil ? (
                        <button className="action-btn" disabled={saving} onClick={() => clearLimit(model.name)}>
                          Clear limit
                        </button>
                      ) : null}
                      <button className="action-btn suspend" disabled={saving} onClick={() => removeModel(index)}>
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {models.length === 0 ? <div className="empty-state">No models. Add one below.</div> : null}
      </div>

      <div className="page-header" style={{ marginTop: 16 }}>
        <div className="ai-add-row">
          <input
            list="ai-available-models"
            value={newModel}
            onChange={(e) => setNewModel(e.target.value)}
            placeholder="Add a model, e.g. gemini-3.5-flash"
            className="ai-add-input"
            onKeyDown={(e) => {
              if (e.key === 'Enter') addModel();
            }}
          />
          <datalist id="ai-available-models">
            {addable.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button className="action-btn view" disabled={saving || !newModel.trim()} onClick={addModel}>
            + Add model
          </button>
        </div>
        {data?.availableError ? (
          <span className="user-email">Could not load model list: {data.availableError}</span>
        ) : (
          <span className="user-email">{addable.length} more models available on this key</span>
        )}
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
