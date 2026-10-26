import { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { BRAND_ICON_SRC } from '../../content/brandAssets';

/** Mirrors adminPasswordProblem in Backend/src/controllers/authController.js. */
const WEAK_WORDS = ['admin123', 'password', 'kinbech', '12345678', 'qwerty'];

function passwordRules(email) {
  const local = String(email || '').split('@')[0].toLowerCase();
  return [
    { test: (value) => value.length >= 10, label: 'At least 10 characters' },
    { test: (value) => /[a-z]/i.test(value) && /\d/.test(value), label: 'Letters and numbers' },
    ...(local.length >= 4
      ? [{ test: (value) => value.length > 0 && !value.toLowerCase().includes(local), label: `Does not contain "${local}"` }]
      : []),
    { test: (value) => value.length > 0 && !WEAK_WORDS.some((word) => value.toLowerCase().includes(word)), label: 'No common words (password, kinbech, 12345678...)' },
  ];
}

const ChangePassword = () => {
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update password');
    } finally {
      setLoading(false);
    }
  };

  const inputType = showPassword ? 'text' : 'password';
  const rules = passwordRules(user?.email);

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <img src={BRAND_ICON_SRC} alt="" className="login-logo" />
          <h1>Set a new password</h1>
          <p className="login-subtitle">
            {user?.email ? `${user.email} — ` : ''}
            choose your own password before using the admin panel.
          </p>
        </div>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="currentPassword">Current or temporary password</label>
            <div className="input-wrapper">
              <Lock className="input-icon" aria-hidden />
              <input
                type={inputType}
                id="currentPassword"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="form-input"
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
              >
                {showPassword ? <EyeOff className="item-icon" /> : <Eye className="item-icon" />}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="newPassword">New password</label>
            <div className="input-wrapper">
              <ShieldCheck className="input-icon" aria-hidden />
              <input
                type={inputType}
                id="newPassword"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="form-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm new password</label>
            <div className="input-wrapper">
              <ShieldCheck className="input-icon" aria-hidden />
              <input
                type={inputType}
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="form-input"
              />
            </div>
          </div>
          <ul className="password-rules">
            {rules.map((rule) => (
              <li key={rule.label} className={rule.test(newPassword) ? 'is-met' : ''}>
                {rule.test(newPassword) ? '✓' : '•'} {rule.label}
              </li>
            ))}
          </ul>
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Saving...' : 'Save new password'}
          </button>
        </form>
        <div className="login-footer">
          <p>
            Not you?{' '}
            <button type="button" className="link-button" onClick={logout}>
              Sign out
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default ChangePassword;
