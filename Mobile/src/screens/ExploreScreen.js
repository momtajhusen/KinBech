import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INFO_COPY, navigateToTab, openItemDetail, ROUTES, TABS } from '../navigation/helpers';
import { api } from '../services/api';
import {
  attachDistanceToCard,
  attachDistanceToSeller,
  formatDistanceLabel,
  formatPrice,
  toCardItem,
} from '../utils/listing';
import ScreenLoader from '../components/ScreenLoader';
import {
  catalogFingerprint,
  getExploreMemory,
  getHomeListingsMemory,
  isExploreFresh,
  loadExploreCache,
  loadHomeListingsCache,
  setExploreMemory,
} from '../utils/homeListingsCache';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useCategories, mergeSidebarCategories, refreshCategories } from '../utils/categories';
import SellerProfileCard from '../components/SellerProfileCard';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import ProductCard from '../components/ProductCard';
import pinnedStoresUtils from '../utils/pinnedStores';
import { ProductCardSkeleton, SellerProfileCardSkeleton } from '../components/SkeletonLoader';

const SIDEBAR_WIDTH = 62;
const GRID_GUTTER = 8;
const GRID_PADDING = 10;
const ALL_TINT = '#047857';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FOCUS_CACHE_TTL_MS = 300_000; // 5 minutes

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest', icon: 'star-outline', activeIcon: 'star' },
  { key: 'nearby', label: 'Nearest', icon: 'navigate-outline' },
  { key: 'priceLow', label: '₹ Price ↑', icon: 'trending-up-outline' },
  { key: 'priceHigh', label: '₹ Price ↓', icon: 'trending-down-outline' },
  { key: 'topRated', label: 'Popular', icon: 'flame-outline' },
];

const PRICE_SORTS = ['priceLow', 'priceHigh'];

function listingPrice(item) {
  const value = Number(item?.listing?.price);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function nearestLabel(distances) {
  if (!distances.length) return '—';
  const km = Math.min(...distances);
  return km < 0.1 ? '< 100 m' : formatDistanceLabel(km);
}

function listingCreatedAt(item) {
  const time = new Date(item?.listing?.createdAt || item?.postedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 30,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  exploreTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.onGradient,
    letterSpacing: -0.5,
  },
  headerMeta: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#4ADE80',
  },
  exploreSubtitle: {
    fontSize: 12.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.88)',
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  searchWrap: {
    marginTop: -22,
    paddingHorizontal: 16,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
  },
  tabsTrack: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: '#059669',
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabBtnTextActive: {
    color: '#fff',
  },
  tabCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  tabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  tabCountTextActive: {
    color: '#fff',
  },
  filterBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  filterBadge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  body: {
    flex: 1,
  },
  split: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.surface,
    borderTopRightRadius: 20,
    borderBottomRightRadius: 20,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sidebarContent: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  sideItem: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 3,
    borderRadius: 14,
    marginHorizontal: 3,
  },
  sideItemActive: {
    backgroundColor: colors.background,
    borderRadius: 14,
  },
  sideIndicator: {
    position: 'absolute',
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: '#10B981',
  },
  sideIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sideIconActive: {
    shadowOpacity: 0.28,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  sideIconImage: {
    width: '100%',
    height: '100%',
  },
  sideLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 11,
  },
  sideLabelActive: {
    color: colors.text,
    fontWeight: '800',
  },
  sideCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  mainContent: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollViewContent: {
    paddingTop: 0,
  },
  sortScroll: {
    flexGrow: 0,
    flexShrink: 0,
  },
  sortRow: {
    paddingHorizontal: GRID_PADDING,
    paddingVertical: 6,
    gap: 6,
    alignItems: 'center',
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  sortChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.text,
  },
  sortChipTextActive: {
    color: '#fff',
  },
  resultsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING + 2,
    paddingBottom: 4,
  },
  resultsTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  clearLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  clearLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10B981',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 4,
    gap: GRID_GUTTER,
  },
  trustBanner: {
    marginHorizontal: GRID_PADDING,
    marginTop: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.45)',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  trustIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trustCopy: {
    flex: 1,
  },
  trustTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  trustTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#34D399',
  },
  trustSub: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '600',
    color: colors.textMuted,
  },
  sellerSection: {
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: GRID_PADDING + 2,
    marginBottom: 4,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionCopy: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  sectionSub: {
    marginTop: 1,
    fontSize: 11,
    color: colors.textMuted,
  },
  sectionCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  sectionCountText: {
    fontSize: 11,
    fontWeight: '800',
  },
  filterHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  sortChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  clearButton: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  applyButtonFlex: {
    flex: 2,
    height: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  filterModal: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  filterModalContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  filterCloseButton: {
    padding: 6,
  },
  filterSection: {
    marginBottom: 18,
  },
  filterSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 10,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterOptionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterOptionText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  filterCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
});

