import { useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTheme, useThemedStyles } from '../theme';
import { useCategories } from '../utils/categories';

const PRICE_MIN = 5000;
const PRICE_MAX = 100000;
const TRACK_PADDING = 12;

const CONDITIONS = ['All', 'New', 'Good', 'Fair'];

const DISTANCES = [
  { label: 'All Distances', radiusKm: null },
  { label: 'Within 1 km', radiusKm: 1 },
  { label: 'Within 5 km', radiusKm: 5 },
  { label: 'Within 10 km', radiusKm: 10 },
  { label: 'Within 25 km', radiusKm: 25 },
  { label: 'Within 50 km', radiusKm: 50 },
];

const SORT_OPTIONS = [
  { label: 'Nearest First', key: 'distance' },
  { label: 'Most Relevant', key: 'relevance' },
  { label: 'Newest First', key: 'newest' },
  { label: 'Price: Low to High', key: 'price-low' },
  { label: 'Price: High to Low', key: 'price-high' },
];

function formatPrice(value) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`;
}

const createStyles = (colors) => ({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingTop: 10,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 14,
  },
  scrollBody: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  sectionSpacing: {
    marginTop: 24,
    marginBottom: 12,
  },
  priceRangeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.price,
  },
  sliderTrackWrap: {
    height: 40,
    justifyContent: 'center',
    marginTop: 20,
  },
  sliderBase: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginHorizontal: TRACK_PADDING,
  },
  sliderActive: {
    position: 'absolute',
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
  },
  thumb: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 2.5,
    shadowColor: colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  thumbMin: {
    borderColor: colors.primary,
  },
  thumbMax: {
    borderColor: colors.secondary,
  },
  priceLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  priceLabel: {
    fontSize: 13,
    color: colors.textMuted,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryChip: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: colors.background,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: colors.primary,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  categoryLabelActive: {
    color: colors.onPrimary,
  },
  conditionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  conditionPill: {
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.background,
  },
  conditionPillActive: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  conditionText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  conditionTextActive: {
    color: colors.primary,
    fontWeight: '700',
  },
  radioGroup: {
    gap: 18,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterActive: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  radioLabel: {
    fontSize: 15,
    color: colors.text,
  },
  sortGroup: {
    gap: 14,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  sortLabel: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  resetBtn: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  applyBtnWrap: {
    flex: 1.6,
  },
  applyBtn: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});

function RangeSlider({ min, max, valueMin, valueMax, onChange }) {
  const styles = useThemedStyles(createStyles);
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);
  const valueMinRef = useRef(valueMin);
  const valueMaxRef = useRef(valueMax);
  const dragStartPixel = useRef(0);

  widthRef.current = width;
  valueMinRef.current = valueMin;
  valueMaxRef.current = valueMax;

  const posFromValue = (value) => ((value - min) / (max - min)) * widthRef.current;
  const valueFromPos = (pos) => min + (pos / widthRef.current) * (max - min);

  const createResponder = (isMin) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartPixel.current = posFromValue(
          isMin ? valueMinRef.current : valueMaxRef.current
        );
      },
      onPanResponderMove: (_, gesture) => {
        if (!widthRef.current) return;
        const rawPos = Math.max(
          0,
          Math.min(widthRef.current, dragStartPixel.current + gesture.dx)
        );
        const newValue = Math.round(valueFromPos(rawPos) / 500) * 500;

        if (isMin) {
          const clamped = Math.min(newValue, valueMaxRef.current - 1000);
          onChange(Math.max(min, clamped), valueMaxRef.current);
        } else {
          const clamped = Math.max(newValue, valueMinRef.current + 1000);
          onChange(valueMinRef.current, Math.min(max, clamped));
        }
      },
    });

  const minResponder = useRef(createResponder(true)).current;
  const maxResponder = useRef(createResponder(false)).current;

  const minPos = width ? posFromValue(valueMin) : 0;
  const maxPos = width ? posFromValue(valueMax) : width;

  return (
    <View
      style={styles.sliderTrackWrap}
      onLayout={(e) => {
        const w = e.nativeEvent.layout.width - TRACK_PADDING * 2;
        setWidth(w);
      }}
    >
      <View style={styles.sliderBase} />
      {width > 0 && (
        <>
          <View
            style={[
              styles.sliderActive,
              { left: minPos + TRACK_PADDING, width: Math.max(0, maxPos - minPos) },
            ]}
          />
          <View
            {...minResponder.panHandlers}
            style={{
              position: 'absolute',
              left: minPos + TRACK_PADDING - 30,
              top: 0,
              width: 60,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={[styles.thumb, styles.thumbMin]} />
          </View>
          <View
            {...maxResponder.panHandlers}
            style={{
              position: 'absolute',
              left: maxPos + TRACK_PADDING - 30,
              top: 0,
              width: 60,
              height: 40,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={[styles.thumb, styles.thumbMax]} />
          </View>
        </>
      )}
    </View>
  );
}

export default function FilterBottomSheet({ visible, onClose, onApply, initial }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const productCategories = useCategories('product');
  const categoryOptions = [
    { label: 'All', icon: 'apps' },
    ...productCategories,
  ];
  const [priceMin, setPriceMin] = useState(initial?.priceMin ?? PRICE_MIN);
  const [priceMax, setPriceMax] = useState(initial?.priceMax ?? PRICE_MAX);
  const [category, setCategory] = useState(initial?.category ?? 'All');
  const [condition, setCondition] = useState(initial?.condition ?? 'All');
  const [distance, setDistance] = useState(initial?.distance ?? DISTANCES[0].label);
  const [sortBy, setSortBy] = useState(initial?.sortBy ?? 'Nearest First');

  const reset = () => {
    setPriceMin(PRICE_MIN);
    setPriceMax(PRICE_MAX);
    setCategory('All');
    setCondition('All');
    setDistance(DISTANCES[0].label);
    setSortBy('Nearest First');
  };

  const apply = () => {
    const distItem = DISTANCES.find((d) => d.label === distance) || DISTANCES[0];
    const sortItem = SORT_OPTIONS.find((s) => s.label === sortBy) || SORT_OPTIONS[0];
    const filters = {
      priceMin,
      priceMax,
      category,
      condition,
      distance,
      radiusKm: distItem.radiusKm,
      sortBy,
      sortKey: sortItem.key,
    };
    if (onApply) onApply(filters);
    else onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <Text style={styles.title}>Filters</Text>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.headerDivider} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Price Range</Text>
              <Text style={styles.priceRangeText}>
                {formatPrice(priceMin)} - {formatPrice(priceMax)}
              </Text>
            </View>

            <RangeSlider
              min={PRICE_MIN}
              max={PRICE_MAX}
              valueMin={priceMin}
              valueMax={priceMax}
              onChange={(lo, hi) => {
                setPriceMin(lo);
                setPriceMax(hi);
              }}
            />
            <View style={styles.priceLabelsRow}>
              <Text style={styles.priceLabel}>{formatPrice(PRICE_MIN)}</Text>
              <Text style={styles.priceLabel}>{formatPrice(PRICE_MAX)}</Text>
            </View>

            <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Category</Text>
            <View style={styles.categoryGrid}>
              {(categoryOptions || []).map((item) => {
                const active = category === item.label;
                return (
                  <Pressable
                    key={item.label}
                    style={[styles.categoryChip, active && styles.categoryChipActive]}
                    onPress={() => setCategory(item.label)}
                  >
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={{ width: 20, height: 20, borderRadius: 6 }} />
                    ) : (
                      <Ionicons
                        name={item.icon}
                        size={20}
                        color={active ? colors.onPrimary : colors.text}
                      />
                    )}
                    <Text style={[styles.categoryLabel, active && styles.categoryLabelActive]}>
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Condition</Text>
            <View style={styles.conditionRow}>
              {(CONDITIONS || []).map((item) => {
                const active = condition === item;
                return (
                  <Pressable
                    key={item}
                    style={[styles.conditionPill, active && styles.conditionPillActive]}
                    onPress={() => setCondition(item)}
                  >
                    <Text
                      style={[styles.conditionText, active && styles.conditionTextActive]}
                    >
                      {item}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Distance</Text>
            <View style={styles.radioGroup}>
              {(DISTANCES || []).map((item) => {
                const active = distance === item.label;
                return (
                  <Pressable
                    key={item.label}
                    style={styles.radioRow}
                    onPress={() => setDistance(item.label)}
                  >
                    <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                      {active && <View style={styles.radioInner} />}
                    </View>
                    <Text style={styles.radioLabel}>{item.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[styles.sectionTitle, styles.sectionSpacing]}>Sort By</Text>
            <View style={styles.sortGroup}>
              {(SORT_OPTIONS || []).map((item) => {
                const active = sortBy === item.label;
                return (
                  <Pressable
                    key={item.key}
                    style={styles.sortRow}
                    onPress={() => setSortBy(item.label)}
                  >
                    <View style={[styles.radioOuter, active && styles.radioOuterActive]}>
                      {active && <View style={styles.radioInner} />}
                    </View>
                    <Text style={styles.sortLabel}>{item.label}</Text>
                    {active ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={colors.primary}
                        style={styles.checkIcon}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.resetBtn} onPress={reset}>
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable style={styles.applyBtnWrap} onPress={apply}>
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.applyBtn}
              >
                <Text style={styles.applyText}>Apply Filters</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
