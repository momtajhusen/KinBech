import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import { Animated, ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CategoryIcon from '../components/CategoryIcon';
import FilterBottomSheet from '../components/FilterBottomSheet';
import ProductCardCarousel from '../components/ProductCardCarousel';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import { navigateToTab, openItemDetail, ROUTES, TABS } from '../navigation/helpers';
import { api } from '../services/api';
import { attachDistanceToCard, shuffleArray, toCardItem } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useAuth } from '../context/AuthContext';
import { useCategories } from '../utils/categories';
import { formatCityDistrict } from '../utils/locations';
import {
  isHomeListingsFresh,
  loadHomeListingsCache,
  setHomeListingsCache,
} from '../utils/homeListingsCache';

const FOCUS_CACHE_TTL_MS = 60_000;

export default function HomeScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const productCategories = useCategories('product');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [orderTick, setOrderTick] = useState(0);
  const [location, setLocation] = useState('Kathmandu');
  const [locating, setLocating] = useState(false);
  const [userCoords, setUserCoords] = useState({ lat: null, lng: null });
  const hasLoadedRef = useRef(false);
  const hasAnimatedRef = useRef(false);
  const locationLabelRef = useRef('Kathmandu');
  const userCoordsRef = useRef({ lat: null, lng: null });

  // Animation refs
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const headerScaleAnim = useRef(new Animated.Value(1)).current;
  const bannerScaleAnim = useRef(new Animated.Value(0.95)).current;

  const revealContent = useCallback(() => {
    if (hasAnimatedRef.current) {
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      bannerScaleAnim.setValue(1);
      return;
    }
    hasAnimatedRef.current = true;
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }),
      Animated.timing(bannerScaleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim, bannerScaleAnim]);

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
      setListings(shuffleArray(cached.listings));
      setHasContent(true);
      hasLoadedRef.current = true;
      if (cached.location) {
        locationLabelRef.current = cached.location;
        setLocation(cached.location);
      }
      if (cached.coords?.lat != null && cached.coords?.lng != null) {
        userCoordsRef.current = cached.coords;
        setUserCoords(cached.coords);
      }
      setOrderTick((tick) => tick + 1);
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

  const loadListings = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!force && silent && isHomeListingsFresh(FOCUS_CACHE_TTL_MS) && hasLoadedRef.current) {
      return;
    }

    if (!silent) setLoading(true);

    const coords = await Promise.race([
      resolveCoordsQuick(),
      new Promise((resolve) => setTimeout(() => resolve(userCoordsRef.current), 120)),
    ]);

    const params = {};
    if (coords?.lat != null && coords?.lng != null) {
      params.lat = coords.lat;
      params.lng = coords.lng;
    }
    params.page = 1;
    params.limit = 40;

    const { data, error } = await api.getListings(params);
    if (error) {
      console.error('Failed to load listings:', error);
      if (!hasLoadedRef.current) setListings([]);
    } else {
      const raw = (data?.listings || []).map(toCardItem).filter(Boolean);
      const withDistance = shuffleArray(
        raw.map((it) => attachDistanceToCard(it, coords, user?.id))
      );
      setListings(withDistance);
      setHasContent(true);
      hasLoadedRef.current = true;
      setOrderTick((tick) => tick + 1);
      setHomeListingsCache({
        listings: withDistance,
        location: locationLabelRef.current,
        coords: coords || userCoordsRef.current,
      });
      revealContent();
    }

    if (!silent) setLoading(false);
  }, [user?.id, resolveCoordsQuick, revealContent]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadListings({ silent: true, force: true }));

  useFocusEffect(
    useCallback(() => {
      setOrderTick((tick) => tick + 1);
      loadListings({ silent: hasLoadedRef.current });
    }, [loadListings])
  );

  const openItem = (item) =>
    openItemDetail(navigation, { listingId: item.id, item: item.listing || item, sharedId: item.id });

  const toggleSave = async (item) => {
    const { error } = await api.toggleWishlist(item.id);
    if (error) {
      return;
    }
  };

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good Morning';
    }
    if (hour < 17) {
      return 'Good Afternoon';
    }
    return 'Good Evening';
  }, []);

  if (!colors) {
    return null;
  }

  const categories = [
    ...productCategories.slice(0, 4),
    {
      label: 'More',
      icon: 'apps-outline',
      color: colors?.category?.more || '#F59E0B',
      isMore: true,
    },
  ];

  const resolvedTrending = useMemo(
    () =>
      shuffleArray(listings)
        .slice(0, 12)
        .map((item) => ({
          ...item,
          onToggleSave: () => toggleSave(item),
        })),
    // orderTick reshuffles whenever Home gains focus
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listings, orderTick]
  );

  const resolvedRecent = useMemo(
    () =>
      shuffleArray(listings)
        .slice(0, 16)
        .map((item) => ({
          ...item,
          onToggleSave: () => toggleSave(item),
        })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [listings, orderTick]
  );

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.primary }]}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.appName}>KinBech</Text>
              <Pressable
                style={styles.locationRow}
                onPress={() => {
                  if (!locating) {
                    fetchCurrentLocation();
                  }
                }}
                hitSlop={8}
              >
                <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.8)" />
                {locating ? (
                  <ActivityIndicator size="small" color="rgba(255,255,255,0.9)" style={styles.locatingSpinner} />
                ) : (
                  <Text style={styles.locationText} numberOfLines={1}>{location}</Text>
                )}
                {!locating ? (
                  <Ionicons name="locate" size={13} color="rgba(255,255,255,0.75)" style={styles.locateBtn} />
                ) : null}
              </Pressable>
            </View>
            <Pressable 
              onPress={() => navigation.navigate(ROUTES.NOTIFICATIONS)} 
              style={styles.bell}
              onPressIn={() => {
                Animated.spring(headerScaleAnim, {
                  toValue: 0.9,
                  useNativeDriver: true,
                  tension: 300,
                  friction: 10,
                }).start();
              }}
              onPressOut={() => {
                Animated.spring(headerScaleAnim, {
                  toValue: 1,
                  useNativeDriver: true,
                  tension: 300,
                  friction: 10,
                }).start();
              }}
            >
              <Animated.View style={{ transform: [{ scale: headerScaleAnim }] }}>
                <Ionicons name="notifications-outline" size={22} color={colors.onGradient} />
              </Animated.View>
            </Pressable>
          </View>
        </View>

        <View style={styles.searchWrap}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Search for things you love..."
            onSubmitEditing={() =>
              navigation.navigate(ROUTES.SEARCH_RESULTS, { query })
            }
            onFilterPress={() => setFiltersOpen(true)}
          />
        </View>

        {categories.length > 0 ? (
        <View style={styles.categories}>
          {(categories || []).map((item) => (
              <CategoryIcon
              key={item.label}
              label={item.label}
              icon={item.icon}
              imageUrl={item.imageUrl}
              color={item.color || item.tint}
              onPress={() => {
                if (item.label === 'More') {
                  navigation.navigate(ROUTES.ALL_CATEGORIES);
                } else {
                  navigation.navigate(ROUTES.MAIN_TABS, { screen: ROUTES.EXPLORE, params: { category: item.label } });
                }
              }}
            />
          ))}
        </View>
        ) : null}

        {listings.length === 0 ? (
          <EmptyState
            compact
            icon="storefront-outline"
            title="No items yet"
            body="Be the first to list something. Your posts will show up here for buyers nearby."
            buttonLabel="Post your first item"
            onButtonPress={() => navigateToTab(navigation, TABS.POST)}
          />
        ) : (
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            <Section
              title="Trending Near You"
              onViewAll={() => navigation.navigate(ROUTES.SEARCH_RESULTS)}
              items={resolvedTrending}
              onPressItem={openItem}
              styles={styles}
            />

            <Animated.View 
              style={[styles.banner, { backgroundColor: colors.primary, transform: [{ scale: bannerScaleAnim }] }]}
            >
              <View style={styles.bannerCopy}>
                <Text style={styles.bannerTitle}>List in 30 seconds</Text>
                <Text style={styles.bannerBody}>
                  Snap a photo, set a price, and go live. Perfect for individual sellers.
                </Text>
              </View>

              <Pressable 
                onPress={() => navigateToTab(navigation, TABS.POST)} 
                style={styles.bannerButton}
                onPressIn={() => {
                  Animated.spring(bannerScaleAnim, {
                    toValue: 0.98,
                    useNativeDriver: true,
                    tension: 300,
                    friction: 10,
                  }).start();
                }}
                onPressOut={() => {
                  Animated.spring(bannerScaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 300,
                    friction: 10,
                  }).start();
                }}
              >
                <Text style={styles.bannerButtonText}>Post an item</Text>
              </Pressable>
            </Animated.View>

            <Section
              title="Recently Viewed"
              onViewAll={() => navigation.navigate(ROUTES.SEARCH_RESULTS)}
              items={resolvedRecent}
              onPressItem={openItem}
              styles={styles}
            />
          </Animated.View>
        )}
      </ScrollView>
      <FilterBottomSheet
        visible={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onApply={(filters) => {
          setFiltersOpen(false);
          navigation.navigate(ROUTES.SEARCH_RESULTS, {
            query,
            category: filters.category,
            condition: filters.condition,
            minPrice: filters.priceMin,
            maxPrice: filters.priceMax,
          });
        }}
      />
    </View>
  );
}