const GridCard = memo(function GridCard({ item, width, onOpen, onSave }) {
  const handlePress = useCallback(() => onOpen(item), [item, onOpen]);
  const handleSave = useCallback(() => onSave(item), [item, onSave]);
  return (
    <ProductCard
      {...item}
      compact
      width={width}
      sharedId={item.id}
      onPress={handlePress}
      onToggleSave={handleSave}
    />
  );
});

function SectionTitle({ styles, icon, tint, title, subtitle, count }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: `${tint}1F` }]}>
        <Ionicons name={icon} size={15} color={tint} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
      {count ? (
        <View style={[styles.sectionCount, { backgroundColor: `${tint}1F` }]}>
          <Text style={[styles.sectionCountText, { color: tint }]}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

export default function ExploreScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const initialCategory = route?.params?.category;
  const productCategories = useCategories('product');
  const shopCategories = useCategories('shop');

  const [activeTab, setActiveTab] = useState('products');
  const [activeCategory, setActiveCategory] = useState(null);
  const seededExplore = getExploreMemory();
  const seededProducts = seededExplore?.products?.length
    ? seededExplore.products
    : (getHomeListingsMemory()?.listings || []);
  const [itemsLoading, setItemsLoading] = useState(seededProducts.length === 0);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [pinnedStores, setPinnedStores] = useState([]);
  const [featuredSellers, setFeaturedSellers] = useState(seededExplore?.featured || []);
  const [popularSellers, setPopularSellers] = useState(seededExplore?.popular || []);
  const [nearbySellers, setNearbySellers] = useState(seededExplore?.nearby || []);
  const [products, setProducts] = useState(seededProducts);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({
    verified: false,
    nearby: false,
    topRated: false,
  });
  const [sortBy, setSortBy] = useState('newest');

  const hasLoadedRef = useRef(seededProducts.length > 0);
  const productsFpRef = useRef(catalogFingerprint(seededProducts));
  const sellersFpRef = useRef(catalogFingerprint([
    ...(seededExplore?.featured || []),
    ...(seededExplore?.popular || []),
    ...(seededExplore?.nearby || []),
  ]));
  const paneAnim = useRef(new Animated.Value(1)).current;
  const sidebarItemAnims = useRef(new Map()).current;

  const getSidebarItemAnim = useCallback((label) => {
    if (!sidebarItemAnims.has(label)) {
      sidebarItemAnims.set(label, new Animated.Value(1));
    }
    return sidebarItemAnims.get(label);
  }, [sidebarItemAnims]);

  const triggerPaneAnim = useCallback(() => {
    paneAnim.stopAnimation();
    paneAnim.setValue(0);
    Animated.timing(paneAnim, {
      toValue: 1,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [paneAnim]);

  const handleCategoryChange = useCallback((label) => {
    setActiveCategory((curr) => {
      if (curr === label) return curr;
      return label;
    });
  }, []);

  const fetchQuickLocation = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const last = await Location.getLastKnownPositionAsync();
      if (last?.coords) {
        const coords = { lat: last.coords.latitude, lng: last.coords.longitude };
        setUserCoords(coords);
        // Fetch precise location in background, don't block
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .then((current) => {
            if (!current?.coords) return;
            setUserCoords({ lat: current.coords.latitude, lng: current.coords.longitude });
          })
          .catch(() => {});
        return coords;
      }
      return null;
    } catch (_) {
      return null;
    }
  }, []);

  const applyExplorePayload = useCallback((featuredRes, popularRes, nearbyRes, productsRes, coords) => {
    const nextProducts = !productsRes.error && productsRes.data?.listings
      ? productsRes.data.listings
        .map(toCardItem)
        .filter(Boolean)
        .map((it) => attachDistanceToCard(it, coords))
      : [];
    const nextProductFp = catalogFingerprint(nextProducts);
    if (nextProductFp !== productsFpRef.current || !hasLoadedRef.current) {
      productsFpRef.current = nextProductFp;
      setProducts(nextProducts);
    }

    const nextSellers = [
      ...(featuredRes.data?.sellers || []),
      ...(popularRes.data?.sellers || []),
      ...(nearbyRes.data?.sellers || []),
    ];
    const nextSellerFp = catalogFingerprint(nextSellers);
    if (nextSellerFp !== sellersFpRef.current || !hasLoadedRef.current) {
      sellersFpRef.current = nextSellerFp;
      setFeaturedSellers(featuredRes.data?.sellers || []);
      setPopularSellers(popularRes.data?.sellers || []);
      setNearbySellers(nearbyRes.data?.sellers || []);
    }

    setExploreMemory({
      products: nextProducts.length ? nextProducts : productsFpRef.current ? nextProducts : [],
      featured: featuredRes.data?.sellers || [],
      popular: popularRes.data?.sellers || [],
      nearby: nearbyRes.data?.sellers || [],
    });
  }, []);

  const fetchSellers = useCallback(async ({ silent = false, force = false } = {}) => {
    // Check if we have fresh cache
    if (!force && silent && isExploreFresh(FOCUS_CACHE_TTL_MS) && hasLoadedRef.current) {
      return;
    }

    // Always load silently for better perceived performance
    if (!hasLoadedRef.current) setItemsLoading(true);

    try {
      const coords = await Promise.race([
        fetchQuickLocation(),
        new Promise((resolve) => setTimeout(() => resolve(null), 100)),
      ]);
      const locParams = {};
      if (coords?.lat != null && coords?.lng != null) {
        locParams.lat = coords.lat;
        locParams.lng = coords.lng;
      }

      const [featuredRes, popularRes, nearbyRes, productsRes] = await Promise.all([
        api.getFeaturedSellers(locParams),
        api.getPopularSellers(locParams),
        api.getNearbySellers(locParams),
        api.getListings({ ...locParams, page: 1, limit: 24 }),
      ]);

      applyExplorePayload(featuredRes, popularRes, nearbyRes, productsRes, coords);

      // Refresh pinned stores from backend
      const pinned = await pinnedStoresUtils.getPinnedStores({ lat: coords?.lat, lng: coords?.lng });
      setPinnedStores(pinned);

      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Failed to load explore data:', error);
      if (!hasLoadedRef.current) {
        setFeaturedSellers([]);
        setPopularSellers([]);
        setNearbySellers([]);
      }
    } finally {
      setItemsLoading(false);
    }
  }, [fetchQuickLocation, applyExplorePayload]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasLoadedRef.current) return;
      const [explore, home] = await Promise.all([loadExploreCache(), loadHomeListingsCache()]);
      if (cancelled || hasLoadedRef.current) return;
      const productsFromDisk = explore?.products?.length ? explore.products : home?.listings;
      if (productsFromDisk?.length) {
        productsFpRef.current = catalogFingerprint(productsFromDisk);
        setProducts(productsFromDisk);
        hasLoadedRef.current = true;
        setItemsLoading(false);
      }
      if (explore?.featured?.length || explore?.popular?.length || explore?.nearby?.length) {
        sellersFpRef.current = catalogFingerprint([
          ...(explore.featured || []),
          ...(explore.popular || []),
          ...(explore.nearby || []),
        ]);
        setFeaturedSellers(explore.featured || []);
        setPopularSellers(explore.popular || []);
        setNearbySellers(explore.nearby || []);
        hasLoadedRef.current = true;
        setItemsLoading(false);
      }
    })();
    // Start location fetch in background, don't block cache load
    fetchQuickLocation();
    return () => {
      cancelled = true;
    };
  }, [fetchQuickLocation]);

  useEffect(() => {
    // Load pinned stores from backend in background
    pinnedStoresUtils.getPinnedStores({ lat: userCoords.lat, lng: userCoords.lng }).then((pinned) => {
      setPinnedStores(Array.isArray(pinned) ? pinned : []);
    }).catch(() => {});
  }, [userCoords.lat, userCoords.lng]);

  useFocusEffect(
    useCallback(() => {
      refreshCategories('product');
      fetchSellers({ silent: true });
    }, [fetchSellers])
  );

  // Load the selected category from API so sidebar filter shows correct items, then shuffle
  useEffect(() => {
    if (!activeCategory || activeCategory === 'All' || activeTab !== 'products') {
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const params = { category: activeCategory, page: 1, limit: 40 };
      if (userCoords?.lat != null && userCoords?.lng != null) {
        params.lat = userCoords.lat;
        params.lng = userCoords.lng;
      }
      const { data, error } = await api.getListings(params);
      if (cancelled || error || !data?.listings) return;

      const incoming = data.listings
        .map(toCardItem)
        .filter(Boolean)
        .map((it) => attachDistanceToCard(it, userCoords));

      setProducts((prev) => {
        const byId = new Map(prev.map((item) => [String(item.id), item]));
        for (const item of incoming) {
          byId.set(String(item.id), item);
        }
        return [...byId.values()];
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCategory, activeTab, userCoords]);



  const { refreshing, onRefresh } = usePullRefresh(() => fetchSellers({ silent: true, force: true }));

  const handleSellerPress = useCallback((seller) => {
    const sellerId = seller?._id || seller?.id || seller?.shopId;
    if (sellerId) {
      pinnedStoresUtils.incrementUsage(sellerId).catch(() => {});
    }

    if (seller?.sellerType === 'shop' || seller?.shopId) {
      navigation.navigate(ROUTES.SHOP_PROFILE, {
        shopId: seller.shopId || seller._id || seller.id,
      });
      return;
    }
    navigation.navigate(ROUTES.SELLER_PROFILE, {
      seller,
      sellerId: seller?._id || seller?.id || seller?.userId,
    });
  }, [navigation]);

  const handlePinToggle = useCallback(async (sellerId) => {
    const seller = [...featuredSellers, ...popularSellers, ...nearbySellers]
      .find(s => s._id === sellerId);

    if (!seller) return;

    const isPinned = await pinnedStoresUtils.isStorePinned(sellerId, pinnedStores);

    if (isPinned) {
      await pinnedStoresUtils.unpinStore(sellerId);
    } else {
      await pinnedStoresUtils.pinStore(seller);
    }

    // Refresh pinned stores from backend
    const pinned = await pinnedStoresUtils.getPinnedStores({ lat: userCoords.lat, lng: userCoords.lng });
    setPinnedStores(pinned);
  }, [featuredSellers, popularSellers, nearbySellers, pinnedStores, userCoords]);

  const handleProductPress = useCallback((product, index) => {
    // Navigate to product detail
    if (product) {
      openItemDetail(navigation, { listingId: product.id, item: product.listing || product, sharedId: product.id });
    }
  }, [navigation]);

  const handleSaveProduct = useCallback((product) => api.toggleWishlist(product.id), []);

  const uniqueSellers = useMemo(() => {
    const seen = new Set();
    return [...featuredSellers, ...popularSellers, ...nearbySellers].filter((seller) => {
      const id = String(seller._id || seller.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [featuredSellers, popularSellers, nearbySellers]);

  const mainTabs = [
    { key: 'products', label: 'Products', icon: 'cube-outline', count: products.length },
    { key: 'sellers', label: 'Sellers', icon: 'storefront-outline', count: uniqueSellers.length },
  ];

  const sortOptions = activeTab === 'products'
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter((o) => !PRICE_SORTS.includes(o.key));

  const activeFilterCount =
    (sortBy !== 'newest' ? 1 : 0) +
    Object.values(selectedFilters).filter(Boolean).length;

  const switchTab = (key) => {
    setActiveTab(key);
    setActiveCategory('All');
    if (key === 'sellers' && PRICE_SORTS.includes(sortBy)) setSortBy('newest');
  };

  const clearFilters = () => {
    setSortBy('newest');
    setSelectedFilters({ verified: false, nearby: false, topRated: false });
  };

  const categories = useMemo(() => {
    const allOption = {
      label: 'All',
      icon: activeTab === 'products' ? 'grid' : 'storefront',
      tint: ALL_TINT,
      count: activeTab === 'products' ? products.length : uniqueSellers.length,
    };

    if (activeTab === 'products') {
      const found = {};
      for (const it of products) {
        const name = it.category || it.listing?.category;
        if (name) found[name] = (found[name] || 0) + 1;
      }
      return mergeSidebarCategories(productCategories, found, allOption);
    }

    const found = {};
    for (const seller of uniqueSellers) {
      const name = seller.category || 'General';
      found[name] = (found[name] || 0) + 1;
    }
    return mergeSidebarCategories(shopCategories, found, allOption);
  }, [products, uniqueSellers, activeTab, productCategories, shopCategories]);

  const matchesCategory = useCallback(
    (seller) => !activeCategory || activeCategory === 'All' || (seller.category || 'General') === activeCategory,
    [activeCategory]
  );

  const filteredProducts = useMemo(() => {
    let filtered = products.map((item) => ({
      ...attachDistanceToCard(item, userCoords),
      condition: item.condition || item.listing?.condition || undefined,
      postedAt: item.postedAt || item.listing?.createdAt || undefined,
    }));

    if (activeCategory && activeCategory !== 'All') {
      const target = String(activeCategory).trim().toLowerCase();
      filtered = filtered.filter((it) => {
        const cat = String(it.category || it.listing?.category || '').trim().toLowerCase();
        return cat === target;
      });
    }

    if (sortBy === 'nearby' || selectedFilters.nearby) {
      filtered.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    } else if (sortBy === 'topRated' || selectedFilters.topRated) {
      filtered.sort((a, b) => (b.listing?.views || 0) - (a.listing?.views || 0));
    } else if (sortBy === 'priceLow') {
      filtered.sort((a, b) => (Number(a.listing?.price) || 0) - (Number(b.listing?.price) || 0));
    } else if (sortBy === 'priceHigh') {
      filtered.sort((a, b) => (Number(b.listing?.price) || 0) - (Number(a.listing?.price) || 0));
    } else {
      filtered.sort((a, b) => listingCreatedAt(b) - listingCreatedAt(a));
    }

    return filtered;
  }, [products, activeCategory, selectedFilters, sortBy, userCoords]);

  const sellerSections = useMemo(() => {
    const keep = (seller) => matchesCategory(seller) && (!selectedFilters.verified || seller.verified);
    const order = (list) => {
      const withDistance = list.map((seller) => attachDistanceToSeller(seller, userCoords)).filter(keep);
      if (sortBy === 'nearby' || selectedFilters.nearby) {
        withDistance.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
      } else if (sortBy === 'topRated' || selectedFilters.topRated) {
        withDistance.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      }
      return withDistance;
    };
    return {
      pinned: order(pinnedStores).sort((a, b) => {
        const aTime = new Date(a.pinnedAt || 0).getTime();
        const bTime = new Date(b.pinnedAt || 0).getTime();
        return bTime - aTime;
      }),
      featured: order(featuredSellers),
      popular: order(popularSellers),
      nearby: order(nearbySellers).slice(0, 8),
      all: order(uniqueSellers),
    };
  }, [
    pinnedStores,
    featuredSellers,
    popularSellers,
    nearbySellers,
    uniqueSellers,
    matchesCategory,
    selectedFilters,
    sortBy,
    userCoords,
  ]);

  const activeMeta = categories.find((c) => c.label === activeCategory) || categories[0];
  const activeTint = activeMeta?.tint || activeMeta?.color || ALL_TINT;
  const isAll = !activeCategory || activeCategory === 'All';

  useEffect(() => {
    if (activeCategory == null && categories.length > 0) {
      if (initialCategory && categories.find((c) => c.label === initialCategory)) {
        setActiveCategory(initialCategory);
      } else {
        setActiveCategory('All');
      }
    }
  }, [categories, activeCategory, initialCategory]);

  const requestedTab = route?.params?.tab;
  const requestStamp = route?.params?.ts;
  useEffect(() => {
    if (!requestStamp) return;
    if (requestedTab === 'products' || requestedTab === 'sellers') setActiveTab(requestedTab);
    setActiveCategory(initialCategory || 'All');
  }, [requestStamp, requestedTab, initialCategory]);

  useEffect(() => {
    if (!activeCategory) return;
    triggerPaneAnim();
  }, [activeCategory, activeTab, triggerPaneAnim]);

  const mainWidth = windowWidth - SIDEBAR_WIDTH;
  const productCardWidth = Math.floor((mainWidth - GRID_PADDING * 2 - GRID_GUTTER) / 2);

  const pressSideItem = (cat, itemAnim) => {
    Animated.sequence([
      Animated.timing(itemAnim, { toValue: 0.9, duration: 70, useNativeDriver: true }),
      Animated.spring(itemAnim, { toValue: 1, tension: 280, friction: 12, useNativeDriver: true }),
    ]).start();
    handleCategoryChange(cat.label);
  };

  const renderSellerGrid = (list, isPinned = false) => {
    if (isPinned && list.length > 2) {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.productGrid, { flexWrap: 'nowrap', paddingRight: GRID_PADDING }]}
        >
          {list.map((seller) => (
            <View key={seller._id || seller.id} style={{ width: productCardWidth }}>
              <SellerProfileCard
                seller={seller}
                sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
                width={productCardWidth}
                onPress={() => handleSellerPress(seller)}
                onPinToggle={() => handlePinToggle(seller._id)}
                isPinned={true}
              />
            </View>
          ))}
        </ScrollView>
      );
    }

    return (
      <View style={styles.productGrid}>
        {list.map((seller) => (
          <SellerProfileCard
            key={seller._id || seller.id}
            seller={seller}
            sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
            width={productCardWidth}
            onPress={() => handleSellerPress(seller)}
            onPinToggle={() => handlePinToggle(seller._id)}
            isPinned={pinnedStores.some((s) => s._id === seller._id)}
          />
        ))}
      </View>
    );
  };

  const sellerBlocks = [
    pinnedStores.length > 0 && {
      key: 'pinned',
      icon: 'bookmark',
      tint: colors.primary,
      title: 'My pinned stores',
      subtitle: 'Quick access to your favourites',
      list: sellerSections.pinned,
      isPinned: true,
    },
    {
      key: 'all',
      icon: 'storefront',
      tint: colors.secondary || colors.primary,
      title: 'All Stores',
      subtitle: 'Browse all available sellers',
      list: sellerSections.all,
    },
  ].filter((block) => block && block.list && block.list.length > 0);

  return (
    <>
      <View style={styles.container}>
        <ThemeStatusBar variant="header" />
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 6 }]}
        >
          <View style={styles.headerTop}>
            <View style={styles.headerCopy}>
              <Text style={styles.exploreTitle}>Explore</Text>
              <View style={styles.headerMeta}>
                <View style={styles.liveDot} />
                <Text style={styles.exploreSubtitle} numberOfLines={1}>
                  {products.length} items · {uniqueSellers.length} sellers near you
                </Text>
              </View>
            </View>
            <Pressable style={styles.headerBtn} onPress={() => navigation.navigate(ROUTES.WISHLIST)} hitSlop={6}>
              <Ionicons name="heart-outline" size={19} color={colors.onGradient} />
            </Pressable>
            <Pressable style={styles.headerBtn} onPress={() => navigation.navigate(ROUTES.MAP_EXPLORE)} hitSlop={6}>
              <Ionicons name="map-outline" size={19} color={colors.onGradient} />
            </Pressable>
          </View>
        </LinearGradient>

        <View style={styles.searchWrap}>
          <SearchBar
            placeholder="Search sellers, stores or products..."
            onPress={() => navigation.navigate(ROUTES.SEARCH_RESULTS)}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.toolbar}>
            <View style={styles.tabsTrack}>
              {mainTabs.map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    style={[styles.tabBtn, isActive && styles.tabBtnActive]}
                    onPress={() => switchTab(tab.key)}
                  >
                    <Ionicons name={tab.icon} size={14} color={isActive ? colors.onPrimary : colors.textMuted} />
                    <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>{tab.label}</Text>
                    <View style={[styles.tabCount, isActive && styles.tabCountActive]}>
                      <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>{tab.count}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
            <Pressable
              style={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
              onPress={() => setShowFilterModal(true)}
            >
              <Ionicons
                name="options-outline"
                size={18}
                color={activeFilterCount > 0 ? colors.onPrimary : colors.text}
              />
              {activeFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          <View style={styles.split}>
            <View style={styles.sidebar}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.sidebarContent, { paddingBottom: insets.bottom }]}
              >
                {categories.map((cat) => {
                  const isActive = cat.label === activeCategory;
                  const tint = cat.tint || cat.color || colors.primary;
                  const itemAnim = getSidebarItemAnim(cat.label);
                  return (
                    <Animated.View key={cat.label} style={{ transform: [{ scale: itemAnim }] }}>
                      <Pressable
                        style={[styles.sideItem, isActive && styles.sideItemActive]}
                        onPress={() => pressSideItem(cat, itemAnim)}
                      >
                        {isActive ? <View style={styles.sideIndicator} /> : null}
                        <View
                          style={[
                            styles.sideIcon,
                            { backgroundColor: isActive ? tint : `${tint}22` },
                            isActive && [styles.sideIconActive, { shadowColor: tint }],
                          ]}
                        >
                          {cat.imageUrl ? (
                            <Image source={{ uri: cat.imageUrl }} style={styles.sideIconImage} />
                          ) : (
                            <Ionicons name={cat.icon} size={16} color={isActive ? '#FFFFFF' : tint} />
                          )}
                        </View>
                        <Text numberOfLines={2} style={[styles.sideLabel, isActive && styles.sideLabelActive]}>
                          {cat.label}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </View>

            <Animated.View
              style={[
                styles.mainContent,
                {
                  opacity: paneAnim,
                  transform: [
                    {
                      translateY: paneAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
                    },
                  ],
                },
              ]}
            >
              <View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.sortScroll}
                  contentContainerStyle={styles.sortRow}
                >
                  {sortOptions.map((opt) => {
                    const active = sortBy === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        style={[styles.sortChip, active && styles.sortChipActive]}
                        onPress={() => setSortBy(opt.key)}
                      >
                        <Ionicons name={active ? (opt.activeIcon || opt.icon) : opt.icon} size={13} color={active ? '#fff' : colors.textMuted} />
                        <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>

              {activeFilterCount > 0 ? (
                <View style={styles.resultsBar}>
                  <Text style={styles.resultsTitle}>{filteredProducts.length} results</Text>
                  <Pressable style={styles.clearLink} onPress={clearFilters} hitSlop={8}>
                    <Ionicons name="close-circle" size={14} color="#10B981" />
                    <Text style={styles.clearLinkText}>Clear filters</Text>
                  </Pressable>
                </View>
              ) : null}

              <ScrollView
                style={styles.mainContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollViewContent, { paddingBottom: insets.bottom }]}
                refreshControl={refreshControl(colors, refreshing, onRefresh)}
              >
                {activeTab === 'products' ? (
                  <View>
                    {itemsLoading && filteredProducts.length === 0 ? (
                      <View style={styles.productGrid}>
                        {[0, 1, 2, 3].map((i) => (
                          <ProductCardSkeleton key={i} width={productCardWidth} compact />
                        ))}
                      </View>
                    ) : filteredProducts.length > 0 ? (
                      <>
                        <View style={styles.productGrid}>
                          {filteredProducts.map((item) => (
                            <GridCard
                              key={item.id}
                              item={item}
                              width={productCardWidth}
                              onOpen={handleProductPress}
                              onSave={handleSaveProduct}
                            />
                          ))}
                        </View>
                        <Pressable
                          style={styles.trustBanner}
                          onPress={() => navigation.navigate(ROUTES.INFO, INFO_COPY.SafetyTips)}
                        >
                          <View style={styles.trustIcons}>
                            <Ionicons name="shield-checkmark" size={22} color="#34D399" />
                            <Ionicons name="lock-closed" size={16} color="#34D399" style={{ marginLeft: -6, marginTop: 8 }} />
                          </View>
                          <View style={styles.trustCopy}>
                            <View style={styles.trustTitleRow}>
                              <Ionicons name="shield-checkmark" size={13} color="#34D399" />
                              <Text style={styles.trustTitle}>Safe & Trusted</Text>
                            </View>
                            <Text style={styles.trustSub}>Verified sellers · Secure payments · Buyer protection</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={16} color="#34D399" />
                        </Pressable>
                      </>
                    ) : (
                      <EmptyState
                        compact
                        icon={activeMeta?.icon || 'cube-outline'}
                        title={isAll ? 'No products yet' : `No ${activeCategory} yet`}
                        body="Be the first to post an item in this category."
                        buttonLabel="Sell an item"
                        onButtonPress={() => navigateToTab(navigation, TABS.POST)}
                      />
                    )}
                  </View>
                ) : itemsLoading && sellerBlocks.length === 0 ? (
                  <View style={styles.productGrid}>
                    {[0, 1, 2, 3].map((i) => (
                      <SellerProfileCardSkeleton key={i} width={productCardWidth} />
                    ))}
                  </View>
                ) : sellerBlocks.length > 0 ? (
                  <View>
                    {sellerBlocks.map((block) => (
                      <View key={block.key} style={styles.sellerSection}>
                        <SectionTitle
                          styles={styles}
                          icon={block.icon}
                          tint={block.tint}
                          title={block.title}
                          subtitle={block.subtitle}
                          count={block.list.length}
                        />
                        {renderSellerGrid(block.list, block.isPinned)}
                      </View>
                    ))}
                  </View>
                ) : (
                  <EmptyState
                    compact
                    icon="storefront-outline"
                    title={isAll ? 'No sellers nearby yet' : `No ${activeCategory} sellers yet`}
                    body="Try another category or pull down to refresh."
                  />
                )}
              </ScrollView>
            </Animated.View>
          </View>
        </View>
        {itemsLoading && products.length === 0 ? <ScreenLoader overlay label="Loading items..." /> : null}
      </View>

      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={styles.filterModal}>
          <Pressable style={styles.mainContent} onPress={() => setShowFilterModal(false)} />
          <View style={[styles.filterModalContent, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
            <View style={styles.filterHandle} />
            <View style={styles.filterModalHeader}>
              <Text style={styles.filterModalTitle}>Sort & filters</Text>
              <Pressable style={styles.filterCloseButton} onPress={() => setShowFilterModal(false)}>
                <Ionicons name="close" size={24} color={colors.text} />
              </Pressable>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Sort by</Text>
              <View style={styles.sortChips}>
                {sortOptions.map((opt) => {
                  const active = sortBy === opt.key;
                  return (
                    <Pressable
                      key={opt.key}
                      style={[styles.sortChip, active && styles.sortChipActive]}
                      onPress={() => setSortBy(opt.key)}
                    >
                      <Ionicons name={opt.icon} size={13} color={active ? colors.onPrimary : colors.textMuted} />
                      <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.filterSection}>
              <Text style={styles.filterSectionTitle}>Show only</Text>
              {[
                activeTab === 'sellers'
                  ? { key: 'verified', label: 'Verified sellers', icon: 'shield-checkmark', tint: colors.success }
                  : null,
                { key: 'nearby', label: 'Nearby first', icon: 'navigate', tint: colors.info || colors.primary },
                { key: 'topRated', label: 'Most popular', icon: 'flame', tint: colors.danger },
              ]
                .filter(Boolean)
                .map((opt) => {
                  const checked = selectedFilters[opt.key];
                  return (
                    <Pressable
                      key={opt.key}
                      style={styles.filterOption}
                      onPress={() => setSelectedFilters((prev) => ({ ...prev, [opt.key]: !prev[opt.key] }))}
                    >
                      <View style={[styles.filterOptionIcon, { backgroundColor: `${opt.tint}1F` }]}>
                        <Ionicons name={opt.icon} size={16} color={opt.tint} />
                      </View>
                      <Text style={styles.filterOptionText}>{opt.label}</Text>
                      <View style={[styles.filterCheckbox, checked && styles.filterCheckboxChecked]}>
                        {checked ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
            </View>

            <View style={styles.filterActions}>
              <Pressable style={styles.clearButton} onPress={clearFilters}>
                <Text style={styles.clearButtonText}>Clear</Text>
              </Pressable>
              <Pressable style={styles.applyButtonFlex} onPress={() => setShowFilterModal(false)}>
                <Text style={styles.applyButtonText}>Show results</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
