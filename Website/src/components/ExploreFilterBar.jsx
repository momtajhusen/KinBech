const CONDITIONS = ['All', 'New', 'Good', 'Fair'];

const DISTANCES = [
  { label: 'Any distance', value: '' },
  { label: '1 km', value: '1' },
  { label: '5 km', value: '5' },
  { label: '10 km', value: '10' },
  { label: '25 km', value: '25' },
  { label: '50 km', value: '50' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'distance', label: 'Nearest' },
  { value: 'price-low', label: 'Price ↑' },
  { value: 'price-high', label: 'Price ↓' },
];

const SELLER_TYPES = [
  { value: 'all', label: 'All sellers' },
  { value: 'individual', label: 'Individual' },
  { value: 'shop', label: 'Shop' },
];

export default function ExploreFilterBar({
  sort,
  onSortChange,
  condition,
  onConditionChange,
  minPrice,
  maxPrice,
  onMinPriceChange,
  onMaxPriceChange,
  radius,
  onRadiusChange,
  sellerType,
  onSellerTypeChange,
  activeFilterCount,
  onClearFilters,
  layout = 'bar',
}) {
  return (
    <div className={`explore-filter-bar${layout === 'sheet' ? ' explore-filter-bar--sheet' : ''}`}>
      <label className="explore-filter-chip">
        <span className="sr-only">Sort</span>
        <select value={sort} onChange={(e) => onSortChange(e.target.value)} aria-label="Sort by">
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>

      <label className="explore-filter-chip">
        <span className="sr-only">Condition</span>
        <select value={condition} onChange={(e) => onConditionChange(e.target.value)} aria-label="Condition">
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>{c === 'All' ? 'Condition' : c}</option>
          ))}
        </select>
      </label>

      <label className="explore-filter-chip">
        <span className="sr-only">Distance</span>
        <select value={radius} onChange={(e) => onRadiusChange(e.target.value)} aria-label="Distance">
          {DISTANCES.map((d) => (
            <option key={d.label} value={d.value}>{d.value ? d.label : 'Distance'}</option>
          ))}
        </select>
      </label>

      <label className="explore-filter-chip">
        <span className="sr-only">Seller type</span>
        <select value={sellerType} onChange={(e) => onSellerTypeChange(e.target.value)} aria-label="Seller type">
          {SELLER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <div className="explore-filter-chip explore-filter-price">
        <input
          type="number"
          min="0"
          placeholder="Min"
          value={minPrice}
          onChange={(e) => onMinPriceChange(e.target.value)}
          aria-label="Minimum price"
        />
        <span>–</span>
        <input
          type="number"
          min="0"
          placeholder="Max"
          value={maxPrice}
          onChange={(e) => onMaxPriceChange(e.target.value)}
          aria-label="Maximum price"
        />
      </div>

      {layout !== 'sheet' && activeFilterCount > 0 ? (
        <button type="button" className="explore-filter-clear" onClick={onClearFilters}>
          Clear
        </button>
      ) : null}
    </div>
  );
}
