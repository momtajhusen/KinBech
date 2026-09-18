import { useEffect, useState } from 'react';
import { getApiBaseUrlCandidates } from '../config/apiUrl';
import { api } from '../services/api';

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
  { label: 'Furniture', icon: 'file-tray-stacked-outline', color: '#059669', tint: '#059669' },
  { label: 'Vehicles', icon: 'car-outline', color: '#4F46E5', tint: '#4F46E5' },
  { label: 'Fashion', icon: 'shirt-outline', color: '#EC4899', tint: '#EC4899' },
  { label: 'Sports & Fitness', icon: 'bicycle-outline', color: '#0D9488', tint: '#0D9488' },
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

export function useCategories(type = 'product') {
  const fallback = type === 'shop' ? FALLBACK_SHOP_CATEGORIES : FALLBACK_PRODUCT_CATEGORIES;
  const [categories, setCategories] = useState(fallback);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await api.getCategories(type);
      if (!active || error) return;
      const list = normalizeCategoriesResponse(data, type).map(mapApiCategory);
      if (list.length) setCategories(list);
    })();
    return () => {
      active = false;
    };
  }, [type]);

  return categories;
}

export function mergeSidebarCategories(presets, counts, allOption) {
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
    if (!merged.find((c) => c.label === preset.label)) {
      merged.push({ ...preset, count: 0 });
    }
  }
  merged.unshift(allOption);
  return merged;
}
