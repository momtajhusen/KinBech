import { useEffect, useState } from 'react';
import { Eye, EyeOff, FlaskConical, KeyRound, PlugZap, RotateCcw, ShieldCheck, Zap } from 'lucide-react';
import api from '../services/api';
import { ModalSwitch } from './Modal';

const TEST_LOGINS = [
  ['eSewa ID', '9806800001 – 9806800005'],
  ['Password', 'Nepal@123'],
  ['MPIN', '1122'],
  ['Verification code', '123456'],
];

const errorText = (error, fallback) => error?.response?.data?.message || fallback;

function draftFrom(settings) {
  return {
    enabled: settings.enabled,
    mode: settings.mode,
    sandboxOpen: settings.sandboxOpen,
    publicApiUrl: settings.publicApiUrl,
    sandbox: { productCode: settings.sandbox.productCode, secretKey: '' },
    live: { productCode: settings.live.productCode, secretKey: '' },
    intent: {
      enabled: settings.intent?.enabled !== false,
      sandboxApp: settings.intent?.sandboxApp === true,
      sandbox: { productCode: settings.intent?.sandbox?.productCode || '', secretKey: '' },
      live: { productCode: settings.intent?.live?.productCode || '', secretKey: '' },
    },
  };
}

const withoutSecrets = (draft) => ({
  ...draft,
  sandbox: { ...draft.sandbox, secretKey: '' },
  live: { ...draft.live, secretKey: '' },
  intent: { ...draft.intent, sandbox: { ...draft.intent.sandbox, secretKey: '' }, live: { ...draft.intent.live, secretKey: '' } },
});

