import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import {
  Animated,
  Easing,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
  Dimensions,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { attachDistanceToCard, toCardItem } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useAuth } from '../context/AuthContext';
import { useCategories, mergeSidebarCategories } from '../utils/categories';
import SellerProfileCard from '../components/SellerProfileCard';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import ProductCard from '../components/ProductCard';
import pinnedStoresUtils from '../utils/pinnedStores';
import { BRAND_TAGLINE } from '../content/brand';
import { ProductCardSkeleton, SellerProfileCardSkeleton } from '../components/SkeletonLoader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(200, SCREEN_WIDTH / 2.0);
const SIDEBAR_WIDTH = 72;
const GRID_GUTTER = 8;
const GRID_PADDING = 10;

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  exploreTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.onGradient,
    letterSpacing: -0.5,
  },
  exploreSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 4,
  },
  mapBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  searchWrap: {
    marginTop: -20,
    paddingHorizontal: 16,
  },
  content: {
    flex: 1,
  },
  scrollViewContent: {
    paddingBottom: 20,
  },
  section: {
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  sectionIcon: {
    marginRight: 6,
  },
  viewAll: {
    color: colors.link,
    fontWeight: '600',
    fontSize: 13,
  },
  pinnedSection: {
    marginTop: 16,
  },
  pinnedScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  featuredSection: {
    marginTop: 24,
  },
  featuredScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  popularSection: {
    marginTop: 24,
  },
  popularScroll: {
    paddingHorizontal: 16,
    gap: 12,
  },
  nearbySection: {
    marginTop: 24,
  },
  nearbyList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  nearbyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nearbyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  nearbyInfo: {
    flex: 1,
  },
  nearbyName: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  nearbyMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  nearbyRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nearbyRatingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
  },
  nearbyDistance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nearbyDistanceText: {
    fontSize: 12,
    color: colors.textMuted,
  },
  searchTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  searchTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchTabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  searchTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  searchTabTextActive: {
    color: colors.onPrimary,
  },
  body: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  tabsTrack: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: colors.iconBackground,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabBtnTextActive: {
    color: colors.onPrimary,
  },
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: 14,
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
    top: 6,
    right: 6,
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
    color: colors.white || '#fff',
  },
  split: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.iconBackground,
    borderTopRightRadius: 18,
    overflow: 'hidden',
  },
  sidebarContent: {
    paddingTop: 0,
    paddingBottom: 8,
  },
  sideItem: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 2,
    gap: 3,
  },
  sideItemActive: {
    backgroundColor: colors.background,
  },
  sideIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: colors.primary,
  },
  sideIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  sideIconImage: {
    width: 32,
    height: 32,
  },
  sideLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 11,
    paddingHorizontal: 2,
  },
  sideLabelActive: {
    color: colors.text,
    fontWeight: '800',
  },
  sideCount: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: '500',
    textAlign: 'center',
  },
  mainContent: {
    flex: 1,
  },
  resultsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  resultsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  resultsMeta: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
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
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: colors.iconBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  sortChipTextActive: {
    color: colors.onPrimary,
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
    paddingBottom: 40,
  },
  filterModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  filterModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  filterCloseButton: {
    padding: 8,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  filterOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterOptionText: {
    fontSize: 15,
    color: colors.text,
    marginLeft: 12,
  },
  filterCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterCheckboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterCheckboxInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.onPrimary,
  },
  applyButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  applyButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  searchResults: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    marginTop: 60,
  },
  searchContent: {
    flex: 1,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 24,
    gap: GRID_GUTTER,
  },
});

