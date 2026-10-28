import { CONDITIONS, DISTANCES, SELLER_TYPES } from '../utils/exploreFilters';
import { PriceRange } from './ExploreRefinePanel';

export default function ExploreFilterBar({
  filters,
  onFilterChange,
  onPriceChange,
  hasLocation,
}) {
  return (
    <div className="explore-filter-bar">
      <label className={`explore-filter-chip${filters.condition !== 'All' ? ' is-set' : ''}`}>
        <span className="sr-only">Condition</span>
        <select value={filters.condition} onChange={(e) => onFilterChange('condition', e.target.value)} aria-label="Condition">
          {CONDITIONS.map((c) => (
            <option key={c} value={c}>{c === 'All' ? 'Any condition' : c}</option>
          ))}
        </select>
      </label>

      <label className={`explore-filter-chip${filters.radius ? ' is-set' : ''}`}>
        <span className="sr-only">Distance</span>
        <select
          value={filters.radius}
          onChange={(e) => onFilterChange('radius', e.target.value)}
          aria-label="Distance"
          title={hasLocation ? undefined : 'Allow location to filter by distance'}
        >
          {DISTANCES.map((d) => (
            <option key={d.label} value={d.value} disabled={Boolean(d.value) && !hasLocation}>
              {d.value ? `Within ${d.label}` : 'Any distance'}
            </option>
          ))}
        </select>
      </label>

      <label className={`explore-filter-chip${filters.sellerType !== 'all' ? ' is-set' : ''}`}>
        <span className="sr-only">Seller type</span>
        <select value={filters.sellerType} onChange={(e) => onFilterChange('sellerType', e.target.value)} aria-label="Seller type">
          {SELLER_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <div className={`explore-filter-chip explore-filter-price${filters.minPrice || filters.maxPrice ? ' is-set' : ''}`}>
        <PriceRange
          compact
          minPrice={filters.minPrice}
          maxPrice={filters.maxPrice}
          onPriceChange={onPriceChange}
        />
      </div>
    </div>
  );
}
