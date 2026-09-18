import { useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Pressable,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  generateVariantsFromOptions,
  getVariantPresetForCategory,
} from '../utils/listingVariants';

function OptionValueInput({ value, onChangeText, onAdd, colors, styles }) {
  return (
    <View style={styles.optionInputRow}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Add value"
        placeholderTextColor={colors.textTertiary}
        style={styles.optionInput}
        onSubmitEditing={onAdd}
        returnKeyType="done"
      />
      <Pressable style={styles.optionAddBtn} onPress={onAdd}>
        <Ionicons name="add" size={18} color={colors.onPrimary} />
      </Pressable>
    </View>
  );
}

export default function VariantEditor({
  category,
  basePrice,
  enabled,
  onToggleEnabled,
  variantOptions,
  onChangeVariantOptions,
  variants,
  onChangeVariants,
  colors,
  styles,
}) {
  const preset = useMemo(() => getVariantPresetForCategory(category), [category]);
  const [draftValues, setDraftValues] = useState({});

  useEffect(() => {
    if (!enabled) return;
    if (variantOptions.length) return;
    const initial = preset.options.map((name) => ({
      name,
      values: [...(preset.suggestions[name] || [])].slice(0, 3),
    }));
    onChangeVariantOptions(initial);
  }, [enabled, category, preset, variantOptions.length, onChangeVariantOptions]);

  const addOptionValue = (optionIndex) => {
    const draft = String(draftValues[optionIndex] || '').trim();
    if (!draft) return;
    const next = variantOptions.map((option, index) => {
      if (index !== optionIndex) return option;
      if (option.values.includes(draft)) return option;
      return { ...option, values: [...option.values, draft] };
    });
    onChangeVariantOptions(next);
    setDraftValues((prev) => ({ ...prev, [optionIndex]: '' }));
  };

  const removeOptionValue = (optionIndex, value) => {
    const next = variantOptions.map((option, index) => {
      if (index !== optionIndex) return option;
      return { ...option, values: option.values.filter((entry) => entry !== value) };
    });
    onChangeVariantOptions(next);
    onChangeVariants([]);
  };

  const regenerateVariants = () => {
    const generated = generateVariantsFromOptions(variantOptions, Number(basePrice) || 0);
    onChangeVariants(
      generated.map((variant) => ({
        ...variant,
        stock: '1',
      })),
    );
  };

  const updateVariantField = (index, field, value) => {
    onChangeVariants(
      variants.map((variant, idx) =>
        idx === index ? { ...variant, [field]: value } : variant,
      ),
    );
  };

  const totalStock = variants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);

  return (
    <View style={styles.variantCard}>
      <View style={styles.variantToggleRow}>
        <View style={styles.variantToggleCopy}>
          <Text style={styles.variantTitle}>Product variants</Text>
          <Text style={styles.variantHint}>
            Same item in different colors, sizes, or storage options
          </Text>
        </View>
        <Switch
          value={enabled}
          onValueChange={onToggleEnabled}
          trackColor={{ false: colors.border, true: colors.primarySoft || `${colors.primary}33` }}
          thumbColor={enabled ? colors.primary : colors.surface}
        />
      </View>

      {enabled ? (
        <>
          {variantOptions.map((option, optionIndex) => (
            <View key={`${option.name}-${optionIndex}`} style={styles.variantOptionBlock}>
              <Text style={styles.fieldLabel}>{option.name}</Text>
              <View style={styles.chipWrap}>
                {option.values.map((value) => (
                  <Pressable
                    key={value}
                    style={styles.variantValueChip}
                    onPress={() => removeOptionValue(optionIndex, value)}
                  >
                    <Text style={styles.variantValueChipText}>{value}</Text>
                    <Ionicons name="close" size={12} color={colors.textSecondary} />
                  </Pressable>
                ))}
              </View>
              <OptionValueInput
                value={draftValues[optionIndex] || ''}
                onChangeText={(text) =>
                  setDraftValues((prev) => ({ ...prev, [optionIndex]: text }))
                }
                onAdd={() => addOptionValue(optionIndex)}
                colors={colors}
                styles={styles}
              />
              <View style={styles.suggestionRow}>
                {(preset.suggestions[option.name] || []).map((value) => {
                  const active = option.values.includes(value);
                  return (
                    <Pressable
                      key={value}
                      style={[styles.suggestionChip, active && styles.suggestionChipActive]}
                      onPress={() => {
                        if (active) {
                          removeOptionValue(optionIndex, value);
                          return;
                        }
                        onChangeVariantOptions(
                          variantOptions.map((entry, idx) =>
                            idx === optionIndex
                              ? { ...entry, values: [...entry.values, value] }
                              : entry,
                          ),
                        );
                      }}
                    >
                      <Text
                        style={[
                          styles.suggestionChipText,
                          active && styles.suggestionChipTextActive,
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ))}

          <Pressable style={styles.generateBtn} onPress={regenerateVariants}>
            <Ionicons name="git-branch-outline" size={16} color={colors.primary} />
            <Text style={styles.generateBtnText}>Generate all combinations</Text>
          </Pressable>

          {variants.length ? (
            <View style={styles.variantRowsWrap}>
              <View style={styles.variantRowsHead}>
                <Text style={styles.variantRowsTitle}>{variants.length} variants</Text>
                <Text style={styles.variantRowsMeta}>Total stock: {totalStock}</Text>
              </View>
              {variants.map((variant, index) => (
                <View key={variant.id || index} style={styles.variantRow}>
                  <Text style={styles.variantRowLabel} numberOfLines={2}>
                    {variant.label}
                  </Text>
                  <View style={styles.variantRowFields}>
                    <View style={styles.variantFieldCol}>
                      <Text style={styles.variantFieldLabel}>Stock</Text>
                      <TextInput
                        value={String(variant.stock ?? '')}
                        onChangeText={(text) => updateVariantField(index, 'stock', text)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor={colors.textTertiary}
                        style={styles.variantFieldInput}
                      />
                    </View>
                    <View style={styles.variantFieldColWide}>
                      <Text style={styles.variantFieldLabel}>Price (optional)</Text>
                      <TextInput
                        value={String(variant.price ?? '')}
                        onChangeText={(text) => updateVariantField(index, 'price', text)}
                        keyboardType="numeric"
                        placeholder={basePrice ? String(basePrice) : 'Base price'}
                        placeholderTextColor={colors.textTertiary}
                        style={styles.variantFieldInput}
                      />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.variantEmptyText}>
              Add option values and tap generate to create variant rows.
            </Text>
          )}
        </>
      ) : null}
    </View>
  );
}
