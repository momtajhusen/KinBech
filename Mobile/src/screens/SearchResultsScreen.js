import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
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
import SellerProfileCard from '../components/SellerProfileCard';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { toCardItem, attachDistanceToCard } from '../utils/listing';
import { catalogFingerprint, readSearchMemory, writeSearchMemory } from '../utils/homeListingsCache';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const GRID_PADDING = 16;
const GRID_GUTTER = 12;
const SCOPES = [
  { key: 'all', label: 'All' },
  { key: 'products', label: 'Products' },
  { key: 'sellers', label: 'Sellers' },
];

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

  const [searchText, setSearchText] = useState(route?.params?.query || '');
  const [query, setQuery] = useState(route?.params?.query || '');
  const [favorites, setFavorites] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState(route?.params?.sort || 'distance');
  const [listings, setListings] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(true);
  const listingsFpRef = useRef('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
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

  const loadResults = useCallback(async ({ silent = false, pageToLoad = 1, append = false } = {}) => {
    if (append) setLoadingMore(true);
    else if (!silent) setLoading(true);

    const listingPromise = api.searchListings({
      ...queryParams,
      page: pageToLoad,
      limit: 20,
    });
    const sellerPromise = append
      ? Promise.resolve(null)
      : api.searchSellers({
          ...queryParams,
          nearby: queryParams.lat != null ? 'true' : undefined,
        });
    const [{ data, error }, sellerResult] = await Promise.all([listingPromise, sellerPromise]);
    const radiusKm = Number(queryParams.radius);
    const nextSellers = (sellerResult?.data?.sellers || []).filter((seller) => {
      if (!radiusKm) return true;
      return seller.distance != null && Number(seller.distance) <= radiusKm;
    });

    if (!append) setSellers(nextSellers);

    if (error) {
      console.error('Failed to load search results:', error);
      if (!append && !listingsFpRef.current) setListings([]);
      if (!append && !listingsFpRef.current) {
        setHasMore(false);
        setTotalResults(0);
      }
    } else {
      const next = data?.listings || [];
      const nextFp = catalogFingerprint(next);
      if (append || nextFp !== listingsFpRef.current) {
        listingsFpRef.current = append ? `${listingsFpRef.current}\n${nextFp}` : nextFp;
        setListings((prev) => (append ? [...prev, ...next] : next));
      }
      setPage(data?.page || pageToLoad);
      setHasMore(Boolean(data?.hasMore));
      setTotalResults(Number(data?.total) || next.length);
      if (!append) {
        writeSearchMemory(JSON.stringify(queryParams), {
          listings: next,
          sellers: nextSellers,
          page: data?.page || pageToLoad,
          hasMore: Boolean(data?.hasMore),
          total: Number(data?.total) || next.length,
        });
      }
    }

    if (append) setLoadingMore(false);
    else if (!silent) setLoading(false);
  }, [queryParams]);

  const { refreshing, onRefresh } = usePullRefresh(() =>
    loadResults({ silent: true, pageToLoad: 1, append: false })
  );

  const searchKey = JSON.stringify(queryParams);

  useEffect(() => {
    const cached = readSearchMemory(searchKey);
    if (cached?.listings?.length || cached?.sellers?.length) {
      listingsFpRef.current = catalogFingerprint(cached.listings || []);
      setListings(cached.listings || []);
      setSellers(cached.sellers || []);
      setPage(cached.page || 1);
      setHasMore(Boolean(cached.hasMore));
      setTotalResults(cached.total || cached.listings?.length || 0);
      setLoading(false);
      loadResults({ silent: true, pageToLoad: 1, append: false });
      return;
    }
    listingsFpRef.current = '';
    loadResults({ silent: false, pageToLoad: 1, append: false });
  }, [searchKey, loadResults]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || scope === 'sellers') return;
    loadResults({ silent: true, pageToLoad: page + 1, append: true });
  }, [loading, loadingMore, hasMore, page, loadResults, scope]);

  const cards = useMemo(
    () => (listings || []).map(toCardItem).filter(Boolean).map((it) => attachDistanceToCard(it, userCoords)),
    [listings, userCoords],
  );

  const matchedSellers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return sellers.filter((seller) => {
      const name = String(seller.name || '').toLowerCase();
      const about = String(seller.description || '').toLowerCase();
      return name.includes(needle) || about.includes(needle);
    });
  }, [sellers, query]);

  const showProducts = scope !== 'sellers';
  const showSellers = scope !== 'products';
  const visibleCount = (showProducts ? totalResults : 0) + (showSellers ? matchedSellers.length : 0);

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

      <View style={styles.scopeRow}>
        {SCOPES.map((item) => {
          const active = scope === item.key;
          const count = item.key === 'products'
            ? totalResults
            : item.key === 'sellers'
              ? matchedSellers.length
              : totalResults + matchedSellers.length;
          return (
            <Pressable
              key={item.key}
              style={[styles.scopeTab, active && styles.scopeTabActive]}
              onPress={() => setScope(item.key)}
            >
              <Text style={[styles.scopeText, active && styles.scopeTextActive]}>{item.label}</Text>
              <Text style={[styles.scopeCount, active && styles.scopeCountActive]}>{count}</Text>
            </Pressable>
          );
        })}
      </View>

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
          {loading
            ? 'Searching…'
            : `${visibleCount} result${visibleCount === 1 ? '' : 's'} found`}
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
        ) : visibleCount === 0 ? (
          <EmptyState
            compact
            icon="search-outline"
            title="No results found"
            body="Try another word, or change distance, category, and price filters."
          />
        ) : (
          <>
            <View style={styles.grid}>
              {showProducts
                ? cards.map((item) => (
                    <ProductCard
                      key={`product-${item.id}`}
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
                  ))
                : null}
            </View>
            {showSellers && matchedSellers.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.sellerRow}
              >
                {matchedSellers.map((seller) => (
                  <SellerProfileCard
                    key={`seller-${seller.id || seller._id}`}
                    seller={seller}
                    sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
                    onPress={() => {
                      if (seller.sellerType === 'shop' || seller.shopId) {
                        navigation.navigate(ROUTES.SHOP_PROFILE, {
                          shopId: seller.shopId || seller._id || seller.id,
                        });
                        return;
                      }
                      navigation.navigate(ROUTES.SELLER_PROFILE, {
                        seller,
                        sellerId: seller._id || seller.id || seller.userId,
                      });
                    }}
                  />
                ))}
              </ScrollView>
            ) : null}
            {showProducts && hasMore ? (
              <Pressable
                style={styles.loadMoreBtn}
                onPress={loadMore}
                disabled={loadingMore}
              >
                <Text style={styles.loadMoreText}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </Text>
              </Pressable>
            ) : null}
          </>
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
  sellerRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 14,
    paddingBottom: 4,
  },
  loadMoreBtn: {
    marginTop: 16,
    marginBottom: 8,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  scopeTab: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  scopeTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  scopeText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  scopeTextActive: {
    color: colors.onPrimary,
  },
  scopeCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  scopeCountActive: {
    color: colors.onPrimary,
  },
});
