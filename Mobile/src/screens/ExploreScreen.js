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
import { navigateToTab, openItemDetail, ROUTES, TABS } from '../navigation/helpers';
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
  loadExploreCache,
  loadHomeListingsCache,
  setExploreMemory,
} from '../utils/homeListingsCache';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useCategories, mergeSidebarCategories } from '../utils/categories';
import SellerProfileCard from '../components/SellerProfileCard';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import ProductCard from '../components/ProductCard';
import pinnedStoresUtils from '../utils/pinnedStores';
import { ProductCardSkeleton, SellerProfileCardSkeleton } from '../components/SkeletonLoader';

const SIDEBAR_WIDTH = 66;
const GRID_GUTTER = 8;
const GRID_PADDING = 10;
const ALL_TINT = '#F59E0B';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest', icon: 'sparkles-outline' },
  { key: 'nearby', label: 'Nearest', icon: 'navigate-outline' },
  { key: 'priceLow', label: 'Price ↑', icon: 'trending-up-outline' },
  { key: 'priceHigh', label: 'Price ↓', icon: 'trending-down-outline' },
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
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  tabsTrack: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabBtnTextActive: {
    color: colors.onPrimary,
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
    color: colors.onPrimary,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
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
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sidebarContent: {
    paddingTop: 4,
  },
  sideItem: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 3,
    gap: 3,
  },
  sideItemActive: {
    backgroundColor: colors.background,
  },
  sideIndicator: {
    position: 'absolute',
    left: 0,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  sideIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sideIconActive: {
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  sideIconImage: {
    width: '100%',
    height: '100%',
  },
  sideLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 11,
  },
  sideLabelActive: {
    color: colors.text,
    fontWeight: '800',
  },
  sideCount: {
    minWidth: 20,
    paddingHorizontal: 4,
    borderRadius: 7,
    backgroundColor: colors.iconBackground,
  },
  sideCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.textMuted,
    textAlign: 'center',
  },
  mainContent: {
    flex: 1,
  },
  scrollViewContent: {
    paddingTop: 2,
  },
  heroCard: {
    marginHorizontal: GRID_PADDING,
    padding: 9,
    borderRadius: 14,
    borderWidth: 1,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: -0.2,
  },
  heroSub: {
    marginTop: 1,
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  heroStats: {
    marginTop: 8,
    flexDirection: 'row',
    gap: 5,
  },
  heroStat: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  heroStatValue: {
    fontSize: 12,
    fontWeight: '900',
    color: colors.text,
  },
  heroStatLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sortRow: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 6,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: colors.text,
  },
  sortChipTextActive: {
    color: colors.onPrimary,
  },
  resultsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING + 2,
    paddingBottom: 6,
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
    color: colors.link,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 12,
    gap: GRID_GUTTER,
  },
  sellerSection: {
    marginTop: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: GRID_PADDING + 2,
    marginBottom: 10,
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
  sellerRow: {
    paddingHorizontal: GRID_PADDING,
    gap: 10,
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
      duration: 240,
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

  const fetchSellers = useCallback(async ({ silent = false } = {}) => {
    if (!silent && !hasLoadedRef.current) setItemsLoading(true);
    try {
      const coords = await Promise.race([
        fetchQuickLocation(),
        new Promise((resolve) => setTimeout(() => resolve(null), 120)),
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
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    pinnedStoresUtils.getPinnedStores().then((pinned) => {
      setPinnedStores(Array.isArray(pinned) ? pinned : []);
    }).catch(() => {});

    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          await Location.requestForegroundPermissionsAsync();
        }
        const last = await Location.getLastKnownPositionAsync();
        if (last?.coords) {
          setUserCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
        }
      } catch (_) {
        // nearby distance is optional
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchSellers({ silent: hasLoadedRef.current });
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
  }, [activeCategory, activeTab, userCoords.lat, userCoords.lng]);

  const { refreshing, onRefresh } = usePullRefresh(() => fetchSellers({ silent: true }));

  const handleSellerPress = useCallback((seller) => {
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

    const isPinned = await pinnedStoresUtils.isStorePinned(sellerId);
    
    if (isPinned) {
      await pinnedStoresUtils.unpinStore(sellerId);
      setPinnedStores(prev => prev.filter(s => s._id !== sellerId));
    } else {
      await pinnedStoresUtils.pinStore(seller);
      setPinnedStores(prev => [...prev, seller]);
    }
  }, [featuredSellers, popularSellers, nearbySellers]);

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
      pinned: order(pinnedStores),
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

  const heroStats = useMemo(() => {
    if (activeTab === 'products') {
      const prices = filteredProducts.map(listingPrice).filter((v) => v != null);
      const distances = filteredProducts.map((it) => it.distanceKm).filter((v) => Number.isFinite(v));
      const weekAgo = Date.now() - WEEK_MS;
      const freshCount = filteredProducts.filter((it) => listingCreatedAt(it) >= weekAgo).length;
      return {
        subtitle: `${filteredProducts.length} item${filteredProducts.length === 1 ? '' : 's'} to explore`,
        stats: [
          { label: 'From', value: prices.length ? formatPrice(Math.min(...prices)) : '—' },
          { label: 'Nearest', value: nearestLabel(distances) },
          { label: 'New 7d', value: String(freshCount) },
        ],
      };
    }
    const list = sellerSections.all;
    const distances = list.map((s) => s.distance).filter((v) => Number.isFinite(v));
    const stores = list.filter((s) => s.sellerType === 'shop' || s.shopId).length;
    return {
      subtitle: `${list.length} seller${list.length === 1 ? '' : 's'} around you`,
      stats: [
        { label: 'Stores', value: String(stores) },
        { label: 'Verified', value: String(list.filter((s) => s.verified).length) },
        { label: 'Nearest', value: nearestLabel(distances) },
      ],
    };
  }, [activeTab, filteredProducts, sellerSections]);

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

  const renderSellerRow = (list, compact) => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sellerRow}>
      {list.map((seller) => (
        <SellerProfileCard
          key={seller._id || seller.id}
          seller={seller}
          sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
          compact={compact}
          onPress={() => handleSellerPress(seller)}
          onPinToggle={() => handlePinToggle(seller._id)}
          isPinned={pinnedStores.some((s) => s._id === seller._id)}
        />
      ))}
    </ScrollView>
  );

  const sellerBlocks = [
    {
      key: 'pinned',
      icon: 'bookmark',
      tint: colors.primary,
      title: 'My pinned stores',
      subtitle: 'Quick access to your favourites',
      list: sellerSections.pinned,
      compact: true,
    },
    {
      key: 'featured',
      icon: 'star',
      tint: colors.warning,
      title: 'Featured near you',
      subtitle: 'Handpicked trusted sellers',
      list: sellerSections.featured,
    },
    {
      key: 'popular',
      icon: 'flame',
      tint: colors.danger,
      title: 'Popular sellers',
      subtitle: 'Most visited this week',
      list: sellerSections.popular,
    },
    {
      key: 'nearby',
      icon: 'location',
      tint: colors.info || colors.primary,
      title: 'Sellers near you',
      subtitle: 'Closest to your location',
      list: sellerSections.nearby,
    },
  ].filter((block) => block.list.length > 0);

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
                contentContainerStyle={[styles.sidebarContent, { paddingBottom: 28 + insets.bottom }]}
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
                        {isActive ? <View style={[styles.sideIndicator, { backgroundColor: tint }]} /> : null}
                        <View
                          style={[
                            styles.sideIcon,
                            { backgroundColor: isActive ? tint : `${tint}1F` },
                            isActive && [styles.sideIconActive, { shadowColor: tint }],
                          ]}
                        >
                          {cat.imageUrl ? (
                            <Image source={{ uri: cat.imageUrl }} style={styles.sideIconImage} />
                          ) : (
                            <Ionicons name={cat.icon} size={17} color={isActive ? '#FFFFFF' : tint} />
                          )}
                        </View>
                        <Text numberOfLines={2} style={[styles.sideLabel, isActive && styles.sideLabelActive]}>
                          {cat.label}
                        </Text>
                        <View style={[styles.sideCount, isActive && { backgroundColor: `${tint}26` }]}>
                          <Text style={[styles.sideCountText, isActive && { color: tint }]}>{cat.count || 0}</Text>
                        </View>
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
              <ScrollView
                style={styles.mainContent}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollViewContent, { paddingBottom: 28 + insets.bottom }]}
                refreshControl={refreshControl(colors, refreshing, onRefresh)}
              >
                <View style={[styles.heroCard, { backgroundColor: `${activeTint}14`, borderColor: `${activeTint}33` }]}>
                  <View style={styles.heroTop}>
                    <View style={[styles.heroIcon, { backgroundColor: activeTint }]}>
                      {activeMeta?.imageUrl ? (
                        <Image source={{ uri: activeMeta.imageUrl }} style={styles.sideIconImage} />
                      ) : (
                        <Ionicons name={activeMeta?.icon || 'grid'} size={17} color="#FFFFFF" />
                      )}
                    </View>
                    <View style={styles.heroCopy}>
                      <Text style={styles.heroTitle} numberOfLines={1}>
                        {isAll ? (activeTab === 'products' ? 'All products' : 'All sellers') : activeCategory}
                      </Text>
                      <Text style={styles.heroSub} numberOfLines={1}>
                        {itemsLoading ? 'Loading…' : heroStats.subtitle}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.heroStats}>
                    {heroStats.stats.map((stat) => (
                      <View key={stat.label} style={styles.heroStat}>
                        <Text style={styles.heroStatValue} numberOfLines={1}>{stat.value}</Text>
                        <Text style={styles.heroStatLabel} numberOfLines={1}>{stat.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sortRow}>
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
                </ScrollView>

                {activeTab === 'products' ? (
                  <>
                    {activeFilterCount > 0 ? (
                      <View style={styles.resultsBar}>
                        <Text style={styles.resultsTitle}>{filteredProducts.length} results</Text>
                        <Pressable style={styles.clearLink} onPress={clearFilters} hitSlop={8}>
                          <Ionicons name="close-circle" size={14} color={colors.link} />
                          <Text style={styles.clearLinkText}>Clear filters</Text>
                        </Pressable>
                      </View>
                    ) : null}
                    {itemsLoading && filteredProducts.length === 0 ? (
                      <View style={styles.productGrid}>
                        {[0, 1, 2, 3].map((i) => (
                          <ProductCardSkeleton key={i} width={productCardWidth} compact />
                        ))}
                      </View>
                    ) : filteredProducts.length > 0 ? (
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
                  </>
                ) : itemsLoading && sellerBlocks.length === 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sellerRow}>
                    {[0, 1].map((i) => (
                      <SellerProfileCardSkeleton key={i} />
                    ))}
                  </ScrollView>
                ) : sellerBlocks.length > 0 ? (
                  sellerBlocks.map((block) => (
                    <View key={block.key} style={styles.sellerSection}>
                      <SectionTitle
                        styles={styles}
                        icon={block.icon}
                        tint={block.tint}
                        title={block.title}
                        subtitle={block.subtitle}
                        count={block.list.length}
                      />
                      {renderSellerRow(block.list, block.compact)}
                    </View>
                  ))
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
        {itemsLoading && products.length === 0 ? <ScreenLoader overlay label="Loading" /> : null}
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
