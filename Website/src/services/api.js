import { apiUrl } from '../config';

function toQuery(params = {}) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== '' && v !== 'All',
  );
  if (!entries.length) return '';
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

async function request(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    headers: { Accept: 'application/json', ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  getListings: (params) => request(`/listings${toQuery(params)}`),
  searchListings: (params) => request(`/listings/search${toQuery(params)}`),
  getCategoryCounts: (params) => request(`/listings/category-counts${toQuery(params)}`),
  getListing: (id) => request(`/listings/${id}`),

  getFeaturedSellers: (params) => request(`/sellers/featured${toQuery(params)}`),
  getPopularSellers: (params) => request(`/sellers/popular${toQuery(params)}`),
  getNearbySellers: (params) => request(`/sellers/nearby${toQuery(params)}`),
  searchSellers: (params) => request(`/sellers/search${toQuery(params)}`),
  getSeller: (id, params) => request(`/sellers/${id}${toQuery(params)}`),

  getShopListings: (shopId, params) => request(`/shops/${shopId}/listings${toQuery(params)}`),

  getCategories: (type) => request(`/categories${type ? `?type=${type}` : ''}`),
  getMapNearby: (params) => request(`/map/nearby${toQuery(params)}`),
};