export default function ExploreScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { user } = useAuth();
  const initialCategory = route?.params?.category;
  const productCategories = useCategories('product');
  const shopCategories = useCategories('shop');

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchTab, setSearchTab] = useState('all');
  const [activeTab, setActiveTab] = useState('products');
  const [activeCategory, setActiveCategory] = useState(null);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [pinnedStores, setPinnedStores] = useState([]);
  const [featuredSellers, setFeaturedSellers] = useState([]);
  const [popularSellers, setPopularSellers] = useState([]);
  const [nearbySellers, setNearbySellers] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [products, setProducts] = useState([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState({
    verified: false,
    nearby: false,
    topRated: false,
  });
  const [sortBy, setSortBy] = useState('newest');

  const hasLoadedRef = useRef(false);
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
    setActiveCategory((curr) => (curr === label ? curr : label));
  }, []);

  const fetchQuickLocation = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const last = await Location.getLastKnownPositionAsync();
      if (last?.coords) {
        const coords = { lat: last.coords.latitude, lng: last.coords.longitude };
        setUserCoords(coords);
        return coords;
      }
      return null;
    } catch (_) {
      return null;
    }
  }, []);

  const applyExplorePayload = useCallback((featuredRes, popularRes, nearbyRes, productsRes, coords) => {
    setFeaturedSellers(featuredRes.data?.sellers || []);
    setPopularSellers(popularRes.data?.sellers || []);
    setNearbySellers(nearbyRes.data?.sellers || []);

    if (!productsRes.error && productsRes.data?.listings) {
      setProducts(
        productsRes.data.listings
          .map(toCardItem)
          .filter(Boolean)
          .map((it) => attachDistanceToCard(it, coords, user?.id))
      );
    } else {
      setProducts([]);
    }
  }, [user?.id]);

  const fetchSellers = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setItemsLoading(true);
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
        api.getListings(locParams),
      ]);

      applyExplorePayload(featuredRes, popularRes, nearbyRes, productsRes, coords);
      hasLoadedRef.current = true;
    } catch (error) {
      console.error('Failed to load explore data:', error);
      setFeaturedSellers([]);
      setPopularSellers([]);
      setNearbySellers([]);
    } finally {
      setItemsLoading(false);
    }
  }, [fetchQuickLocation, applyExplorePayload]);

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

  const handleSearch = useCallback(async () => {
    if (!query.trim()) {
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setSearchLoading(true);

    try {
      const searchParams = {
        q: query.trim(),
        type: searchTab,
      };
      if (userCoords.lat != null) searchParams.lat = userCoords.lat;
      if (userCoords.lng != null) searchParams.lng = userCoords.lng;

      if (searchTab === 'products') {
        const listingRes = await api.searchListings(searchParams);
        const listings = (listingRes.data?.listings || []).map(toCardItem).filter(Boolean);
        setSearchResults(listings.map((item) => ({ ...item, resultType: 'product' })));
      } else {
        const sellerRes = await api.searchSellers(searchParams);
        setSearchResults(sellerRes.data?.sellers || []);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [query, searchTab]);

  const { refreshing, onRefresh } = usePullRefresh(async () => {
    if (isSearching && query.trim()) {
      await handleSearch();
      return;
    }
    await fetchSellers({ silent: true });
  });

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (query.trim()) {
        handleSearch();
      } else {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, searchTab]);

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
      openItemDetail(navigation, { listingId: product.id, item: product, sharedId: product.id });
    }
  }, [navigation]);

  const mainTabs = [
    { key: 'products', label: 'Products', icon: 'cube-outline' },
    { key: 'sellers', label: 'Sellers', icon: 'storefront-outline' },
  ];

  const SORT_OPTIONS = [
    { key: 'newest', label: 'Newest' },
    { key: 'nearby', label: 'Nearby' },
    { key: 'priceLow', label: 'Price: Low' },
    { key: 'priceHigh', label: 'Price: High' },
    { key: 'topRated', label: 'Popular' },
  ];

  const activeFilterCount =
    (sortBy !== 'newest' ? 1 : 0) +
    Object.values(selectedFilters).filter(Boolean).length;

  const switchTab = (key) => {
    setActiveTab(key);
    setActiveCategory('All');
  };

  const clearFilters = () => {
    setSortBy('newest');
    setSelectedFilters({ verified: false, nearby: false, topRated: false });
  };

  const tabs = [
    { key: 'all', label: 'All' },
    { key: 'sellers', label: 'Sellers' },
    { key: 'stores', label: 'Stores' },
    { key: 'products', label: 'Products' },
  ];

  const categories = useMemo(() => {
    const allOption = { 
      label: 'All', 
      icon: activeTab === 'products' ? 'grid-outline' : 'storefront-outline', 
      tint: '#F59E0B',
      count: activeTab === 'products' ? products.length : [...featuredSellers, ...popularSellers, ...nearbySellers].length
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
    for (const seller of [...featuredSellers, ...popularSellers, ...nearbySellers]) {
      const name = seller.category || 'General';
      if (name) found[name] = (found[name] || 0) + 1;
    }
    return mergeSidebarCategories(shopCategories, found, allOption);
  }, [products, featuredSellers, popularSellers, nearbySellers, activeTab, productCategories, shopCategories]);

  const filteredProducts = useMemo(() => {
    let filtered = [...products];

    if (activeCategory && activeCategory !== 'All') {
      filtered = filtered.filter(
        (it) => (it.category || it.listing?.category) === activeCategory
      );
    }

    if (sortBy === 'nearby' || selectedFilters.nearby) {
      filtered.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    } else if (sortBy === 'topRated' || selectedFilters.topRated) {
      filtered.sort((a, b) => (b.listing?.views || 0) - (a.listing?.views || 0));
    } else if (sortBy === 'priceLow') {
      filtered.sort((a, b) => (Number(a.listing?.price) || 0) - (Number(b.listing?.price) || 0));
    } else if (sortBy === 'priceHigh') {
      filtered.sort((a, b) => (Number(b.listing?.price) || 0) - (Number(a.listing?.price) || 0));
    }

    return filtered;
  }, [products, activeCategory, selectedFilters, sortBy]);

  const filteredSellers = useMemo(() => {
    let sellers = [...featuredSellers, ...popularSellers, ...nearbySellers];
    const seen = new Set();
    sellers = sellers.filter((seller) => {
      const id = String(seller._id || seller.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    if (activeCategory && activeCategory !== 'All') {
      sellers = sellers.filter(
        (seller) => (seller.category || 'General') === activeCategory
      );
    }

    if (selectedFilters.verified) {
      sellers = sellers.filter((seller) => seller.verified);
    }

    if (sortBy === 'nearby' || selectedFilters.nearby) {
      sellers.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
    } else if (sortBy === 'topRated' || selectedFilters.topRated) {
      sellers.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }

    return sellers;
  }, [featuredSellers, popularSellers, nearbySellers, activeCategory, selectedFilters, sortBy]);

  // Set initial category when categories change or from navigation params
  useEffect(() => {
    if (activeCategory == null && categories.length > 0) {
      if (initialCategory && categories.find((c) => c.label === initialCategory)) {
        setActiveCategory(initialCategory);
      } else {
        setActiveCategory('All');
      }
    }
  }, [categories, activeCategory, initialCategory]);

  useEffect(() => {
    if (!activeCategory) return;
    triggerPaneAnim();
  }, [activeCategory, activeTab, triggerPaneAnim]);

  const mainWidth = isSearching ? windowWidth : windowWidth - SIDEBAR_WIDTH;
  const productCardWidth = (mainWidth - GRID_PADDING * 2 - GRID_GUTTER) / 2;

  return (
    <>
      <View style={styles.container}>
        <ThemeStatusBar variant="header" />
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.exploreTitle}>Explore</Text>
              <Text style={styles.exploreSubtitle}>{BRAND_TAGLINE}</Text>
            </View>
            <Pressable
              style={styles.mapBtn}
              onPress={() => navigation.navigate(ROUTES.MAP_EXPLORE)}
              hitSlop={8}
            >
              <Ionicons name="map-outline" size={20} color={colors.onPrimary} />
            </Pressable>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search sellers, stores or products..."
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
                    <Ionicons
                      name={tab.icon}
                      size={16}
                      color={isActive ? colors.onPrimary : colors.textMuted}
                    />
                    <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>
                      {tab.label}
                    </Text>
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
                size={20}
                color={activeFilterCount > 0 ? colors.onPrimary : colors.text}
              />
              {activeFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </Pressable>
          </View>

          {isSearching ? (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={[styles.scrollViewContent, { paddingBottom: 28 + insets.bottom }]}
              refreshControl={refreshControl(colors, refreshing, onRefresh)}
            >
            <View style={styles.searchContent}>
              <View style={styles.searchTabs}>
                {tabs.map(tab => (
                  <Pressable
                    key={tab.key}
                    style={[styles.searchTab, searchTab === tab.key && styles.searchTabActive]}
                    onPress={() => setSearchTab(tab.key)}
                  >
                    <Text style={[styles.searchTabText, searchTab === tab.key && styles.searchTabTextActive]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {searchLoading ? (
                searchTab === 'products' ? (
                  <View style={styles.productGrid}>
                    {[0, 1, 2, 3].map((i) => (
                      <ProductCardSkeleton key={i} width={productCardWidth} compact />
                    ))}
                  </View>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.featuredScroll}
                  >
                    {[0, 1, 2].map((i) => (
                      <SellerProfileCardSkeleton key={i} width={CARD_WIDTH} />
                    ))}
                  </ScrollView>
                )
              ) : searchResults.length === 0 ? (
                <EmptyState
                  compact
                  icon="search-outline"
                  title="No results found"
                  body="Try different words to find sellers or stores."
                />
              ) : (
                <View style={styles.searchResults}>
                  {searchResults.map((result) => {
                    if (searchTab === 'products' || result.resultType === 'product') {
                      return (
                        <Pressable
                          key={result.id || result._id}
                          onPress={() => handleProductPress(result)}
                          style={{ marginBottom: 8 }}
                        >
                          <Text style={{ color: colors.text, fontWeight: '700' }}>{result.title}</Text>
                          <Text style={{ color: colors.textMuted }}>{result.price} · {result.location}</Text>
                        </Pressable>
                      );
                    }
                    return (
                      <SellerProfileCard
                        key={result._id || result.id}
                        seller={result}
                        sellerType={result.sellerType || (result.shopId ? 'shop' : 'individual')}
                        onPress={() => handleSellerPress(result)}
                        onPinToggle={() => handlePinToggle(result._id || result.id)}
                        isPinned={pinnedStores.some((s) => s._id === result._id || s._id === result.id)}
                        onProductPress={handleProductPress}
                      />
                    );
                  })}
                </View>
              )}
            </View>
            </ScrollView>
          ) : (
            <View style={styles.split}>
              <View style={styles.sidebar}>
                <ScrollView
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[styles.sidebarContent, { paddingBottom: 28 + insets.bottom }]}
                >
                  {categories.map((cat) => {
                    const isActive = cat.label === activeCategory;
                    const itemAnim = getSidebarItemAnim(cat.label);
                    return (
                      <Animated.View key={cat.label} style={{ transform: [{ scale: itemAnim }] }}>
                      <Pressable
                        style={[styles.sideItem, isActive && styles.sideItemActive]}
                        onPress={() => {
                          Animated.sequence([
                            Animated.timing(itemAnim, {
                              toValue: 0.92,
                              duration: 70,
                              useNativeDriver: true,
                            }),
                            Animated.spring(itemAnim, {
                              toValue: 1,
                              tension: 280,
                              friction: 12,
                              useNativeDriver: true,
                            }),
                          ]).start();
                          handleCategoryChange(cat.label);
                        }}
                      >
                        {isActive ? <View style={styles.sideIndicator} /> : null}
                        <View
                          style={[
                            styles.sideIcon,
                            { backgroundColor: cat.tint || cat.color || colors.surface },
                          ]}
                        >
                          {cat.imageUrl ? (
                            <Image source={{ uri: cat.imageUrl }} style={styles.sideIconImage} />
                          ) : (
                            <Ionicons
                              name={cat.icon}
                              size={18}
                              color={colors.onPrimary || colors.white || '#FFFFFF'}
                            />
                          )}
                        </View>
                        <Text
                          numberOfLines={2}
                          style={[styles.sideLabel, isActive && styles.sideLabelActive]}
                        >
                          {cat.label}
                        </Text>
                        <Text style={styles.sideCount}>{cat.count || 0}</Text>
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
                        translateY: paneAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [12, 0],
                        }),
                      },
                    ],
                  },
                ]}
              >
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.scrollViewContent, { paddingBottom: 28 + insets.bottom }]}
                refreshControl={refreshControl(colors, refreshing, onRefresh)}
              >
              {activeTab === 'products' ? (
                <>
                  {/* Products Tab Content */}
                  <View style={styles.section}>
                    <View style={styles.resultsBar}>
                      <Text style={styles.resultsTitle}>
                        {activeCategory && activeCategory !== 'All' ? activeCategory : 'All products'}
                      </Text>
                      <Text style={styles.resultsMeta}>
                        {itemsLoading ? 'Loading…' : `${filteredProducts.length} items`}
                      </Text>
                    </View>
                    {itemsLoading ? (
                      <View style={styles.productGrid}>
                        {[0, 1, 2, 3].map((i) => (
                          <ProductCardSkeleton key={i} width={productCardWidth} compact />
                        ))}
                      </View>
                    ) : filteredProducts.length > 0 ? (
                      <View style={styles.productGrid}>
                        {filteredProducts.map((item) => (
                          <ProductCard
                            key={item.id}
                            {...item}
                            compact
                            width={productCardWidth}
                            sharedId={item.id}
                            onPress={() =>
                              openItemDetail(navigation, {
                                listingId: item.id,
                                item: item.listing || item,
                                sharedId: item.id,
                              })
                            }
                            onToggleSave={async () => {
                              await api.toggleWishlist(item.id);
                            }}
                          />
                        ))}
                      </View>
                    ) : (
                      <EmptyState
                        compact
                        icon="cube-outline"
                        title="No products yet"
                        body="Products will appear here when sellers start listing items."
                      />
                    )}
                  </View>
                </>
              ) : (
                <>
                  {/* Sellers & Stores Tab Content */}
                {/* Pinned Stores Section - Only show when there are pinned stores */}
                {pinnedStores.length > 0 && (
                  <View style={styles.pinnedSection}>
                    <View style={styles.sectionHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="bookmark" size={20} color={colors.primary} style={styles.sectionIcon} />
                        <Text style={styles.sectionTitle}>My Pinned Stores</Text>
                      </View>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.pinnedScroll}
                      scrollEventThrottle={16}
                    >
                      {pinnedStores.filter(seller => !activeCategory || activeCategory === 'All' || (seller.category || 'General') === activeCategory).map(seller => (
                        <SellerProfileCard
                          key={seller._id}
                          seller={seller}
                          sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
                          compact
                          onPress={() => handleSellerPress(seller)}
                          onPinToggle={() => handlePinToggle(seller._id)}
                          isPinned={true}
                        />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Featured Sellers Section */}
                <View style={styles.featuredSection}>
                  <View style={styles.sectionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="star" size={20} color={colors.warning} style={styles.sectionIcon} />
                      <Text style={styles.sectionTitle}>Featured Near You</Text>
                    </View>
                    <Pressable onPress={() => {}}>
                      <Text style={styles.viewAll}>View all</Text>
                    </Pressable>
                  </View>
                  {itemsLoading ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.featuredScroll}
                    >
                      {[0, 1, 2].map((i) => (
                        <SellerProfileCardSkeleton key={i} width={CARD_WIDTH} />
                      ))}
                    </ScrollView>
                  ) : featuredSellers.filter(seller => !activeCategory || activeCategory === 'All' || (seller.category || 'General') === activeCategory).length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.featuredScroll}
                      scrollEventThrottle={16}
                    >
                      {featuredSellers.filter(seller => !activeCategory || activeCategory === 'All' || (seller.category || 'General') === activeCategory).map(seller => (
                        <SellerProfileCard
                          key={seller._id}
                          seller={seller}
                          sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
                          onPress={() => handleSellerPress(seller)}
                          onPinToggle={() => handlePinToggle(seller._id)}
                          isPinned={pinnedStores.some(s => s._id === seller._id)}
                          onProductPress={handleProductPress}
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    <EmptyState
                      icon="star-outline"
                      title="No featured sellers available"
                      body="Make sure your backend server is running on port 5001."
                      compact
                    />
                  )}
                </View>

                {/* Popular Sellers Section */}
                <View style={styles.popularSection}>
                  <View style={styles.sectionHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Ionicons name="flame" size={20} color={colors.error} style={styles.sectionIcon} />
                      <Text style={styles.sectionTitle}>Popular Sellers</Text>
                    </View>
                    <Pressable onPress={() => {}}>
                      <Text style={styles.viewAll}>View all</Text>
                    </Pressable>
                  </View>
                  {itemsLoading ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.popularScroll}
                    >
                      {[0, 1, 2].map((i) => (
                        <SellerProfileCardSkeleton key={i} width={CARD_WIDTH} />
                      ))}
                    </ScrollView>
                  ) : popularSellers.filter(seller => !activeCategory || activeCategory === 'All' || (seller.category || 'General') === activeCategory).length > 0 ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.popularScroll}
                      scrollEventThrottle={16}
                    >
                      {popularSellers.filter(seller => !activeCategory || activeCategory === 'All' || (seller.category || 'General') === activeCategory).map(seller => (
                        <SellerProfileCard
                          key={seller._id}
                          seller={seller}
                          sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
                          onPress={() => handleSellerPress(seller)}
                          onPinToggle={() => handlePinToggle(seller._id)}
                          isPinned={pinnedStores.some(s => s._id === seller._id)}
                          onProductPress={handleProductPress}
                        />
                      ))}
                    </ScrollView>
                  ) : (
                    <EmptyState
                      icon="flame-outline"
                      title="No popular sellers available"
                      body="Make sure your backend server is running on port 5001."
                      compact
                    />
                  )}
                </View>

                {/* Nearby Sellers Section */}
                <View style={styles.nearbySection}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="location" size={20} color={colors.primary} style={styles.sectionIcon} />
                  <Text style={styles.sectionTitle}>Sellers Near You</Text>
                </View>
                <Pressable onPress={() => {}}>
                  <Text style={styles.viewAll}>View all</Text>
                </Pressable>
              </View>
              {itemsLoading ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.nearbyList}
                >
                  {[0, 1, 2].map((i) => (
                    <SellerProfileCardSkeleton key={i} width={CARD_WIDTH} />
                  ))}
                </ScrollView>
              ) : nearbySellers.filter(seller => !activeCategory || activeCategory === 'All' || (seller.category || 'General') === activeCategory).length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.nearbyList}
                  scrollEventThrottle={16}
                >
                  {nearbySellers.filter(seller => !activeCategory || activeCategory === 'All' || (seller.category || 'General') === activeCategory).slice(0, 5).map(seller => (
                    <SellerProfileCard
                      key={seller._id}
                      seller={seller}
                      sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
                      onPress={() => handleSellerPress(seller)}
                      onPinToggle={() => handlePinToggle(seller._id)}
                      isPinned={pinnedStores.some(s => s._id === seller._id)}
                      onProductPress={handleProductPress}
                    />
                  ))}
                </ScrollView>
              ) : (
                <EmptyState
                  icon="location-outline"
                  title="No nearby sellers available"
                  body="Make sure your backend server is running on port 5001."
                  compact
                />
              )}
            </View>
          </>
        )}
              </ScrollView>
              </Animated.View>
            </View>
          )}
      </View>
      </View>

  {/* Filter Modal */}
  <Modal
    visible={showFilterModal}
    transparent={true}
    animationType="slide"
    onRequestClose={() => setShowFilterModal(false)}
  >
    <View style={styles.filterModal}>
      <Pressable
        style={{ flex: 1 }}
        onPress={() => setShowFilterModal(false)}
      />
      <View style={[styles.filterModalContent, { paddingBottom: Math.max(insets.bottom, 20) + 12 }]}>
        <View style={styles.filterHandle} />
        <View style={styles.filterModalHeader}>
          <Text style={styles.filterModalTitle}>Sort & filters</Text>
          <Pressable
            style={styles.filterCloseButton}
            onPress={() => setShowFilterModal(false)}
          >
            <Ionicons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterSectionTitle}>Sort by</Text>
          <View style={styles.sortChips}>
            {(activeTab === 'products'
              ? SORT_OPTIONS
              : SORT_OPTIONS.filter((o) => o.key !== 'priceLow' && o.key !== 'priceHigh')
            ).map((opt) => {
              const active = sortBy === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  style={[styles.sortChip, active && styles.sortChipActive]}
                  onPress={() => setSortBy(opt.key)}
                >
                  <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.filterSection}>
          <Text style={styles.filterSectionTitle}>Show only</Text>

          {activeTab === 'sellers' ? (
            <Pressable
              style={styles.filterOption}
              onPress={() => setSelectedFilters((prev) => ({ ...prev, verified: !prev.verified }))}
            >
              <View style={[
                styles.filterCheckbox,
                selectedFilters.verified && styles.filterCheckboxChecked
              ]}>
                {selectedFilters.verified && <View style={styles.filterCheckboxInner} />}
              </View>
              <Text style={styles.filterOptionText}>Verified sellers</Text>
            </Pressable>
          ) : null}

          <Pressable
            style={styles.filterOption}
            onPress={() => setSelectedFilters((prev) => ({ ...prev, nearby: !prev.nearby }))}
          >
            <View style={[
              styles.filterCheckbox,
              selectedFilters.nearby && styles.filterCheckboxChecked
            ]}>
              {selectedFilters.nearby && <View style={styles.filterCheckboxInner} />}
            </View>
            <Text style={styles.filterOptionText}>Nearby first</Text>
          </Pressable>

          <Pressable
            style={styles.filterOption}
            onPress={() => setSelectedFilters((prev) => ({ ...prev, topRated: !prev.topRated }))}
          >
            <View style={[
              styles.filterCheckbox,
              selectedFilters.topRated && styles.filterCheckboxChecked
            ]}>
              {selectedFilters.topRated && <View style={styles.filterCheckboxInner} />}
            </View>
            <Text style={styles.filterOptionText}>Most popular</Text>
          </Pressable>
        </View>

        <View style={styles.filterActions}>
          <Pressable style={styles.clearButton} onPress={clearFilters}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </Pressable>
          <Pressable
            style={styles.applyButtonFlex}
            onPress={() => setShowFilterModal(false)}
          >
            <Text style={styles.applyButtonText}>Show results</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>
    </>
  );
}