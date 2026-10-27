import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Icon from '../components/Icon';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  Float,
  PressableScale,
  Pulse,
  Reanimated,
  Shimmer,
  SoftPop,
  Wiggle,
  enterCard,
  enterSlide,
  enterUp,
} from '../components/Motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProductCardCarousel from '../components/ProductCardCarousel';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import { ProductCarouselSkeleton, Skeleton } from '../components/SkeletonLoader';
import { navigateToTab, openItemDetail, ROUTES, TABS } from '../navigation/helpers';
import { api, getAuthToken } from '../services/api';
import { useRequireLogin } from '../components/LoginPrompt';
import WelcomeModal from '../components/WelcomeModal';
import PermissionPrompt from '../components/PermissionPrompt';
import { useAuth } from '../context/AuthContext';
import { attachDistanceToCard, formatDistanceLabel, formatPrice, resolveMediaUrl, toCardItem } from '../utils/listing';
import { useDisplayCurrency } from '../utils/currency';
import { loadRecentlyViewed, getRecentlyViewed } from '../utils/recentlyViewed';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useAccountStatus } from '../hooks/useAccountStatus';
import { PlanPill } from '../components/AccountStatusCard';
import TesterModeButton from '../components/TesterModeButton';
import { categoriesLoaded, useCategories } from '../utils/categories';
import { formatCityDistrict } from '../utils/locations';
import {
  catalogFingerprint,
  getHomeListingsMemory,
  isHomeListingsFresh,
  loadHomeListingsCache,
  setHomeListingsCache,
  setHomePlace,
} from '../utils/homeListingsCache';
import pinnedStoresUtils from '../utils/pinnedStores';

const FOCUS_CACHE_TTL_MS = 300_000; // 5 minutes - longer cache for faster focus returns
const APP_LOGO = require('../../assets/icons/app-icon.png');
const BUDGET_LIMIT = 5000;

let storesMemory = [];

function listingPrice(item) {
  const value = Number(item?.listing?.price);
  return Number.isFinite(value) ? value : null;
}

