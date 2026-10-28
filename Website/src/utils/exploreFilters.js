export const CONDITIONS = ['All', 'New', 'Good', 'Fair'];

export const DISTANCES = [
  { label: 'Any', value: '' },
  { label: '1 km', value: '1' },
  { label: '5 km', value: '5' },
  { label: '10 km', value: '10' },
  { label: '25 km', value: '25' },
  { label: '50 km', value: '50' },
];

export const SELLER_TYPES = [
  { value: 'all', label: 'All sellers' },
  { value: 'individual', label: 'Individuals' },
  { value: 'shop', label: 'Shops' },
];

export const PRICE_PRESETS = [
  { label: 'Under 1k', min: '', max: '1000' },
  { label: '1k – 5k', min: '1000', max: '5000' },
  { label: '5k – 20k', min: '5000', max: '20000' },
  { label: '20k – 1L', min: '20000', max: '100000' },
  { label: '1L+', min: '100000', max: '' },
];

/** '' is the default sort: newest while browsing, best match while searching. */
export function sortOptions(isSearch) {
  return [
    { value: '', label: isSearch ? 'Best match' : 'Newest' },
    ...(isSearch ? [{ value: 'newest', label: 'Newest' }] : []),
    { value: 'distance', label: 'Nearest', needsLocation: true },
    { value: 'price-low', label: 'Price: low to high' },
    { value: 'price-high', label: 'Price: high to low' },
  ];
}

export const DEFAULT_FILTERS = {
  sort: '',
  condition: 'All',
  minPrice: '',
  maxPrice: '',
  radius: '',
  sellerType: 'all',
};

const URL_KEYS = {
  sort: 'sort',
  condition: 'condition',
  minPrice: 'min',
  maxPrice: 'max',
  radius: 'radius',
  sellerType: 'seller',
};

const SORT_VALUES = ['', 'newest', 'distance', 'price-low', 'price-high'];
const cleanPrice = (value) => (/^\d{1,9}$/.test(value || '') ? value : '');

export function readFilters(params) {
  const sort = params.get(URL_KEYS.sort) || '';
  const condition = params.get(URL_KEYS.condition) || 'All';
  const radius = params.get(URL_KEYS.radius) || '';
  const sellerType = params.get(URL_KEYS.sellerType) || 'all';
  return {
    sort: SORT_VALUES.includes(sort) ? sort : '',
    condition: CONDITIONS.includes(condition) ? condition : 'All',
    minPrice: cleanPrice(params.get(URL_KEYS.minPrice)),
    maxPrice: cleanPrice(params.get(URL_KEYS.maxPrice)),
    radius: DISTANCES.some((d) => d.value === radius) ? radius : '',
    sellerType: SELLER_TYPES.some((t) => t.value === sellerType) ? sellerType : 'all',
  };
}

export function writeFilters(params, filters) {
  const next = new URLSearchParams(params);
  Object.entries(URL_KEYS).forEach(([key, urlKey]) => {
    const value = filters[key];
    if (value === undefined || value === '' || value === DEFAULT_FILTERS[key]) next.delete(urlKey);
    else next.set(urlKey, value);
  });
  return next;
}

export function countActiveFilters(filters, category = 'All') {
  let n = category !== 'All' ? 1 : 0;
  if (filters.condition !== 'All') n += 1;
  if (filters.minPrice || filters.maxPrice) n += 1;
  if (filters.radius) n += 1;
  if (filters.sellerType !== 'all') n += 1;
  if (filters.sort) n += 1;
  return n;
}

export function formatNpr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString('en-IN');
}
