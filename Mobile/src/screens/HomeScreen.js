import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
  Animated,
  ActivityIndicator,
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
import { INDIVIDUAL_GRADIENT } from '../components/SellerProfileCard';
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

const FOCUS_CACHE_TTL_MS = 60_000;
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
  return merged
    .sort((a, b) => {
      const shopDiff = (b.sellerType === 'shop' ? 1 : 0) - (a.sellerType === 'shop' ? 1 : 0);
      if (shopDiff) return shopDiff;
      return (Number(b.listingCount) || 0) - (Number(a.listingCount) || 0);
    })
    .slice(0, 10);
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
  const [locating, setLocating] = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentViews, setRecentViews] = useState(() => getRecentlyViewed());
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
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const fetchCurrentLocation = useCallback(async () => {
    setLocating(true);
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
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      coords = {
        lat: currentLocation.coords.latitude,
        lng: currentLocation.coords.longitude,
      };
      userCoordsRef.current = coords;
      setUserCoords(coords);

      const reverseGeocode = await Location.reverseGeocodeAsync({
        latitude: coords.lat,
        longitude: coords.lng,
      });
      const addr = reverseGeocode?.[0];
      if (addr) {
        const label = formatCityDistrict(addr, 'Kathmandu');
        locationLabelRef.current = label;
        setLocation(label);
      }
      return coords;
    } catch (error) {
      console.log('Location error:', error);
      return null;
    } finally {
      setLocating(false);
    }
  }, []);

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
    const [nearbyRes, featuredRes] = await Promise.all([
      api.getNearbySellers(params),
      api.getFeaturedSellers(params),
    ]);
    const next = mergeStores(featuredRes.data?.sellers || [], nearbyRes.data?.sellers || []);
    if (next.length || (!nearbyRes.error && !featuredRes.error)) {
      storesMemory = next;
      setStores(next);
    }
  }, []);

  const loadListings = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!force && silent && isHomeListingsFresh(FOCUS_CACHE_TTL_MS) && hasLoadedRef.current) {
      return;
    }

    if (!silent && !hasLoadedRef.current) setLoading(true);

    const coords = await Promise.race([
      resolveCoordsQuick(),
      new Promise((resolve) => setTimeout(() => resolve(userCoordsRef.current), 120)),
    ]);

    const params = {};
    if (coords?.lat != null && coords?.lng != null) {
      params.lat = coords.lat;
      params.lng = coords.lng;
    }

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

    if (!silent) setLoading(false);
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
      loadListings({ silent: hasLoadedRef.current });
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
    { label: 'All', icon: 'grid', color: colors.warning, isMore: true },
    ...productCategories,
  ];

  const renderStore = (store) => {
    const isShop = store.sellerType === 'shop';
    const cover = resolveMediaUrl(store.coverImage || '');
    const logo = resolveMediaUrl(store.avatarUrl || '');
    const distance = formatDistanceLabel(Number(store.distance));
    const rating = Number(store.rating) || 0;
    return (
      <Pressable
        key={String(store.shopId || store.id || store._id)}
        onPress={() => openStore(store)}
        style={({ pressed }) => [styles.storeCard, pressed && styles.pressed]}
      >
        <View style={styles.storeBanner}>
          {cover ? (
            <Image source={{ uri: cover }} style={styles.fill} />
          ) : (
            <LinearGradient
              colors={isShop ? colors.gradient : INDIVIDUAL_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fill}
            />
          )}
          <View style={styles.storeShade} />
          <View style={styles.storeTypePill}>
            <Ionicons name={isShop ? 'storefront' : 'person'} size={9} color="#fff" />
            <Text style={styles.storeTypeText}>{isShop ? 'STORE' : 'SELLER'}</Text>
          </View>
        </View>
        <View style={[styles.storeLogo, !isShop && styles.storeLogoRound]}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.fill} />
          ) : (
            <Ionicons name={isShop ? 'storefront' : 'person'} size={20} color={colors.primary} />
          )}
        </View>
        <View style={styles.storeBody}>
          <View style={styles.storeNameRow}>
            <Text style={styles.storeName} numberOfLines={1}>
              {store.name}
            </Text>
            {store.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.info} /> : null}
          </View>
          <Text style={styles.storeMeta} numberOfLines={1}>
            {[store.category, String(store.location || '').split(',')[0]].filter(Boolean).join(' · ') || 'Local seller'}
          </Text>
          <View style={styles.storeStats}>
            <View style={styles.storeStat}>
              <Ionicons name="star" size={11} color={colors.warning} />
              <Text style={styles.storeStatText}>{rating > 0 ? rating.toFixed(1) : 'New'}</Text>
            </View>
            <View style={styles.storeStat}>
              <Ionicons name="cube-outline" size={11} color={colors.textMuted} />
              <Text style={styles.storeStatText}>{Number(store.listingCount) || 0} items</Text>
            </View>
            {distance ? (
              <View style={styles.storeStat}>
                <Ionicons name="navigate-outline" size={11} color={colors.textMuted} />
                <Text style={styles.storeStatText}>{distance}</Text>
              </View>
            ) : null}
          </View>
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
                    if (!locating) fetchCurrentLocation();
                  }}
                  hitSlop={8}
                >
                  <Ionicons name="location" size={12} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {location}
                  </Text>
                  {locating ? (
                    <ActivityIndicator size="small" color={colors.onGradient} style={styles.locatingSpinner} />
                  ) : (
                    <Ionicons name="chevron-down" size={12} color="rgba(255,255,255,0.8)" />
                  )}
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
              const count = cat.isMore ? listings.length : categoryCounts[cat.label] || 0;
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
                      <Ionicons name={cat.icon || 'pricetag-outline'} size={20} color={tint} />
                    )}
                    {count > 0 ? (
                      <View style={[styles.categoryCount, { backgroundColor: tint }]}>
                        <Text style={styles.categoryCountText}>{count > 99 ? '99+' : count}</Text>
                      </View>
                    ) : null}
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

            {stores.length > 0 ? (
              <View style={styles.block}>
                <SectionHeader
                  styles={styles}
                  colors={colors}
                  icon="storefront"
                  tint={colors.primary}
                  title="Stores & sellers nearby"
                  subtitle="Trusted local shops and sellers"
                  onViewAll={openSellers}
                />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.storeRow}
                >
                  {stores.map(renderStore)}
                </ScrollView>
              </View>
            ) : null}

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
                        <View style={[styles.tabCount, active && styles.tabCountActive]}>
                          <Text style={[styles.tabCountText, active && styles.tabTextActive]}>
                            {categoryCounts[name]}
                          </Text>
                        </View>
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
      {listings.length === 0 && !settled ? <ScreenLoader overlay label="Loading" /> : null}
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
    paddingBottom: 28,
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
    paddingBottom: 40,
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
  locatingSpinner: {
    transform: [{ scale: 0.7 }],
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
    marginTop: -24,
    paddingHorizontal: 16,
  },
  block: {
    marginTop: 22,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
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
    marginTop: 8,
  },
  miniHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 8,
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
    width: 70,
    alignItems: 'center',
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryImage: {
    width: 48,
    height: 48,
    borderRadius: 16,
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
    marginTop: 5,
    fontSize: 11,
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
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  storeBanner: {
    height: 76,
    backgroundColor: colors.surfaceMuted,
  },
  storeShade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  storeTypePill: {
    position: 'absolute',
    top: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  storeTypeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.4,
  },
  storeLogo: {
    position: 'absolute',
    top: 50,
    left: 12,
    width: 48,
    height: 48,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  storeLogoRound: {
    borderRadius: 24,
  },
  storeBody: {
    paddingHorizontal: 12,
    paddingTop: 26,
    paddingBottom: 12,
  },
  storeNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  storeName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  storeMeta: {
    marginTop: 2,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  storeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  storeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  storeStatText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  sellBanner: {
    marginTop: 24,
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
