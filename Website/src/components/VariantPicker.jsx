import { useMemo } from 'react';
import { formatPrice } from '../utils/listing';
import {
  findMatchingVariant,
  getAvailableValues,
  getDefaultVariantSelection,
  getVariantGroups,
  resolveVariantPrice,
} from '../utils/listingVariants';

export default function VariantPicker({ listing, selection, onChangeSelection }) {
  const groups = useMemo(() => getVariantGroups(listing), [listing]);
  const selectedVariant = useMemo(
    () => findMatchingVariant(listing, selection),
    [listing, selection],
  );

  if (!listing?.hasVariants || !groups.length) return null;

  const displayPrice = formatPrice(
    resolveVariantPrice(listing, selectedVariant),
    listing.currency,
  );
  const stock = selectedVariant ? Number(selectedVariant.stock) || 0 : 0;

  return (
    <div className="detail-variants">
      {groups.map((group) => {
        const available = getAvailableValues(listing, group.name, selection);
        return (
          <div key={group.name} className="detail-variant-group">
            <p className="detail-variant-label">{group.name}</p>
            <div className="detail-variant-options">
              {available.map((value) => {
                const active = selection[group.name] === value;
                const outOfStock = !listing.variants.some((variant) => {
                  const attrs = Object.fromEntries(
                    (variant.attributes || []).map((entry) => [entry.name, entry.value]),
                  );
                  const test = { ...selection, [group.name]: value };
                  return (
                    Object.entries(test).every(([name, val]) => attrs[name] === val) &&
                    Number(variant.stock) > 0
                  );
                });
                return (
                  <button
                    key={value}
                    type="button"
                    className={[
                      'detail-variant-chip',
                      active ? 'active' : '',
                      outOfStock ? 'disabled' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    disabled={outOfStock}
                    onClick={() => onChangeSelection({ ...selection, [group.name]: value })}
                  >
                    {value}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="detail-variant-summary">
        <p className="detail-price detail-variant-price">{displayPrice}</p>
        <p className="detail-variant-stock">
          {stock > 0 ? `${stock} in stock` : 'Out of stock'}
        </p>
        {selectedVariant?.label ? (
          <p className="detail-variant-selected">{selectedVariant.label}</p>
        ) : null}
      </div>
    </div>
  );
}

export { getDefaultVariantSelection };
