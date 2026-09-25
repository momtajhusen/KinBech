import axios from 'axios';
import { API_BASE } from '../../config';
import { adminPath } from '../routes';
import { reportClientError } from '../../utils/errorReporting';

const api = axios.create({
  baseURL: API_BASE || undefined,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      window.location.href = adminPath('login');
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
          path: error.config?.url || '',
          method: error.config?.method || '',
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