function listingTime(item) {
  const time = new Date(item?.listing?.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function mergeStores(...lists) {
  const seen = new Set();
  const merged = [];
  lists.flat().forEach((store) => {
    const key = String(store?.shopId || store?.id || store?._id || '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(store);
  });
  return merged.slice(0, 10);
}

export default function HomeScreen({ navigation }) {
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const { status: accountStatus, reload: reloadAccountStatus } = useAccountStatus(Boolean(user));
  const requireLogin = useRequireLogin();
  useDisplayCurrency();
  const productCategories = useCategories('product');
  const [initialCatalog] = useState(getHomeListingsMemory);
  const [listings, setListings] = useState(() => initialCatalog?.listings || []);
  const [stores, setStores] = useState(() => storesMemory);
  const [, setLoading] = useState(false);
  const [settled, setSettled] = useState(() => Boolean(initialCatalog?.listings?.length));
  const [location, setLocation] = useState(initialCatalog?.location || 'Kathmandu');
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentViews, setRecentViews] = useState(() => getRecentlyViewed());
  const [pinnedStores, setPinnedStores] = useState([]);
  const hasLoadedRef = useRef(Boolean(initialCatalog?.listings?.length));
  const catalogFpRef = useRef(catalogFingerprint(initialCatalog?.listings || []));
  const locationLabelRef = useRef('Kathmandu');
  const userCoordsRef = useRef({ lat: null, lng: null });
  const [pickedCategory, setPickedCategory] = useState(null);
  const [personalized, setPersonalized] = useState(() => Boolean(initialCatalog?.personalized));
  const [interestCategories, setInterestCategories] = useState([]);
  const [liveCounts, setLiveCounts] = useState(null);
  const [welcomeDone, setWelcomeDone] = useState(false);

  useEffect(() => {
    const hasCoords = userCoords.lat != null && userCoords.lng != null;
    const cached = getHomeListingsMemory();
    if (!hasCoords && location === 'Kathmandu' && !cached?.location) return;
    setHomePlace({
      location,
      coords: hasCoords ? userCoords : undefined,
    });
  }, [location, userCoords]);

  // Opening Home only checks; the system dialog comes from a tap (here or in PermissionPrompt).
  const fetchCurrentLocation = useCallback(async ({ prompt = false } = {}) => {
    try {
      const { status } = prompt
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        if (prompt) Alert.alert('Location permission', 'Allow location access to see items near you.');
        return null;
      }

      let coords = null;
      const last = await Location.getLastKnownPositionAsync();
      if (last?.coords) {
        coords = { lat: last.coords.latitude, lng: last.coords.longitude };
        userCoordsRef.current = coords;
        setUserCoords(coords);

        // Use cached location label if available
        if (initialCatalog?.location) {
          locationLabelRef.current = initialCatalog.location;
          setLocation(initialCatalog.location);
        }
      }

      // Don't block UI - fetch precise location in background
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      })
        .then((currentLocation) => {
          coords = {
            lat: currentLocation.coords.latitude,
            lng: currentLocation.coords.longitude,
          };
          userCoordsRef.current = coords;
          setUserCoords(coords);

          return Location.reverseGeocodeAsync({
            latitude: coords.lat,
            longitude: coords.lng,
          });
        })
        .then((reverseGeocode) => {
          const addr = reverseGeocode?.[0];
          if (addr) {
            const label = formatCityDistrict(addr, 'Kathmandu');
            locationLabelRef.current = label;
            setLocation(label);
          }
        })
        .catch((error) => {
          console.log('Background location error:', error);
        });

      return coords;
    } catch (error) {
      console.log('Location error:', error);
      return null;
    }
  }, [initialCatalog]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cached = await loadHomeListingsCache();
      if (cancelled || !cached?.listings?.length || hasLoadedRef.current) return;
      catalogFpRef.current = catalogFingerprint(cached.listings);
      setListings(cached.listings);
      setSettled(true);
      hasLoadedRef.current = true;
      if (cached.location) {
        locationLabelRef.current = cached.location;
        setLocation(cached.location);
      }
      if (cached.coords?.lat != null && cached.coords?.lng != null) {
        userCoordsRef.current = cached.coords;
        setUserCoords(cached.coords);
      }
    })();
    // Start location fetch in background, don't block cache load
    fetchCurrentLocation();
    return () => {
      cancelled = true;
    };
  }, [fetchCurrentLocation]);

  const resolveCoordsQuick = useCallback(async () => {
    const known = userCoordsRef.current;
    if (known.lat != null && known.lng != null) return known;
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return known;
      const last = await Location.getLastKnownPositionAsync();
      if (last?.coords) {
        const coords = { lat: last.coords.latitude, lng: last.coords.longitude };
        userCoordsRef.current = coords;
        setUserCoords(coords);
        return coords;
      }
    } catch {
      // ignore
    }
    return known;
  }, []);

  const loadStores = useCallback(async (params) => {
    const [nearbyRes, featuredRes, pinnedRes] = await Promise.all([
      api.getNearbySellers(params),
      api.getFeaturedSellers(params),
      getAuthToken() ? api.getPinnedStores(params) : Promise.resolve({ data: null }),
    ]);

    const nearbyList = nearbyRes.data?.sellers || [];
    const featuredList = featuredRes.data?.sellers || [];
    const pinnedList = pinnedRes.data?.stores || [];

    // Set pinned stores separately
    setPinnedStores(pinnedList);

    const next = mergeStores(pinnedList, featuredList, nearbyList);
    if (next.length || (!nearbyRes.error && !featuredRes.error)) {
      storesMemory = next;
      setStores(next);
    }
  }, []);

  const loadListings = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!force && silent && isHomeListingsFresh(FOCUS_CACHE_TTL_MS) && hasLoadedRef.current) {
      return;
    }

    // Always load silently for better perceived performance
    if (!hasLoadedRef.current) setLoading(true);

    const coords = await Promise.race([
      resolveCoordsQuick(),
      new Promise((resolve) => setTimeout(() => resolve(userCoordsRef.current), 100)),
    ]);

    const params = {};
    if (coords?.lat != null && coords?.lng != null) {
      params.lat = coords.lat;
      params.lng = coords.lng;
    }

    // Load stores in background, don't block listings
    loadStores(params);

    const { data, error } = await api.getListings({ ...params, page: 1, limit: 40 });
    if (error) {
      console.error('Failed to load listings:', error);
      if (!hasLoadedRef.current) {
        setListings([]);
        setSettled(true);
      }
    } else {
      const raw = (data?.listings || []).map(toCardItem).filter(Boolean);
      const withDistance = raw.map((it) => attachDistanceToCard(it, coords));
      const nextFp = catalogFingerprint(withDistance);
      const changed = nextFp !== catalogFpRef.current;
      catalogFpRef.current = nextFp;
      if (changed || !hasLoadedRef.current) {
        setListings(withDistance);
      }
      setPersonalized(Boolean(data?.personalized));
      setSettled(true);
      hasLoadedRef.current = true;
      setHomeListingsCache({
        listings: withDistance,
        location: locationLabelRef.current,
        coords: coords || userCoordsRef.current,
        personalized: data?.personalized,
      });
    }

    setLoading(false);
  }, [loadStores, resolveCoordsQuick]);

  const { refreshing, onRefresh } = usePullRefresh(() =>
    Promise.all([loadListings({ silent: true, force: true }), reloadAccountStatus()])
  );

  useEffect(() => {
    if (userCoords.lat == null || userCoords.lng == null) return;
    loadStores({ lat: userCoords.lat, lng: userCoords.lng });
  }, [userCoords.lat, userCoords.lng, loadStores]);

  useFocusEffect(
    useCallback(() => {
      const known = userCoordsRef.current;
      const loc = known.lat != null && known.lng != null ? { lat: known.lat, lng: known.lng } : {};
      if (!storesMemory.length) {
        loadStores(loc);
      }
      pinnedStoresUtils.getPinnedStores(loc).then((pinned) => {
        if (Array.isArray(pinned)) setPinnedStores(pinned);
      }).catch(() => {});
      // Always silent load for instant display
      loadListings({ silent: true });
      // Load other data in background
      loadRecentlyViewed().then((items) => setRecentViews(items));
      api.getCategoryCounts().then(({ data }) => {
        if (!data?.counts) return;
        setLiveCounts((prev) => (JSON.stringify(prev) === JSON.stringify(data.counts) ? prev : data.counts));
      });
      if (getAuthToken()) api.getMyInterests().then(({ data }) => {
        if (Array.isArray(data?.categories)) setInterestCategories(data.categories.map((c) => c.name));
      });
      if (getAuthToken()) api.getNotifications().then(({ data }) => {
        if (data) setUnreadCount(data.unreadCount || 0);
      });
    }, [loadListings, loadStores])
  );

  const openItem = useCallback(
    (item) => openItemDetail(navigation, { listingId: item.id, item: item.listing || item, sharedId: item.id }),
    [navigation]
  );

  const openStore = (store) => {
    if (store.sellerType === 'shop' || store.shopId) {
      navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: store.shopId || store._id || store.id });
      return;
    }
    navigation.navigate(ROUTES.SELLER_PROFILE, {
      seller: store,
      sellerId: store.userId || store._id || store.id,
    });
  };

  const openCategory = (label) =>
    navigation.navigate(ROUTES.MAIN_TABS, {
      screen: ROUTES.EXPLORE,
      params: { tab: 'products', category: label, ts: Date.now() },
    });

  const openSellers = () =>
    navigation.navigate(ROUTES.MAIN_TABS, {
      screen: ROUTES.EXPLORE,
      params: { tab: 'sellers', category: undefined, ts: Date.now() },
    });

  const openCollection = (params) => navigation.navigate(ROUTES.SEARCH_RESULTS, { browse: true, ...params });

  const decorate = useCallback(
    (item) => ({
      ...item,
      condition: item.condition || item.listing?.condition || undefined,
      postedAt: item.postedAt || item.listing?.createdAt || undefined,
      onToggleSave: () => api.toggleWishlist(item.id),
    }),
    []
  );

  const nearbyListings = useMemo(
    () => listings.map((item) => attachDistanceToCard(item, userCoords)),
    [listings, userCoords]
  );


  // The server already ranked `listings` by this buyer's interests when `personalized` is set.
  const forYou = useMemo(
    () => (personalized ? nearbyListings.slice(0, 12).map(decorate) : []),
    [personalized, nearbyListings, decorate]
  );

  const fresh = useMemo(
    () =>
      [...nearbyListings]
        .sort((a, b) => listingTime(b) - listingTime(a))
        .slice(0, 12)
        .map(decorate),
    [nearbyListings, decorate]
  );

  const budgetAll = useMemo(
    () =>
      nearbyListings
        .filter((item) => {
          const price = listingPrice(item);
          return price != null && price > 0 && price <= BUDGET_LIMIT;
        })
        .sort((a, b) => listingPrice(a) - listingPrice(b)),
    [nearbyListings]
  );

  const budget = useMemo(() => budgetAll.slice(0, 12).map(decorate), [budgetAll, decorate]);

  const recent = useMemo(
    () =>
      recentViews
        .slice(0, 16)
        .map((item) => attachDistanceToCard(item, userCoords))
        .map(decorate),
    [recentViews, userCoords, decorate]
  );

  const categoryCounts = useMemo(() => {
    const counts = {};
    listings.forEach((item) => {
      if (item.category) counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, [listings]);

  const trending = useMemo(
    () => [...nearbyListings].sort(compareTrendingNear).slice(0, 12).map(decorate),
    [nearbyListings, decorate]
  );

  const interestRank = useMemo(
    () => new Map(interestCategories.map((name, index) => [name, index])),
    [interestCategories]
  );

  const topCategories = useMemo(() => {
    const rankOf = (name) => (interestRank.has(name) ? interestRank.get(name) : Infinity);
    return Object.entries(categoryCounts)
      .sort((a, b) => rankOf(a[0]) - rankOf(b[0]) || b[1] - a[1])
      .slice(0, 4)
      .map(([name]) => name);
  }, [categoryCounts, interestRank]);

  const homeCategories = useMemo(() => {
    const rankOf = (cat) => (interestRank.has(cat.label) ? interestRank.get(cat.label) : Infinity);
    return productCategories
      .map((cat, index) => ({
        cat: { ...cat, count: Math.max(liveCounts?.[cat.label] || 0, categoryCounts[cat.label] || 0) },
        index,
      }))
      .filter(({ cat }) => cat.count > 0)
      .sort((a, b) => rankOf(a.cat) - rankOf(b.cat) || b.cat.count - a.cat.count || a.index - b.index)
      .map(({ cat }) => cat);
  }, [productCategories, interestRank, liveCounts, categoryCounts]);
  const activeCategory = topCategories.includes(pickedCategory) ? pickedCategory : topCategories[0];
  const categoryItems = useMemo(
    () =>
      nearbyListings
        .filter((item) => item.category === activeCategory)
        .sort((a, b) => (personalized ? 0 : (Number(b.views) || 0) - (Number(a.views) || 0)))
        .slice(0, 10)
        .map(decorate),
    [nearbyListings, activeCategory, decorate, personalized]
  );

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  if (!colors) {
    return null;
  }

  const firstName = String(user?.name || '').trim().split(/\s+/)[0];

  const categoriesReady = categoriesLoaded('product');
  const countsReady = settled || Boolean(liveCounts);
  const categoryTiles = [
    ...(categoriesReady
      ? homeCategories.slice(0, 5)
      : Array.from({ length: 5 }, (_, i) => ({ label: `skeleton-${i}`, skeleton: true }))),
    { label: 'All', icon: 'grid', color: colors.warning, isMore: true, count: homeCategories.length },
  ];
  const CATEGORY_COLS = 3;
  const categoryGap = 8;
  const categoryTileWidth = Math.floor((windowWidth - 32 - categoryGap * (CATEGORY_COLS - 1)) / CATEGORY_COLS);

  const renderStore = (store, index) => {
    const isShop = store.sellerType === 'shop';
    const logo = resolveMediaUrl(store.avatarUrl || '');
    const distance = formatDistanceLabel(Number(store.distance));
    const rating = Number(store.rating) || 0;
    const accent = isShop ? colors.primary : colors.menuBlue;
    const accentSoft = isShop ? colors.pastelGreen : colors.pastelBlue;
    const typeIcon = isShop ? 'storefront' : 'person';
    return (
      <Reanimated.View key={String(store.shopId || store.id || store._id)} entering={enterSlide(index, 70)}>
      <Pressable
        onPress={() => openStore(store)}
        style={({ pressed }) => [
          styles.storeCard,
          !isShop && styles.individualCard,
          pressed && styles.pressed
        ]}
      >
        <View style={styles.storeHeader}>
          <View
            style={[
              styles.storeLogo,
              !isShop && styles.storeLogoRound,
              { borderColor: accent, backgroundColor: accentSoft },
            ]}
          >
            {logo ? (
              <Image source={{ uri: logo }} style={styles.fill} />
            ) : (
              <Icon name={typeIcon} size={20} color={accent} />
            )}
          </View>
          <View style={styles.storeHeaderText}>
            <View style={styles.storeNameRow}>
              <Text style={styles.storeName} numberOfLines={1}>
                {store.name}
              </Text>
              {store.verified ? (
                <Icon name="checkmark-circle" size={12} color={colors.info} />
              ) : null}
            </View>
            <View style={styles.storeBadgesRow}>
              <View style={[styles.storeTypePill, { backgroundColor: accentSoft }]}>
                <Icon name={typeIcon} size={8} color={accent} />
                <Text style={[styles.storeTypeText, { color: accent }]}>
                  {isShop ? 'STORE' : 'INDIVIDUAL'}
                </Text>
              </View>
              {store.verified ? (
                <View style={[styles.storeTypePill, { backgroundColor: `${colors.info}20` }]}>
                  <Icon name="checkmark-circle" size={8} color={colors.info} />
                  <Text style={[styles.storeTypeText, { color: colors.info }]}>VERIFIED</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.storeSubRow}>
          <Text style={[styles.storeMeta, { color: accent }]} numberOfLines={1}>
            {[store.category || (isShop ? 'Store' : 'Individual'), String(store.location || '').split(',')[0]]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        <View style={styles.storeDivider} />

        <View style={styles.storeStats}>
          <View style={styles.storeStat}>
            <Icon name="star" size={10} color={rating > 0 ? colors.warning : colors.textMuted} />
            <Text style={styles.storeStatText}>{rating > 0 ? rating.toFixed(1) : 'New'}</Text>
          </View>
          <View style={styles.storeStat}>
            <Icon name="cube-outline" size={10} color={colors.textMuted} />
            <Text style={styles.storeStatText}>{Number(store.listingCount) || 0} items</Text>
          </View>
          {distance ? (
            <View style={styles.storeStat}>
              <Icon name="navigate-outline" size={10} color={colors.textMuted} />
              <Text style={styles.storeStatText}>{distance}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
      </Reanimated.View>
    );
  };

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <View style={styles.topBar}>
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.headerRow}>
            <View style={styles.brand}>
              <Float distance={2} duration={1800}>
                <Image source={APP_LOGO} style={styles.brandLogo} resizeMode="contain" />
              </Float>
              <View style={styles.brandCopy}>
                <Text style={styles.appName}>KinBech</Text>
                <Pressable
                  style={styles.locationRow}
                  onPress={() => {
                    fetchCurrentLocation({ prompt: true });
                  }}
                  hitSlop={8}
                >
                  <Icon name="location" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {location}
                  </Text>
                  <Icon name="chevron-down" size={12} color="rgba(255,255,255,0.8)" />
                </Pressable>
              </View>
            </View>
            <View style={styles.headerActions}>
              <TesterModeButton style={styles.testerBtn} />
              <PressableScale contentStyle={styles.headerBtn} hitSlop={6} scaleTo={0.92} onPress={() => requireLogin('save', () => navigation.navigate(ROUTES.WISHLIST))}>
                <Icon name="heart-outline" size={20} color={colors.onGradient} />
              </PressableScale>
              <PressableScale contentStyle={styles.headerBtn} hitSlop={6} scaleTo={0.92} onPress={() => requireLogin('notifications', () => navigation.navigate(ROUTES.NOTIFICATIONS))}>
                <Wiggle angle={unreadCount > 0 ? 14 : 0} every={4200} delay={900}>
                  <Icon name="notifications-outline" size={20} color={colors.onGradient} />
                </Wiggle>
                {unreadCount > 0 ? (
                  <Pulse style={styles.badge} to={1.2} pause={1800}>
                    <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </Pulse>
                ) : null}
              </PressableScale>
            </View>
          </View>
          <View style={styles.greetingRow}>
            <Reanimated.Text
              entering={enterUp(0, 0)}
              style={[styles.greeting, user && accountStatus && styles.greetingWithPill]}
              numberOfLines={1}
            >
              {greeting}
              {firstName ? `, ${firstName}` : ''}
            </Reanimated.Text>
            {user ? (
              <PlanPill
                status={accountStatus}
                style={styles.planPill}
                onPress={() => navigation.navigate(ROUTES.SUBSCRIPTION)}
              />
            ) : null}
          </View>
          <Reanimated.Text entering={enterUp(1, 90)} style={styles.headline}>
            What are you looking for today?
          </Reanimated.Text>
        </LinearGradient>

        <View style={styles.searchWrap}>
          <SearchBar
            placeholder="Search products, stores, sellers..."
            onPress={() => navigation.navigate(ROUTES.SEARCH_RESULTS)}
            onVoiceResult={(text, isFinal) => {
              if (isFinal) navigation.navigate(ROUTES.SEARCH_RESULTS, { query: text });
            }}
          />
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={styles.categoryBlock}>
          <View style={styles.miniHeader}>
            <Text style={styles.miniTitle}>Categories</Text>
            <Pressable onPress={() => navigation.navigate(ROUTES.ALL_CATEGORIES)} hitSlop={8} style={styles.viewAll}>
              <Text style={styles.viewAllText}>See all</Text>
              <Icon name="chevron-forward" size={14} color={colors.link} />
            </Pressable>
          </View>
          <View style={styles.categoryRow}>
            {categoryTiles.map((cat, index) => {
              if (cat.skeleton) {
                return (
                  <View
                    key={cat.label}
                    style={[styles.categoryCard, styles.categorySkeleton, { width: categoryTileWidth }]}
                  >
                    <Skeleton width={28} height={28} borderRadius={9} />
                    <View style={styles.categoryCopy}>
                      <Skeleton width="78%" height={10} borderRadius={4} />
                      <Skeleton width="48%" height={8} borderRadius={4} marginTop={5} />
                    </View>
                  </View>
                );
              }
              const tint = cat.color || cat.tint || colors.primary;
              const countLabel = cat.isMore
                ? `${cat.count} categor${cat.count === 1 ? 'y' : 'ies'}`
                : `${cat.count} item${cat.count === 1 ? '' : 's'}`;
              const countPending = cat.isMore ? !categoriesReady : !countsReady && !cat.count;
              return (
                <PressableScale
                  key={cat.label}
                  style={{ width: categoryTileWidth }}
                  entering={enterCard(index, 40)}
                  scaleTo={0.95}
                  onPress={() => (cat.isMore ? navigation.navigate(ROUTES.ALL_CATEGORIES) : openCategory(cat.label))}
                >
                  <LinearGradient
                    colors={[`${tint}33`, `${tint}0D`]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.categoryCard, { borderColor: `${tint}40` }]}
                  >
                    <SoftPop index={index} style={[styles.categoryIcon, { backgroundColor: tint }]}>
                      {cat.imageUrl ? (
                        <Image source={{ uri: cat.imageUrl }} style={styles.categoryImage} />
                      ) : (
                        <Icon name={cat.icon || 'pricetag-outline'} size={14} color="#FFFFFF" />
                      )}
                    </SoftPop>
                    <View style={styles.categoryCopy}>
                      <Text style={styles.categoryLabel} numberOfLines={1}>{cat.label}</Text>
                      {countPending ? (
                        <Skeleton width="55%" height={8} borderRadius={4} marginTop={4} />
                      ) : (
                        <Text style={[styles.categoryCountLabel, { color: tint }]} numberOfLines={1}>{countLabel}</Text>
                      )}
                    </View>
                  </LinearGradient>
                </PressableScale>
              );
            })}
          </View>
        </View>

        {listings.length === 0 ? (
          settled ? (
            <EmptyState
              compact
              icon="storefront-outline"
              title="No items yet"
              body="Be the first to list something. Your posts will show up here for buyers nearby."
              buttonLabel="Post your first item"
              onButtonPress={() => requireLogin('sell', () => navigateToTab(navigation, TABS.POST))}
            />
          ) : (
            <>
              <ProductCarouselSkeleton />
              <ProductCarouselSkeleton />
            </>
          )
        ) : (
          <>
            {forYou.length > 0 ? (
              <Reanimated.View entering={enterUp(2, 46)}>
              <Section
                styles={styles}
                colors={colors}
                icon="sparkles"
                tint={colors.primary}
                title="Picked for you"
                subtitle="Based on what you browse and save"
                onViewAll={() =>
                  openCollection({
                    sort: 'recommended',
                    title: 'Picked for you',
                    subtitle: 'Based on your interests',
                  })
                }
                items={forYou}
                onPressItem={openItem}
              />
              </Reanimated.View>
            ) : null}

            {pinnedStores.length > 0 ? (
              <Reanimated.View entering={enterUp(3, 46)} style={styles.block}>
                <SectionHeader
                  styles={styles}
                  colors={colors}
                  icon="bookmark"
                  tint={colors.primary}
                  title="Pinned sellers"
                  subtitle="Your favourite sellers saved for quick access"
                  onViewAll={openSellers}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.storeRow}
                >
                  {pinnedStores.map(renderStore)}
                </ScrollView>
              </Reanimated.View>
            ) : null}

            <Reanimated.View entering={enterUp(4, 46)}>
            <Section
              styles={styles}
              colors={colors}
              icon="flame"
              tint={colors.danger}
              title="Trending near you"
              subtitle="Most viewed items around you"
              onViewAll={() =>
                openCollection({
                  sort: 'trending',
                  title: 'Trending near you',
                  subtitle: 'Most viewed around you',
                })
              }
              items={trending}
              onPressItem={openItem}
            />
            </Reanimated.View>

            {topCategories.length > 1 ? (
              <Reanimated.View entering={enterUp(5, 46)} style={styles.block}>
                <SectionHeader
                  styles={styles}
                  colors={colors}
                  icon="apps"
                  tint={colors.info}
                  title="Popular categories"
                  subtitle="What people near you are buying"
                  onViewAll={() => openCategory(activeCategory)}
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRow}>
                  {topCategories.map((name) => {
                    const active = name === activeCategory;
                    return (
                      <PressableScale
                        key={name}
                        scaleTo={0.96}
                        contentStyle={[styles.tab, active && styles.tabActive]}
                        onPress={() => setPickedCategory(name)}
                      >
                        <Text style={[styles.tabText, active && styles.tabTextActive]}>{name}</Text>
                      </PressableScale>
                    );
                  })}
                </ScrollView>
                <ProductCardCarousel key={activeCategory} items={categoryItems} onPressItem={openItem} />
              </Reanimated.View>
            ) : null}

            <Reanimated.View entering={enterUp(6, 46)}>
            <Section
              styles={styles}
              colors={colors}
              icon="flash"
              tint={colors.warning}
              title="Just listed"
              subtitle="Fresh items posted recently"
              onViewAll={() =>
                openCollection({ sort: 'newest', title: 'Just listed', subtitle: 'Freshest first' })
              }
              items={fresh}
              onPressItem={openItem}
            />
            </Reanimated.View>

            <Reanimated.View entering={enterUp(7, 46)} style={styles.sellBanner}>
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sellBannerInner}
              >
                <Shimmer duration={2000} pause={2600} />
                <Float distance={3} duration={1400}>
                  <View style={styles.sellIcon}>
                    <Wiggle angle={10} every={3000} delay={1200}>
                      <Icon name="camera" size={22} color={colors.primary} />
                    </Wiggle>
                  </View>
                </Float>
                <View style={styles.sellCopy}>
                  <Text style={styles.sellTitle}>Sell in 30 seconds</Text>
                  <Text style={styles.sellBody}>Snap a photo, set a price and reach buyers nearby.</Text>
                  <View style={styles.sellPerks}>
                    {['Free', 'AI fill', 'Local buyers'].map((perk) => (
                      <View key={perk} style={styles.sellPerk}>
                        <Icon name="checkmark-circle" size={11} color={colors.onGradient} />
                        <Text style={styles.sellPerkText}>{perk}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <Pulse to={1.07} duration={700} pause={1600}>
                  <PressableScale
                    scaleTo={0.96}
                    contentStyle={styles.sellButton}
                    onPress={() => requireLogin('sell', () => navigateToTab(navigation, TABS.POST))}
                  >
                    <Icon name="add" size={16} color={colors.primary} />
                    <Text style={styles.sellButtonText}>Post</Text>
                  </PressableScale>
                </Pulse>
              </LinearGradient>
            </Reanimated.View>

            {budget.length > 0 ? (
              <Reanimated.View entering={enterUp(8, 46)}>
              <Section
                styles={styles}
                colors={colors}
                icon="pricetags"
                tint={colors.success}
                title={`Under ${formatPrice(BUDGET_LIMIT)}`}
                subtitle="Budget-friendly picks near you"
                onViewAll={() =>
                  openCollection({
                    maxPrice: BUDGET_LIMIT,
                    sort: 'price-low',
                    title: `Under ${formatPrice(BUDGET_LIMIT)}`,
                    subtitle: 'Cheapest first',
                  })
                }
                items={budget}
                onPressItem={openItem}
              />
              </Reanimated.View>
            ) : null}

            {recent.length > 0 ? (
              <Reanimated.View entering={enterUp(9, 46)}>
              <Section
                styles={styles}
                colors={colors}
                icon="time"
                tint={colors.info}
                title="Recently viewed"
                subtitle="Pick up where you left off"
                onViewAll={() => navigation.navigate(ROUTES.RECENTLY_VIEWED)}
                items={recent}
                onPressItem={openItem}
              />
              </Reanimated.View>
            ) : null}
          </>
        )}
      </ScrollView>
      <WelcomeModal onDone={() => setWelcomeDone(true)} />
      <PermissionPrompt enabled={welcomeDone} onLocationGranted={fetchCurrentLocation} />
    </View>
  );
}

function compareTrendingNear(a, b) {
  const aKm = Number.isFinite(a.distanceKm) ? a.distanceKm : null;
  const bKm = Number.isFinite(b.distanceKm) ? b.distanceKm : null;
  const viewDiff = (Number(b.views) || 0) - (Number(a.views) || 0);
  if (aKm != null && bKm != null) {
    if (Math.abs(aKm - bKm) > 2) return aKm - bKm;
    if (viewDiff !== 0) return viewDiff;
    return aKm - bKm;
  }
  if (aKm != null) return -1;
  if (bKm != null) return 1;
  return viewDiff;
}

function SectionHeader({ styles, colors, icon, tint, title, subtitle, onViewAll }) {
  const [wiggleDelay] = useState(() => 600 + Math.round(Math.random() * 2400));
  return (
    <View style={styles.sectionHeader}>
      <SoftPop style={[styles.sectionIcon, { backgroundColor: `${tint}1F` }]}>
        <Wiggle angle={14} every={5200} delay={wiggleDelay}>
          <Icon name={icon} size={15} color={tint} />
        </Wiggle>
      </SoftPop>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
      {onViewAll ? (
        <Pressable onPress={onViewAll} hitSlop={8} style={styles.viewAll}>
          <Text style={styles.viewAllText}>See all</Text>
          <Icon name="chevron-forward" size={14} color={colors.link} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Section({ styles, colors, icon, tint, title, subtitle, onViewAll, items, onPressItem }) {
  if (!items?.length) return null;
  return (
    <View style={styles.block}>
      <SectionHeader
        styles={styles}
        colors={colors}
        icon={icon}
        tint={tint}
        title={title}
        subtitle={subtitle}
        onViewAll={onViewAll}
      />
      <ProductCardCarousel items={items} onPressItem={onPressItem} />
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    zIndex: 2,
    paddingBottom: 6,
    backgroundColor: colors.background,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 20,
  },
  pressed: {
    opacity: 0.8,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 28,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 10,
  },
  brandLogo: {
    width: 46,
    height: 46,
    marginLeft: -6,
  },
  brandCopy: {
    flex: 1,
  },
  appName: {
    fontSize: 25,
    lineHeight: 28,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: colors.onGradient,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  locationText: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  testerBtn: { width: 38, height: 38, borderRadius: 19 },
  badge: {
    position: 'absolute',
    top: 3,
    right: 3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: colors.onGradient,
    fontSize: 9.5,
    fontWeight: '800',
  },
  greetingRow: {
    marginTop: 8,
    justifyContent: 'center',
  },
  greeting: {
    fontSize: 13.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  greetingWithPill: {
    paddingRight: 156,
  },
  planPill: {
    position: 'absolute',
    right: 0,
  },
  headline: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.onGradient,
  },
  searchWrap: {
    marginTop: -22,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  block: {
    marginTop: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 6,
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
    fontSize: 16.5,
    fontWeight: '800',
    color: colors.text,
  },
  sectionSub: {
    marginTop: 1,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  viewAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.link,
  },
  categoryBlock: {
    marginTop: 6,
  },
  miniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  miniTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  categoryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 8,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 7,
    paddingHorizontal: 7,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  categorySkeleton: {
    height: 44,
    borderColor: colors.border,
  },
  categoryIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  categoryImage: {
    width: 28,
    height: 28,
    borderRadius: 9,
  },
  categoryCopy: {
    flex: 1,
    minWidth: 0,
  },
  categoryLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.text,
  },
  categoryCountLabel: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '800',
  },
  tabRow: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.onPrimary,
  },
  tabCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  tabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  tabCountText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.textMuted,
  },
  storeRow: {
    paddingHorizontal: 16,
    gap: 10,
  },
  storeCard: {
    width: 240,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    overflow: 'hidden',
  },
  individualCard: {
    borderColor: 'rgba(37, 99, 235, 0.22)',
    backgroundColor: 'rgba(37, 99, 235, 0.03)',
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  storeHeaderText: {
    flex: 1,
  },
  storeLogo: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  storeLogoRound: {
    borderRadius: 22,
  },
  storeDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  storeName: {
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: '800',
    color: colors.text,
  },
  storeSubRow: {
    marginTop: 6,
  },
  storeBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  storeTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  storeTypeText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  storeMeta: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.primary,
    lineHeight: 13,
  },
  storeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  storeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  storeStatText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sellBanner: {
    marginTop: 10,
    marginHorizontal: 16,
    borderRadius: 18,
    overflow: 'hidden',
  },
  sellBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  sellIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.onGradient,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellCopy: {
    flex: 1,
  },
  sellTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.onGradient,
  },
  sellBody: {
    marginTop: 2,
    fontSize: 11.5,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.88)',
  },
  sellPerks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  sellPerk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  sellPerkText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.onGradient,
  },
  sellButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: colors.onGradient,
  },
  sellButtonText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.primary,
  },
});