function CredentialsPanel({
  title,
  hint,
  icon: Icon,
  saved,
  value,
  onChange,
  active,
  children,
  codePlaceholder = 'EPAYTEST',
  keyLabel = 'Secret key',
  keyHint = 'ePay v2 secret key, not the mobile SDK client secret. Stored encrypted. Leave empty to keep the saved key.',
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={`esewa-creds ${active ? 'active' : ''}`}>
      <div className="esewa-creds-head">
        <span className="post-limit-icon"><Icon className="item-icon" aria-hidden /></span>
        <div>
          <strong>{title}</strong>
          <span className="subs-muted">{hint}</span>
        </div>
        {active ? <span className="status-badge active">In use</span> : null}
      </div>
      <div className="form-group">
        <label>Merchant ID / product code</label>
        <input
          className="form-input"
          value={value.productCode}
          maxLength={60}
          autoComplete="off"
          onChange={(e) => onChange({ ...value, productCode: e.target.value })}
          placeholder={codePlaceholder}
        />
      </div>
      <div className="form-group">
        <label>{keyLabel}</label>
        <div className="esewa-secret">
          <input
            className="form-input"
            type={show ? 'text' : 'password'}
            value={value.secretKey}
            maxLength={200}
            autoComplete="new-password"
            onChange={(e) => onChange({ ...value, secretKey: e.target.value })}
            placeholder={saved.secretKeySet ? `Saved ${saved.secretKeyHint} · type to replace` : `Paste the ${keyLabel.toLowerCase()} from eSewa`}
          />
          <button type="button" className="subs-copy" onClick={() => setShow((v) => !v)} title={show ? 'Hide' : 'Show'}>
            {show ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </button>
        </div>
        <p className="form-hint">{keyHint}</p>
      </div>
      {children}
    </div>
  );
}

/** eSewa ePay settings: credentials live in the database and are edited here, never in .env. */
export default function EsewaGatewayCard() {
  const [settings, setSettings] = useState(null);
  const [stats, setStats] = useState([]);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const apply = (data) => {
    setSettings(data.settings);
    setDraft(draftFrom(data.settings));
    if (data.stats) setStats(data.stats);
  };

  useEffect(() => {
    api.get('/subscriptions/admin/gateway/esewa')
      .then(({ data }) => apply(data))
      .catch((err) => setMessage({ ok: false, text: errorText(err, 'Could not load eSewa settings') }));
  }, []);

  if (!settings || !draft) {
    return <div className="card esewa-card"><p className="subs-muted">{message?.text || 'Loading eSewa settings…'}</p></div>;
  }

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const setIntent = (patch) => setDraft((current) => ({ ...current, intent: { ...current.intent, ...patch } }));
  const changed =
    JSON.stringify(withoutSecrets(draft)) !== JSON.stringify(draftFrom(settings)) ||
    Boolean(draft.sandbox.secretKey || draft.live.secretKey || draft.intent.sandbox.secretKey || draft.intent.live.secretKey);

  const run = async (request, success) => {
    setBusy(true);
    setMessage(null);
    try {
      const { data } = await request();
      if (data.settings) apply({ settings: data.settings });
      setMessage({ ok: data.ok !== false, text: data.message || success });
    } catch (err) {
      setMessage({ ok: false, text: errorText(err, 'Could not save') });
    } finally {
      setBusy(false);
    }
  };

  const save = (event) => {
    event.preventDefault();
    if (draft.enabled && draft.mode === 'live' && !settings.enabled) {
      if (!window.confirm('Turn on LIVE eSewa payments? Sellers will pay real money.')) return;
    }
    run(() => api.put('/subscriptions/admin/gateway/esewa', draft), 'eSewa settings saved');
  };

  const sumFor = (status) => stats.filter((row) => row.status === status && row.mode === settings.mode);
  const paid = sumFor('approved').reduce((acc, row) => ({ count: acc.count + row.count, amount: acc.amount + row.amount }), { count: 0, amount: 0 });
  const failed = sumFor('failed').reduce((sum, row) => sum + row.count, 0);
  const statusLabel = settings.enabled ? `On · ${settings.mode === 'live' ? 'Live' : 'Test mode'}` : 'Off';

  return (
    <form className="card esewa-card" onSubmit={save}>
      <div className="esewa-head">
        <span className="esewa-logo">e</span>
        <div>
          <h3>eSewa online payment</h3>
          <p className="subs-muted">Sellers pay inside the app and the plan turns on by itself after eSewa confirms.</p>
        </div>
        <span className={`status-badge ${settings.enabled ? (settings.mode === 'live' ? 'active' : 'pending') : 'suspended'}`}>{statusLabel}</span>
      </div>

      <div className="esewa-stats">
        <div><strong>{paid.count}</strong><span>paid in 30 days</span></div>
        <div><strong>Rs {paid.amount.toLocaleString('en-IN')}</strong><span>received ({settings.mode === 'live' ? 'live' : 'test'})</span></div>
        <div><strong>{failed}</strong><span>not completed</span></div>
      </div>

      <ModalSwitch
        checked={draft.enabled}
        onChange={(v) => set({ enabled: v })}
        label="Accept eSewa payments in the app"
        hint="Off: nobody can buy a plan in the app. eSewa is the only way to pay."
      />

      <div className="form-group">
        <label>Mode</label>
        <div className="post-limit-mode">
          <button type="button" className={draft.mode === 'sandbox' ? 'active' : ''} onClick={() => set({ mode: 'sandbox' })}>Test (sandbox)</button>
          <button type="button" className={draft.mode === 'live' ? 'active' : ''} onClick={() => set({ mode: 'live' })}>Live</button>
        </div>
      </div>

      <div className="esewa-creds-grid">
        <CredentialsPanel
          title="Test credentials"
          hint="eSewa UAT server, no real money"
          icon={FlaskConical}
          saved={settings.sandbox}
          value={draft.sandbox}
          active={draft.mode === 'sandbox'}
          onChange={(sandbox) => set({ sandbox })}
        >
          <button
            type="button"
            className="btn btn-secondary esewa-small-btn"
            disabled={busy}
            onClick={() => run(() => api.post('/subscriptions/admin/gateway/esewa/sandbox-defaults'), 'eSewa test credentials restored (EPAYTEST)')}
          >
            <RotateCcw className="item-icon" aria-hidden /> Use eSewa test credentials
          </button>
        </CredentialsPanel>
        <CredentialsPanel
          title="Live credentials"
          hint="From eSewa after your test payments pass"
          icon={ShieldCheck}
          saved={settings.live}
          value={draft.live}
          active={draft.mode === 'live'}
          onChange={(live) => set({ live })}
        />
      </div>

      <ModalSwitch
        checked={draft.intent.enabled}
        onChange={(v) => setIntent({ enabled: v })}
        label="Pay in the eSewa app (recommended)"
        hint="Sellers confirm with their MPIN in the eSewa app, no eSewa ID or password to type. Uses the eSewa web page when this is off or the keys below are missing."
      />
      {draft.intent.enabled ? (
        <div className="esewa-creds-grid">
          <CredentialsPanel
            title="eSewa app · test"
            hint={settings.intent?.sandbox?.secretKeySet ? 'Your own test keys' : "Empty uses eSewa's public test keys (INTENT)"}
            icon={FlaskConical}
            saved={settings.intent?.sandbox || {}}
            value={draft.intent.sandbox}
            active={draft.mode === 'sandbox'}
            onChange={(sandbox) => setIntent({ sandbox })}
            codePlaceholder="INTENT"
            keyLabel="Access key"
            keyHint="eSewa Intent access key. Stored encrypted. Leave empty to keep the saved key."
          />
          <CredentialsPanel
            title="eSewa app · live"
            hint="eSewa gives Intent keys apart from the ePay keys"
            icon={ShieldCheck}
            saved={settings.intent?.live || {}}
            value={draft.intent.live}
            active={draft.mode === 'live'}
            onChange={(live) => setIntent({ live })}
            codePlaceholder="Product code from eSewa"
            keyLabel="Access key"
            keyHint="eSewa Intent access key. Stored encrypted. Leave empty to keep the saved key."
          />
        </div>
      ) : null}

      {draft.mode === 'sandbox' ? (
        <>
          <ModalSwitch
            checked={draft.sandboxOpen}
            onChange={(v) => set({ sandboxOpen: v })}
            label="Open test mode to every seller"
            hint="Off: only staff and test accounts see eSewa. On: anyone can get a plan with eSewa's public test logins."
          />
          {draft.intent.enabled ? (
            <ModalSwitch
              checked={draft.intent.sandboxApp}
              onChange={(v) => setIntent({ sandboxApp: v })}
              label="Test payments in the eSewa test app"
              hint="Turn on only when the test phone has eSewa's test app instead of the Play Store eSewa app. The Play Store app shows test payments as an expired link. Off: test payments use the eSewa web page."
            />
          ) : null}
          <div className="esewa-test-logins">
            <div className="esewa-test-title"><KeyRound aria-hidden /> Test logins for the eSewa page</div>
            <dl>
              {TEST_LOGINS.map(([label, value]) => (
                <div key={label}><dt>{label}</dt><dd><code>{value}</code></dd></div>
              ))}
            </dl>
            {draft.intent.enabled && draft.intent.sandboxApp ? (
              <p className="form-hint">
                Install esewa_rc_release.apk from{' '}
                <a href="https://gitlab.com/esewa-pub/esewa-intent-payment-app" target="_blank" rel="noreferrer">eSewa&apos;s demo repo</a>{' '}
                in place of the Play Store eSewa app. The Play Store app works only in live mode.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <details className="esewa-advanced">
        <summary>Advanced</summary>
        <div className="form-group">
          <label htmlFor="esewa-public-url">Public API URL</label>
          <input
            id="esewa-public-url"
            className="form-input"
            value={draft.publicApiUrl}
            placeholder="https://kinbechapi.codersalpha.com"
            onChange={(e) => set({ publicApiUrl: e.target.value })}
          />
          <p className="form-hint">Where eSewa sends the buyer back. Leave empty to use the address the app calls.</p>
        </div>
        <p className="form-hint">
          Checkout: <code>{settings.urls[draft.mode].form}</code><br />
          Status check: <code>{settings.urls[draft.mode].status}</code>
        </p>
      </details>

      {message ? <div className={message.ok ? 'ai-message' : 'u360-error'}>{message.text}</div> : null}

      <div className="form-actions">
        <button
          type="button"
          className="btn btn-secondary esewa-small-btn"
          disabled={busy}
          onClick={() => run(() => api.post('/subscriptions/admin/gateway/esewa/test', { mode: draft.mode }), 'eSewa answered')}
        >
          <PlugZap className="item-icon" aria-hidden /> Check connection
        </button>
        <button type="button" className="btn btn-secondary" disabled={busy || !changed} onClick={() => setDraft(draftFrom(settings))}>Reset</button>
        <button type="submit" className="btn btn-primary esewa-small-btn" disabled={busy || !changed}>
          <Zap className="item-icon" aria-hidden /> {busy ? 'Saving…' : 'Save eSewa settings'}
        </button>
      </div>
    </form>
  );
}
