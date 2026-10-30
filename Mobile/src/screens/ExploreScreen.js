import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import Icon from '../components/Icon';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { navigateToTab, openItemDetail, ROUTES, TABS } from '../navigation/helpers';
import { api, getAuthToken } from '../services/api';
import { useRequireLogin } from '../components/LoginPrompt';
import {
  attachDistanceToCard,
  attachDistanceToSeller,
  formatDistanceLabel,
  formatPrice,
  toCardItem,
} from '../utils/listing';
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
import { useExploreVoiceTurns } from '../components/VoiceHost';
import EmptyState from '../components/EmptyState';
import ProductCard from '../components/ProductCard';
import pinnedStoresUtils from '../utils/pinnedStores';
import { isNearEnd } from '../utils/scroll';
import { ProductCardSkeleton, SellerProfileCardSkeleton } from '../components/SkeletonLoader';
import {
  Ping,
  PressableScale,
  Reanimated,
  SoftPop,
  enterCard,
  enterQuick,
  enterSlide,
  enterUp,
} from '../components/Motion';
import ExploreFilterSheet, { DEFAULT_EXPLORE_FILTERS, countActiveFilters } from '../components/ExploreFilterSheet';

const SIDEBAR_WIDTH = 70;
const GRID_GUTTER = 8;
const GRID_PADDING = 10;
const ALL_TINT = '#047857';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const FOCUS_CACHE_TTL_MS = 300_000; // 5 minutes
const SEARCH_PAUSE_MS = 450;
const MIN_SEARCH_CHARS = 2;
const EXPLORE_PAGE = 24;
const CATEGORY_PAGE = 40;

const DEFAULT_SORT = 'forYou';
const SORT_OPTIONS = [
  { key: 'forYou', label: 'For you', icon: 'sparkles-outline', activeIcon: 'sparkles' },
  { key: 'newest', label: 'Newest', icon: 'star-outline', activeIcon: 'star' },
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

function productPasses(item, filters) {
  const price = Number(item?.listing?.price) || 0;
  if (filters.priceMin != null && price < filters.priceMin) return false;
  if (filters.priceMax != null && price > filters.priceMax) return false;
  if (filters.condition && (item.condition || item.listing?.condition) !== filters.condition) return false;
  if (filters.postedDays) {
    const created = listingCreatedAt(item);
    if (!created || Date.now() - created > filters.postedDays * 86400000) return false;
  }
  if (filters.maxKm && (item.distanceKm == null || item.distanceKm > filters.maxKm)) return false;
  if (filters.sellerType !== 'all' && (item.sellerType || item.listing?.sellerType || 'individual') !== filters.sellerType) {
    return false;
  }
  if (filters.verified && !item.verified) return false;
  return true;
}

/** Price and condition also go to the server so a filtered search is not cut from the top 40. */
function serverSearchFilters(filters) {
  const params = {};
  if (filters?.priceMin != null) params.minPrice = filters.priceMin;
  if (filters?.priceMax != null) params.maxPrice = filters.priceMax;
  if (filters?.condition) params.condition = filters.condition;
  return params;
}

function searchKeyFor(q, filters) {
  const params = serverSearchFilters(filters);
  return `${q}#${params.minPrice ?? ''}|${params.maxPrice ?? ''}|${params.condition ?? ''}`;
}

const VOICE_SORTS = {
  relevance: DEFAULT_SORT,
  'price-low': 'priceLow',
  'price-high': 'priceHigh',
  nearby: 'nearby',
  newest: 'newest',
  popular: 'topRated',
};

// Spoken words that ask the app to do something rather than name an item; no instant search for these.
const VOICE_COMMAND_RE = /(^|\s)(khol\w*|open|kholo|seller\w*|shops?|pasal\w*|band|stop|bye|home|profile|setting\w*|saved|wishlist|chats?|notification\w*|clear|hatao|hata|pahil\w*|pehl\w*|first|second|dosr\w*|dusr\w*|teesr\w*|last|thank\w*|dhanyabad|namaste|hello|hi|hey|kaise|kasto|what|who|why|how|खोल\S*|सेलर\S*|पसल\S*|बन्द|बंद|पहिलो|पहला|दोस्रो|दूसरा|धन्यवाद|नमस्ते|सेटिङ\S*|प्रोफाइल)(?=\s|$)/i;

// Request words, price and condition words dropped from the spoken text for the instant search.
const VOICE_FILLER_RE = /(^|\s)(mujhe|malai|hamlai|hamein|please|plz|show|me|find|search|look|for|i|want|need|a|an|the|some|koi|kuch|ek|euta|dikhao|dikha|dikhaiye|dikhado|dekhau|dekhaunus|dekhaideu|chahiye|chaiye|chahiyo|chaincha|chahincha|khojo|khoja|khojdeu|wala|wali|vala|ko|ka|ki|ke|ma|me|mai|hai|ho|cha|chha|sasta|sasti|sasto|mahanga|naya|nayi|naaya|purana|purani|purano|second hand|used|new|near|nearby|najik|najikai|paas|under|below|above|less|than|se|kam|tak|bhanda|rupees|rs|rupaiya|मुझे|मलाई|दिखाओ|दिखाइए|दिखा|देखाउनुस्|देखाउनुहोस्|देखाऊ|देखाउ|चाहिए|चाहियो|चाहिन्छ|खोज|खोज्नुस्|खोजो|कोई|कुछ|एक|एउटा|वाला|वाली|को|का|की|के|मा|में|है|छ|सस्ता|सस्ती|सस्तो|नया|नयाँ|पुराना|पुरानो|नजिक|पास|तक|भन्दा|रुपैयाँ)(?=\s|$)/gi;

/** A rough item query from the raw words, searched at once while the AI works out the real one. */
function quickVoiceQuery(text) {
  const spoken = String(text || '').toLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!spoken || VOICE_COMMAND_RE.test(spoken)) return '';
  let rest = spoken.replace(/\d+(\.\d+)?\s*(k|hazar|hajar|हजार|lakh|lac|लाख|thousand)?/gi, ' ');
  // Run twice: the lookahead shares the space between neighbouring fillers.
  rest = rest.replace(VOICE_FILLER_RE, ' ').replace(VOICE_FILLER_RE, ' ').replace(/\s+/g, ' ').trim();
  return rest.length >= MIN_SEARCH_CHARS ? rest.slice(0, 40) : '';
}

