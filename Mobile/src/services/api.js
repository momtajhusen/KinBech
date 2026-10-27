import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrlCandidates } from '../config/apiUrl';
import { reportMobileError } from '../utils/errorReporting';
import { readRefreshToken, readToken, writeRefreshToken, writeToken } from './tokenStorage';
import { withHumanCheck } from '../utils/humanCheck';

// OkHttp rejects non-ASCII header values.
function headerSafe(value, max = 80) {
  return String(value || '').replace(/[^\x20-\x7E]/g, '').trim().slice(0, max);
}

const DEVICE_HEADERS = (() => {
  const pc = Platform.constants || {};
  const androidName = [pc.Brand, pc.Model].filter(Boolean).join(' ');
  const name =
    (Platform.OS === 'android' ? androidName : '') ||
    Constants.deviceName ||
    (Platform.OS === 'ios' ? (Platform.isPad ? 'iPad' : 'iPhone') : Platform.OS);
  return {
    'X-Device-Name': headerSafe(name) || 'Phone',
    'X-Device-Platform': headerSafe(Platform.OS, 20),
    'X-App-Version': headerSafe(Constants.expoConfig?.version, 20),
    'X-Token-Refresh': '1',
  };
})();

// Random per-install id; lets the server link accounts that share one phone. Not tied to hardware.
const INSTALL_ID_KEY = 'kinbech_install_id';
let installId = '';
const installIdReady = AsyncStorage.getItem(INSTALL_ID_KEY)
  .then(async (stored) => {
    if (stored) {
      installId = stored;
      return;
    }
    const random = () => Math.random().toString(36).slice(2, 10);
    installId = `${Date.now().toString(36)}-${random()}${random()}`;
    await AsyncStorage.setItem(INSTALL_ID_KEY, installId);
  })
  .catch(() => {});

let authToken = null;
let workingBaseUrl = null;
let refreshToken = null;
let refreshLoaded = false;
let refreshInFlight = null;
const tokenListeners = new Set();

export function setAuthToken(token) {
  authToken = token || null;
  if (!token) {
    refreshToken = null;
    refreshLoaded = true;
  }
}

export function getAuthToken() {
  return authToken;
}

/** Called with the new access token after a silent refresh, or null when the session ended. */
export function onAuthTokenChange(listener) {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

function notifyToken(token) {
  tokenListeners.forEach((listener) => {
    try {
      listener(token);
    } catch {
      /* listener errors must not break requests */
    }
  });
}

function rememberRefreshToken(token) {
  if (!token) return;
  refreshToken = token;
  refreshLoaded = true;
  writeRefreshToken(token).catch(() => {});
}

async function currentRefreshToken() {
  if (!refreshLoaded) {
    refreshToken = (await readRefreshToken().catch(() => null)) || refreshToken;
    refreshLoaded = true;
  }
  return refreshToken;
}

const expiryCache = { token: null, exp: 0 };

function tokenExpiryMs(token) {
  if (expiryCache.token === token) return expiryCache.exp;
  let exp = 0;
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    exp = (JSON.parse(atob(padded)).exp || 0) * 1000;
  } catch {
    exp = 0;
  }
  expiryCache.token = token;
  expiryCache.exp = exp;
  return exp;
}

const SESSION_ENDED_CODES = new Set(['REFRESH_INVALID', 'REFRESH_REUSED', 'SESSION_EXPIRED', 'ACCOUNT_SUSPENDED']);

