import { useEffect, useState } from 'react';
import { getApiBaseUrlCandidates } from '../config/apiUrl';
import { api, getAuthToken } from '../services/api';

function resolveCategoryImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const parsed = new URL(trimmed);
      if (parsed.pathname.startsWith('/uploads/')) {
        path = parsed.pathname;
      } else {
        return trimmed;
      }
    }
  } catch {
    /* ignore */
  }
  const base = (
    process.env.EXPO_PUBLIC_API_URL
    || getApiBaseUrlCandidates()?.[0]
    || 'http://127.0.0.1:5001'
  ).replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

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

export const FALLBACK_PRODUCT_CATEGORIES = [
  { label: 'Mobiles', icon: 'phone-portrait-outline', color: '#5B39C6', tint: '#5B39C6' },
  { label: 'Laptops', icon: 'laptop-outline', color: '#16A34A', tint: '#16A34A' },
  { label: 'Electronics', icon: 'headset-outline', color: '#DB2777', tint: '#DB2777' },
  { label: 'Furniture', icon: 'bed-outline', color: '#059669', tint: '#059669' },
  { label: 'Vehicles', icon: 'car-outline', color: '#4F46E5', tint: '#4F46E5' },
  { label: 'Fashion', icon: 'shirt-outline', color: '#EC4899', tint: '#EC4899' },
  { label: 'Sports & Fitness', icon: 'barbell-outline', color: '#0D9488', tint: '#0D9488' },
];

export const FALLBACK_SHOP_CATEGORIES = [
  { label: 'Grocery & Kirana', icon: 'basket-outline', color: '#5B39C6', tint: '#5B39C6', description: 'Daily essentials, grains, spices' },
  { label: 'Electronics', icon: 'hardware-chip-outline', color: '#16A34A', tint: '#16A34A', description: 'Mobiles, laptops, appliances' },
  { label: 'Clothing & Fashion', icon: 'shirt-outline', color: '#DB2777', tint: '#DB2777', description: 'Men, women, kids clothing' },
  { label: 'Furniture & Home', icon: 'home-outline', color: '#059669', tint: '#059669', description: 'Furniture, home decor, kitchen' },
  { label: 'Medical & Pharmacy', icon: 'medkit-outline', color: '#4F46E5', tint: '#4F46E5', description: 'Medicines, health products' },
  { label: 'Food & Restaurant', icon: 'restaurant-outline', color: '#DC2626', tint: '#DC2626', description: 'Food items, restaurants, cafes' },
  { label: 'Books & Stationery', icon: 'book-outline', color: '#0D9488', tint: '#0D9488', description: 'Books, school supplies, office' },
  { label: 'Sports & Fitness', icon: 'bicycle-outline', color: '#2563EB', tint: '#2563EB', description: 'Sports equipment, gym gear' },
  { label: 'Automotive', icon: 'car-outline', color: '#7C3AED', tint: '#7C3AED', description: 'Vehicle parts, accessories' },
  { label: 'Beauty & Personal Care', icon: 'flower-outline', color: '#EC4899', tint: '#EC4899', description: 'Cosmetics, personal care' },
  { label: 'Jewelry & Accessories', icon: 'diamond-outline', color: '#D97706', tint: '#D97706', description: 'Jewelry, watches, accessories' },
  { label: 'Hardware & Tools', icon: 'construct-outline', color: '#64748B', tint: '#64748B', description: 'Construction tools, hardware' },
  { label: 'Pet Supplies', icon: 'paw-outline', color: '#CA8A04', tint: '#CA8A04', description: 'Pet food, accessories' },
  { label: 'Toys & Games', icon: 'game-controller-outline', color: '#EA580C', tint: '#EA580C', description: 'Toys, games, entertainment' },
  { label: 'Other', icon: 'ellipsis-horizontal-outline', color: '#6B7280', tint: '#6B7280', description: 'Other business types' },
];

export function mapApiCategory(item) {
  const rawImage = item.imageUrl || item.imageUrlFull || '';
  return {
    id: item.id,
    label: item.name,
    icon: item.icon || 'pricetag-outline',
    imageUrl: resolveCategoryImageUrl(rawImage),
    color: item.color || '#5B39C6',
    tint: item.color || '#5B39C6',
    description: item.description || '',
  };
}

const categoriesMemory = {};
const categoryListeners = new Set();
/** @type {{ name: string, count: number }[] | null} */
let userCategoryRank = null;
let userCategoryRankPromise = null;

function emitCategories(type) {
  categoryListeners.forEach((fn) => fn(type));
}

