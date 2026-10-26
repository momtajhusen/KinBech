import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { adminPath } from '../routes';
import { BRAND_TAGLINE } from '../../content/brand';
import { BRAND_ICON_SRC } from '../../content/brandAssets';
import Turnstile from '../../components/Turnstile';

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
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <img src={BRAND_ICON_SRC} alt="" className="login-logo" />
            <h1>Two-step verification</h1>
            <p className="login-subtitle">
              Enter the 6-digit code from your authenticator app, or one of your backup codes.
            </p>
          </div>
          {error && <div className="error-message">{error}</div>}
          <form onSubmit={handleCode} className="login-form">
            <div className="form-group">
              <label htmlFor="code">Verification code</label>
              <div className="input-wrapper">
                <ShieldCheck className="input-icon" aria-hidden />
                <input
                  id="code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  required
                  autoFocus
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={11}
                  className="form-input"
                />
              </div>
            </div>
            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? 'Checking...' : 'Verify'}
            </button>
          </form>
          <div className="login-footer">
            <p>
              <button type="button" className="link-button" onClick={() => { setChallenge(''); setError(''); }}>
                Use a different account
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="login-container">
      <button 
        className="login-theme-toggle" 
        onClick={toggleTheme}
        title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
      >
        {theme === 'light' ? <Moon className="item-icon" /> : <Sun className="item-icon" />}
      </button>
      <div className="login-card">
        <div className="login-header">
          <img src={BRAND_ICON_SRC} alt="" className="login-logo" />
          <h1>KinBech Admin</h1>
          <p className="login-tagline">{BRAND_TAGLINE}</p>
          <p className="login-subtitle">Sign in to access admin panel</p>
        </div>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <Mail className="input-icon" aria-hidden />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@company.com"
                className="form-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" aria-hidden />
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="form-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={togglePasswordVisibility}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="item-icon" /> : <Eye className="item-icon" />}
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
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
        <div className="login-footer">
          <p>Forgot password? <a href="#forgot">Reset here</a></p>
        </div>
      </div>
    </div>
  );
};

export default Login;