function Section({ title, onViewAll, items, onPressItem, styles }) {
  const safeItems = items || [];
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Pressable onPress={onViewAll}>
          <Text style={styles.viewAll}>View all</Text>
        </Pressable>
      </View>
      <ProductCardCarousel items={safeItems} onPressItem={onPressItem} />
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: 28,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 36,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  appName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.onGradient,
    letterSpacing: -0.5,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    maxWidth: 220,
  },
  locationText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '500',
    flexShrink: 1,
  },
  locateBtn: {
    marginLeft: 2,
  },
  locatingSpinner: {
    transform: [{ scale: 0.7 }],
  },
  bell: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
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
    fontSize: 10,
    fontWeight: '700',
  },
  searchWrap: {
    marginTop: -24,
    paddingHorizontal: 16,
  },
  categories: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 4,
    marginTop: 8,
    gap: 4,
  },
  section: {
    marginTop: 22,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  viewAll: {
    color: colors.link,
    fontWeight: '600',
  },
  banner: {
    marginTop: 22,
    marginHorizontal: 16,
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    overflow: 'hidden',
  },
  bannerSpark: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.6)',
  },
  bannerCopy: {
    flex: 1,
    gap: 4,
  },
  bannerTitle: {
    color: colors.onGradient,
    fontSize: 16,
    fontWeight: '800',
  },
  bannerBody: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    lineHeight: 17,
  },
  bannerStar: {
    fontSize: 26,
  },
  bannerButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  bannerButtonText: {
    color: colors.price,
    fontWeight: '700',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
  },
  emptyButton: {
    marginTop: 12,
  },
  emptyButtonGradient: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.onGradient,
  },
});
