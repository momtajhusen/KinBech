import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Laptop, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import api from '../services/api';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { BRAND_ICON_SRC } from '../../content/brandAssets';

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function BackupCodes({ codes, onDone }) {
  return (
    <div className="security-backup">
      <p>
        Save these backup codes somewhere safe. Each one signs you in once if you lose your phone.
        They are shown only now.
      </p>
      <div className="backup-codes">
        {codes.map((code) => <code key={code}>{code}</code>)}
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>
          Copy codes
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>I saved them</button>
      </div>
    </div>
  );
}

function TwoFactorCard() {
  const { setUser } = useAuth();
  const [status, setStatus] = useState(null);
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('');
  const [backupCodes, setBackupCodes] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get('/auth/admin/2fa').then((res) => setStatus(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const startSetup = () => run(async () => {
    const res = await api.post('/auth/admin/2fa/setup');
    setSetup(res.data);
    setCode('');
  });

  const enable = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await api.post('/auth/admin/2fa/enable', { code });
      setSetup(null);
      setCode('');
      setBackupCodes(res.data.backupCodes);
      // Keep the forced-setup gate closed until the codes are saved.
      setStatus((current) => ({ ...current, enabled: true, backupCodesLeft: res.data.backupCodes.length, pendingUser: res.data.user }));
    });
  };

  const closeMode = () => {
    setMode('');
    setCode('');
    setPassword('');
    setError('');
  };

  const disable = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await api.post('/auth/admin/2fa/disable', { password, code });
      setUser(res.data.user);
      setMode('');
      setPassword('');
      setCode('');
      load();
    });
  };

  const regenerate = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await api.post('/auth/admin/2fa/backup-codes', { code });
      setMode('');
      setCode('');
      setBackupCodes(res.data.backupCodes);
      load();
    });
  };

  const finishBackup = () => {
    setBackupCodes(null);
    if (status?.pendingUser) setUser(status.pendingUser);
    load();
  };

  if (!status) return <div className="card security-card"><div className="loading">Loading…</div></div>;

  return (
    <div className="card security-card">
      <div className="card-header">
        <h3>Two-step verification</h3>
        <span className={`status-badge ${status.enabled ? 'active' : 'pending'}`}>{status.enabled ? 'On' : 'Off'}</span>
      </div>
      {error && !mode ? <div className="error-message">{error}</div> : null}

      {backupCodes ? (
        <BackupCodes codes={backupCodes} onDone={finishBackup} />
      ) : setup ? (
        <form onSubmit={enable} className="security-setup">
          <p>Scan this QR code with Google Authenticator, Microsoft Authenticator or Authy, then type the 6-digit code it shows.</p>
          <img src={setup.qrDataUrl} alt="Authenticator QR code" className="security-qr" />
          <p className="form-hint">Can&apos;t scan? Enter this key: <code>{setup.secret}</code></p>
          <div className="form-group">
            <label htmlFor="enable-code">6-digit code</label>
            <input id="enable-code" className="form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setSetup(null)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Checking…' : 'Turn on'}</button>
          </div>
        </form>
      ) : status.enabled ? (
        <>
          <p className="security-text">
            <ShieldCheck className="item-icon" aria-hidden /> Signing in needs your password and a code from your phone.
            Backup codes left: <strong>{status.backupCodesLeft}</strong>
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={() => { setError(''); setMode('codes'); }}>New backup codes</button>
            {!status.required ? (
              <button type="button" className="btn btn-secondary" onClick={() => { setError(''); setMode('disable'); }}>
                <ShieldOff className="item-icon" aria-hidden /> Turn off
              </button>
            ) : null}
          </div>
          {mode ? (
            <Modal
              icon={mode === 'disable' ? ShieldOff : KeyRound}
              tone={mode === 'disable' ? 'danger' : 'primary'}
              title={mode === 'disable' ? 'Turn off two-step verification' : 'Create new backup codes'}
              subtitle={mode === 'disable'
                ? 'Signing in will need only your password. Confirm with your password and a code.'
                : 'Your old backup codes stop working. Confirm with a code from your authenticator app.'}
              size="sm"
              busy={busy}
              onClose={closeMode}
              onSubmit={mode === 'disable' ? disable : regenerate}
              footer={(
                <>
                  <button type="button" className="btn btn-secondary" onClick={closeMode} disabled={busy}>Cancel</button>
                  <button type="submit" className={`btn ${mode === 'disable' ? 'u360-danger-btn' : 'btn-primary'}`} disabled={busy}>
                    {busy ? 'Checking…' : mode === 'disable' ? 'Turn off' : 'Create new codes'}
                  </button>
                </>
              )}
            >
              {mode === 'disable' ? (
                <div className="form-group">
                  <label htmlFor="disable-password">Password</label>
                  <input id="disable-password" type="password" className="form-input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              ) : null}
              <div className="form-group">
                <label htmlFor="action-code">Authenticator code</label>
                <input id="action-code" className="form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={11} value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code or a backup code" required />
              </div>
              {error ? <div className="u360-error">{error}</div> : null}
            </Modal>
          ) : null}
        </>
      ) : (
        <>
          <p className="security-text">
            Protect this admin account with a code from your phone. Even if someone learns your password, they can&apos;t sign in.
          </p>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" onClick={startSetup} disabled={busy}>Set up two-step verification</button>
          </div>
        </>
      )}
    </div>
  );
}

function SessionsCard() {
  const { logout } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.get('/auth/sessions')
      .then((res) => setSessions(res.data.sessions || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (session) => {
    if (!window.confirm(`Sign out ${session.deviceName}?`)) return;
    await api.delete(`/auth/sessions/${session.id}`).catch(() => {});
    if (session.current) logout();
    else load();
  };

  const signOutEverywhere = async () => {
    if (!window.confirm('Sign out of every device, including this one?')) return;
    await api.post('/auth/logout-all').catch(() => {});
    logout();
  };

  return (
    <div className="card security-card">
      <div className="card-header">
        <h3>Signed-in devices</h3>
        <button type="button" className="btn btn-secondary" onClick={signOutEverywhere}>Sign out everywhere</button>
      </div>
      {loading ? <div className="loading">Loading…</div> : (
        <div className="session-list">
          {sessions.length === 0 ? <div className="empty-state">No devices found</div> : sessions.map((session) => {
            const Icon = session.platform === 'android' || session.platform === 'ios' ? Smartphone : Laptop;
            return (
              <div key={session.id} className="session-row">
                <Icon className="item-icon" aria-hidden />
                <div className="session-info">
                  <div className="session-name">
                    {session.deviceName}
                    {session.current ? <span className="status-badge active">This device</span> : null}
                  </div>
                  <div className="form-hint">
                    {session.kind === 'admin' ? 'Admin panel' : 'KinBech app'} · {session.ip || 'Unknown IP'} · Last active {formatWhen(session.lastSeenAt)}
                  </div>
                </div>
                <button type="button" className="action-btn small delete" onClick={() => revoke(session)}>Sign out</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Admin account security. `forced` renders only 2FA setup when the server requires it. */
export default function Security({ forced = false }) {
  const { user, logout } = useAuth();

  if (forced) {
    return (
      <div className="login-container">
        <div className="login-card security-forced">
          <div className="login-header">
            <img src={BRAND_ICON_SRC} alt="" className="login-logo" />
            <h1>Turn on two-step verification</h1>
            <p className="login-subtitle">{user?.email ? `${user.email} — ` : ''}admin accounts need a code from your phone to sign in.</p>
          </div>
          <TwoFactorCard />
          <div className="login-footer">
            <p>
              <button type="button" className="link-button" onClick={logout}>Sign out</button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="security-page">
      <div className="page-header">
        <div>
          <h2 className="page-title" style={{ margin: 0 }}>My security</h2>
          <p className="page-subtitle" style={{ marginTop: 4 }}>Two-step verification and the devices signed in to your account.</p>
        </div>
      </div>
      <div className="security-grid">
        <TwoFactorCard />
        <SessionsCard />
      </div>
    </div>
  );
}
