import { createContext, useContext, useState, useEffect } from 'react';
import api, { clearAdminTokens } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      try {
        const response = await api.get('/auth/me');
        // Older sign-ins get a device-session token back once.
        if (response.data.token) localStorage.setItem('adminToken', response.data.token);
        setUser(response.data.user);
      } catch (error) {
        clearAdminTokens();
      }
    }
    setLoading(false);
  };

  const saveSession = (data) => {
    localStorage.setItem('adminToken', data.token);
    localStorage.setItem('adminLastActive', String(Date.now()));
    setUser(data.user);
  };

  /** Returns `{ twoFactorRequired, challenge }` when a code is still needed. */
  const login = async (email, password, captchaToken = '') => {
    const response = await api.post('/auth/admin/login', {
      email,
      password,
      ...(captchaToken ? { captchaToken } : {}),
    });
    if (response.data.twoFactorRequired) return response.data;
    saveSession(response.data);
    return response.data;
  };

  const verifyTwoFactor = async (challenge, code) => {
    const response = await api.post('/auth/admin/login/2fa', { challenge, code });
    saveSession(response.data);
    return response.data;
  };

  const changePassword = async (currentPassword, newPassword) => {
    const response = await api.post('/auth/admin/change-password', { currentPassword, newPassword });
    // Older tokens are revoked by the change; keep the fresh one.
    localStorage.setItem('adminToken', response.data.token);
    setUser(response.data.user);
    return response.data;
  };

  const logout = () => {
    const token = localStorage.getItem('adminToken');
    // Pass the header directly: the interceptor runs after the token is removed below.
    if (token) api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${token}` } }).catch(() => {});
    clearAdminTokens();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, verifyTwoFactor, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
