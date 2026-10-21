import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
  Animated,
  Alert,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FilterBottomSheet from '../components/FilterBottomSheet';
import ProductCardCarousel from '../components/ProductCardCarousel';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import ScreenLoader from '../components/ScreenLoader';
import { navigateToTab, openItemDetail, ROUTES, TABS } from '../navigation/helpers';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { attachDistanceToCard, formatDistanceLabel, resolveMediaUrl, toCardItem } from '../utils/listing';
import { loadRecentlyViewed, getRecentlyViewed } from '../utils/recentlyViewed';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useCategories } from '../utils/categories';
import { formatCityDistrict } from '../utils/locations';
import {
  catalogFingerprint,
  getHomeListingsMemory,
  isHomeListingsFresh,
  loadHomeListingsCache,
  setHomeListingsCache,
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
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const productCategories = useCategories('product');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const initialCatalog = getHomeListingsMemory();
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
  const hasAnimatedRef = useRef(false);
  const locationLabelRef = useRef('Kathmandu');
  const userCoordsRef = useRef({ lat: null, lng: null });
  const [pickedCategory, setPickedCategory] = useState(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  const revealContent = useCallback(() => {
    if (hasAnimatedRef.current) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      return;
    }
    hasAnimatedRef.current = true;
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const fetchCurrentLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location permission', 'Allow location access to see items near you.');
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
      revealContent();
    })();
    // Start location fetch in background, don't block cache load
    fetchCurrentLocation();
    return () => {
      cancelled = true;
    };
  }, [fetchCurrentLocation, revealContent]);

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
      api.getPinnedStores(params),
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
      setSettled(true);
      hasLoadedRef.current = true;
      setHomeListingsCache({
        listings: withDistance,
        location: locationLabelRef.current,
        coords: coords || userCoordsRef.current,
      });
      revealContent();
    }

    setLoading(false);
  }, [loadStores, resolveCoordsQuick, revealContent]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadListings({ silent: true, force: true }));

  useEffect(() => {
    if (listings.length) revealContent();
  }, [listings.length, revealContent]);

  useEffect(() => {
    if (userCoords.lat == null || userCoords.lng == null) return;
    loadStores({ lat: userCoords.lat, lng: userCoords.lng });
  }, [userCoords.lat, userCoords.lng, loadStores]);

  useFocusEffect(
    useCallback(() => {
      if (!storesMemory.length) {
        const known = userCoordsRef.current;
        loadStores(known.lat != null && known.lng != null ? { lat: known.lat, lng: known.lng } : {});
      }
      // Always silent load for instant display
      loadListings({ silent: true });
      // Load other data in background
      loadRecentlyViewed().then((items) => setRecentViews(items));
      api.getNotifications().then(({ data }) => {
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

  const topCategories = useMemo(
    () =>
      Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([name]) => name),
    [categoryCounts]
  );
  const activeCategory = topCategories.includes(pickedCategory) ? pickedCategory : topCategories[0];
  const categoryItems = useMemo(
    () =>
      nearbyListings
        .filter((item) => item.category === activeCategory)
        .sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
        .slice(0, 10)
        .map(decorate),
    [nearbyListings, activeCategory, decorate]
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

  const categoryTiles = [
    ...productCategories.slice(0, 5),
    { label: 'All', icon: 'grid', color: colors.warning, isMore: true },
  ];

  const renderStore = (store) => {
    const isShop = store.sellerType === 'shop';
    const logo = resolveMediaUrl(store.avatarUrl || '');
    const distance = formatDistanceLabel(Number(store.distance));
    const rating = Number(store.rating) || 0;
    const accent = isShop ? colors.primary : colors.menuBlue;
    const accentSoft = isShop ? colors.pastelGreen : colors.pastelBlue;
    const typeIcon = isShop ? 'storefront' : 'person';
    return (
      <Pressable
        key={String(store.shopId || store.id || store._id)}
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
              <Ionicons name={typeIcon} size={20} color={accent} />
            )}
          </View>
          <View style={styles.storeHeaderText}>
            <View style={styles.storeNameRow}>
              <Text style={styles.storeName} numberOfLines={1}>
                {store.name}
              </Text>
              {store.verified ? (
                <Ionicons name="checkmark-circle" size={12} color={colors.info} />
              ) : null}
            </View>
            <View style={styles.storeBadgesRow}>
              <View style={[styles.storeTypePill, { backgroundColor: accentSoft }]}>
                <Ionicons name={typeIcon} size={8} color={accent} />
                <Text style={[styles.storeTypeText, { color: accent }]}>
                  {isShop ? 'STORE' : 'INDIVIDUAL'}
                </Text>
              </View>
              {store.verified ? (
                <View style={[styles.storeTypePill, { backgroundColor: `${colors.info}20` }]}>
                  <Ionicons name="checkmark-circle" size={8} color={colors.info} />
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
            <Ionicons name="star" size={10} color={rating > 0 ? colors.warning : colors.textMuted} />
            <Text style={styles.storeStatText}>{rating > 0 ? rating.toFixed(1) : 'New'}</Text>
          </View>
          <View style={styles.storeStat}>
            <Ionicons name="cube-outline" size={10} color={colors.textMuted} />
            <Text style={styles.storeStatText}>{Number(store.listingCount) || 0} items</Text>
          </View>
          {distance ? (
            <View style={styles.storeStat}>
              <Ionicons name="navigate-outline" size={10} color={colors.textMuted} />
              <Text style={styles.storeStatText}>{distance}</Text>
            </View>
          ) : null}
        </View>
      </Pressable>
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
              <Image source={APP_LOGO} style={styles.brandLogo} resizeMode="contain" />
              <View style={styles.brandCopy}>
                <Text style={styles.appName}>KinBech</Text>
                <Pressable
                  style={styles.locationRow}
                  onPress={() => {
                    fetchCurrentLocation();
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="location" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {location}
                  </Text>
                  <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.8)" />
                </Pressable>
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => navigation.navigate(ROUTES.MAP_EXPLORE)}
                style={styles.headerBtn}
                hitSlop={6}
              >
                <Ionicons name="map-outline" size={19} color={colors.onGradient} />
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate(ROUTES.WISHLIST)}
                style={styles.headerBtn}
                hitSlop={6}
              >
                <Ionicons name="heart-outline" size={20} color={colors.onGradient} />
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate(ROUTES.NOTIFICATIONS)}
                style={styles.headerBtn}
                hitSlop={6}
              >
                <Ionicons name="notifications-outline" size={20} color={colors.onGradient} />
                {unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>
          </View>
          <Text style={styles.greeting}>
            {greeting}
            {firstName ? `, ${firstName}` : ''}
          </Text>
          <Text style={styles.headline}>What are you looking for today?</Text>
        </LinearGradient>

        <View style={styles.searchWrap}>
          <SearchBar
            placeholder="Search products, stores, sellers..."
            onPress={() => navigation.navigate(ROUTES.SEARCH_RESULTS)}
            onFilterPress={() => setFiltersOpen(true)}
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
              <Ionicons name="chevron-forward" size={14} color={colors.link} />
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
            {categoryTiles.map((cat) => {
              const tint = cat.color || cat.tint || colors.primary;
              return (
                <Pressable
                  key={cat.label}
                  style={({ pressed }) => [styles.categoryTile, pressed && styles.pressed]}
                  onPress={() => (cat.isMore ? navigation.navigate(ROUTES.ALL_CATEGORIES) : openCategory(cat.label))}
                >
                  <View style={[styles.categoryIcon, { backgroundColor: `${tint}1F` }]}>
                    {cat.imageUrl ? (
                      <Image source={{ uri: cat.imageUrl }} style={styles.categoryImage} />
                    ) : (
                      <Ionicons name={cat.icon || 'pricetag-outline'} size={18} color={tint} />
                    )}
                  </View>
                  <Text style={styles.categoryLabel} numberOfLines={1}>
                    {cat.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {listings.length === 0 ? (
          settled ? (
            <EmptyState
              compact
              icon="storefront-outline"
              title="No items yet"
              body="Be the first to list something. Your posts will show up here for buyers nearby."
              buttonLabel="Post your first item"
              onButtonPress={() => navigateToTab(navigation, TABS.POST)}
            />
          ) : null
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            {recent.length > 0 ? (
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
            ) : null}

            {pinnedStores.length > 0 ? (
              <View style={styles.block}>
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
              </View>
            ) : null}

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

            {topCategories.length > 1 ? (
              <View style={styles.block}>
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
                      <Pressable
                        key={name}
                        onPress={() => setPickedCategory(name)}
                        style={[styles.tab, active && styles.tabActive]}
                      >
                        <Text style={[styles.tabText, active && styles.tabTextActive]}>{name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <ProductCardCarousel key={activeCategory} items={categoryItems} onPressItem={openItem} />
              </View>
            ) : null}

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

            <View style={styles.sellBanner}>
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sellBannerInner}
              >
                <View style={styles.sellIcon}>
                  <Ionicons name="camera" size={22} color={colors.primary} />
                </View>
                <View style={styles.sellCopy}>
                  <Text style={styles.sellTitle}>Sell in 30 seconds</Text>
                  <Text style={styles.sellBody}>Snap a photo, set a price and reach buyers nearby.</Text>
                  <View style={styles.sellPerks}>
                    {['Free', 'AI fill', 'Local buyers'].map((perk) => (
                      <View key={perk} style={styles.sellPerk}>
                        <Ionicons name="checkmark-circle" size={11} color={colors.onGradient} />
                        <Text style={styles.sellPerkText}>{perk}</Text>
                      </View>
                    ))}
                  </View>
                </View>
                <Pressable
                  onPress={() => navigateToTab(navigation, TABS.POST)}
                  style={({ pressed }) => [styles.sellButton, pressed && styles.pressed]}
                >
                  <Ionicons name="add" size={16} color={colors.primary} />
                  <Text style={styles.sellButtonText}>Post</Text>
                </Pressable>
              </LinearGradient>
            </View>

            {budget.length > 0 ? (
              <Section
                styles={styles}
                colors={colors}
                icon="pricetags"
                tint={colors.success}
                title={`Under ₹${BUDGET_LIMIT.toLocaleString('en-IN')}`}
                subtitle="Budget-friendly picks near you"
                onViewAll={() =>
                  openCollection({
                    maxPrice: BUDGET_LIMIT,
                    sort: 'price-low',
                    title: `Under ₹${BUDGET_LIMIT.toLocaleString('en-IN')}`,
                    subtitle: 'Cheapest first',
                  })
                }
                items={budget}
                onPressItem={openItem}
              />
            ) : null}
          </Animated.View>
        )}
      </ScrollView>
      <FilterBottomSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onApply={(filters) => {
          setFiltersOpen(false);
          navigation.navigate(ROUTES.SEARCH_RESULTS, {
            category: filters.category,
            condition: filters.condition,
            minPrice: filters.priceMin,
            maxPrice: filters.priceMax,
            radiusKm: filters.radiusKm,
            sort: filters.sortKey,
          });
        }}
      />
      {listings.length === 0 && !settled ? <ScreenLoader overlay label="Loading items..." /> : null}
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
  return (
    <View style={styles.sectionHeader}>
      <View style={[styles.sectionIcon, { backgroundColor: `${tint}1F` }]}>
        <Ionicons name={icon} size={15} color={tint} />
      </View>
      <View style={styles.sectionCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
      </View>
      {onViewAll ? (
        <Pressable onPress={onViewAll} hitSlop={8} style={styles.viewAll}>
          <Text style={styles.viewAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.link} />
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
  greeting: {
    marginTop: 8,
    fontSize: 13.5,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  headline: {
    marginTop: 2,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
    color: colors.onGradient,
  },
  searchWrap: {
    marginTop: -20,
    paddingHorizontal: 16,
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
    paddingHorizontal: 12,
    gap: 4,
  },
  categoryTile: {
    width: 58,
    alignItems: 'center',
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryImage: {
    width: 40,
    height: 40,
    borderRadius: 14,
  },
  categoryCount: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  categoryCountText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
  },
  categoryLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
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
