import axios from 'axios';
import { API_BASE } from '../../config';
import { adminPath } from '../routes';
import { reportClientError } from '../../utils/errorReporting';

const api = axios.create({
  baseURL: API_BASE || undefined,
  headers: {
    'Content-Type': 'application/json',
    'X-Token-Refresh': '1',
  },
});

export function clearAdminTokens() {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminRefreshToken');
}

let refreshInFlight = null;

/** One refresh at a time across parallel 401s. Resolves to the new access token or null. */
function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  const stale = localStorage.getItem('adminToken');
  refreshInFlight = (async () => {
    const refreshToken = localStorage.getItem('adminRefreshToken');
    if (!refreshToken) return null;
    try {
      const { data } = await axios.post(
        `${API_BASE || ''}/auth/refresh`,
        { refreshToken },
        { headers: { 'Content-Type': 'application/json', 'X-Token-Refresh': '1' } },
      );
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminRefreshToken', data.refreshToken);
      return data.token;
    } catch (error) {
      // Another tab refreshed first; it already stored the new pair.
      if (error.response?.data?.code === 'REFRESH_RACE') {
        const latest = localStorage.getItem('adminToken');
        return latest && latest !== stale ? latest : null;
      }
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('adminToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (typeof config.headers?.delete === 'function') {
        config.headers.delete('Content-Type');
      } else {
        delete config.headers['Content-Type'];
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => {
    if (response.data?.refreshToken) {
      localStorage.setItem('adminRefreshToken', response.data.refreshToken);
    }
    return response;
  },
  async (error) => {
    const code = error.response?.data?.code;
    const original = error.config || {};
    // Wrong password / 2FA code: let the login form show the message instead of reloading.
    const isLoginCall = String(original.url || '').includes('/auth/admin/login');
    if (code === 'TOKEN_EXPIRED' && !original._retried) {
      const token = await refreshAccessToken();
      if (token) {
        original._retried = true;
        original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
        return api(original);
      }
    }
    if (isLoginCall) {
      // fall through to reject
    } else if (error.response?.status === 401 || code === 'ACCOUNT_SUSPENDED') {
      clearAdminTokens();
      window.location.href = adminPath('login');
    } else if (code === 'PASSWORD_CHANGE_REQUIRED' || code === 'TWO_FACTOR_SETUP_REQUIRED') {
      // Reload so the auth gate shows the change-password screen.
      window.location.href = adminPath('dashboard');
    } else if (!error.response || error.response.status >= 500) {
      const token = localStorage.getItem('adminToken');
      reportClientError(
        {
          source: 'admin',
          message: error.response?.data?.message || error.message || 'Admin API error',
          stack: error.stack || '',
          name: error.name || 'ApiError',
          severity: 'error',
          statusCode: error.response?.status || 0,
          path: original.url || '',
          method: original.method || '',
          extra: {
            responseData: error.response?.data || null,
          },
        },
        { token }
      );
    }
    return Promise.reject(error);
  },
);

export default api;