export function orderCategoriesForUser(list) {
  if (!userCategoryRank?.length || !list?.length) return list;
  const score = new Map(userCategoryRank.map((row, index) => [row.name, userCategoryRank.length - index]));
  return list
    .map((item, index) => ({ item, index, score: score.get(item.label) || 0 }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((row) => row.item);
}

export function getUserTopCategory() {
  return userCategoryRank?.[0]?.name || '';
}

export function noteUserListedCategory(name) {
  const label = String(name || '').trim();
  if (!label) return;
  const rows = (userCategoryRank || []).map((row) => ({ ...row }));
  const found = rows.find((row) => row.name === label);
  if (found) found.count += 1;
  else rows.push({ name: label, count: 1 });
  rows.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  userCategoryRank = rows;
  emitCategories('product');
}

export function refreshUserCategoryRank({ force = false } = {}) {
  if (!getAuthToken()) return Promise.resolve(userCategoryRank || []);
  if (!force && userCategoryRank) return Promise.resolve(userCategoryRank);
  if (!force && userCategoryRankPromise) return userCategoryRankPromise;
  userCategoryRankPromise = (async () => {
    const { data, error } = await api.getMyCategoryUsage();
    userCategoryRankPromise = null;
    if (error) return userCategoryRank || [];
    userCategoryRank = (data?.categories || [])
      .filter((row) => row?.name)
      .map((row) => ({ name: row.name, count: Number(row.count) || 0 }));
    emitCategories('product');
    return userCategoryRank;
  })();
  return userCategoryRankPromise;
}

/** Moves the category named `label` to the front; `fallback` is used when the list lacks it. */
export function withCategoryFirst(list, label, fallback = null) {
  if (!label) return list;
  const found = list.find((item) => item.label === label) || fallback;
  if (!found) return list;
  return [found, ...list.filter((item) => item.label !== label)];
}

export function upsertCategoryMemory(type, category) {
  if (!category?.label) return;
  const current = categoriesMemory[type] || [];
  const index = current.findIndex((item) => item.label === category.label);
  const next = index >= 0
    ? current.map((item, i) => (i === index ? { ...item, ...category } : item))
    : [...current, category];
  categoriesMemory[type] = next;
  emitCategories(type);
}

const categoriesSettled = {};

/** False only until the first category fetch for `type` finishes (success or failure). */
export function categoriesLoaded(type = 'product') {
  return Boolean(categoriesMemory[type]?.length || categoriesSettled[type]);
}

export async function refreshCategories(type = 'product') {
  const { data, error } = await api.getCategories(type);
  categoriesSettled[type] = true;
  if (error) return [];
  const list = normalizeCategoriesResponse(data, type).map(mapApiCategory);
  if (list.length) {
    categoriesMemory[type] = list;
    emitCategories(type);
  }
  return list;
}

export function useCategories(type = 'product') {
  const fallback = type === 'shop' ? FALLBACK_SHOP_CATEGORIES : FALLBACK_PRODUCT_CATEGORIES;
  const [categories, setCategories] = useState(() => categoriesMemory[type] || fallback);

  useEffect(() => {
    let active = true;
    if (categoriesMemory[type]?.length) {
      setCategories(categoriesMemory[type]);
    }
    (async () => {
      const list = await refreshCategories(type);
      if (!active) return;
      if (!list.length) {
        setCategories((current) => [...current]);
        return;
      }
      setCategories(list);
    })();
    if (type === 'product') refreshUserCategoryRank();
    const onChange = (changedType) => {
      if (changedType && changedType !== type) return;
      if (categoriesMemory[type]?.length) setCategories([...categoriesMemory[type]]);
    };
    categoryListeners.add(onChange);
    return () => {
      active = false;
      categoryListeners.delete(onChange);
    };
  }, [type]);

  return type === 'product' ? orderCategoriesForUser(categories) : categories;
}

/** `interests`: category names this buyer engages with most, strongest first. */
export function mergeSidebarCategories(presets, counts, allOption, interests = [], { hideEmpty = false, keep = [] } = {}) {
  const fromData = Object.keys(counts).map((label) => {
    const preset = presets.find((c) => c.label === label);
    return {
      label,
      icon: preset?.icon || 'pricetag-outline',
      tint: preset?.tint || preset?.color || '#F59E0B',
      imageUrl: preset?.imageUrl || '',
      count: counts[label],
    };
  }).sort((a, b) => b.count - a.count);

  const merged = [...fromData];
  for (const preset of presets) {
    if (hideEmpty && !keep.includes(preset.label)) continue;
    if (!merged.find((c) => c.label === preset.label)) {
      merged.push({ ...preset, count: 0 });
    }
  }
  if (interests.length) {
    const rank = new Map(interests.map((name, index) => [name, index]));
    const rankOf = (item) => (rank.has(item.label) ? rank.get(item.label) : Infinity);
    merged.sort((a, b) => {
      const diff = rankOf(a) - rankOf(b);
      return Number.isNaN(diff) ? 0 : diff;
    });
    merged.unshift(allOption);
    return merged;
  }
  merged.unshift(allOption);
  const top = getUserTopCategory();
  if (top) {
    const index = merged.findIndex((item, i) => i > 0 && item.label === top);
    if (index > 1) {
      const [item] = merged.splice(index, 1);
      merged.splice(1, 0, item);
    }
  }
  return merged;
}