/** One refresh at a time; parallel 401s all wait for the same result. */
function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const staleAccess = authToken;
    const current = await currentRefreshToken();
    if (!current) return false;
    const result = await request('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken: current }),
      skipAuthRefresh: true,
      timeoutMs: 8000,
    });
    if (result.data?.token && result.data?.refreshToken) {
      authToken = result.data.token;
      await writeToken(result.data.token).catch(() => {});
      notifyToken(result.data.token);
      return true;
    }
    const code = result.data?.code;
    if (code === 'REFRESH_RACE') {
      // Another JS context (e.g. the call headless task) refreshed first.
      const [storedAccess, storedRefresh] = await Promise.all([readToken(), readRefreshToken()]);
      if (storedAccess && storedAccess !== staleAccess) {
        authToken = storedAccess;
        refreshToken = storedRefresh || refreshToken;
        notifyToken(storedAccess);
        return true;
      }
      return false;
    }
    if (SESSION_ENDED_CODES.has(code)) {
      authToken = null;
      refreshToken = null;
      notifyToken(null);
    }
    return false;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/** Refresh ahead of time when the access token is about to expire. */
export async function ensureFreshToken() {
  if (!authToken) return authToken;
  const exp = tokenExpiryMs(authToken);
  if (exp && exp - Date.now() < 60 * 1000 && (await currentRefreshToken())) {
    await refreshAccessToken();
  }
  return authToken;
}

export function getWorkingApiBaseUrl() {
  return workingBaseUrl;
}

export function resetCachedBaseUrl() {
  workingBaseUrl = null;
}

function toQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '' || value === 'All') {
      return;
    }
    search.set(key, String(value));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

/** Always send page/limit so listing list APIs stay paginated. */
function withListingPagination(params = {}) {
  const page = Math.max(1, parseInt(params.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, parseInt(params.limit, 10) || 20));
  return { ...params, page, limit };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkError(errorMessage) {
  if (!errorMessage) return false;
  const m = String(errorMessage).toLowerCase();
  return (
    m.includes('network request failed') ||
    m.includes('network error') ||
    m.includes('load failed') ||
    m.includes('timeout') ||
    m.includes('connection reset') ||
    m.includes('enotfound') ||
    m.includes('econnrefused') ||
    m.includes('etimedout') ||
    m.includes('eai_again') ||
    m.includes('abort') ||
    m.includes('socket hang up') ||
    m.includes('failed to fetch') ||
    m.includes('fetch failed') ||
    m.includes('connectexception')
  );
}

function isTransientHttpStatus(status) {
  if (!status) return false;
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status < 600);
}

function safeUrl(baseUrl, path) {
  const u = String(baseUrl || '').trim();
  const p = String(path || '').trim();
  const cleanBase = u.replace(/\/+$/, '');
  const cleanPath = p.startsWith('/') ? p : `/${p}`;
  return `${cleanBase}${cleanPath}`;
}

