export const CATEGORY_VARIANT_PRESETS = {
  Fashion: {
    options: ['Color', 'Size'],
    suggestions: {
      Color: ['Black', 'White', 'Blue', 'Red', 'Green', 'Grey'],
      Size: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    },
  },
  Mobiles: {
    options: ['Color', 'Storage'],
    suggestions: {
      Color: ['Black', 'White', 'Blue', 'Gold', 'Silver'],
      Storage: ['64GB', '128GB', '256GB', '512GB'],
    },
  },
  Laptops: {
    options: ['Color', 'Storage', 'RAM'],
    suggestions: {
      Color: ['Black', 'Silver', 'Grey'],
      Storage: ['256GB', '512GB', '1TB'],
      RAM: ['8GB', '16GB', '32GB'],
    },
  },
  Electronics: {
    options: ['Color'],
    suggestions: {
      Color: ['Black', 'White', 'Silver'],
    },
  },
};

export function formatListingPrice(listing, formatPrice) {
  if (!listing) return '';
  if (listing.hasVariants && listing.priceMin != null && listing.priceMax != null) {
    const min = Number(listing.priceMin);
    const max = Number(listing.priceMax);
    if (Number.isFinite(min) && Number.isFinite(max) && min !== max) {
      return `${formatPrice(min, listing.currency)} – ${formatPrice(max, listing.currency)}`;
    }
    if (Number.isFinite(min)) return formatPrice(min, listing.currency);
  }
  return formatPrice(listing.price, listing.currency);
}

export function getVariantGroups(listing) {
  return (listing?.variantOptions || []).filter(
    (option) => option.name && Array.isArray(option.values) && option.values.length,
  );
}

function selectionKey(selection = {}) {
  return Object.entries(selection)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `${name}:${value}`)
    .join('|');
}

export function findMatchingVariant(listing, selection = {}) {
  if (!listing?.hasVariants || !Array.isArray(listing.variants)) return null;
  const key = selectionKey(selection);
  return (
    listing.variants.find((variant) => {
      const variantSelection = Object.fromEntries(
        (variant.attributes || []).map((entry) => [entry.name, entry.value]),
      );
      return selectionKey(variantSelection) === key;
    }) || null
  );
}

export function getAvailableValues(listing, optionName, currentSelection = {}) {
  if (!listing?.hasVariants) return [];
  const option = (listing.variantOptions || []).find((entry) => entry.name === optionName);
  if (!option) return [];

  return option.values.filter((value) => {
    const testSelection = { ...currentSelection, [optionName]: value };
    return listing.variants.some((variant) => {
      const attrs = Object.fromEntries(
        (variant.attributes || []).map((entry) => [entry.name, entry.value]),
      );
      return Object.entries(testSelection).every(([name, val]) => attrs[name] === val);
    });
  });
}

export function getDefaultVariantSelection(listing) {
  const groups = getVariantGroups(listing);
  if (!groups.length || !listing?.variants?.length) return {};

  const firstInStock =
    listing.variants.find((variant) => Number(variant.stock) > 0) || listing.variants[0];
  return Object.fromEntries(
    (firstInStock.attributes || []).map((entry) => [entry.name, entry.value]),
  );
}

export function resolveVariantPrice(listing, variant) {
  const base = Number(listing?.price) || 0;
  if (!variant) return base;
  const custom = variant.price != null && variant.price !== '' ? Number(variant.price) : null;
  return Number.isFinite(custom) ? custom : base;
}
