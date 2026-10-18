import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import {
  ActivityIndicator,
  Image,
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmptyState from '../components/EmptyState';
import FilterBottomSheet from '../components/FilterBottomSheet';
import HighlightText from '../components/HighlightText';
import ProductCard from '../components/ProductCard';
import { INDIVIDUAL_GRADIENT } from '../components/SellerProfileCard';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import {
  attachDistanceToCard,
  attachDistanceToSeller,
  formatDistanceLabel,
  resolveMediaUrl,
  toCardItem,
} from '../utils/listing';
import {
  catalogFingerprint,
  getHomeListingsMemory,
  readSearchMemory,
  writeSearchMemory,
} from '../utils/homeListingsCache';
import { useCategories } from '../utils/categories';
import {
  clearRecentSearches,
  forgetSearch,
  loadRecentSearches,
  rememberSearch,
} from '../utils/recentSearches';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const GRID_PADDING = 16;
const GRID_GUTTER = 12;
const PRICE_DEFAULT_MIN = 5000;
const PRICE_DEFAULT_MAX = 100000;
const SELLER_PREVIEW = 8;

const SCOPES = [
  { key: 'all', label: 'All' },
  { key: 'products', label: 'Products' },
  { key: 'sellers', label: 'Sellers' },
];

const SORT_ORDER = [
  { key: 'relevance', label: 'Best match', icon: 'sparkles-outline' },
  { key: 'distance', label: 'Nearest first', icon: 'navigate-outline' },
  { key: 'newest', label: 'Newest first', icon: 'time-outline' },
  { key: 'trending', label: 'Trending', icon: 'flame-outline' },
  { key: 'price-low', label: 'Price: low to high', icon: 'trending-up-outline' },
  { key: 'price-high', label: 'Price: high to low', icon: 'trending-down-outline' },
];

const SHEET_SORT_LABELS = {
  distance: 'Nearest First',
  relevance: 'Most Relevant',
  newest: 'Newest First',
  trending: 'Trending',
  'price-low': 'Price: Low to High',
  'price-high': 'Price: High to Low',
};

function cleanPrice(value, fallback) {
  const n = Number(value);
  if (value == null || value === '' || !Number.isFinite(n) || n === fallback) return null;
  return n;
}

function priceLabel(min, max) {
  const fmt = (n) => `Rs ${Number(n).toLocaleString('en-IN')}`;
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  if (min != null) return `From ${fmt(min)}`;
  return `Up to ${fmt(max)}`;
}

export default function SearchResultsScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = (windowWidth - GRID_PADDING * 2 - GRID_GUTTER) / 2;
  const storeCardWidth = Math.min(320, Math.round(windowWidth * 0.8));
  const productCategories = useCategories('product');
  const params = route?.params || {};
  const initialQuery = String(params.query || '').trim();
  const presetTitle = params.title ? String(params.title) : '';
  const presetSubtitle = params.subtitle ? String(params.subtitle) : '';

  const inputRef = useRef(null);
  const sortTouchedRef = useRef(Boolean(params.sort));
  const layoutTouchedRef = useRef(false);
  const listingsFpRef = useRef('');

  const [searchText, setSearchText] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [browseAll] = useState(Boolean(params.browse));
  const [inputFocused, setInputFocused] = useState(false);
  const [sortKey, setSortKey] = useState(params.sort || (initialQuery ? 'relevance' : 'distance'));
  const [layout, setLayout] = useState(initialQuery ? 'list' : 'grid');
  const [scope, setScope] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [favorites, setFavorites] = useState({});
  const [recent, setRecent] = useState([]);

  const [filters, setFilters] = useState(() => ({
    category: params.category,
    condition: params.condition,
    priceMin: cleanPrice(params.priceMin ?? params.minPrice, PRICE_DEFAULT_MIN),
    priceMax: cleanPrice(params.priceMax ?? params.maxPrice, PRICE_DEFAULT_MAX),
    radiusKm: params.radiusKm ?? null,
  }));

  const [listings, setListings] = useState([]);
  const [sellers, setSellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  const [matchMode, setMatchMode] = useState('all');
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [hasLocationPerm, setHasLocationPerm] = useState(true);

  const [suggest, setSuggest] = useState({ q: '', suggestions: [], categories: [], stores: [] });
  const [suggestLoading, setSuggestLoading] = useState(false);

  const categoryActive = Boolean(filters.category && filters.category !== 'All' && filters.category !== 'More');
  const conditionActive = Boolean(filters.condition && filters.condition !== 'All');
  const distanceActive = filters.radiusKm != null && Number(filters.radiusKm) > 0;
  const priceActive = filters.priceMin != null || filters.priceMax != null;
  const activeFilterCount = [categoryActive, conditionActive, distanceActive, priceActive].filter(Boolean).length;

  const trimmedText = searchText.trim();
  const hasContext = Boolean(query) || activeFilterCount > 0 || browseAll;
  const showSuggestions = Boolean(trimmedText) && trimmedText !== query;
  const showDiscovery = !showSuggestions && (!hasContext || (inputFocused && !trimmedText));
  const showResults = !showSuggestions && !showDiscovery;

  useEffect(() => {
    loadRecentSearches().then(setRecent);
  }, []);

  useEffect(() => {
    if (initialQuery || params.category || params.browse) return undefined;
    const focus = () => inputRef.current?.focus();
    const unsubscribe = navigation.addListener('transitionEnd', focus);
    const timer = setTimeout(focus, 500);
    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (status !== 'granted') {
          setHasLocationPerm(false);
          return;
        }
        setHasLocationPerm(true);
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null);
        if (active && loc?.coords) {
          setUserCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }
      } catch {
        if (active) setHasLocationPerm(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!showSuggestions) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSuggestLoading(true);
      const { data } = await api.getSearchSuggestions(trimmedText);
      if (cancelled) return;
      setSuggest({
        q: trimmedText,
        suggestions: data?.suggestions || [],
        categories: data?.categories || [],
        stores: data?.stores || [],
      });
      setSuggestLoading(false);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedText, showSuggestions]);

  const queryParams = useMemo(() => {
    const next = { sort: sortKey };
    if (query) next.q = query;
    if (categoryActive) next.category = filters.category;
    if (conditionActive) next.condition = filters.condition;
    if (filters.priceMin != null) next.minPrice = Number(filters.priceMin);
    if (filters.priceMax != null) next.maxPrice = Number(filters.priceMax);
    if (distanceActive) next.radius = Number(filters.radiusKm);
    if (userCoords.lat != null && userCoords.lng != null) {
      next.lat = userCoords.lat;
      next.lng = userCoords.lng;
    }
    return next;
  }, [query, filters, sortKey, userCoords, categoryActive, conditionActive, distanceActive]);

  const loadResults = useCallback(async ({ silent = false, pageToLoad = 1, append = false } = {}) => {
    if (append) setLoadingMore(true);
    else if (!silent) setLoading(true);

    const listingPromise = api.searchListings({ ...queryParams, page: pageToLoad, limit: 20 });
    const sellerPromise = append || !queryParams.q
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
      if (!append && !listingsFpRef.current) {
        setListings([]);
        setHasMore(false);
        setTotalResults(0);
      }
    } else {
      const next = data?.listings || [];
      const nextFp = catalogFingerprint(next);
      if (append || nextFp !== listingsFpRef.current || !next.length) {
        listingsFpRef.current = append ? `${listingsFpRef.current}\n${nextFp}` : nextFp;
        setListings((prev) => (append ? [...prev, ...next] : next));
      }
      const total = Number(data?.total) || next.length;
      setPage(data?.page || pageToLoad);
      setHasMore(Boolean(data?.hasMore));
      setTotalResults(total);
      if (!append) {
        setMatchMode(data?.matchMode || 'all');
        writeSearchMemory(JSON.stringify(queryParams), {
          listings: next,
          sellers: nextSellers,
          page: data?.page || pageToLoad,
          hasMore: Boolean(data?.hasMore),
          total,
          matchMode: data?.matchMode || 'all',
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
    if (!hasContext) {
      listingsFpRef.current = '';
      setListings([]);
      setSellers([]);
      setTotalResults(0);
      setLoading(false);
      return;
    }
    const cached = readSearchMemory(searchKey);
    if (cached) {
      listingsFpRef.current = catalogFingerprint(cached.listings || []);
      setListings(cached.listings || []);
      setSellers(cached.sellers || []);
      setPage(cached.page || 1);
      setHasMore(Boolean(cached.hasMore));
      setTotalResults(cached.total || cached.listings?.length || 0);
      setMatchMode(cached.matchMode || 'all');
      setLoading(false);
      loadResults({ silent: true, pageToLoad: 1, append: false });
      return;
    }
    listingsFpRef.current = '';
    loadResults({ silent: false, pageToLoad: 1, append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchKey, hasContext, loadResults]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore || scope === 'sellers') return;
    loadResults({ silent: true, pageToLoad: page + 1, append: true });
  }, [loading, loadingMore, hasMore, page, loadResults, scope]);

  const cards = useMemo(
    () => listings.map(toCardItem).filter(Boolean).map((it) => attachDistanceToCard(it, userCoords)),
    [listings, userCoords],
  );

  const placedSellers = useMemo(
    () => sellers.map((seller) => attachDistanceToSeller(seller, userCoords)),
    [sellers, userCoords],
  );

  const trending = useMemo(() => {
    const items = getHomeListingsMemory()?.listings || [];
    return [...items].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 6);
  }, []);

  const showProducts = scope !== 'sellers';
  const showSellers = Boolean(query) && scope !== 'products';
  const visibleCount = (showProducts ? totalResults : 0) + (showSellers ? placedSellers.length : 0);
  const sortLabel = SORT_ORDER.find((s) => s.key === sortKey)?.label || 'Best match';

  const submitSearch = useCallback((text, { category } = {}) => {
    const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!clean && !category) return;
    if (category) setFilters((prev) => ({ ...prev, category }));
    setSearchText(clean);
    setQuery(clean);
    setScope('all');
    if (clean) setRecent(rememberSearch(clean));
    if (!sortTouchedRef.current) setSortKey(clean ? 'relevance' : 'distance');
    if (!layoutTouchedRef.current) setLayout(clean ? 'list' : 'grid');
    Keyboard.dismiss();
    inputRef.current?.blur();
  }, []);

  const clearInput = () => {
    setSearchText('');
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    setInputFocused(false);
    if (!searchText.trim() && query) setSearchText(query);
  };

  const clearFilter = (key) => {
    setFilters((prev) => {
      if (key === 'price') return { ...prev, priceMin: null, priceMax: null };
      if (key === 'distance') return { ...prev, radiusKm: null };
      return { ...prev, [key]: undefined };
    });
  };

  const clearAllFilters = () => {
    setFilters({ category: undefined, condition: undefined, priceMin: null, priceMax: null, radiusKm: null });
  };

  const toggleFavorite = async (id) => {
    setFavorites((prev) => ({ ...prev, [id]: !prev[id] }));
    await api.toggleWishlist(id);
  };

  const openProduct = (item) =>
    openItemDetail(navigation, { listingId: item.id, item: item.listing || item, sharedId: item.id });

  const openSeller = (seller) => {
    if (seller.sellerType === 'shop' || seller.shopId) {
      navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: seller.shopId || seller._id || seller.id });
      return;
    }
    navigation.navigate(ROUTES.SELLER_PROFILE, {
      seller,
      sellerId: seller._id || seller.id || seller.userId,
    });
  };

  const filterInitial = {
    category: filters.category ?? 'All',
    condition: filters.condition ?? 'All',
    distance: distanceActive ? `Within ${filters.radiusKm} km` : 'All Distances',
    sortBy: SHEET_SORT_LABELS[sortKey] || 'Nearest First',
    priceMin: filters.priceMin ?? PRICE_DEFAULT_MIN,
    priceMax: filters.priceMax ?? PRICE_DEFAULT_MAX,
  };

  const highlight = styles.highlight;

  const renderFilterChip = (key, active, icon, label) => (
    <Pressable
      key={key}
      style={[styles.chip, active && styles.chipActive]}
      onPress={() => setFiltersOpen(true)}
    >
      <Ionicons name={icon} size={14} color={active ? colors.onPrimary : colors.textSecondary} />
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
      {active ? (
        <Pressable hitSlop={8} onPress={() => clearFilter(key)}>
          <Ionicons name="close-circle" size={15} color={colors.onPrimary} />
        </Pressable>
      ) : (
        <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
      )}
    </Pressable>
  );

  const renderSellerCard = (seller, { carousel = false } = {}) => {
    const isShop = seller.sellerType === 'shop' || Boolean(seller.shopId);
    const avatar = resolveMediaUrl(seller.avatarUrl || '');
    const cover = isShop && seller.coverImage ? resolveMediaUrl(seller.coverImage) : '';
    const distance = formatDistanceLabel(seller.distance);
    const about = seller.tagline || seller.description || '';
    const rating = Number(seller.rating) || 0;
    const reviews = Number(seller.reviewsCount) || 0;
    const gallery = (seller.productGallery || []).map((photo) => resolveMediaUrl(photo)).filter(Boolean).slice(0, 4);
    const city = String(seller.location || '').split(',')[0].trim();
    const subline = [seller.category, city].filter(Boolean).join(' · ');
    const accent = isShop ? colors.primary : colors.info;
    return (
      <Pressable
        key={`seller-${seller._id || seller.id}`}
        style={({ pressed }) => [
          styles.storeCard,
          carousel && { width: storeCardWidth },
          pressed && styles.pressed,
        ]}
        onPress={() => openSeller(seller)}
      >
        <View style={styles.storeBanner}>
          {cover ? (
            <>
              <Image source={{ uri: cover }} style={styles.fill} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.05)', 'rgba(0,0,0,0.45)']}
                style={styles.bannerShade}
              />
            </>
          ) : (
            <LinearGradient
              colors={isShop ? colors.gradient : INDIVIDUAL_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fill}
            />
          )}
          <View style={styles.bannerTags}>
            {distance ? (
              <View style={styles.bannerPill}>
                <Ionicons name="navigate" size={10} color={colors.white} />
                <Text style={styles.bannerPillText}>{distance}</Text>
              </View>
            ) : <View />}
            <View style={styles.bannerPill}>
              <Ionicons name={isShop ? 'storefront' : 'person'} size={10} color={colors.white} />
              <Text style={styles.bannerPillText}>{isShop ? 'STORE' : 'SELLER'}</Text>
            </View>
          </View>
        </View>

        <View style={styles.storeHead}>
          <View style={[styles.storeLogo, !isShop && styles.storeLogoRound]}>
            {avatar ? (
              <Image source={{ uri: avatar }} style={styles.fill} resizeMode="cover" />
            ) : (
              <Text style={[styles.storeInitial, { color: accent }]}>
                {String(seller.name || '?').charAt(0).toUpperCase()}
              </Text>
            )}
          </View>
          <View style={styles.storeTitleBox}>
            <View style={styles.sellerNameRow}>
              <HighlightText
                text={seller.name}
                query={query}
                style={styles.storeName}
                highlightStyle={highlight}
                numberOfLines={1}
              />
              {seller.verified ? (
                <Ionicons
                  name={isShop ? 'shield-checkmark' : 'checkmark-circle'}
                  size={16}
                  color={isShop ? colors.success : colors.info}
                />
              ) : null}
            </View>
            {subline ? <Text style={styles.storeSub} numberOfLines={1}>{subline}</Text> : null}
          </View>
        </View>

        <View style={styles.storeBody}>
          {about ? (
            <HighlightText
              text={about}
              query={query}
              style={styles.storeAbout}
              highlightStyle={highlight}
              numberOfLines={2}
            />
          ) : null}

          <View style={styles.storeStats}>
            <View style={styles.statPill}>
              <Ionicons name="star" size={12} color={colors.warning} />
              <Text style={styles.statText}>
                {rating > 0 ? `${rating.toFixed(1)}${reviews ? ` (${reviews})` : ''}` : 'New'}
              </Text>
            </View>
            <View style={styles.statPill}>
              <Ionicons name="cube-outline" size={12} color={accent} />
              <Text style={styles.statText}>{seller.listingCount || 0} items</Text>
            </View>
            {seller.verificationLabel ? (
              <View style={styles.statPill}>
                <Ionicons name="ribbon-outline" size={12} color={colors.success} />
                <Text style={styles.statText} numberOfLines={1}>{seller.verificationLabel}</Text>
              </View>
            ) : null}
          </View>

          {gallery.length > 0 ? (
            <View style={styles.storeGallery}>
              {gallery.map((photo, index) => (
                <View key={`${photo}-${index}`} style={styles.galleryThumb}>
                  <Image source={{ uri: photo }} style={styles.fill} resizeMode="cover" />
                  {index === gallery.length - 1 && (seller.listingCount || 0) > gallery.length ? (
                    <View style={styles.galleryMore}>
                      <Text style={styles.galleryMoreText}>+{seller.listingCount - gallery.length}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <View style={[styles.visitBtn, { backgroundColor: `${accent}14`, borderColor: `${accent}40` }]}>
            <Text style={[styles.visitText, { color: accent }]}>
              {isShop ? 'Visit store' : 'View profile'}
            </Text>
            <Ionicons name="arrow-forward" size={15} color={accent} />
          </View>
        </View>
      </Pressable>
    );
  };

  const renderProductRow = (item, index) => {
    const isShop = item.sellerType === 'shop';
    const bestMatch = index === 0 && query && sortKey === 'relevance' && matchMode === 'all';
    const saved = Boolean(favorites[item.id]);
    const place = [String(item.location || '').split(',')[0].trim(), item.distanceLabel]
      .filter(Boolean)
      .join(' · ');
    return (
      <Pressable
        key={`row-${item.id}`}
        style={({ pressed }) => [styles.productRow, bestMatch && styles.productRowBest, pressed && styles.pressed]}
        onPress={() => openProduct(item)}
      >
        <View style={styles.thumb}>
          {item.photo ? (
            <Image source={{ uri: item.photo }} style={styles.thumbImg} />
          ) : (
            <Ionicons name={item.icon || 'cube-outline'} size={28} color={colors.textTertiary} />
          )}
          {item.isFeatured ? (
            <View style={styles.featuredTag}>
              <Ionicons name="flash" size={9} color={colors.onPrimary} />
            </View>
          ) : null}
        </View>
        <View style={styles.productBody}>
          {bestMatch ? (
            <View style={styles.bestTag}>
              <Ionicons name="sparkles" size={10} color={colors.primary} />
              <Text style={styles.bestTagText}>Best match</Text>
            </View>
          ) : null}
          <HighlightText
            text={item.title}
            query={query}
            style={styles.productTitle}
            highlightStyle={highlight}
            numberOfLines={2}
          />
          <Text style={styles.productPrice}>{item.price}</Text>
          {place ? (
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={12} color={colors.textMuted} />
              <Text style={styles.metaText} numberOfLines={1}>{place}</Text>
            </View>
          ) : null}
          <View style={styles.metaItem}>
            <Ionicons
              name={isShop ? 'storefront-outline' : 'person-outline'}
              size={12}
              color={colors.textMuted}
            />
            <Text style={styles.metaText} numberOfLines={1}>{item.sellerName}</Text>
            {item.verificationKind ? (
              <Ionicons
                name={item.verificationKind === 'business' ? 'shield-checkmark' : 'checkmark-circle'}
                size={12}
                color={item.verificationKind === 'business' ? colors.success : colors.info}
              />
            ) : null}
          </View>
        </View>
        <Pressable hitSlop={10} style={styles.heartBtn} onPress={() => toggleFavorite(item.id)}>
          <Ionicons
            name={saved ? 'heart' : 'heart-outline'}
            size={18}
            color={saved ? colors.favorite : colors.textTertiary}
          />
        </Pressable>
      </Pressable>
    );
  };

  const renderProducts = () => {
    if (layout === 'list') {
      return <View style={styles.list}>{cards.map(renderProductRow)}</View>;
    }
    return (
      <View style={styles.grid}>
        {cards.map((item) => (
          <ProductCard
            key={`product-${item.id}`}
            {...item}
            compact
            width={cardWidth}
            sharedId={item.id}
            saved={!!favorites[item.id]}
            onToggleSave={() => toggleFavorite(item.id)}
            onPress={() => openProduct(item)}
          />
        ))}
      </View>
    );
  };

  const renderLoading = () => (layout === 'list' ? (
    <View style={styles.list}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View key={i} style={styles.productRow}>
          <View style={[styles.thumb, styles.skeleton]} />
          <View style={styles.productBody}>
            <View style={[styles.skeletonLine, { width: '85%' }]} />
            <View style={[styles.skeletonLine, { width: '40%' }]} />
            <View style={[styles.skeletonLine, { width: '60%' }]} />
          </View>
        </View>
      ))}
    </View>
  ) : (
    <View style={styles.grid}>
      {[0, 1, 2, 3].map((i) => (
        <ProductCardSkeleton key={i} width={cardWidth} compact />
      ))}
    </View>
  ));

  const renderDiscovery = () => (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.panel, { paddingBottom: insets.bottom + 32 }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      showsVerticalScrollIndicator={false}
    >
      {recent.length > 0 ? (
        <View style={styles.block}>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>Recent searches</Text>
            <Pressable hitSlop={8} onPress={() => setRecent(clearRecentSearches())}>
              <Text style={styles.blockAction}>Clear all</Text>
            </Pressable>
          </View>
          <View style={styles.recentWrap}>
            {recent.map((text) => (
              <Pressable key={text} style={styles.recentChip} onPress={() => submitSearch(text)}>
                <Ionicons name="time-outline" size={14} color={colors.textMuted} />
                <Text style={styles.recentText} numberOfLines={1}>{text}</Text>
                <Pressable hitSlop={8} onPress={() => setRecent(forgetSearch(text))}>
                  <Ionicons name="close" size={14} color={colors.textTertiary} />
                </Pressable>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {productCategories.length > 0 ? (
        <View style={styles.block}>
          <View style={styles.blockHeader}>
            <Text style={styles.blockTitle}>Browse categories</Text>
          </View>
          <View style={styles.categoryGrid}>
            {productCategories.slice(0, 8).map((cat) => {
              const tint = cat.tint || cat.color || colors.primary;
              return (
                <Pressable
                  key={cat.label}
                  style={({ pressed }) => [styles.categoryTile, pressed && styles.pressed]}
                  onPress={() => submitSearch('', { category: cat.label })}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: `${tint}1F` }]}>
                    {cat.imageUrl ? (
                      <Image source={{ uri: cat.imageUrl }} style={styles.categoryImg} />
                    ) : (
                      <Ionicons name={cat.icon || 'pricetag-outline'} size={22} color={tint} />
                    )}
                  </View>
                  <Text style={styles.categoryLabel} numberOfLines={2}>{cat.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {trending.length > 0 ? (
        <View style={styles.block}>
          <View style={styles.blockHeader}>
            <View style={styles.blockTitleRow}>
              <Ionicons name="flame" size={16} color={colors.favorite} />
              <Text style={styles.blockTitle}>Trending near you</Text>
            </View>
          </View>
          <View style={styles.trendList}>
            {trending.map((item, index) => (
              <Pressable
                key={`trend-${item.id}`}
                style={({ pressed }) => [styles.trendRow, pressed && styles.pressed]}
                onPress={() => openProduct(item)}
              >
                <Text style={styles.trendRank}>{index + 1}</Text>
                <View style={styles.trendThumb}>
                  {item.photo ? (
                    <Image source={{ uri: item.photo }} style={styles.thumbImg} />
                  ) : (
                    <Ionicons name={item.icon || 'cube-outline'} size={18} color={colors.textTertiary} />
                  )}
                </View>
                <View style={styles.flex}>
                  <Text style={styles.trendTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.trendPrice}>{item.price}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {!recent.length && !productCategories.length && !trending.length ? (
        <EmptyState
          compact
          icon="search-outline"
          title="Find anything near you"
          body="Search by product name, brand, store or seller."
        />
      ) : null}
    </ScrollView>
  );

  const renderSuggestions = () => {
    const fresh = suggest.q === trimmedText;
    const { suggestions, categories, stores } = fresh
      ? suggest
      : { suggestions: [], categories: [], stores: [] };
    const nothing = fresh && !suggestLoading && !suggestions.length && !categories.length && !stores.length;
    return (
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.suggestPanel, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          style={({ pressed }) => [styles.searchForRow, pressed && styles.pressed]}
          onPress={() => submitSearch(trimmedText)}
        >
          <View style={styles.searchForIcon}>
            <Ionicons name="search" size={16} color={colors.onPrimary} />
          </View>
          <Text style={styles.searchForText} numberOfLines={1}>
            Search for <Text style={styles.searchForQuery}>“{trimmedText}”</Text>
          </Text>
          <Ionicons name="arrow-forward" size={18} color={colors.primary} />
        </Pressable>

        {stores.length > 0 ? (
          <View style={styles.suggestGroup}>
            <Text style={styles.suggestGroupTitle}>Stores</Text>
            {stores.map((store) => {
              const logo = resolveMediaUrl(store.logo || '');
              return (
                <Pressable
                  key={`store-${store.id}`}
                  style={({ pressed }) => [styles.suggestRow, pressed && styles.pressed]}
                  onPress={() => navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: store.id })}
                >
                  <View style={styles.suggestStoreLogo}>
                    {logo ? (
                      <Image source={{ uri: logo }} style={styles.sellerAvatarImg} />
                    ) : (
                      <Ionicons name="storefront" size={16} color={colors.primary} />
                    )}
                  </View>
                  <View style={styles.flex}>
                    <View style={styles.sellerNameRow}>
                      <HighlightText
                        text={store.name}
                        query={trimmedText}
                        style={styles.suggestText}
                        highlightStyle={styles.suggestHighlight}
                        numberOfLines={1}
                      />
                      {store.isVerified ? (
                        <Ionicons name="shield-checkmark" size={13} color={colors.success} />
                      ) : null}
                    </View>
                    <Text style={styles.suggestSub} numberOfLines={1}>
                      Store{store.category ? ` · ${store.category}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {categories.length > 0 ? (
          <View style={styles.suggestGroup}>
            {categories.map((cat) => (
              <Pressable
                key={`cat-${cat.name}`}
                style={({ pressed }) => [styles.suggestRow, pressed && styles.pressed]}
                onPress={() => submitSearch(trimmedText, { category: cat.name })}
              >
                <View style={styles.suggestIcon}>
                  <Ionicons name="grid-outline" size={15} color={colors.primary} />
                </View>
                <Text style={styles.suggestText} numberOfLines={1}>
                  {trimmedText} <Text style={styles.suggestIn}>in {cat.name}</Text>
                </Text>
                <Text style={styles.suggestCount}>{cat.count}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {suggestions.length > 0 ? (
          <View style={styles.suggestGroup}>
            {suggestions.map((item) => {
              const photo = item.photo ? resolveMediaUrl(item.photo) : '';
              return (
                <Pressable
                  key={`sg-${item.text}`}
                  style={({ pressed }) => [styles.suggestRow, pressed && styles.pressed]}
                  onPress={() => submitSearch(item.text)}
                >
                  <View style={styles.suggestIcon}>
                    {photo ? (
                      <Image source={{ uri: photo }} style={styles.suggestPhoto} />
                    ) : (
                      <Ionicons name="search-outline" size={15} color={colors.textMuted} />
                    )}
                  </View>
                  <HighlightText
                    text={item.text}
                    query={trimmedText}
                    style={[styles.suggestText, styles.flex]}
                    highlightStyle={styles.suggestHighlight}
                    numberOfLines={1}
                  />
                  <Pressable
                    hitSlop={10}
                    style={styles.fillBtn}
                    onPress={() => setSearchText(`${item.text} `)}
                  >
                    <Ionicons name="arrow-up" size={16} color={colors.textTertiary} style={styles.fillIcon} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {!fresh || (suggestLoading && !suggestions.length) ? (
          <ActivityIndicator style={styles.suggestSpinner} color={colors.primary} />
        ) : null}

        {nothing ? (
          <Text style={styles.suggestEmpty}>
            No quick matches. Tap search to look through everything.
          </Text>
        ) : null}
      </ScrollView>
    );
  };

  const renderEmptyResults = () => (
    <View style={styles.emptyWrap}>
      <EmptyState
        compact
        icon="search-outline"
        title={query ? `No results for “${query}”` : 'Nothing here yet'}
        body={activeFilterCount
          ? 'Try removing some filters or searching with fewer words.'
          : 'Check the spelling, or try a more general word like “phone” or “chair”.'}
        buttonLabel={activeFilterCount ? 'Clear filters' : undefined}
        onButtonPress={activeFilterCount ? clearAllFilters : undefined}
      />
      {productCategories.length > 0 ? (
        <View style={styles.emptyCats}>
          <Text style={styles.emptyCatsTitle}>Or browse a category</Text>
          <View style={styles.recentWrap}>
            {productCategories.slice(0, 6).map((cat) => (
              <Pressable
                key={`empty-${cat.label}`}
                style={styles.recentChip}
                onPress={() => submitSearch('', { category: cat.label })}
              >
                <Ionicons name={cat.icon || 'pricetag-outline'} size={14} color={cat.tint || colors.primary} />
                <Text style={styles.recentText}>{cat.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );

  const renderResults = () => {
    const sellerList = scope === 'sellers' ? placedSellers : placedSellers.slice(0, SELLER_PREVIEW);
    const titleText = query
      ? `“${query}”`
      : categoryActive ? filters.category : presetTitle || 'All items';
    const metaParts = [`${totalResults} product${totalResults === 1 ? '' : 's'}`];
    if (query) metaParts.push(`${placedSellers.length} store${placedSellers.length === 1 ? '' : 's'} & sellers`);
    else if (presetTitle && presetSubtitle) metaParts.push(presetSubtitle);

    return (
      <View style={styles.flex}>
        <View style={styles.resultsTop}>
          <View style={styles.resultsHead}>
            <View style={styles.flex}>
              <Text style={styles.resultsTitle} numberOfLines={1}>{titleText}</Text>
              <Text style={styles.resultsMeta} numberOfLines={1}>
                {loading ? 'Searching…' : metaParts.join(' · ')}
              </Text>
            </View>
            <Pressable style={styles.sortPill} onPress={() => setSortOpen(true)}>
              <Ionicons name="swap-vertical" size={14} color={colors.text} />
              <Text style={styles.sortPillText} numberOfLines={1}>{sortLabel}</Text>
            </Pressable>
            <Pressable
              style={styles.layoutBtn}
              onPress={() => {
                layoutTouchedRef.current = true;
                setLayout((prev) => (prev === 'list' ? 'grid' : 'list'));
              }}
              hitSlop={6}
            >
              <Ionicons
                name={layout === 'list' ? 'grid-outline' : 'list-outline'}
                size={18}
                color={colors.text}
              />
            </Pressable>
          </View>

          {query ? (
            <View style={styles.scopeTrack}>
              {SCOPES.map((item) => {
                const active = scope === item.key;
                const count = item.key === 'products'
                  ? totalResults
                  : item.key === 'sellers'
                    ? placedSellers.length
                    : totalResults + placedSellers.length;
                return (
                  <Pressable
                    key={item.key}
                    style={[styles.scopeTab, active && styles.scopeTabActive]}
                    onPress={() => setScope(item.key)}
                  >
                    <Text style={[styles.scopeText, active && styles.scopeTextActive]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    <View style={[styles.scopeBadge, active && styles.scopeBadgeActive]}>
                      <Text style={[styles.scopeCount, active && styles.scopeCountActive]}>{count}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
            keyboardShouldPersistTaps="handled"
          >
            {renderFilterChip('distance', distanceActive, 'navigate-outline', distanceActive ? `${filters.radiusKm} km` : 'Distance')}
            {renderFilterChip('category', categoryActive, 'grid-outline', categoryActive ? filters.category : 'Category')}
            {renderFilterChip('condition', conditionActive, 'shield-checkmark-outline', conditionActive ? filters.condition : 'Condition')}
            {renderFilterChip('price', priceActive, 'pricetag-outline', priceActive ? priceLabel(filters.priceMin, filters.priceMax) : 'Price')}
            {activeFilterCount > 1 ? (
              <Pressable style={styles.clearChip} onPress={clearAllFilters}>
                <Text style={styles.clearChipText}>Clear all</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={refreshControl(colors, refreshing, onRefresh)}
        >
          {!hasLocationPerm ? (
            <View style={styles.notice}>
              <Ionicons name="location-outline" size={15} color={colors.primary} />
              <Text style={styles.noticeText}>Turn on location to see the nearest items first.</Text>
            </View>
          ) : null}

          {!loading && matchMode === 'partial' && totalResults > 0 ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Ionicons name="information-circle-outline" size={15} color={colors.warning} />
              <Text style={styles.noticeText}>
                No exact match for “{query}”. Showing close matches.
              </Text>
            </View>
          ) : null}

          {loading ? renderLoading() : visibleCount === 0 ? renderEmptyResults() : (
            <>
              {showSellers && sellerList.length > 0 ? (
                <View style={styles.resultBlock}>
                  {scope === 'all' ? (
                    <View style={styles.blockHeader}>
                      <Text style={styles.blockTitle}>Stores & sellers</Text>
                      {placedSellers.length > SELLER_PREVIEW ? (
                        <Pressable hitSlop={8} onPress={() => setScope('sellers')}>
                          <Text style={styles.blockAction}>See all {placedSellers.length}</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                  {scope === 'all' && sellerList.length > 1 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.storeCarousel}
                      contentContainerStyle={styles.storeCarouselContent}
                      snapToInterval={storeCardWidth + 12}
                      decelerationRate="fast"
                    >
                      {sellerList.map((seller) => renderSellerCard(seller, { carousel: true }))}
                    </ScrollView>
                  ) : (
                    <View style={styles.sellerList}>{sellerList.map((seller) => renderSellerCard(seller))}</View>
                  )}
                </View>
              ) : null}

              {showProducts && cards.length > 0 ? (
                <View style={styles.resultBlock}>
                  {scope === 'all' && showSellers && sellerList.length > 0 ? (
                    <View style={styles.blockHeader}>
                      <Text style={styles.blockTitle}>Products</Text>
                    </View>
                  ) : null}
                  {renderProducts()}
                </View>
              ) : null}

              {showProducts && hasMore ? (
                <Pressable style={styles.loadMoreBtn} onPress={loadMore} disabled={loadingMore}>
                  {loadingMore ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Text style={styles.loadMoreText}>Show more results</Text>
                      <Ionicons name="chevron-down" size={16} color={colors.primary} />
                    </>
                  )}
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      </View>
    );
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
            <Ionicons name="chevron-back" size={22} color={colors.onGradient} />
          </Pressable>

          <View style={[styles.searchBar, inputFocused && styles.searchBarFocused]}>
            <Ionicons name="search" size={18} color={inputFocused ? colors.primary : colors.textMuted} />
            <TextInput
              ref={inputRef}
              value={searchText}
              onChangeText={setSearchText}
              onFocus={() => setInputFocused(true)}
              onBlur={handleBlur}
              style={styles.searchInput}
              placeholder="Search items, stores, sellers"
              placeholderTextColor={colors.textTertiary}
              numberOfLines={1}
              returnKeyType="search"
              autoCorrect={false}
              onSubmitEditing={() => submitSearch(searchText)}
            />
            {searchText.length > 0 ? (
              <Pressable onPress={clearInput} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <Pressable style={styles.filterIconBtn} onPress={() => setFiltersOpen(true)}>
            <Ionicons name="options-outline" size={20} color={colors.primary} />
            {activeFilterCount > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>
      </LinearGradient>

      {showSuggestions ? renderSuggestions() : showDiscovery ? renderDiscovery() : null}
      {showResults ? renderResults() : null}

      <FilterBottomSheet
        visible={filtersOpen}
        initial={filterInitial}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters({
            category: next.category,
            condition: next.condition,
            priceMin: cleanPrice(next.priceMin, PRICE_DEFAULT_MIN),
            priceMax: cleanPrice(next.priceMax, PRICE_DEFAULT_MAX),
            radiusKm: next.radiusKm ?? null,
          });
          if (next.sortKey && next.sortKey !== sortKey) {
            sortTouchedRef.current = true;
            setSortKey(next.sortKey);
          }
          setFiltersOpen(false);
        }}
      />

      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <Pressable style={styles.sheetOverlay} onPress={() => setSortOpen(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Sort results by</Text>
            {SORT_ORDER.map((option) => {
              const active = option.key === sortKey;
              return (
                <Pressable
                  key={option.key}
                  style={[styles.sortOption, active && styles.sortOptionActive]}
                  onPress={() => {
                    sortTouchedRef.current = true;
                    setSortKey(option.key);
                    setSortOpen(false);
                  }}
                >
                  <View style={[styles.sortIcon, active && styles.sortIconActive]}>
                    <Ionicons name={option.icon} size={16} color={active ? colors.onPrimary : colors.textSecondary} />
                  </View>
                  <Text style={[styles.sortOptionText, active && styles.sortOptionTextActive]}>
                    {option.label}
                  </Text>
                  {active ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  pressed: {
    opacity: 0.7,
  },
  header: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  back: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 46,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  searchBarFocused: {
    borderColor: colors.primary,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  filterIconBtn: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.white,
  },
  highlight: {
    color: colors.primary,
    fontWeight: '800',
    backgroundColor: `${colors.primary}1A`,
  },

  panel: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  block: {
    marginBottom: 24,
  },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  blockTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  blockAction: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.link,
  },
  recentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    paddingHorizontal: 12,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recentText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 14,
  },
  categoryTile: {
    width: '25%',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
  },
  categoryIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  categoryImg: {
    width: 54,
    height: 54,
  },
  categoryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 14,
  },
  trendList: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  trendRank: {
    width: 18,
    fontSize: 15,
    fontWeight: '800',
    color: colors.textTertiary,
    textAlign: 'center',
  },
  trendThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  trendPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.price,
    marginTop: 2,
  },

  suggestPanel: {
    paddingTop: 10,
  },
  searchForRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 6,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: `${colors.primary}14`,
  },
  searchForIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchForText: {
    flex: 1,
    fontSize: 14,
    color: colors.textSecondary,
  },
  searchForQuery: {
    fontWeight: '800',
    color: colors.text,
  },
  suggestGroup: {
    paddingTop: 6,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  suggestGroupTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 2,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  suggestIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  suggestPhoto: {
    width: 32,
    height: 32,
  },
  suggestStoreLogo: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: `${colors.primary}1A`,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  suggestText: {
    flexShrink: 1,
    fontSize: 15,
    color: colors.textSecondary,
  },
  suggestHighlight: {
    color: colors.text,
    fontWeight: '800',
  },
  suggestSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },
  suggestIn: {
    color: colors.primary,
    fontWeight: '700',
  },
  suggestCount: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  fillBtn: {
    padding: 4,
  },
  fillIcon: {
    transform: [{ rotate: '-45deg' }],
  },
  suggestSpinner: {
    marginTop: 18,
  },
  suggestEmpty: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginTop: 18,
  },

  resultsTop: {
    paddingTop: 12,
    gap: 10,
  },
  resultsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  resultsMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 2,
  },
  sortPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    maxWidth: 150,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    flexShrink: 1,
  },
  layoutBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeTrack: {
    flexDirection: 'row',
    marginHorizontal: 16,
    padding: 4,
    gap: 4,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scopeTab: {
    flex: 1,
    height: 36,
    borderRadius: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 6,
  },
  scopeTabActive: {
    backgroundColor: colors.primary,
  },
  scopeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    flexShrink: 1,
  },
  scopeTextActive: {
    color: colors.onPrimary,
  },
  scopeBadge: {
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  scopeBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  scopeCount: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textMuted,
  },
  scopeCountActive: {
    color: colors.onPrimary,
  },
  chipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 4,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    height: 34,
    backgroundColor: colors.surface,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    maxWidth: 140,
  },
  chipTextActive: {
    color: colors.onPrimary,
  },
  clearChip: {
    height: 34,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  clearChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },

  content: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 12,
    flexGrow: 1,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: `${colors.primary}12`,
  },
  noticeWarn: {
    backgroundColor: `${colors.warning}1A`,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  resultBlock: {
    marginBottom: 18,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GUTTER,
  },
  list: {
    gap: 10,
  },
  productRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  productRowBest: {
    borderColor: colors.primary,
    borderWidth: 1.5,
  },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  featuredTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productBody: {
    flex: 1,
    gap: 4,
    paddingVertical: 2,
  },
  bestTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: `${colors.primary}1A`,
  },
  bestTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.primary,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    lineHeight: 19,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.price,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 12,
    color: colors.textMuted,
    flexShrink: 1,
  },
  heartBtn: {
    alignSelf: 'flex-start',
    padding: 2,
  },
  skeleton: {
    backgroundColor: colors.iconBackground,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    marginVertical: 4,
    backgroundColor: colors.iconBackground,
  },
  sellerList: {
    gap: 14,
  },
  sellerAvatarImg: {
    width: '100%',
    height: '100%',
  },
  sellerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  storeCarousel: {
    marginHorizontal: -GRID_PADDING,
  },
  storeCarouselContent: {
    paddingHorizontal: GRID_PADDING,
    gap: 12,
  },
  storeCard: {
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  storeBanner: {
    height: 92,
    backgroundColor: colors.iconBackground,
  },
  bannerShade: {
    ...StyleSheet.absoluteFillObject,
  },
  bannerTags: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bannerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  bannerPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.white,
  },
  storeHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    marginTop: -30,
  },
  storeLogo: {
    width: 64,
    height: 64,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  storeLogoRound: {
    borderRadius: 32,
  },
  storeInitial: {
    fontSize: 24,
    fontWeight: '800',
  },
  storeTitleBox: {
    flex: 1,
    paddingBottom: 2,
  },
  storeName: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  storeSub: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
    marginTop: 1,
  },
  storeBody: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
    gap: 10,
  },
  storeAbout: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  storeStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: colors.iconBackground,
  },
  statText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  storeGallery: {
    flexDirection: 'row',
    gap: 6,
  },
  galleryThumb: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 72,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
  },
  galleryMore: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryMoreText: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  visitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
  },
  visitText: {
    fontSize: 13,
    fontWeight: '800',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    minWidth: 180,
    height: 44,
    marginTop: 4,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: `${colors.primary}0F`,
  },
  loadMoreText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  emptyWrap: {
    paddingTop: 12,
  },
  emptyCats: {
    marginTop: 8,
    alignItems: 'center',
    gap: 10,
  },
  emptyCatsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },

  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.overlay,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 14,
  },
  sortOptionActive: {
    backgroundColor: `${colors.primary}12`,
  },
  sortIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  sortIconActive: {
    backgroundColor: colors.primary,
  },
  sortOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  sortOptionTextActive: {
    fontWeight: '800',
  },
});