function sellerPasses(seller, filters) {
  if (filters.verified && !seller.verified) return false;
  if (filters.maxKm && (seller.distance == null || seller.distance > filters.maxKm)) return false;
  if (filters.sellerType !== 'all') {
    const type = seller.sellerType || (seller.shopId ? 'shop' : 'individual');
    if (type !== filters.sellerType) return false;
  }
  return true;
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
    marginTop: -18,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 8,
  },
  tabsTrack: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
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
  tabSlider: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 10,
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
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderTopRightRadius: 20,
    borderRightWidth: 1,
    borderTopWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sidebarList: {
    flex: 1,
  },
  sidebarContent: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  sideItem: {
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    gap: 3,
    borderRadius: 14,
    marginHorizontal: 2,
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
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 12,
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
    flexShrink: 1,
    marginRight: 8,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  searchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: GRID_PADDING + 2,
    paddingTop: 4,
    paddingBottom: 10,
  },
  searchingText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
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
  loadMoreRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    paddingBottom: 4,
    gap: GRID_GUTTER,
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

const TAB_SLIDE = { duration: 240, easing: Easing.bezier(0.22, 1, 0.36, 1) };

const ExploreTabs = memo(function ExploreTabs({ styles, colors, activeTab, onChange }) {
  const [selected, setSelected] = useState(activeTab);
  const [tabWidth, setTabWidth] = useState(0);
  const offset = useSharedValue(0);
  const tabs = [
    { key: 'products', label: 'Products', icon: 'cube-outline' },
    { key: 'sellers', label: 'Sellers', icon: 'storefront-outline' },
  ];
  const indexOf = (key) => Math.max(0, tabs.findIndex((tab) => tab.key === key));

  useEffect(() => {
    if (activeTab === selected) return;
    setSelected(activeTab);
    if (tabWidth) offset.value = withTiming(indexOf(activeTab) * tabWidth, TAB_SLIDE);
  }, [activeTab]);

  const sliderStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  const onLayout = (event) => {
    const next = Math.max(0, (event.nativeEvent.layout.width - 2 - 8) / 2);
    offset.value = indexOf(selected) * next;
    setTabWidth(next);
  };

  const press = (key) => {
    if (key === selected) return;
    if (tabWidth) offset.value = withTiming(indexOf(key) * tabWidth, TAB_SLIDE);
    setSelected(key);
    onChange(key);
  };

  return (
    <View style={styles.tabsTrack} onLayout={onLayout}>
      {tabWidth ? (
        <Reanimated.View pointerEvents="none" style={[styles.tabSlider, { width: tabWidth }, sliderStyle]} />
      ) : null}
      {tabs.map((tab) => {
        const isActive = selected === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tabBtn, isActive && !tabWidth && styles.tabBtnActive]}
            onPress={() => press(tab.key)}
          >
            <Icon name={tab.icon} size={14} color={isActive ? colors.onPrimary : colors.textMuted} />
            <Text style={[styles.tabBtnText, isActive && styles.tabBtnTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
});

function SectionTitle({ styles, icon, tint, title, subtitle, count }) {
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: `${tint}1F` }]}>
        <Icon name={icon} size={15} color={tint} />
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
  const requireLogin = useRequireLogin();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const initialCategory = route?.params?.category;
  const productCategories = useCategories('product');
  const shopCategories = useCategories('shop');
  const [interestCategories, setInterestCategories] = useState([]);
  const [liveCounts, setLiveCounts] = useState(null);
  const [sellerCounts, setSellerCounts] = useState(null);
  const [categorySellers, setCategorySellers] = useState({});
  const [sellerReloadTick, setSellerReloadTick] = useState(0);

  const [activeTab, setActiveTab] = useState('products');
  const [activeCategory, setActiveCategory] = useState(null);
  const seededExplore = getExploreMemory();
  const seededProducts = seededExplore?.products?.length
    ? seededExplore.products
    : (getHomeListingsMemory()?.listings || []);
  const [itemsLoading, setItemsLoading] = useState(seededProducts.length === 0);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const userCoordsRef = useRef(userCoords);
  userCoordsRef.current = userCoords;
  const [pinnedStores, setPinnedStores] = useState([]);
  const [featuredSellers, setFeaturedSellers] = useState(seededExplore?.featured || []);
  const [popularSellers, setPopularSellers] = useState(seededExplore?.popular || []);
  const [nearbySellers, setNearbySellers] = useState(seededExplore?.nearby || []);
  const [products, setProducts] = useState(seededProducts);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [selectedFilters, setSelectedFilters] = useState(DEFAULT_EXPLORE_FILTERS);
  const [sortBy, setSortBy] = useState(DEFAULT_SORT);
  const productRankRef = useRef(new Map());
  const [productOrderTick, setProductOrderTick] = useState(0);
  const rememberProductOrder = useCallback((key, listings, reset = false) => {
    let ranks = productRankRef.current.get(key);
    if (!ranks || reset) {
      ranks = new Map();
      productRankRef.current.set(key, ranks);
    }
    listings.forEach((item) => {
      const id = String(item?.id || item?._id || '');
      if (id && !ranks.has(id)) ranks.set(id, ranks.size);
    });
  }, []);
  const [searchText, setSearchText] = useState('');
  // What the voice chat wrote into the box; it is searched by the voice flow, not the typing debounce.
  const [voiceText, setVoiceText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchProducts, setSearchProducts] = useState([]);
  const [searchSellers, setSearchSellers] = useState([]);
  const searchAbortRef = useRef(null);
  const searchQueryRef = useRef('');
  searchQueryRef.current = searchQuery;
  // Other spellings/languages the voice helper gave for its query ("kursi,कुर्सी" for "chair").
  const voiceAltsRef = useRef(null);

  const hasLoadedRef = useRef(seededProducts.length > 0);
  const productsFpRef = useRef(catalogFingerprint(seededProducts));
  const productPagingRef = useRef(new Map());
  const loadingMoreRef = useRef(false);
  const [loadingMoreProducts, setLoadingMoreProducts] = useState(false);

  const mergeProducts = useCallback((listings, key = 'All', reset = false) => {
    const incoming = listings
      .map(toCardItem)
      .filter(Boolean)
      .map((it) => attachDistanceToCard(it, userCoordsRef.current));
    rememberProductOrder(key, incoming, reset);
    startTransition(() => {
      setProductOrderTick((tick) => tick + 1);
      setProducts((prev) => {
        const byId = new Map(prev.map((item) => [String(item.id), item]));
        let changed = false;
        for (const item of incoming) {
          const key = String(item.id);
          if (!byId.has(key)) changed = true;
          byId.set(key, item);
        }
        return changed ? [...byId.values()] : prev;
      });
    });
  }, [rememberProductOrder]);
  const sellersFpRef = useRef(catalogFingerprint([
    ...(seededExplore?.featured || []),
    ...(seededExplore?.popular || []),
    ...(seededExplore?.nearby || []),
  ]));
  const sidebarItemAnims = useRef(new Map()).current;
  const skipEnter = useRef(false);

  const getSidebarItemAnim = useCallback((label) => {
    if (!sidebarItemAnims.has(label)) {
      sidebarItemAnims.set(label, new Animated.Value(1));
    }
    return sidebarItemAnims.get(label);
  }, [sidebarItemAnims]);

  const [catPending, startCatTransition] = useTransition();
  const [pendingCategory, setPendingCategory] = useState(null);

  const handleCategoryChange = useCallback((label) => {
    skipEnter.current = true;
    setPendingCategory(label);
    startCatTransition(() => {
      setActiveCategory(label);
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
      rememberProductOrder('All', nextProducts, true);
      setProducts(nextProducts);
      productPagingRef.current = new Map(
        productsRes.error ? [] : [['All', { page: 1, hasMore: Boolean(productsRes.data?.hasMore) }]]
      );
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
      const pinned = await pinnedStoresUtils.getPinnedStores({
        lat: userCoordsRef.current?.lat,
        lng: userCoordsRef.current?.lng,
      });
      setPinnedStores(Array.isArray(pinned) ? pinned : []);
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
        api.getListings({ ...locParams, page: 1, limit: EXPLORE_PAGE }),
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
        rememberProductOrder('All', productsFromDisk, true);
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

  const loadLiveCounts = useCallback(async () => {
    const [products, sellers] = await Promise.all([api.getCategoryCounts(), api.getSellerCategoryCounts()]);
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (products.data?.counts) setLiveCounts((prev) => (same(prev, products.data) ? prev : products.data));
    if (sellers.data?.categories) setSellerCounts((prev) => (same(prev, sellers.data) ? prev : sellers.data));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshCategories('product');
      loadLiveCounts();
      fetchSellers({ silent: true });
      // Only on focus, so the sidebar never jumps while the buyer is tapping through it.
      if (getAuthToken()) api.getMyInterests().then(({ data }) => {
        if (!Array.isArray(data?.categories)) return;
        const names = data.categories.map((c) => c.name);
        setInterestCategories((prev) => (prev.join('|') === names.join('|') ? prev : names));
      });
    }, [fetchSellers, loadLiveCounts])
  );

  // Load the selected category from API so sidebar filter shows correct items, then shuffle
  useEffect(() => {
    if (!activeCategory || activeCategory === 'All' || activeTab !== 'products' || searchQuery) {
      return undefined;
    }

    let cancelled = false;
    (async () => {
      const params = { category: activeCategory, page: 1, limit: CATEGORY_PAGE };
      if (userCoords?.lat != null && userCoords?.lng != null) {
        params.lat = userCoords.lat;
        params.lng = userCoords.lng;
      }
      const { data, error } = await api.getListings(params);
      if (cancelled || error || !data?.listings) return;

      if (!productPagingRef.current.has(activeCategory)) {
        productPagingRef.current.set(activeCategory, { page: 1, hasMore: Boolean(data.hasMore) });
      }
      mergeProducts(data.listings, activeCategory, true);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCategory, activeTab, searchQuery, userCoords, mergeProducts]);

  const loadMoreProducts = useCallback(async () => {
    if (loadingMoreRef.current) return;
    const key = activeCategory && activeCategory !== 'All' ? activeCategory : 'All';
    const paging = productPagingRef.current.get(key) || { page: 0, hasMore: true };
    if (!paging.hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMoreProducts(true);
    const params = { page: paging.page + 1, limit: key === 'All' ? EXPLORE_PAGE : CATEGORY_PAGE };
    if (key !== 'All') params.category = key;
    if (userCoords?.lat != null && userCoords?.lng != null) {
      params.lat = userCoords.lat;
      params.lng = userCoords.lng;
    }
    const { data, error } = await api.getListings(params);
    if (!error && data?.listings) {
      productPagingRef.current.set(key, { page: paging.page + 1, hasMore: Boolean(data.hasMore) });
      mergeProducts(data.listings, key);
    }
    loadingMoreRef.current = false;
    setLoadingMoreProducts(false);
  }, [activeCategory, userCoords, mergeProducts]);

  const cleanSearch = searchText.replace(/\s+/g, ' ').trim();
  const searchPending = cleanSearch.length >= MIN_SEARCH_CHARS && cleanSearch !== searchQuery && cleanSearch !== voiceText;
  const searchActive = Boolean(searchQuery);
  const searchBusy = searching || searchPending;

  const applySearch = useCallback((text) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (clean === searchQueryRef.current) return;
    skipEnter.current = true;
    setActiveCategory('All');
    setSearchQuery(clean);
  }, []);

  useEffect(() => {
    if (cleanSearch === searchQuery || (voiceText && cleanSearch === voiceText)) return undefined;
    if (cleanSearch.length > 0 && cleanSearch.length < MIN_SEARCH_CHARS) return undefined;
    const timer = setTimeout(() => applySearch(cleanSearch), cleanSearch ? SEARCH_PAUSE_MS : 0);
    return () => clearTimeout(timer);
  }, [cleanSearch, searchQuery, voiceText, applySearch]);

  const searchResultsForRef = useRef('');
  const runSearch = useCallback(async (q, filters = DEFAULT_EXPLORE_FILTERS) => {
    searchAbortRef.current?.abort();
    if (!q) {
      setSearchProducts([]);
      setSearchSellers([]);
      setSearching(false);
      return;
    }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);

    const coords = userCoordsRef.current;
    const params = { q, sort: 'relevance', page: 1, limit: 40 };
    if (voiceAltsRef.current?.q === q) params.alt = voiceAltsRef.current.alt;
    if (coords?.lat != null && coords?.lng != null) {
      params.lat = coords.lat;
      params.lng = coords.lng;
    }
    const options = { signal: controller.signal };
    const [listingRes, sellerRes] = await Promise.all([
      api.searchListings({ ...params, ...serverSearchFilters(filters) }, options),
      api.searchSellers({ ...params, nearby: params.lat != null ? 'true' : undefined }, options),
    ]);
    if (controller.signal.aborted || listingRes?.aborted || sellerRes?.aborted) return;

    searchResultsForRef.current = q;
    setSearchProducts(
      listingRes?.error ? [] : (listingRes?.data?.listings || []).map(toCardItem).filter(Boolean)
    );
    setSearchSellers(sellerRes?.error ? [] : sellerRes?.data?.sellers || []);
    setSearching(false);
  }, []);

  const selectedFiltersRef = useRef(selectedFilters);
  selectedFiltersRef.current = selectedFilters;
  const serverFilterKey = searchKeyFor('', selectedFilters);

  useEffect(() => {
    runSearch(searchQuery, selectedFiltersRef.current);
  }, [searchQuery, serverFilterKey, runSearch]);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const clearSearch = useCallback(() => {
    setSearchText('');
    applySearch('');
  }, [applySearch]);

  const { refreshing, onRefresh } = usePullRefresh(() => {
    if (searchQueryRef.current) return runSearch(searchQueryRef.current, selectedFiltersRef.current);
    setSellerReloadTick((tick) => tick + 1);
    return Promise.all([fetchSellers({ silent: true, force: true }), loadLiveCounts()]);
  });

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

  const handlePinToggle = useCallback((sellerId) => requireLogin('pin', async () => {
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
  }), [featuredSellers, popularSellers, nearbySellers, pinnedStores, userCoords, requireLogin]);

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

  const sourceProducts = searchActive ? searchProducts : products;
  const sourceSellers = useMemo(() => {
    if (!searchActive) return uniqueSellers;
    const seen = new Set();
    return searchSellers.filter((seller) => {
      const id = String(seller._id || seller.id);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [searchActive, searchSellers, uniqueSellers]);

  const sortOptions = activeTab === 'products'
    ? SORT_OPTIONS
    : SORT_OPTIONS.filter((o) => !PRICE_SORTS.includes(o.key));

  const activeFilterCount = countActiveFilters(selectedFilters, sortBy, DEFAULT_SORT);

  const [tabPending, startTabTransition] = useTransition();
  const [targetTab, setTargetTab] = useState(activeTab);

  const switchTab = useCallback((key) => {
    skipEnter.current = true;
    setTargetTab(key);
    startTabTransition(() => {
      setActiveTab(key);
      setActiveCategory('All');
      setSortBy((prev) => (key === 'sellers' && PRICE_SORTS.includes(prev) ? DEFAULT_SORT : prev));
    });
  }, []);

  const clearFilters = () => {
    setSortBy(DEFAULT_SORT);
    setSelectedFilters(DEFAULT_EXPLORE_FILTERS);
  };

  const categories = useMemo(() => {
    const isProducts = activeTab === 'products';
    const nameOf = isProducts
      ? (it) => it.category || it.listing?.category
      : (seller) => seller.category || 'General';
    const tally = (list) => {
      const found = {};
      for (const item of list) {
        const name = nameOf(item);
        if (name) found[name] = (found[name] || 0) + 1;
      }
      return found;
    };
    const bump = (found, name, count) => {
      if (count > 0) found[name] = Math.max(found[name] || 0, count);
    };

    // The sidebar keeps the full category list while searching; the search only reorders it.
    const found = tally(isProducts ? products : uniqueSellers);
    const hits = searchActive ? tally(isProducts ? searchProducts : sourceSellers) : null;
    const allOption = {
      label: 'All',
      icon: isProducts ? 'grid' : 'storefront',
      tint: ALL_TINT,
      count: isProducts ? Math.max(products.length, liveCounts?.total || 0) : uniqueSellers.length,
    };
    if (isProducts && liveCounts) {
      const known = new Set(productCategories.map((c) => c.label));
      for (const [name, count] of Object.entries(liveCounts.counts)) {
        if (known.has(name) || found[name]) bump(found, name, count);
      }
    }
    if (!isProducts && sellerCounts) {
      for (const [name, info] of Object.entries(sellerCounts.categories || {})) bump(found, name, info.sellers);
      for (const [name, count] of Object.entries(sellerCounts.storeTypes || {})) bump(found, name, count);
      allOption.count = Math.max(allOption.count, sellerCounts.totals?.sellers || 0);
    }
    for (const [name, count] of Object.entries(hits || {})) bump(found, name, count);

    // Keep the selected category visible even if it just ran out of items.
    const options = { hideEmpty: true, keep: [activeCategory, initialCategory].filter(Boolean) };
    const list = isProducts
      ? mergeSidebarCategories(productCategories, found, allOption, hits ? [] : interestCategories, options)
      : mergeSidebarCategories([...shopCategories, ...productCategories], found, allOption, [], options);
    if (!hits) return list;

    const [all, ...rest] = list;
    const hitCount = (cat) => hits[cat.label] || 0;
    const matched = rest.filter(hitCount).sort((a, b) => hitCount(b) - hitCount(a));
    return [all, ...matched, ...rest.filter((cat) => !hitCount(cat))];
  }, [
    products,
    uniqueSellers,
    searchProducts,
    sourceSellers,
    activeTab,
    searchActive,
    liveCounts,
    sellerCounts,
    activeCategory,
    initialCategory,
    productCategories,
    shopCategories,
    interestCategories,
  ]);

  // After a product search lands, select its category when every result shares one, else "All".
  const searchPickRef = useRef('');
  useEffect(() => {
    if (!searchActive) {
      searchPickRef.current = '';
      return;
    }
    if (activeTab !== 'products' || searchPickRef.current === searchQuery) return;
    if (searchResultsForRef.current !== searchQuery || searching) return;
    searchPickRef.current = searchQuery;
    const names = new Set(searchProducts.map((it) => it.category || it.listing?.category).filter(Boolean));
    setActiveCategory(names.size === 1 ? [...names][0] : 'All');
  }, [searchActive, activeTab, searchQuery, searching, searchProducts]);

  useEffect(() => {
    if (activeTab !== 'sellers' || !activeCategory || activeCategory === 'All') return undefined;
    let cancelled = false;
    const params = { category: activeCategory };
    if (userCoords.lat != null && userCoords.lng != null) {
      params.lat = userCoords.lat;
      params.lng = userCoords.lng;
    }
    const category = activeCategory;
    api.getSellers(params).then(({ data }) => {
      if (cancelled) return;
      if (!Array.isArray(data?.sellers)) {
        // null = request failed; fall back to matching the sellers already loaded.
        setCategorySellers((prev) => ({ ...prev, [category]: prev[category] || null }));
        return;
      }
      // A shop whose store type is this category belongs here even before it lists anything.
      const list = data.sellers
        .filter((s) => Number(s.listingCount) > 0 || s.category === category)
        .sort((a, b) => (Number(b.listingCount) || 0) - (Number(a.listingCount) || 0));
      setCategorySellers((prev) => ({ ...prev, [category]: list }));
    });
    return () => {
      cancelled = true;
    };
  }, [activeTab, activeCategory, userCoords.lat, userCoords.lng, sellerReloadTick]);

  const categorySellerIds = useMemo(() => {
    const list = activeCategory ? categorySellers[activeCategory] : null;
    return list ? new Set(list.map((s) => String(s._id || s.id))) : null;
  }, [categorySellers, activeCategory]);

  const matchesCategory = useCallback(
    (seller) => {
      if (!activeCategory || activeCategory === 'All') return true;
      if (categorySellerIds) return categorySellerIds.has(String(seller._id || seller.id));
      return (seller.category || 'General') === activeCategory;
    },
    [activeCategory, categorySellerIds]
  );

  const productBase = useMemo(() => {
    const mapped = sourceProducts.map((item) => ({
      ...attachDistanceToCard(item, userCoords),
      condition: item.condition || item.listing?.condition || undefined,
      postedAt: item.postedAt || item.listing?.createdAt || undefined,
    }));
    if (!activeCategory || activeCategory === 'All') return mapped;
    const target = String(activeCategory).trim().toLowerCase();
    return mapped.filter((it) => {
      const cat = String(it.category || it.listing?.category || '').trim().toLowerCase();
      return cat === target;
    });
  }, [sourceProducts, activeCategory, userCoords]);

  const filteredProducts = useMemo(() => {
    const filtered = productBase.filter((item) => productPasses(item, selectedFilters));

    if (sortBy === 'nearby' || selectedFilters.nearby) {
      filtered.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
    } else if (sortBy === 'topRated' || selectedFilters.topRated) {
      filtered.sort((a, b) => (b.listing?.views || 0) - (a.listing?.views || 0));
    } else if (sortBy === 'priceLow') {
      filtered.sort((a, b) => (Number(a.listing?.price) || 0) - (Number(b.listing?.price) || 0));
    } else if (sortBy === 'priceHigh') {
      filtered.sort((a, b) => (Number(b.listing?.price) || 0) - (Number(a.listing?.price) || 0));
    } else if (sortBy === 'newest' && !searchActive) {
      filtered.sort((a, b) => listingCreatedAt(b) - listingCreatedAt(a));
    } else if (!searchActive) {
      // "For you": keep the server's interest order for this category (or the main feed).
      const key = activeCategory && activeCategory !== 'All' ? activeCategory : 'All';
      const ranks = productRankRef.current.get(key);
      const feed = productRankRef.current.get('All');
      const rankOf = (item) => {
        const id = String(item.id);
        if (ranks?.has(id)) return ranks.get(id);
        return 1e6 + (feed?.get(id) ?? 1e6);
      };
      filtered.sort((a, b) => rankOf(a) - rankOf(b));
    }

    return filtered;
  }, [productBase, searchActive, activeCategory, selectedFilters, sortBy, productOrderTick]);

  const allSellers = useMemo(() => {
    const fetched = activeCategory ? categorySellers[activeCategory] : null;
    return searchActive || !fetched ? sourceSellers : fetched;
  }, [searchActive, activeCategory, categorySellers, sourceSellers]);

  const sellerSections = useMemo(() => {
    const keep = (seller) => matchesCategory(seller) && sellerPasses(seller, selectedFilters);
    const order = (list) => {
      const seen = new Set();
      const withDistance = list
        .filter((seller) => {
          const id = String(seller._id || seller.id);
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .map((seller) => attachDistanceToSeller(seller, userCoords))
        .filter(keep);
      if (sortBy === 'nearby' || selectedFilters.nearby) {
        withDistance.sort((a, b) => (a.distance ?? 9999) - (b.distance ?? 9999));
      } else if (sortBy === 'topRated' || selectedFilters.topRated) {
        withDistance.sort((a, b) => (b.rating || 0) - (a.rating || 0));
      }
      return withDistance;
    };
    return {
      pinned: order(pinnedStores).sort((a, b) => {
        const views = (b.viewCount || 0) - (a.viewCount || 0);
        if (views !== 0) return views;
        return new Date(b.pinnedAt || 0).getTime() - new Date(a.pinnedAt || 0).getTime();
      }),
      featured: order(featuredSellers),
      popular: order(popularSellers),
      nearby: order(nearbySellers).slice(0, 8),
      all: order(allSellers),
    };
  }, [
    pinnedStores,
    featuredSellers,
    popularSellers,
    nearbySellers,
    allSellers,
    matchesCategory,
    selectedFilters,
    sortBy,
    userCoords,
  ]);

  const countFilterMatches = useCallback(
    (filters) => {
      if (activeTab === 'products') return productBase.filter((item) => productPasses(item, filters)).length;
      return allSellers
        .map((seller) => attachDistanceToSeller(seller, userCoords))
        .filter((seller) => matchesCategory(seller) && sellerPasses(seller, filters)).length;
    },
    [activeTab, productBase, allSellers, userCoords, matchesCategory]
  );

  const applyFilterSheet = useCallback(({ sortBy: nextSort, filters }) => {
    setSortBy(nextSort);
    setSelectedFilters(filters);
  }, []);

  /** Shows a voice search (said here or on a screen without its own search box). */
  const handleVoiceTurn = useCallback((turn) => {
    setVoiceText('');
    setSearchText(searchQueryRef.current);
    // Opening a tab by voice shows all of it, so an earlier search does not hide what was asked for.
    if (turn?.action === 'view') {
      setSearchText('');
      applySearch('');
      switchTab(turn.tab === 'sellers' ? 'sellers' : 'products');
      return null;
    }
    const search = turn?.search || {};
    const filters = {
      ...selectedFiltersRef.current,
      priceMin: search.minPrice ?? null,
      priceMax: search.maxPrice ?? null,
      condition: search.condition || '',
      nearby: Boolean(search.nearby),
    };
    // The search runs on the AI's clean English phrase ("mobile and dustbin", "all items from seller Kaushal"). The
    // server keeps the whole search the AI built for that phrase (every item, and any logic: seller, place, order...)
    // and runs it, so nothing is lost here.
    const items = Array.isArray(search.items) ? search.items.filter(Boolean) : [];
    const heard = String(turn?.heard || '').replace(/\s+/g, ' ').trim();
    const q = String(search.english || items.join(' and ') || search.category || heard).replace(/\s+/g, ' ').trim();
    voiceAltsRef.current = null;

    skipEnter.current = true;
    setTargetTab('products');
    setActiveTab('products');
    setSelectedFilters(filters);
    setSortBy(VOICE_SORTS[search.sort] || DEFAULT_SORT);
    setSearchText(q);
    if (q === searchQueryRef.current) runSearch(q, filters);
    else applySearch(q);
    return null;
  }, [applySearch, runSearch, switchTab]);

  /** Live words go into the search box; when the buyer stops, a rough search starts before the AI answers. */
  const handleVoiceHeard = useCallback((text, done) => {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return;
    setVoiceText(clean);
    setSearchText(clean);
    if (!done) return;
    const quick = quickVoiceQuery(clean);
    if (!quick) return;
    voiceAltsRef.current = null;
    skipEnter.current = true;
    setTargetTab('products');
    setActiveTab('products');
    applySearch(quick);
  }, [applySearch]);

  useExploreVoiceTurns(handleVoiceTurn, handleVoiceHeard);

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

  const mainWidth = windowWidth - SIDEBAR_WIDTH;
  const productCardWidth = Math.floor((mainWidth - GRID_PADDING * 2 - GRID_GUTTER) / 2);

  const pressSideItem = (cat, itemAnim) => {
    // Picking a category by hand shows everything in it, not just the earlier search's matches.
    if (searchQueryRef.current || searchText) {
      voiceAltsRef.current = null;
      setVoiceText('');
      setSearchText('');
      setSearchQuery('');
    }
    handleCategoryChange(cat.label);
    Animated.sequence([
      Animated.timing(itemAnim, { toValue: 0.92, duration: 40, useNativeDriver: true }),
      Animated.spring(itemAnim, { toValue: 1, tension: 380, friction: 14, useNativeDriver: true }),
    ]).start();
  };

  const renderSellerGrid = (list, isPinned = false) => {
    if (isPinned && list.length > 2) {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.productGrid, { flexWrap: 'nowrap', paddingRight: GRID_PADDING }]}
        >
          {list.map((seller, index) => (
            <Reanimated.View
              key={seller._id || seller.id}
              entering={skipEnter.current ? enterQuick(index) : enterSlide(index, 60)}
              style={{ width: productCardWidth }}
            >
              <SellerProfileCard
                seller={seller}
                sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
                width={productCardWidth}
                onPress={() => handleSellerPress(seller)}
                onPinToggle={() => handlePinToggle(seller._id)}
                isPinned={true}
              />
            </Reanimated.View>
          ))}
        </ScrollView>
      );
    }

    return (
      <View style={styles.productGrid}>
        {list.map((seller, index) => (
          <Reanimated.View
            key={seller._id || seller.id}
            entering={skipEnter.current ? enterQuick(index) : enterCard(index, 50)}
            style={{ width: productCardWidth }}
          >
            <SellerProfileCard
              seller={seller}
              sellerType={seller.sellerType || (seller.shopId ? 'shop' : 'individual')}
              width={productCardWidth}
              onPress={() => handleSellerPress(seller)}
              onPinToggle={() => handlePinToggle(seller._id)}
              isPinned={pinnedStores.some((s) => s._id === seller._id)}
            />
          </Reanimated.View>
        ))}
      </View>
    );
  };

  const sellerCategoryLoading =
    activeTab === 'sellers' && !isAll && !searchActive && categorySellers[activeCategory] === undefined;

  const sellerBlocks = searchActive ? [
    {
      key: 'search',
      icon: 'search',
      tint: colors.primary,
      title: 'Matching sellers',
      subtitle: `Results for “${searchQuery}”`,
      list: sellerSections.all,
    },
  ].filter((block) => block.list.length > 0) : !isAll ? [
    {
      key: `cat-${activeCategory}`,
      icon: activeMeta?.icon || 'storefront',
      tint: activeTint,
      title: `${activeCategory} sellers`,
      subtitle: 'Shops and people selling in this category',
      list: sellerSections.all,
    },
  ].filter((block) => block.list.length > 0) : [
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
                <Ping size={7} color="#4ADE80" />
                <Text style={styles.exploreSubtitle} numberOfLines={1}>
                  {products.length} items · {uniqueSellers.length} sellers near you
                </Text>
              </View>
            </View>
            <PressableScale contentStyle={styles.headerBtn} hitSlop={6} scaleTo={0.92} onPress={() => requireLogin('save', () => navigation.navigate(ROUTES.WISHLIST))}>
              <Icon name="heart-outline" size={19} color={colors.onGradient} />
            </PressableScale>
          </View>
        </LinearGradient>

        <View style={styles.searchWrap}>
          <SearchBar
            placeholder="Search sellers, stores or products..."
            value={searchText}
            onChangeText={setSearchText}
            onSubmitEditing={() => applySearch(searchText)}
            onClear={clearSearch}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            focused={searchFocused}
            loading={searchBusy}
          />
        </View>

        <View style={styles.body}>
          <View style={styles.toolbar}>
            <ExploreTabs
              styles={styles}
              colors={colors}
              activeTab={activeTab}
              onChange={switchTab}
            />
            <PressableScale
              contentStyle={[styles.filterBtn, activeFilterCount > 0 && styles.filterBtnActive]}
              scaleTo={0.94}
              onPress={() => setShowFilterModal(true)}
            >
              <Icon
                name="options-outline"
                size={18}
                color={activeFilterCount > 0 ? colors.onPrimary : colors.text}
              />
              {activeFilterCount > 0 ? (
                <View style={styles.filterBadge}>
                  <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                </View>
              ) : null}
            </PressableScale>
          </View>

          <View style={styles.split}>
            <View style={styles.sidebar}>
              <ScrollView
                style={styles.sidebarList}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[styles.sidebarContent, { paddingBottom: insets.bottom }]}
              >
                {categories.map((cat, index) => {
                  const isActive = cat.label === (catPending ? pendingCategory : activeCategory);
                  const tint = colors.primary;
                  const itemAnim = getSidebarItemAnim(cat.label);
                  return (
                    <Animated.View key={cat.label} style={{ transform: [{ scale: itemAnim }] }}>
                      <Pressable
                        style={[styles.sideItem, isActive && styles.sideItemActive]}
                        onPress={() => pressSideItem(cat, itemAnim)}
                      >
                        {isActive ? <View style={styles.sideIndicator} /> : null}
                        <SoftPop
                          index={index}
                          style={[
                            styles.sideIcon,
                            { backgroundColor: tint },
                            isActive && [styles.sideIconActive, { shadowColor: tint }],
                          ]}
                        >
                          {cat.imageUrl ? (
                            <Image source={{ uri: cat.imageUrl }} style={styles.sideIconImage} />
                          ) : (
                            <Icon name={cat.icon} size={17} color="#FFFFFF" />
                          )}
                        </SoftPop>
                        <Text numberOfLines={2} style={[styles.sideLabel, isActive && styles.sideLabelActive]}>
                          {cat.label}
                        </Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </ScrollView>
            </View>

            <View style={styles.mainContent}>
              <View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.sortScroll}
                  contentContainerStyle={styles.sortRow}
                >
                  {sortOptions.map((opt, index) => {
                    const active = sortBy === opt.key;
                    return (
                      <PressableScale
                        key={opt.key}
                        entering={enterSlide(index, 50)}
                        contentStyle={[styles.sortChip, active && styles.sortChipActive]}
                        scaleTo={0.96}
                        onPress={() => setSortBy(opt.key)}
                      >
                        <Icon name={active ? (opt.activeIcon || opt.icon) : opt.icon} size={13} color={active ? '#fff' : colors.textMuted} />
                        <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
                      </PressableScale>
                    );
                  })}
                </ScrollView>
              </View>

              {searchActive && !searchBusy ? (
                <View style={styles.resultsBar}>
                  <Text style={styles.resultsTitle} numberOfLines={1}>
                    {activeTab === 'products' ? filteredProducts.length : sellerSections.all.length} results for “{searchQuery}”
                  </Text>
                  <Pressable style={styles.clearLink} onPress={clearSearch} hitSlop={8}>
                    <Icon name="close-circle" size={14} color="#10B981" />
                    <Text style={styles.clearLinkText}>Clear</Text>
                  </Pressable>
                </View>
              ) : activeFilterCount > 0 && !searchBusy ? (
                <View style={styles.resultsBar}>
                  <Text style={styles.resultsTitle}>{filteredProducts.length} results</Text>
                  <Pressable style={styles.clearLink} onPress={clearFilters} hitSlop={8}>
                    <Icon name="close-circle" size={14} color="#10B981" />
                    <Text style={styles.clearLinkText}>Clear filters</Text>
                  </Pressable>
                </View>
              ) : null}

              <ScrollView
                style={styles.mainContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={[styles.scrollViewContent, { paddingBottom: insets.bottom }]}
                refreshControl={refreshControl(colors, refreshing, onRefresh, !searchFocused)}
                scrollEventThrottle={100}
                onScroll={(event) => {
                  if (activeTab === 'products' && !searchActive && isNearEnd(event, 900)) loadMoreProducts();
                }}
              >
                {tabPending || catPending ? (
                  <View style={styles.productGrid}>
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      (tabPending ? targetTab : activeTab) === 'products'
                        ? <ProductCardSkeleton key={i} width={productCardWidth} compact />
                        : <SellerProfileCardSkeleton key={i} width={productCardWidth} />
                    ))}
                  </View>
                ) : searchBusy ? (
                  <View>
                    <View style={styles.searchingRow}>
                      <ActivityIndicator size="small" color={colors.primary} />
                      <Text style={styles.searchingText} numberOfLines={1}>
                        Searching “{searchQuery || cleanSearch}”...
                      </Text>
                    </View>
                    <View style={styles.productGrid}>
                      {[0, 1, 2, 3].map((i) => (
                        activeTab === 'products'
                          ? <ProductCardSkeleton key={i} width={productCardWidth} compact />
                          : <SellerProfileCardSkeleton key={i} width={productCardWidth} />
                      ))}
                    </View>
                  </View>
                ) : searchActive && (activeTab === 'products' ? filteredProducts.length === 0 : sellerBlocks.length === 0) ? (
                  <EmptyState
                    compact
                    icon="search-outline"
                    title={`No results for “${searchQuery}”`}
                    body={isAll
                      ? 'Try a different word or check the spelling.'
                      : `Nothing in ${activeCategory}. Try All categories.`}
                    buttonLabel={isAll ? 'Clear search' : 'Show all'}
                    onButtonPress={isAll ? clearSearch : () => handleCategoryChange('All')}
                  />
                ) : activeTab === 'products' ? (
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
                          {filteredProducts.map((item, index) => {
                            const card = (
                              <GridCard
                                item={item}
                                width={productCardWidth}
                                onOpen={handleProductPress}
                                onSave={handleSaveProduct}
                              />
                            );
                            let entering;
                            if (skipEnter.current) entering = enterQuick(index);
                            else if (index <= 7) entering = enterCard(index, 50);
                            else entering = enterCard(index % 2, 60);
                            return (
                              <Reanimated.View key={item.id} entering={entering} style={{ width: productCardWidth }}>
                                {card}
                              </Reanimated.View>
                            );
                          })}
                        </View>
                        {loadingMoreProducts ? (
                          <View style={styles.loadMoreRow}>
                            <ActivityIndicator size="small" color={colors.primary} />
                          </View>
                        ) : null}
                      </>
                    ) : (
                      <EmptyState
                        compact
                        icon={activeMeta?.icon || 'cube-outline'}
                        title={isAll ? 'No products yet' : `No ${activeCategory} yet`}
                        body="Be the first to post an item in this category."
                        buttonLabel="Sell an item"
                        onButtonPress={() => requireLogin('sell', () => navigateToTab(navigation, TABS.POST))}
                      />
                    )}
                  </View>
                ) : sellerCategoryLoading || (itemsLoading && sellerBlocks.length === 0) ? (
                  <View style={styles.productGrid}>
                    {[0, 1, 2, 3].map((i) => (
                      <SellerProfileCardSkeleton key={i} width={productCardWidth} />
                    ))}
                  </View>
                ) : sellerBlocks.length > 0 ? (
                  <View>
                    {sellerBlocks.map((block, index) => {
                      const body = (
                        <>
                          <SectionTitle
                            styles={styles}
                            icon={block.icon}
                            tint={block.tint}
                            title={block.title}
                            subtitle={block.subtitle}
                            count={block.list.length}
                          />
                          {renderSellerGrid(block.list, block.isPinned)}
                        </>
                      );
                      if (skipEnter.current) {
                        return (
                          <View key={block.key} style={styles.sellerSection}>
                            {body}
                          </View>
                        );
                      }
                      return (
                        <Reanimated.View key={block.key} entering={enterUp(index, 40)} style={styles.sellerSection}>
                          {body}
                        </Reanimated.View>
                      );
                    })}
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
            </View>
          </View>
        </View>
      </View>

      <ExploreFilterSheet
        visible={showFilterModal}
        onClose={() => setShowFilterModal(false)}
        activeTab={activeTab}
        sortOptions={sortOptions}
        defaultSort={DEFAULT_SORT}
        sortBy={sortBy}
        filters={selectedFilters}
        onApply={applyFilterSheet}
        countFor={countFilterMatches}
        hasLocation={userCoords.lat != null && userCoords.lng != null}
      />
    </>
  );
}
