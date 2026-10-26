import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Reanimated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';

export const DEFAULT_EXPLORE_FILTERS = {
  verified: false,
  nearby: false,
  topRated: false,
  priceMin: null,
  priceMax: null,
  condition: '',
  postedDays: 0,
  maxKm: 0,
  sellerType: 'all',
};

const SORT_DETAILS = {
  forYou: 'Matched to what you like',
  newest: 'Latest listings first',
  nearby: 'Closest to you first',
  priceLow: 'Cheapest first',
  priceHigh: 'Most expensive first',
  topRated: 'Most viewed and rated',
};

const SORT_LABELS = {
  priceLow: 'Price: low to high',
  priceHigh: 'Price: high to low',
};

const PRICE_PRESETS = [
  { key: 'u1k', label: 'Under 1k', min: null, max: 1000 },
  { key: '1-5k', label: '1k – 5k', min: 1000, max: 5000 },
  { key: '5-20k', label: '5k – 20k', min: 5000, max: 20000 },
  { key: '20k-1l', label: '20k – 1L', min: 20000, max: 100000 },
  { key: '1l', label: '1L+', min: 100000, max: null },
];

const DISTANCES = [0, 2, 5, 10, 25];
const CONDITIONS = [
  { key: '', label: 'Any', icon: 'apps-outline' },
  { key: 'New', label: 'New', icon: 'sparkles-outline' },
  { key: 'Good', label: 'Good', icon: 'checkmark-circle-outline' },
  { key: 'Fair', label: 'Fair', icon: 'construct-outline' },
];
const POSTED = [
  { key: 0, label: 'Any time' },
  { key: 1, label: 'Today' },
  { key: 7, label: 'This week' },
  { key: 30, label: 'This month' },
];
const SELLER_TYPES = [
  { key: 'all', label: 'Anyone', icon: 'people-outline' },
  { key: 'shop', label: 'Shops', icon: 'storefront-outline' },
  { key: 'individual', label: 'Individuals', icon: 'person-outline' },
];

const OPEN = { duration: 280, easing: Easing.bezier(0.22, 1, 0.36, 1) };
const CLOSE = { duration: 200, easing: Easing.in(Easing.cubic) };

