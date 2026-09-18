import { useEffect, useMemo, useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import FilterBottomSheet from '../components/FilterBottomSheet';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { openItemDetail } from '../navigation/helpers';
import { api } from '../services/api';
import { toCardItem, attachDistanceToCard } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useAuth } from '../context/AuthContext';

const GRID_PADDING = 16;
const GRID_GUTTER = 12;

const SORT_ORDER = [
  { label: 'Nearest First', key: 'distance' },
  { label: 'Most Relevant', key: 'relevance' },
  { label: 'Newest First', key: 'newest' },
  { label: 'Price: Low to High', key: 'price-low' },
  { label: 'Price: High to Low', key: 'price-high' },
];

const SORT_KEY_TO_LABEL = SORT_ORDER.reduce((acc, s) => {
  acc[s.key] = s.label;
  return acc;
}, {});

export default function SearchResultsScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = (windowWidth - GRID_PADDING * 2 - GRID_GUTTER) / 2;

  const { user } = useAuth();
  const [searchText, setSearchText] = useState(route?.params?.query || '');
  const [query, setQuery] = useState(route?.params?.query || '');
  const [favorites, setFavorites] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState(route?.params?.sort || 'distance');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [hasLocationPerm, setHasLocationPerm] = useState(false);

  const [filters, setFilters] = useState({
    category: route?.params?.category,
    condition: route?.params?.condition,
    minPrice: route?.params?.minPrice,
    maxPrice: route?.params?.maxPrice,
    radiusKm: route?.params?.radiusKm ?? null,
    distance: route?.params?.distance || 'All Distances',
    priceMin: route?.params?.priceMin,
    priceMax: route?.params?.priceMax,
    sortBy: SORT_KEY_TO_LABEL[sortKey] || 'Nearest First',
  });

  const sortLabel = SORT_KEY_TO_LABEL[sortKey] || 'Nearest First';
  const categoryActive = Boolean(filters.category && filters.category !== 'All' && filters.category !== 'More');
  const conditionActive = Boolean(filters.condition && filters.condition !== 'All');
  const distanceActive = filters.radiusKm != null;
  const priceActive = filters.priceMin != null || filters.priceMax != null || filters.minPrice != null || filters.maxPrice != null;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchText), 350);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (status === 'granted') {
          setHasLocationPerm(true);
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }).catch(() => null);
          if (!active) return;
          if (loc?.coords) {
            setUserCoords({
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            });
          }
        } else {
          setHasLocationPerm(false);
        }
      } catch {
        if (active) setHasLocationPerm(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const queryParams = useMemo(() => {
    const params = {};
    if (query && query.trim()) params.q = query.trim();
    if (categoryActive) params.category = filters.category;
    if (conditionActive) params.condition = filters.condition;
    const minPrice = filters.priceMin ?? filters.minPrice;
    const maxPrice = filters.priceMax ?? filters.maxPrice;
    if (minPrice != null && minPrice !== '') params.minPrice = Number(minPrice);
    if (maxPrice != null && maxPrice !== '') params.maxPrice = Number(maxPrice);
    if (filters.radiusKm != null && Number(filters.radiusKm) > 0) {
      params.radius = Number(filters.radiusKm);
    }
    if (userCoords?.lat != null && userCoords?.lng != null) {
      params.lat = userCoords.lat;
      params.lng = userCoords.lng;
    }
    params.sort = sortKey;
    return params;
  }, [query, filters, sortKey, userCoords, categoryActive, conditionActive]);

  const loadResults = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const { data, error } = await api.searchListings(queryParams);
    if (error) {
      console.error('Failed to load search results:', error);
      setListings([]);
    } else {
      setListings(data?.listings || []);
    }
    if (!silent) setLoading(false);
  }, [queryParams]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadResults({ silent: true }));

  useEffect(() => {
    loadResults();
  }, [loadResults]);

  const cards = useMemo(
    () =>
      (listings || [])
        .map(toCardItem)
        .filter(Boolean)
        .map((it) => attachDistanceToCard(it, userCoords, user?.id)),
    [listings, userCoords, user?.id]
  );

  const cycleSort = () => {
    const idx = SORT_ORDER.findIndex((s) => s.key === sortKey);
    const next = SORT_ORDER[(idx + 1) % SORT_ORDER.length];
    setSortKey(next.key);
  };

  const toggleFavorite = async (id) => {
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
    await api.toggleWishlist(id);
  };

  const filterInitial = {
    category: filters.category ?? 'All',
    condition: filters.condition ?? 'All',
    distance: filters.distance ?? 'All Distances',
    sortBy: sortLabel,
    priceMin: filters.priceMin ?? filters.minPrice ?? 5000,
    priceMax: filters.priceMax ?? filters.maxPrice ?? 100000,
  };

  const renderChip = (active, icon, label) => (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={() => setFiltersOpen(true)}
    >
      <Ionicons name={icon} size={14} color={active ? colors.onPrimary : colors.text} />
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      <Ionicons name="chevron-down" size={12} color={active ? colors.onPrimary : colors.textMuted} />
    </Pressable>
  );

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={24} color={colors.onGradient} />
        </Pressable>

        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            style={styles.searchInput}
            placeholder="Search for things you love..."
            placeholderTextColor={colors.textTertiary}
            returnKeyType="search"
            onSubmitEditing={() => setQuery(searchText)}
          />
          {searchText.length > 0 && (
            <Pressable onPress={() => setSearchText('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        <Pressable style={styles.filterIconBtn} onPress={() => setFiltersOpen(true)}>
          <Ionicons name="options-outline" size={20} color={colors.primary} />
        </Pressable>
      </LinearGradient>

      <View style={styles.chipsWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {renderChip(
            distanceActive,
            'location-outline',
            distanceActive ? `${filters.radiusKm} km` : 'Distance'
          )}
          {renderChip(
            categoryActive,
            'grid-outline',
            categoryActive ? filters.category : 'Category'
          )}
          {renderChip(
            conditionActive,
            'shield-checkmark-outline',
            conditionActive ? filters.condition : 'Condition'
          )}
          {renderChip(priceActive, 'pricetag-outline', 'Price')}
        </ScrollView>
      </View>

      <View style={styles.resultsRow}>
        <Text style={styles.resultsCount}>
          {loading ? 'Searching…' : `${cards.length} result${cards.length === 1 ? '' : 's'} found`}
        </Text>
        <Pressable style={styles.sortBtn} onPress={cycleSort}>
          <Ionicons name="swap-vertical" size={15} color={colors.text} />
          <Text style={styles.sortText} numberOfLines={1}>
            {sortLabel}
          </Text>
          <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      {!hasLocationPerm && (
        <View style={styles.locationHint}>
          <Ionicons name="location-outline" size={16} color={colors.primary} />
          <Text style={styles.locationHintText}>
            Enable location to see nearest listings first
          </Text>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {loading ? (
          <View style={styles.grid}>
            {[0, 1, 2, 3].map((i) => (
              <ProductCardSkeleton key={i} width={cardWidth} compact />
            ))}
          </View>
        ) : cards.length === 0 ? (
          <EmptyState
            compact
            icon="search-outline"
            title="No results found"
            body="Try another search or change filters to find what you need."
          />
        ) : (
          <View style={styles.grid}>
            {cards.map((item) => (
              <ProductCard
                key={item.id}
                {...item}
                compact
                width={cardWidth}
                sharedId={item.id}
                saved={!!favorites[item.id]}
                onToggleSave={() => toggleFavorite(item.id)}
                onPress={() =>
                  openItemDetail(navigation, {
                    listingId: item.id,
                    item: item.listing,
                    sharedId: item.id,
                  })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>

      <FilterBottomSheet
        visible={filtersOpen}
        initial={filterInitial}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters((prev) => ({
            ...prev,
            category: next.category,
            condition: next.condition,
            minPrice: next.priceMin,
            maxPrice: next.priceMax,
            priceMin: next.priceMin,
            priceMax: next.priceMax,
            radiusKm: next.radiusKm ?? null,
            distance: next.distance ?? prev.distance,
            sortBy: next.sortBy,
          }));
          if (next.sortKey) {
            setSortKey(next.sortKey);
          }
          setFiltersOpen(false);
        }}
      />
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  filterIconBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipsWrap: {
    paddingTop: 12,
    paddingBottom: 4,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 36,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    maxWidth: 120,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  resultsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resultsCount: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: '55%',
  },
  sortText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  locationHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.primarySoft || colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  locationHintText: {
    fontSize: 12,
    color: colors.text,
    fontWeight: '500',
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: GRID_PADDING,
    flexGrow: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GUTTER,
  },
});
