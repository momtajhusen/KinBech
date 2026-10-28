import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { adminPath } from '../routes';
import { BRAND_TAGLINE } from '../../content/brand';
import { BRAND_ICON_SRC } from '../../content/brandAssets';
import Turnstile from '../../components/Turnstile';
import MIcon from '../components/MIcon';

const HIGHLIGHTS = [
  { icon: 'fact_check', title: 'Review listings', text: 'Approve, fix or remove new posts quickly.' },
  { icon: 'verified_user', title: 'Verify shops', text: 'Check documents and give the trusted badge.' },
  { icon: 'support_agent', title: 'Help people', text: 'Answer support chats, reports and calls.' },
  { icon: 'monitoring', title: 'Watch the platform', text: 'Live numbers, alerts and error logs.' },
];

function LoginShell({ theme, toggleTheme, children }) {
  return (
    <div className="login-container login-clay">
      <span className="login-blob blob-a" aria-hidden="true" />
      <span className="login-blob blob-b" aria-hidden="true" />
      <span className="login-blob blob-c" aria-hidden="true" />

      <button
        type="button"
        className="login-theme-toggle"
        onClick={toggleTheme}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
        aria-label="Toggle theme"
      >
        <MIcon key={theme} name={theme === 'light' ? 'dark_mode' : 'light_mode'} className="theme-icon" />
      </button>

      <div className="login-stage">
        <section className="login-showcase" aria-hidden="true">
          <div className="login-brand">
            <img src={BRAND_ICON_SRC} alt="" className="login-brand-mark" />
            <div>
              <div className="login-brand-name">KinBech</div>
              <div className="login-brand-tag">{BRAND_TAGLINE}</div>
            </div>
          </div>

          <h2 className="login-hero">
            Keep Nepal&apos;s local marketplace <span>safe and moving.</span>
          </h2>
          <p className="login-hero-sub">
            One place to look after listings, shops, sellers and buyers, from first post to final meetup.
          </p>

          <ul className="login-highlights">
            {HIGHLIGHTS.map((item) => (
              <li key={item.icon}>
                <span className="login-hl-icon"><MIcon name={item.icon} filled /></span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.text}</small>
                </span>
              </li>
            ))}
          </ul>

          <div className="login-float float-a">
            <span className="login-float-dot" />
            Live activity
          </div>
          <div className="login-float float-b">
            <MIcon name="encrypted" filled />
            2-step sign-in
          </div>
        </section>

        <div className="login-card">{children}</div>
      </div>
    </div>
  );
}

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState('');
  const [code, setCode] = useState('');
  const [captchaSiteKey, setCaptchaSiteKey] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const { login, verifyTwoFactor } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password, captchaToken);
      setCaptchaSiteKey('');
      setCaptchaToken('');
      if (result.twoFactorRequired) {
        setChallenge(result.challenge);
        setCode('');
        return;
      }
      navigate(adminPath('dashboard'));
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'CAPTCHA_REQUIRED') {
        // Turnstile tokens are single use; a fresh widget renders for the next try.
        setCaptchaToken('');
        setCaptchaSiteKey('');
        setTimeout(() => setCaptchaSiteKey(data.siteKey || ''), 0);
      }
      setError(data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCode = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyTwoFactor(challenge, code);
      navigate(adminPath('dashboard'));
    } catch (err) {
      const data = err.response?.data;
      if (data?.code === 'CHALLENGE_EXPIRED') setChallenge('');
      setError(data?.message || 'Could not verify the code');
    } finally {
      setLoading(false);
    }
  };

  if (challenge) {
    return (
      <LoginShell theme={theme} toggleTheme={toggleTheme}>
        <div className="login-header">
          <span className="login-head-icon"><MIcon name="shield_lock" filled /></span>
          <span className="login-eyebrow"><MIcon name="encrypted" filled /> Step 2 of 2</span>
          <h1>Two-step verification</h1>
          <p className="login-subtitle">
            Enter the 6-digit code from your authenticator app, or one of your backup codes.
          </p>
        </div>
        {error && <div className="error-message" key={error}><MIcon name="error" filled />{error}</div>}
        <form onSubmit={handleCode} className="login-form">
          <div className="form-group">
            <label htmlFor="code">Verification code</label>
            <div className="input-wrapper">
              <MIcon name="pin" className="input-icon" />
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123 456"
                maxLength={11}
                className="form-input login-code-input"
              />
            </div>
          </div>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <span className="login-spinner" aria-hidden="true" /> : <MIcon name="verified" filled />}
            {loading ? 'Checking…' : 'Verify and continue'}
          </button>
        </form>
        <div className="login-footer">
          <button type="button" className="login-link" onClick={() => { setChallenge(''); setError(''); }}>
            <MIcon name="arrow_back" /> Use a different account
          </button>
        </div>
      </LoginShell>
    );
  }

  return (
    <LoginShell theme={theme} toggleTheme={toggleTheme}>
      <div className="login-header">
        <img src={BRAND_ICON_SRC} alt="" className="login-logo" />
        <span className="login-eyebrow"><MIcon name="admin_panel_settings" filled /> Admin console</span>
        <h1>Welcome back</h1>
        <p className="login-subtitle">Sign in with your admin email to manage KinBech.</p>
      </div>
      {error && <div className="error-message" key={error}><MIcon name="error" filled />{error}</div>}
      <form onSubmit={handleSubmit} className="login-form">
        <div className="form-group">
          <label htmlFor="email">Email address</label>
          <div className="input-wrapper">
            <MIcon name="mail" className="input-icon" />
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="you@kinbech.com"
              className="form-input"
            />
          </div>
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <div className="input-wrapper">
            <MIcon name="lock" className="input-icon" />
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              className="form-input"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <MIcon key={showPassword ? 'off' : 'on'} name={showPassword ? 'visibility_off' : 'visibility'} />
            </button>
          </div>
        </div>
        {captchaSiteKey && (
          <Turnstile
            siteKey={captchaSiteKey}
            theme={theme === 'light' ? 'light' : 'dark'}
            onToken={setCaptchaToken}
            onError={setError}
          />
        )}
        <button type="submit" className="login-btn" disabled={loading || (Boolean(captchaSiteKey) && !captchaToken)}>
          {loading ? <span className="login-spinner" aria-hidden="true" /> : null}
          {loading ? 'Signing in…' : 'Sign in'}
          {loading ? null : <MIcon name="arrow_forward" className="login-btn-arrow" />}
        </button>
      </form>
      <div className="login-footer">
        <p className="login-secure"><MIcon name="lock" filled /> Secure sign-in · every admin action is logged</p>
        <p>Forgot your password? Ask a super admin to reset it.</p>
      </div>
    </LoginShell>
  );
};

export default Login;
