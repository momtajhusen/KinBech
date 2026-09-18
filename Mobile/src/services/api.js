import { getApiBaseUrlCandidates } from '../config/apiUrl';

let authToken = null;
let workingBaseUrl = null;

export function setAuthToken(token) {
  authToken = token || null;
}

export function getAuthToken() {
  return authToken;
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
  const signal = controller ? controller.signal : undefined;
  let timeoutId = null;
  let timedOut = false;

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
    const response = await fetch(url, { ...options, signal });
    return { response, timedOut: false };
  } catch (err) {
    throw new Error(timedOut ? 'Request timeout' : (err?.message || 'Network request failed'));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function tryUrlOnce({ baseUrl, path, options, extraHeaders, timeoutMs }) {
  const url = safeUrl(baseUrl, path);
  const isFormData =
    typeof FormData !== 'undefined' && options?.body && options.body instanceof FormData;

  const headers = {
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
  console.log('API Response Status:', response.status, 'via', baseUrl);

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorMsg = data?.message || 'Request failed';
    return {
      ok: false,
      isNetwork: false,
      status: response.status,
      data,
      error: errorMsg,
      baseUrl,
    };
  }

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
  const { headers: extraHeaders, timeoutMs: overrideTimeout, ...rest } = options;
  const initialTimeoutMs = overrideTimeout || 8000;

  let lastData = null;
  let lastNonNetworkError = null;

  for (let pass = 0; pass < 1; pass++) {
    const candidates = buildCandidates();
    if (pass === 0) {
      console.log('API Request start:', path, ' candidates:', candidates);
    } else {
      console.log('API retry pass:', pass + 1, '- refreshing candidates');
      if (workingBaseUrl) resetCachedBaseUrl();
    }

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
          console.log(`[${label}] POST/GET ${baseUrl}${path}`);
          const result = await tryUrlOnce({
            baseUrl,
            path,
            options: rest,
            extraHeaders,
            timeoutMs,
          });

          if (result.ok) {
            if (workingBaseUrl !== baseUrl) {
              workingBaseUrl = baseUrl;
              console.log('Cached working API base URL:', baseUrl);
            }
            console.log('API Success:', result.data);
            return { data: result.data, error: null };
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
          const isLastOfAll =
            pass === 1 && cIdx === candidates.length - 1 && attempt === attemptsPerUrl - 1;
          if (isLastOfAll) {
            return { data: result.data, error: result.error };
          }
          break;
        } catch (rawErr) {
          const msg = rawErr?.message || 'Network request failed';
          console.log(`[${label}] failed:`, msg);

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
            if (pass === 0) {
              console.log('All candidates failed in first pass; will refresh candidates and retry');
              break;
            }
            return {
              data: lastData,
              error:
                'Cannot reach the server. Please check your network connection or try again in a moment.',
            };
          }

          lastNonNetworkError = msg;
          const isLastOfAllNonNet =
            pass === 1 && cIdx === candidates.length - 1 && attempt === attemptsPerUrl - 1;
          if (isLastOfAllNonNet) {
            return { data: lastData, error: msg };
          }
          break;
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
    request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  signup: (payload) =>
    request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
  verifyOtp: (payload) =>
    request('/auth/otp', { method: 'POST', body: JSON.stringify(payload) }),
  completeSignup: (payload) =>
    request('/auth/complete-signup', { method: 'POST', body: JSON.stringify(payload) }),
  me: () => request('/auth/me'),
  updateMe: (payload) =>
    request('/auth/me', { method: 'PATCH', body: JSON.stringify(payload) }),
  updateProfile: (payload) =>
    request('/auth/me', { method: 'PATCH', body: JSON.stringify({ ...payload, profileComplete: true }) }),
  uploadMedia: (formData, folder = 'misc') =>
    request(`/media/upload?folder=${encodeURIComponent(folder)}`, {
      method: 'POST',
      body: formData,
      timeoutMs: 60000,
    }),
  getListings: (params = {}) => request(`/listings${toQuery(params)}`),
  searchListings: (params = {}) => request(`/listings/search${toQuery(params)}`),
  getMyListings: () => request('/listings/mine'),
  getMyPurchases: () => request('/listings/purchases'),
  getListing: (id, loc) => {
    const params = {};
    if (loc?.lat != null) params.lat = loc.lat;
    if (loc?.lng != null) params.lng = loc.lng;
    return request(`/listings/${id}${toQuery(params)}`);
  },
  createListing: (payload) =>
    request('/listings', { method: 'POST', body: JSON.stringify(payload) }),
  updateListing: (id, payload) =>
    request(`/listings/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteListing: (id) => request(`/listings/${id}`, { method: 'DELETE' }),
  getChats: () => request('/chats'),
  createChat: (payload) =>
    request('/chats', { method: 'POST', body: JSON.stringify(payload) }),
  getMessages: (chatId) => request(`/chats/${chatId}/messages`),
  sendMessage: (chatId, text) =>
    request(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  confirmMeetup: (chatId, payload = {}) =>
    request(`/chats/${chatId}/meetup`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getWishlist: () => request('/wishlist'),
  toggleWishlist: (listingId) =>
    request('/wishlist', {
      method: 'POST',
      body: JSON.stringify({ listingId }),
    }),
  updatePreferences: (payload) =>
    request('/auth/preferences', { method: 'PATCH', body: JSON.stringify(payload) }),
  getNotifications: () => request('/notifications'),
  markNotificationRead: (id) =>
    request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request('/notifications/read-all', { method: 'PATCH' }),
  createReport: (payload) =>
    request('/reports', { method: 'POST', body: JSON.stringify(payload) }),
  blockUser: (userId) =>
    request(`/reports/users/${userId}/block`, { method: 'POST' }),
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
  searchSellers: (params = {}) => request(`/sellers/search${toQuery(params)}`),
  getFeaturedSellers: (params = {}) => request(`/sellers/featured${toQuery(params)}`),
  getPopularSellers: (params = {}) => request(`/sellers/popular${toQuery(params)}`),
  getNearbySellers: (params = {}) => request(`/sellers/nearby${toQuery(params)}`),
  
  // Shop APIs
  createShop: (payload) =>
    request('/shops', { method: 'POST', body: JSON.stringify(payload) }),
  getMyShop: () => request('/shops/mine'),
  getMyShopAnalytics: (period = '30d') => request(`/shops/mine/analytics${toQuery({ period })}`),
  getMyShopStorefront: () => request('/shops/mine/storefront'),
  getMapNearby: (params = {}) => request(`/map/nearby${toQuery(params)}`),
  getShopById: (shopId) => request(`/shops/${shopId}`),
  updateShop: (shopId, payload) =>
    request(`/shops/${shopId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getShopListings: (shopId) => request(`/shops/${shopId}/listings`),
  getShopReviews: (shopId) => request(`/shops/${shopId}/reviews`),
  getAllShops: (params = {}) => request(`/shops${toQuery(params)}`),
  getCategories: (type) => request(`/categories${toQuery(type ? { type } : {})}`),
};

export default api;
