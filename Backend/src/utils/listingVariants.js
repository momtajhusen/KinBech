function parsePrice(value) {
  if (value == null || value === '') return NaN;
  return Number(String(value).replace(/,/g, '').replace(/[^\d.]/g, ''));
}

const CATEGORY_VARIANT_PRESETS = {
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

function getVariantPresetForCategory(category) {
  return (
    CATEGORY_VARIANT_PRESETS[category] || {
      options: ['Color'],
      suggestions: { Color: ['Black', 'White'] },
    }
  );
}

function cleanString(value) {
  return String(value || '').trim();
}

function normalizeVariantOptions(rawOptions) {
  if (!Array.isArray(rawOptions)) return [];
  return rawOptions
    .map((option) => {
      const name = cleanString(option?.name);
      const values = Array.isArray(option?.values)
        ? [...new Set(option.values.map(cleanString).filter(Boolean))]
        : [];
      if (!name || !values.length) return null;
      return { name, values };
    })
    .filter(Boolean);
}

function buildVariantLabel(attributes) {
  return attributes.map((entry) => entry.value).join(' · ');
}

function normalizeVariants(rawVariants, basePrice, variantOptions = []) {
  if (!Array.isArray(rawVariants)) return [];

  const optionNames = variantOptions.map((option) => option.name);

  return rawVariants
    .map((variant, index) => {
      const attributes = Array.isArray(variant?.attributes)
        ? variant.attributes
            .map((entry) => ({
              name: cleanString(entry?.name),
              value: cleanString(entry?.value),
            }))
            .filter((entry) => entry.name && entry.value)
        : [];

      if (!attributes.length && variant?.options && typeof variant.options === 'object') {
        for (const [name, value] of Object.entries(variant.options)) {
          const cleanName = cleanString(name);
          const cleanValue = cleanString(value);
          if (cleanName && cleanValue) {
            attributes.push({ name: cleanName, value: cleanValue });
          }
        }
      }

      if (!attributes.length) return null;

      const orderedAttributes = optionNames.length
        ? optionNames
            .map((name) => attributes.find((entry) => entry.name === name))
            .filter(Boolean)
            .concat(attributes.filter((entry) => !optionNames.includes(entry.name)))
        : attributes;

      const parsedPrice =
        variant?.price == null || variant?.price === ''
          ? null
          : parsePrice(variant.price);
      const stock = Math.max(0, Number(variant?.stock) || 0);

      return {
        id: cleanString(variant?.id) || `variant-${index + 1}`,
        label: cleanString(variant?.label) || buildVariantLabel(orderedAttributes),
        attributes: orderedAttributes,
        sku: cleanString(variant?.sku),
        price: Number.isFinite(parsedPrice) ? parsedPrice : null,
        stock,
        photo: cleanString(variant?.photo),
      };
    })
    .filter(Boolean);
}

function validateVariants({ sellerType, variantOptions, variants, basePrice }) {
  if (sellerType !== 'shop') {
    if (variants.length) {
      return { ok: false, message: 'Variants are only supported for shop listings' };
    }
    return { ok: true, variantOptions: [], variants: [], hasVariants: false, stock: null };
  }

  if (!variants.length) {
    return {
      ok: true,
      variantOptions: [],
      variants: [],
      hasVariants: false,
      stock: null,
    };
  }

  if (!variantOptions.length) {
    return { ok: false, message: 'Add at least one variant option (e.g. Color, Size)' };
  }

  const optionMap = new Map(variantOptions.map((option) => [option.name, new Set(option.values)]));

  const seenKeys = new Set();
  for (const variant of variants) {
    if (!variant.attributes.length) {
      return { ok: false, message: 'Each variant needs option values selected' };
    }

    for (const attribute of variant.attributes) {
      const allowed = optionMap.get(attribute.name);
      if (!allowed || !allowed.has(attribute.value)) {
        return {
          ok: false,
          message: `Invalid value "${attribute.value}" for ${attribute.name}`,
        };
      }
    }

    const key = variant.attributes.map((entry) => `${entry.name}:${entry.value}`).join('|');
    if (seenKeys.has(key)) {
      return { ok: false, message: 'Duplicate variant combinations are not allowed' };
    }
    seenKeys.add(key);

    if (variant.price != null && (!Number.isFinite(variant.price) || variant.price < 0)) {
      return { ok: false, message: 'Variant price must be zero or greater' };
    }

    if (!Number.isFinite(basePrice) || basePrice < 0) {
      return { ok: false, message: 'Base price is required when using variants' };
    }
  }

  const totalStock = variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);

  return {
    ok: true,
    variantOptions,
    variants,
    hasVariants: true,
    stock: totalStock,
  };
}

function computeVariantPricing(listing) {
  const basePrice = Number(listing?.price) || 0;
  if (!listing?.hasVariants || !Array.isArray(listing.variants) || !listing.variants.length) {
    return {
      priceMin: basePrice,
      priceMax: basePrice,
      totalStock: Number(listing?.stock) || 0,
    };
  }

  const prices = listing.variants.map((variant) =>
    variant.price != null && Number.isFinite(Number(variant.price))
      ? Number(variant.price)
      : basePrice,
  );

  return {
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
    totalStock: listing.variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0),
  };
}

function serializeVariantsForPayload(listing) {
  const pricing = computeVariantPricing(listing);
  return {
    hasVariants: Boolean(listing?.hasVariants),
    variantOptions: (listing?.variantOptions || []).map((option) => ({
      name: option.name,
      values: option.values || [],
    })),
    variants: (listing?.variants || []).map((variant) => ({
      id: variant.id,
      label: variant.label,
      attributes: (variant.attributes || []).map((entry) => ({
        name: entry.name,
        value: entry.value,
      })),
      sku: variant.sku || '',
      price: variant.price != null ? Number(variant.price) : null,
      stock: Number(variant.stock) || 0,
      photo: variant.photo || '',
    })),
    stock: pricing.totalStock,
    priceMin: pricing.priceMin,
    priceMax: pricing.priceMax,
    brand: listing?.brand || '',
    sku: listing?.sku || '',
    originalPrice: listing?.originalPrice ?? null,
    isOnSale: Boolean(listing?.isOnSale),
  };
}

function parseVariantsFromBody(body, basePrice, sellerType) {
  const variantOptions = normalizeVariantOptions(body?.variantOptions);
  const variants = normalizeVariants(body?.variants, basePrice, variantOptions);
  const hasVariantsFlag = Boolean(body?.hasVariants) || variants.length > 0;

  if (!hasVariantsFlag) {
    return validateVariants({
      sellerType,
      variantOptions: [],
      variants: [],
      basePrice,
    });
  }

  return validateVariants({
    sellerType,
    variantOptions,
    variants,
    basePrice,
  });
}

module.exports = {
  CATEGORY_VARIANT_PRESETS,
  getVariantPresetForCategory,
  normalizeVariantOptions,
  normalizeVariants,
  validateVariants,
  computeVariantPricing,
  serializeVariantsForPayload,
  parseVariantsFromBody,
  buildVariantLabel,
};