function shortAmount(value) {
  if (value >= 100000) return `${+(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `${+(value / 1000).toFixed(1)}k`;
  return String(value);
}

export function priceLabel(min, max) {
  if (min != null && max != null) return `Rs ${shortAmount(min)} – ${shortAmount(max)}`;
  if (min != null) return `Rs ${shortAmount(min)}+`;
  if (max != null) return `Under Rs ${shortAmount(max)}`;
  return '';
}

export function countActiveFilters(filters, sortBy, defaultSort) {
  const f = { ...DEFAULT_EXPLORE_FILTERS, ...filters };
  return (
    (sortBy !== defaultSort ? 1 : 0) +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) +
    (f.condition ? 1 : 0) +
    (f.postedDays ? 1 : 0) +
    (f.maxKm ? 1 : 0) +
    (f.sellerType !== 'all' ? 1 : 0) +
    (f.verified ? 1 : 0) +
    (f.nearby ? 1 : 0) +
    (f.topRated ? 1 : 0)
  );
}

function Section({ icon, title, hint, onReset, children, styles, colors }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionIcon}>
          <Icon name={icon} size={15} color={colors.primary} />
        </View>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
        </View>
        {onReset ? (
          <Pressable hitSlop={8} onPress={onReset}>
            <Text style={styles.resetLink}>Reset</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Chip({ label, icon, active, disabled, onPress, styles, colors }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
    >
      {icon ? <Icon name={icon} size={14} color={active ? '#fff' : colors.textSecondary} /> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export default function ExploreFilterSheet({
  visible,
  onClose,
  activeTab,
  sortOptions,
  defaultSort,
  sortBy,
  filters,
  onApply,
  countFor,
  hasLocation,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const [draftSort, setDraftSort] = useState(sortBy);
  const [draft, setDraft] = useState({ ...DEFAULT_EXPLORE_FILTERS, ...filters });
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const translateY = useSharedValue(windowHeight);
  const backdrop = useSharedValue(0);
  const closingRef = useRef(false);

  const isProducts = activeTab === 'products';

  useEffect(() => {
    if (visible) {
      const next = { ...DEFAULT_EXPLORE_FILTERS, ...filters };
      setDraft(next);
      setDraftSort(sortBy);
      setMinText(next.priceMin != null ? String(next.priceMin) : '');
      setMaxText(next.priceMax != null ? String(next.priceMax) : '');
      closingRef.current = false;
      setMounted(true);
      translateY.value = windowHeight;
      backdrop.value = 0;
      translateY.value = withTiming(0, OPEN);
      backdrop.value = withTiming(1, OPEN);
    } else if (mounted) {
      setMounted(false);
    }
  }, [visible]);

  const close = (after) => {
    if (closingRef.current) return;
    closingRef.current = true;
    translateY.value = withTiming(windowHeight, CLOSE);
    backdrop.value = withTiming(0, CLOSE);
    setTimeout(() => {
      after?.();
      onClose();
    }, CLOSE.duration);
  };

  const dragResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_, g) => {
          translateY.value = Math.max(0, g.dy);
        },
        onPanResponderRelease: (_, g) => {
          if (g.dy > 110 || g.vy > 1.1) close();
          else translateY.value = withTiming(0, OPEN);
        },
        onPanResponderTerminate: () => {
          translateY.value = withTiming(0, OPEN);
        },
      }),
    [onClose]
  );

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));

  const setPrice = (min, max) => {
    update({ priceMin: min, priceMax: max });
    setMinText(min != null ? String(min) : '');
    setMaxText(max != null ? String(max) : '');
  };

  const onPriceText = (which, text) => {
    const digits = text.replace(/[^0-9]/g, '').slice(0, 9);
    const value = digits ? Number(digits) : null;
    if (which === 'min') {
      setMinText(digits);
      update({ priceMin: value });
    } else {
      setMaxText(digits);
      update({ priceMax: value });
    }
  };

  const resetAll = () => {
    setDraftSort(defaultSort);
    setPrice(null, null);
    setDraft({ ...DEFAULT_EXPLORE_FILTERS });
  };

  const priceInvalid = draft.priceMin != null && draft.priceMax != null && draft.priceMin > draft.priceMax;
  const effective = priceInvalid ? { ...draft, priceMin: draft.priceMax, priceMax: draft.priceMin } : draft;
  const resultCount = useMemo(() => (mounted ? countFor(effective) : 0), [mounted, countFor, effective]);
  const activeCount = countActiveFilters(draft, draftSort, defaultSort);

  const summary = [];
  if (draftSort !== defaultSort) {
    const opt = sortOptions.find((o) => o.key === draftSort);
    summary.push({ key: 'sort', label: SORT_LABELS[draftSort] || opt?.label || 'Sorted', clear: () => setDraftSort(defaultSort) });
  }
  if (isProducts && (draft.priceMin != null || draft.priceMax != null)) {
    summary.push({ key: 'price', label: priceLabel(effective.priceMin, effective.priceMax), clear: () => setPrice(null, null) });
  }
  if (draft.maxKm) summary.push({ key: 'km', label: `Within ${draft.maxKm} km`, clear: () => update({ maxKm: 0 }) });
  if (isProducts && draft.condition) summary.push({ key: 'cond', label: draft.condition, clear: () => update({ condition: '' }) });
  if (isProducts && draft.postedDays) {
    summary.push({
      key: 'posted',
      label: POSTED.find((p) => p.key === draft.postedDays)?.label || 'Recent',
      clear: () => update({ postedDays: 0 }),
    });
  }
  if (draft.sellerType !== 'all') {
    summary.push({
      key: 'type',
      label: draft.sellerType === 'shop' ? 'Shops only' : 'Individuals only',
      clear: () => update({ sellerType: 'all' }),
    });
  }
  if (draft.verified) summary.push({ key: 'verified', label: 'Verified only', clear: () => update({ verified: false }) });

  const apply = () => {
    close(() => onApply({ sortBy: draftSort, filters: effective }));
  };

  if (!mounted) return null;

  const noun = isProducts ? 'item' : 'seller';
  const applyLabel = resultCount > 0 ? `Show ${resultCount} ${noun}${resultCount === 1 ? '' : 's'}` : 'No matches';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={() => close()}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Reanimated.View style={[styles.backdrop, backdropStyle]}>
          <Pressable style={styles.fill} onPress={() => close()} />
        </Reanimated.View>

        <Reanimated.View style={[styles.sheet, { maxHeight: windowHeight * 0.9 - insets.top }, sheetStyle]}>
          <View {...dragResponder.panHandlers}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerIcon}>
                <Icon name="options" size={20} color="#fff" />
              </View>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Sort & filters</Text>
                <Text style={styles.subtitle}>
                  {activeCount > 0
                    ? `${activeCount} active · ${resultCount} ${noun}${resultCount === 1 ? '' : 's'} match`
                    : `Refine ${isProducts ? 'items' : 'sellers'} near you`}
                </Text>
              </View>
              <Pressable style={styles.closeBtn} hitSlop={8} onPress={() => close()}>
                <Icon name="close" size={20} color={colors.text} />
              </Pressable>
            </View>
          </View>

          {summary.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.summaryScroll}
              contentContainerStyle={styles.summaryRow}
            >
              {summary.map((item) => (
                <Pressable key={item.key} style={styles.summaryChip} onPress={item.clear}>
                  <Text style={styles.summaryText}>{item.label}</Text>
                  <Icon name="close-circle" size={14} color={colors.primary} />
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Section
              icon="swap-vertical"
              title="Sort by"
              onReset={draftSort !== defaultSort ? () => setDraftSort(defaultSort) : null}
              styles={styles}
              colors={colors}
            >
              <View style={styles.sortGrid}>
                {sortOptions.map((opt) => {
                  const active = draftSort === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[styles.sortTile, active && styles.sortTileActive]}
                      onPress={() => setDraftSort(opt.key)}
                    >
                      <View style={[styles.sortIcon, active && styles.sortIconActive]}>
                        <Icon name={active ? opt.activeIcon || opt.icon : opt.icon} size={16} color={active ? '#fff' : colors.textSecondary} />
                      </View>
                      <View style={styles.sortCopy}>
                        <Text style={[styles.sortLabel, active && styles.sortLabelActive]} numberOfLines={1}>
                          {SORT_LABELS[opt.key] || opt.label}
                        </Text>
                        <Text style={styles.sortHint} numberOfLines={1}>{SORT_DETAILS[opt.key] || ''}</Text>
                      </View>
                      {active ? <Icon name="checkmark-circle" size={18} color={colors.primary} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </Section>

            {isProducts ? (
              <Section
                icon="pricetag-outline"
                title="Price range"
                hint={priceInvalid ? 'Min is higher than max, we swapped them' : 'In Nepali rupees'}
                onReset={draft.priceMin != null || draft.priceMax != null ? () => setPrice(null, null) : null}
                styles={styles}
                colors={colors}
              >
                <View style={styles.priceRow}>
                  <View style={styles.priceField}>
                    <Text style={styles.priceCaption}>Min</Text>
                    <View style={styles.priceInputRow}>
                      <Text style={styles.pricePrefix}>Rs</Text>
                      <TextInput
                        value={minText}
                        onChangeText={(text) => onPriceText('min', text)}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        style={styles.priceInput}
                      />
                    </View>
                  </View>
                  <View style={styles.priceDash} />
                  <View style={styles.priceField}>
                    <Text style={styles.priceCaption}>Max</Text>
                    <View style={styles.priceInputRow}>
                      <Text style={styles.pricePrefix}>Rs</Text>
                      <TextInput
                        value={maxText}
                        onChangeText={(text) => onPriceText('max', text)}
                        placeholder="Any"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        style={styles.priceInput}
                      />
                    </View>
                  </View>
                </View>
                <View style={styles.chipWrap}>
                  {PRICE_PRESETS.map((preset) => (
                    <Chip
                      key={preset.key}
                      label={preset.label}
                      active={draft.priceMin === preset.min && draft.priceMax === preset.max}
                      onPress={() => setPrice(preset.min, preset.max)}
                      styles={styles}
                      colors={colors}
                    />
                  ))}
                </View>
              </Section>
            ) : null}

            <Section
              icon="navigate-outline"
              title="Distance"
              hint={hasLocation ? 'From your current location' : 'Turn on location to use distance'}
              onReset={draft.maxKm ? () => update({ maxKm: 0 }) : null}
              styles={styles}
              colors={colors}
            >
              <View style={styles.chipWrap}>
                {DISTANCES.map((km) => (
                  <Chip
                    key={km}
                    label={km ? `${km} km` : 'Any'}
                    icon={km ? null : 'globe-outline'}
                    active={draft.maxKm === km}
                    disabled={!hasLocation && km > 0}
                    onPress={() => update({ maxKm: km })}
                    styles={styles}
                    colors={colors}
                  />
                ))}
              </View>
            </Section>

            {isProducts ? (
              <Section
                icon="ribbon-outline"
                title="Condition"
                onReset={draft.condition ? () => update({ condition: '' }) : null}
                styles={styles}
                colors={colors}
              >
                <View style={styles.segment}>
                  {CONDITIONS.map((cond) => {
                    const active = draft.condition === cond.key;
                    return (
                      <Pressable
                        key={cond.key || 'any'}
                        style={[styles.segmentItem, active && styles.segmentItemActive]}
                        onPress={() => update({ condition: cond.key })}
                      >
                        <Icon name={cond.icon} size={15} color={active ? '#fff' : colors.textSecondary} />
                        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{cond.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>
            ) : null}

            {isProducts ? (
              <Section
                icon="time-outline"
                title="Posted"
                onReset={draft.postedDays ? () => update({ postedDays: 0 }) : null}
                styles={styles}
                colors={colors}
              >
                <View style={styles.chipWrap}>
                  {POSTED.map((option) => (
                    <Chip
                      key={option.key}
                      label={option.label}
                      active={draft.postedDays === option.key}
                      onPress={() => update({ postedDays: option.key })}
                      styles={styles}
                      colors={colors}
                    />
                  ))}
                </View>
              </Section>
            ) : null}

            <Section
              icon="people-outline"
              title="Seller type"
              onReset={draft.sellerType !== 'all' ? () => update({ sellerType: 'all' }) : null}
              styles={styles}
              colors={colors}
            >
              <View style={styles.segment}>
                {SELLER_TYPES.map((type) => {
                  const active = draft.sellerType === type.key;
                  return (
                    <Pressable
                      key={type.key}
                      style={[styles.segmentItem, active && styles.segmentItemActive]}
                      onPress={() => update({ sellerType: type.key })}
                    >
                      <Icon name={type.icon} size={15} color={active ? '#fff' : colors.textSecondary} />
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{type.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Section>

            <Pressable style={styles.toggleRow} onPress={() => update({ verified: !draft.verified })}>
              <View style={[styles.toggleIcon, { backgroundColor: `${colors.success}1F` }]}>
                <Icon name="shield-checkmark" size={18} color={colors.success} />
              </View>
              <View style={styles.sectionCopy}>
                <Text style={styles.toggleTitle}>Verified sellers only</Text>
                <Text style={styles.sectionHint}>Phone or business verified on KinBech</Text>
              </View>
              <View style={[styles.switch, draft.verified && styles.switchOn]}>
                <View style={[styles.knob, draft.verified && styles.knobOn]} />
              </View>
            </Pressable>
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <Pressable style={styles.resetBtn} onPress={resetAll}>
              <Icon name="refresh" size={16} color={colors.text} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable
              style={[styles.applyBtn, resultCount === 0 && styles.applyBtnMuted]}
              onPress={apply}
            >
              <Text style={styles.applyText}>{applyLabel}</Text>
              {resultCount > 0 ? <Icon name="arrow-forward" size={16} color="#fff" /> : null}
            </Pressable>
          </View>
        </Reanimated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  fill: {
    flex: 1,
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderTopWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    marginTop: 10,
    backgroundColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },
  headerIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textSecondary,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  summaryScroll: {
    flexGrow: 0,
  },
  summaryRow: {
    gap: 8,
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  summaryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.glow,
    borderWidth: 1,
    borderColor: `${colors.primary}55`,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  section: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glow,
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  sectionHint: {
    marginTop: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  resetLink: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  sortGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 8,
  },
  sortTile: {
    width: '49%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  sortTileActive: {
    borderColor: colors.primary,
    backgroundColor: colors.glow,
  },
  sortIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  sortIconActive: {
    backgroundColor: colors.primary,
  },
  sortCopy: {
    flex: 1,
    minWidth: 0,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  sortLabelActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  sortHint: {
    marginTop: 1,
    fontSize: 10,
    color: colors.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  priceField: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 7,
    paddingBottom: 4,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  priceCaption: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pricePrefix: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  priceInput: {
    flex: 1,
    paddingVertical: 4,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  priceDash: {
    width: 10,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.border,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: '#fff',
  },
  segment: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
  },
  segmentItemActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: '#fff',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  switch: {
    width: 46,
    height: 28,
    borderRadius: 14,
    padding: 3,
    backgroundColor: colors.border,
  },
  switchOn: {
    backgroundColor: colors.primary,
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
  },
  knobOn: {
    transform: [{ translateX: 18 }],
  },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  resetText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  applyBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.primary,
  },
  applyBtnMuted: {
    backgroundColor: colors.textMuted,
  },
  applyText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
});
