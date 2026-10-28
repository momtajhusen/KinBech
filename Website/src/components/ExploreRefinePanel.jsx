import { useEffect, useState } from 'react';
import {
  CONDITIONS,
  DISTANCES,
  PRICE_PRESETS,
  SELLER_TYPES,
  sortOptions,
} from '../utils/exploreFilters';

function PillGroup({ options, value, onChange, disabled = false }) {
  return (
    <div className="refine-pills" role="radiogroup">
      {options.map((o) => {
        const active = value === o.value;
        const off = disabled || o.disabled;
        return (
          <button
            key={o.value || o.label}
            type="button"
            role="radio"
            aria-checked={active}
            className={`refine-pill${active ? ' active' : ''}`}
            disabled={off && !active}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function PriceRange({ minPrice, maxPrice, onPriceChange, compact = false }) {
  const [draft, setDraft] = useState({ min: minPrice, max: maxPrice });

  useEffect(() => {
    setDraft({ min: minPrice, max: maxPrice });
  }, [minPrice, maxPrice]);

  const commit = () => {
    let { min, max } = draft;
    if (min && max && Number(min) > Number(max)) [min, max] = [max, min];
    if (min !== minPrice || max !== maxPrice) onPriceChange(min, max);
  };
  const onKey = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };
  const digits = (value) => value.replace(/\D/g, '').slice(0, 9);

  return (
    <div className={`refine-price${compact ? ' refine-price--compact' : ''}`}>
      <div className="refine-price-inputs">
        <label>
          <span>Min</span>
          <input
            inputMode="numeric"
            placeholder="0"
            value={draft.min}
            onChange={(e) => setDraft((d) => ({ ...d, min: digits(e.target.value) }))}
            onBlur={commit}
            onKeyDown={onKey}
            aria-label="Minimum price in NPR"
          />
        </label>
        <span className="refine-price-dash" aria-hidden>–</span>
        <label>
          <span>Max</span>
          <input
            inputMode="numeric"
            placeholder="Any"
            value={draft.max}
            onChange={(e) => setDraft((d) => ({ ...d, max: digits(e.target.value) }))}
            onBlur={commit}
            onKeyDown={onKey}
            aria-label="Maximum price in NPR"
          />
        </label>
      </div>
      {!compact ? (
        <div className="refine-pills refine-pills--wrap">
          {PRICE_PRESETS.map((p) => {
            const active = p.min === minPrice && p.max === maxPrice;
            return (
              <button
                key={p.label}
                type="button"
                className={`refine-pill refine-pill--sm${active ? ' active' : ''}`}
                onClick={() => (active ? onPriceChange('', '') : onPriceChange(p.min, p.max))}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function ExploreRefinePanel({
  filters,
  onFilterChange,
  onPriceChange,
  hasLocation,
  isSearch = false,
  showSort = false,
  activeFilterCount = 0,
  onClearFilters,
  className = '',
}) {
  const sorts = sortOptions(isSearch).map((o) => ({ ...o, disabled: o.needsLocation && !hasLocation }));
  const distances = DISTANCES.map((d) => ({ ...d, disabled: Boolean(d.value) && !hasLocation }));

  return (
    <div className={`refine-panel ${className}`.trim()}>
      <div className="refine-head">
        <h2>Refine</h2>
        {activeFilterCount > 0 ? (
          <button type="button" className="refine-clear" onClick={onClearFilters}>
            Clear all
          </button>
        ) : null}
      </div>

      {showSort ? (
        <section className="refine-group">
          <h3>Sort by</h3>
          <PillGroup options={sorts} value={filters.sort} onChange={(v) => onFilterChange('sort', v)} />
        </section>
      ) : null}

      <section className="refine-group">
        <h3>Price <small>NPR</small></h3>
        <PriceRange minPrice={filters.minPrice} maxPrice={filters.maxPrice} onPriceChange={onPriceChange} />
      </section>

      <section className="refine-group">
        <h3>Condition</h3>
        <PillGroup
          options={CONDITIONS.map((c) => ({ value: c, label: c === 'All' ? 'Any' : c }))}
          value={filters.condition}
          onChange={(v) => onFilterChange('condition', v)}
        />
      </section>

      <section className="refine-group">
        <h3>Sold by</h3>
        <PillGroup options={SELLER_TYPES} value={filters.sellerType} onChange={(v) => onFilterChange('sellerType', v)} />
      </section>

      <section className="refine-group">
        <h3>Distance</h3>
        <PillGroup options={distances} value={filters.radius} onChange={(v) => onFilterChange('radius', v)} />
        {!hasLocation ? (
          <p className="refine-note">Allow location in your browser to filter by distance.</p>
        ) : null}
      </section>
    </div>
  );
}
