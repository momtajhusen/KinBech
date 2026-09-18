import { apiUrl } from '../config';

/** Normalize API shapes: { categories }, { product, shop }, or bare array */
export function normalizeCategoriesResponse(data, type = 'product') {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.categories)) {
    if (!type) return data.categories;
    return data.categories.filter((c) => !c.type || c.type === type);
  }
  if (type === 'shop' && Array.isArray(data.shop)) return data.shop;
  if (type === 'product' && Array.isArray(data.product)) return data.product;
  return [];
}

export function resolveCategoryImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/uploads/')) {
        return apiUrl(parsed.pathname);
      }
      return trimmed;
    }
  } catch {
    /* ignore */
  }
  return apiUrl(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
}