async function requestWithTimeout(url, options, timeoutMs) {
  const controller =
    typeof AbortController !== 'undefined' ? new AbortController() : null;
  const { signal: externalSignal, ...fetchOptions } = options || {};
  let timeoutId = null;
  let timedOut = false;
  let callerAborted = false;

  if (externalSignal && controller) {
    if (externalSignal.aborted) {
      callerAborted = true;
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', () => {
        callerAborted = true;
        try {
          controller.abort();
        } catch {
          /* noop */
        }
      }, { once: true });
    }
  }

  if (controller && timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      timedOut = true;
      try {
        controller.abort();
      } catch {
        /* noop */
      }
    }, timeoutMs);
  }

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller ? controller.signal : undefined,
    });
    return { response, timedOut: false };
  } catch (err) {
    if (callerAborted) {
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }
    throw new Error(timedOut ? 'Request timeout' : (err?.message || 'Network request failed'));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function tryUrlOnce({ baseUrl, path, options, extraHeaders, timeoutMs }) {
  const url = safeUrl(baseUrl, path);
  const isFormData =
    typeof FormData !== 'undefined' && options?.body && options.body instanceof FormData;

  await installIdReady;
  const headers = {
    ...DEVICE_HEADERS,
    ...(installId ? { 'X-Install-Id': installId } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(extraHeaders || {}),
  };
  // Let fetch set multipart boundary for FormData — never force JSON content-type.
  if (!isFormData && !headers['Content-Type'] && !headers['content-type']) {
    headers['Content-Type'] = 'application/json';
  }

  const { response } = await requestWithTimeout(
    url,
    {
      ...options,
      headers,
    },
    timeoutMs
  );
  if (!response.ok && typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('API Response Status:', response.status, 'via', baseUrl);
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = data?.message || 'Request failed';
    if (response.status >= 500) {
      reportMobileError(
        {
          message: errorMsg,
          name: 'ApiError',
          severity: 'error',
          statusCode: response.status,
          path,
          method: options?.method || 'GET',
          url: url,
          extra: { data },
        },
        { baseUrl, token: authToken }
      ).catch(() => {});
    }
    return {
      ok: false,
      isNetwork: false,
      status: response.status,
      data,
      error: errorMsg,
      baseUrl,
    };
  }

  // Login, /auth/me upgrade and /auth/refresh hand out a rotating refresh token.
  if (data?.refreshToken) rememberRefreshToken(data.refreshToken);

  return {
    ok: true,
    isNetwork: false,
    status: response.status,
    data,
    error: null,
    baseUrl,
  };
}

function buildCandidates() {
  const candidates = [];
  if (workingBaseUrl) candidates.push(workingBaseUrl);
  try {
    const detected = getApiBaseUrlCandidates();
    for (const c of detected) {
      if (!candidates.includes(c)) candidates.push(c);
    }
  } catch {
    const primary = process.env.EXPO_PUBLIC_API_URL || 'http://127.0.0.1:5001';
    if (!candidates.includes(primary)) candidates.push(primary);
  }
  return candidates;
}

async function request(path, options = {}) {
  const { headers: extraHeaders, timeoutMs: overrideTimeout, skipAuthRefresh, ...rest } = options;
  const initialTimeoutMs = overrideTimeout || 8000;
  if (!skipAuthRefresh) await ensureFreshToken();

  let lastData = null;
  let lastNonNetworkError = null;

  for (let pass = 0; pass < 1; pass++) {
    const candidates = buildCandidates();
    if (pass !== 0 && workingBaseUrl) resetCachedBaseUrl();

    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
      const baseUrl = candidates[cIdx];
      const isPrimary = cIdx === 0;
      const attemptsPerUrl = isPrimary ? 1 : 1;
      const baseTimeout = isPrimary ? initialTimeoutMs : 2000;

      for (let attempt = 0; attempt < attemptsPerUrl; attempt++) {
        const timeoutMs = baseTimeout + attempt * 1000 + (pass * 1000);
        const label =
          pass === 0 && cIdx === 0 && attempt === 0
            ? 'Request'
            : `[P${pass + 1}] Retry(${baseUrl}) a${attempt + 1}`;

        try {
          const result = await tryUrlOnce({
            baseUrl,
            path,
            options: rest,
            extraHeaders,
            timeoutMs,
          });

          if (result.ok) {
            if (workingBaseUrl !== baseUrl) workingBaseUrl = baseUrl;
            return { data: result.data, error: null };
          }

          if (
            !skipAuthRefresh &&
            result.status === 401 &&
            result.data?.code === 'TOKEN_EXPIRED' &&
            (await refreshAccessToken())
          ) {
            return request(path, { ...options, skipAuthRefresh: true });
          }

          lastData = result.data;

          if (isTransientHttpStatus(result.status) && attempt < attemptsPerUrl - 1) {
            const backoff = 400 * Math.pow(2, attempt) + Math.random() * 200;
            console.log(`Status ${result.status}; retrying same URL after ${Math.round(backoff)}ms`);
            await sleep(backoff);
            continue;
          }

          // Don't retry for 404 errors (endpoint not found)
          if (result.status === 404) {
            return { data: result.data, error: result.error || 'Not found' };
          }

          lastNonNetworkError = result.error;
          break;
        } catch (rawErr) {
          if (rawErr?.name === 'AbortError') {
            return { data: null, error: null, aborted: true };
          }
          const msg = rawErr?.message || 'Network request failed';
          console.log(`[${label}] failed:`, baseUrl, msg);

          const isNetErr = isNetworkError(msg);

          if (isNetErr) {
            if (workingBaseUrl === baseUrl) workingBaseUrl = null;
            if (cIdx < candidates.length - 1) {
              console.log(`Switching to next candidate URL: ${candidates[cIdx + 1]}`);
              break;
            }
            if (attempt < attemptsPerUrl - 1) {
              const backoff = 600 * Math.pow(2, attempt) + Math.random() * 400;
              console.log(`Network error; retrying same URL after ${Math.round(backoff)}ms`);
              await sleep(backoff);
              continue;
            }
            return {
              data: lastData,
              error:
                'Cannot reach the server. Check that the phone and computer are on the same Wi‑Fi, then try again.',
            };
          }

          lastNonNetworkError = msg;
          return { data: lastData, error: msg };
        }
      }
    }
  }

  return {
    data: lastData,
    error: lastNonNetworkError || 'Request failed after multiple attempts. Please try again shortly.',
  };
}

export const api = {
  login: (payload) =>
    withHumanCheck((extra) =>
      request('/auth/login', { method: 'POST', body: JSON.stringify({ ...payload, ...extra }) })
    ),
  signup: (payload) =>
    withHumanCheck((extra) =>
      request('/auth/signup', { method: 'POST', body: JSON.stringify({ ...payload, ...extra }) })
    ),
  verifyOtp: (payload) =>
    request('/auth/otp', { method: 'POST', body: JSON.stringify(payload) }),
  googleLogin: (payload) =>
    request('/auth/google', { method: 'POST', body: JSON.stringify(payload), timeoutMs: 15000 }),
  completeSignup: (payload) =>
    request('/auth/complete-signup', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/auth/me'),
  logoutAllDevices: () => request('/auth/logout-all', { method: 'POST' }),
  logout: (deviceToken = '') =>
    request('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ deviceToken }),
      timeoutMs: 4000,
      skipAuthRefresh: true,
    }),
  getSessions: () => request('/auth/sessions'),
  exportMyData: () => request('/auth/me/export', { timeoutMs: 30000 }),
  deleteAccount: () =>
    request('/auth/me/delete', { method: 'POST', body: JSON.stringify({ confirm: 'DELETE' }) }),
  revokeSession: (sessionId) =>
    request(`/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }),
  saveDeviceToken: (token) =>
    request('/auth/device-token', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),
  getReferral: () => request('/auth/referral'),
  applyReferral: (code) =>
    request('/auth/referral/apply', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),
  featureListing: (id) =>
    request(`/listings/${id}/feature`, { method: 'POST' }),
  updateMe: (payload) =>
    request('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  getSellerMode: () => request('/auth/me/seller-mode'),
  updateProfile: (payload) =>
    request('/auth/me', { method: 'PATCH', body: JSON.stringify({ ...payload, profileComplete: true }) }),
  uploadMedia: (formData, folder = 'misc') =>
    request(`/media/upload?folder=${encodeURIComponent(folder)}`, {
      method: 'POST',
      body: formData,
      timeoutMs: 60000,
    }),
  uploadMediaBase64: (payload) =>
    request('/media/upload-base64', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 90000,
    }),
  getListings: (params = {}) =>
    request(`/listings${toQuery(withListingPagination(params))}`),
  getRelatedListings: (params = {}) =>
    request(`/listings/related${toQuery(params)}`),
  searchListings: (params = {}, options = {}) =>
    request(`/listings/search${toQuery(withListingPagination(params))}`, options),
  getSearchSuggestions: (q) => request(`/listings/suggestions${toQuery({ q })}`),
  getCategoryCounts: (params = {}) =>
    request(`/listings/category-counts${toQuery(params)}`),
  getMyListings: () => request('/listings/mine'),
  getMyCategoryUsage: () => request('/listings/mine/categories'),
  getMyInterests: () => request('/listings/mine/interests'),
  getMyPurchases: () => request('/listings/purchases'),
  getListing: (id, loc) => {
    const params = {};
    if (loc?.lat != null) params.lat = loc.lat;
    if (loc?.lng != null) params.lng = loc.lng;
    return request(`/listings/${id}${toQuery(params)}`);
  },
  createListing: (payload) =>
    request('/listings', { method: 'POST', body: JSON.stringify(payload) }),
  suggestListingDetails: (payload) =>
    request('/ai/listing-suggest', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 60000,
    }),
  updateListing: (id, payload) =>
    request(`/listings/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteListing: (id) => request(`/listings/${id}`, { method: 'DELETE' }),
  confirmStillAvailable: (id, payload = {}) =>
    request(`/listings/${id}/still-available`, { method: 'POST', body: JSON.stringify(payload) }),
  updateListingStock: (id, payload) =>
    request(`/listings/${id}/stock`, { method: 'POST', body: JSON.stringify(payload) }),
  confirmAllStock: () => request('/listings/mine/confirm-stock', { method: 'POST' }),
  setDealOutcome: (chatId, outcome) =>
    request(`/chats/${chatId}/deal`, { method: 'POST', body: JSON.stringify({ outcome }) }),
  getChats: () => request('/chats'),
  createChat: (payload) =>
    request('/chats', { method: 'POST', body: JSON.stringify(payload) }),
  getMessages: (chatId, params = {}) => request(`/chats/${chatId}/messages${toQuery(params)}`),
  setTyping: (chatId, active) =>
    request(`/chats/${chatId}/typing`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    }),
  sendVoiceMessage: (chatId, { audioUrl, durationSec, replyTo }) =>
    request(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ kind: 'voice', audioUrl, durationSec, replyTo }),
    }),
  sendMessage: (chatId, text, extra = null) => {
    if (extra && typeof FormData !== 'undefined' && extra instanceof FormData) {
      return request(`/chats/${chatId}/messages`, {
        method: 'POST',
        body: extra,
        timeoutMs: 60000,
      });
    }
    return request(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text, replyTo: extra?.replyTo || undefined }),
    });
  },
  editMessage: (chatId, messageId, text) =>
    request(`/chats/${chatId}/messages/${messageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ text }),
    }),
  deleteMessage: (chatId, messageId, scope) =>
    request(`/chats/${chatId}/messages/${messageId}/delete`, {
      method: 'POST',
      body: JSON.stringify({ scope }),
    }),
  confirmMeetup: (chatId, payload = {}) =>
    request(`/chats/${chatId}/meetup`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  createCall: (chatId, { join = false } = {}) =>
    request(`/chats/${chatId}/call`, {
      method: 'POST',
      body: JSON.stringify({ join }),
    }),
  reportCallFailure: (chatId, { accountId, reason }) =>
    request(`/chats/${chatId}/call/failure`, {
      method: 'POST',
      body: JSON.stringify({ accountId, reason }),
    }),
  getIncomingCall: () => request('/chats/incoming-call'),
  getCallStatus: (chatId) => request(`/chats/${chatId}/call`),
  markCallDelivered: (chatId) =>
    request(`/chats/${chatId}/call/delivered`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  endCall: (chatId) =>
    request(`/chats/${chatId}/call/end`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  getWishlist: (params = {}) => request(`/wishlist${toQuery(params)}`),
  toggleWishlist: (listingId) =>
    request('/wishlist', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),
  updatePreferences: (payload) =>
    request('/auth/preferences', { method: 'PATCH', body: JSON.stringify(payload) }),
  getNotifications: (params) => request(`/notifications${toQuery(params || {})}`),
  markNotificationRead: (id) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: (scope) =>
    request('/notifications/read-all', { method: 'PATCH', body: JSON.stringify(scope || {}) }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
  clearNotifications: (scope) =>
    request('/notifications/clear', { method: 'POST', body: JSON.stringify(scope || {}) }),
  createReport: (payload) =>
    request('/reports', { method: 'POST', body: JSON.stringify(payload) }),
  blockUser: (userId, { messages = true, calls = true } = {}) =>
    request(`/reports/users/${userId}/block`, { method: 'POST', body: JSON.stringify({ messages, calls }) }),
  unblockUser: (userId) =>
    request(`/reports/users/${userId}/block`, { method: 'DELETE' }),
  getMyReports: () => request('/reports/my'),
  getBlockedUsers: () => request('/auth/blocked'),
  getAddresses: () => request('/auth/addresses'),
  createAddress: (payload) =>
    request('/auth/addresses', { method: 'POST', body: JSON.stringify(payload) }),
  updateAddress: (id, payload) =>
    request(`/auth/addresses/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteAddress: (id) => request(`/auth/addresses/${id}`, { method: 'DELETE' }),
  getPaymentMethods: () => request('/auth/payment-methods'),
  createPaymentMethod: (payload) =>
    request('/auth/payment-methods', { method: 'POST', body: JSON.stringify(payload) }),
  updatePaymentMethod: (id, payload) =>
    request(`/auth/payment-methods/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deletePaymentMethod: (id) => request(`/auth/payment-methods/${id}`, { method: 'DELETE' }),
  getWallet: () => request('/auth/wallet'),
  getSupportTickets: () => request('/auth/support'),
  createSupportTicket: (payload) =>
    request('/auth/support', { method: 'POST', body: JSON.stringify(payload) }),
  createReview: (payload) =>
    request('/reviews', { method: 'POST', body: JSON.stringify(payload) }),
  getUserReviews: (userId) => request(`/reviews/user/${userId}`),
  getMyReviews: () => request('/reviews/my'),
  
  // Seller/Store Discovery APIs
  getSellers: (params = {}) => request(`/sellers${toQuery(params)}`),
  getSeller: (sellerId) => request(`/sellers/${sellerId}`),
  searchSellers: (params = {}, options = {}) => request(`/sellers/search${toQuery(params)}`, options),
  getSellerCategoryCounts: () => request('/sellers/category-counts'),
  getFeaturedSellers: (params = {}) => request(`/sellers/featured${toQuery(params)}`),
  getPopularSellers: (params = {}) => request(`/sellers/popular${toQuery(params)}`),
  getNearbySellers: (params = {}) => request(`/sellers/nearby${toQuery(params)}`),

  // Pinned stores APIs
  getPinnedStores: (params = {}) => request(`/auth/pinned-stores${toQuery(params)}`),
  pinStore: (payload) =>
    request('/auth/pinned-stores', { method: 'POST', body: JSON.stringify(payload) }),
  recordPinnedView: (storeId) =>
    request(`/auth/pinned-stores/${storeId}/view`, { method: 'POST' }),
  unpinStore: (storeId) => request(`/auth/pinned-stores/${storeId}`, { method: 'DELETE' }),
  
  // Shop APIs
  createShop: (payload) =>
    request('/shops', { method: 'POST', body: JSON.stringify(payload) }),
  getMyShop: () => request('/shops/mine'),
  getMyShopCategories: () => request('/shops/mine/categories', { timeoutMs: 60000 }),
  getMyShopAnalytics: (period = '30d') => request(`/shops/mine/analytics${toQuery({ period })}`),
  getMyShopStorefront: () => request('/shops/mine/storefront'),
  getShopById: (shopId) => request(`/shops/${shopId}`),
  updateShop: (shopId, payload) =>
    request(`/shops/${shopId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getShopListings: (shopId, params = {}) => request(`/shops/${shopId}/listings${toQuery(params)}`),
  getShopReviews: (shopId) => request(`/shops/${shopId}/reviews`),
  getAllShops: (params = {}) => request(`/shops${toQuery(params)}`),
  getCategories: (type) => request(`/categories${toQuery(type ? { type } : {})}`),
};

export default api;
