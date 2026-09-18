import { Pressable, Text, View } from 'react-native';
import {
  findMatchingVariant,
  getAvailableValues,
  getVariantGroups,
  resolveVariantPrice,
} from '../utils/listingVariants';
import { formatPrice } from '../utils/listing';

export default function VariantPicker({
  listing,
  selection,
  onChangeSelection,
  colors,
  styles,
}) {
  if (!listing?.hasVariants) return null;

  const groups = getVariantGroups(listing);
  const selectedVariant = findMatchingVariant(listing, selection);
  const displayPrice = formatPrice(resolveVariantPrice(listing, selectedVariant));
  const stock = selectedVariant ? Number(selectedVariant.stock) || 0 : 0;

  return (
    <View style={styles.variantPickerWrap}>
      {groups.map((group) => {
        const available = getAvailableValues(listing, group.name, selection);
        return (
          <View key={group.name} style={styles.variantPickerGroup}>
            <Text style={styles.variantPickerLabel}>{group.name}</Text>
            <View style={styles.variantPickerOptions}>
              {available.map((value) => {
                const active = selection[group.name] === value;
                const outOfStock = !listing.variants.some((variant) => {
                  const attrs = Object.fromEntries(
                    (variant.attributes || []).map((entry) => [entry.name, entry.value]),
                  );
                  const test = { ...selection, [group.name]: value };
                  return Object.entries(test).every(([name, val]) => attrs[name] === val) &&
                    Number(variant.stock) > 0;
                });
                return (
                  <Pressable
                    key={value}
                    disabled={outOfStock}
                    style={[
                      styles.variantPickerChip,
                      active && styles.variantPickerChipActive,
                      outOfStock && styles.variantPickerChipDisabled,
                    ]}
                    onPress={() =>
                      onChangeSelection({ ...selection, [group.name]: value })
                    }
                  >
                    <Text
                      style={[
                        styles.variantPickerChipText,
                        active && styles.variantPickerChipTextActive,
                        outOfStock && styles.variantPickerChipTextDisabled,
                      ]}
                    >
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}

      <View style={styles.variantPickerSummary}>
        <Text style={styles.variantPickerPrice}>{displayPrice}</Text>
        <Text style={styles.variantPickerStock}>
          {stock > 0 ? `${stock} in stock` : 'Out of stock'}
        </Text>
        {selectedVariant?.label ? (
          <Text style={styles.variantPickerSelected}>{selectedVariant.label}</Text>
        ) : null}
      </View>
    </View>
  );
}
