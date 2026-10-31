import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { FadeIn } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductCardSkeleton, Skeleton } from '../components/SkeletonLoader';
import { isNearEnd } from '../utils/scroll';
import { VoiceSearchToggle, useVoiceSearchBox } from '../components/VoiceHost';
import EmptyState from '../components/EmptyState';
import ProductCard, { compactCardLayout } from '../components/ProductCard';
import LazyList, { LazyScrollProvider, useLazyScroll } from '../components/LazyList';
import { Ping, PressableScale, Reanimated, enterQuick } from '../components/Motion';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { formatDistanceLabel, resolveMediaUrl, toCardItem } from '../utils/listing';
import { haversineKm } from '../utils/locations';
import { useCategories } from '../utils/categories';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useAuth } from '../context/AuthContext';
import { useRequireLogin } from '../components/LoginPrompt';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import pinnedStoresUtils from '../utils/pinnedStores';

const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'price_low', label: 'Price ↑' },
  { key: 'price_high', label: 'Price ↓' },
];

const TABS = [
  { key: 'products', label: 'Products', icon: 'grid-outline', activeIcon: 'grid' },
  { key: 'reviews', label: 'Reviews', icon: 'star-outline', activeIcon: 'star' },
  { key: 'about', label: 'About', icon: 'information-circle-outline', activeIcon: 'information-circle' },
];

const TOP_BAR_HEIGHT = 52;
const APP_ICON = 64;
const GRID_GUTTER = 8;
const GRID_PADDING = 10;
const SIDEBAR_WIDTH = 70;
const SHOP_PAGE = 30;
const HERO_GRADIENT = ['#022C22', '#065F46', '#10B981'];

function mergeById(prev, incoming) {
  const byId = new Map(prev.map((item) => [String(item._id || item.id), item]));
  incoming.forEach((item) => byId.set(String(item._id || item.id), item));
  return [...byId.values()];
}

function parseClock(text) {
  const m = String(text || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = Number(m[1]) % 24;
  const min = Number(m[2] || 0);
  const ampm = (m[3] || '').toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return h * 60 + min;
}

const WEEK_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function openStatus(hours, openDays) {
  if (Array.isArray(openDays) && openDays.length && !openDays.includes(WEEK_DAYS[new Date().getDay()])) {
    return false;
  }
  const [from, to] = String(hours || '').split(/\s*[-–]\s*/);
  const start = parseClock(from);
  const end = parseClock(to);
  if (start == null || end == null) return null;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  return end > start ? mins >= start && mins < end : mins >= start || mins < end;
}

const SOCIAL_LINKS = [
  { key: 'facebook', icon: 'logo-facebook', color: '#1877F2', base: 'https://facebook.com/' },
  { key: 'instagram', icon: 'logo-instagram', color: '#E1306C', base: 'https://instagram.com/' },
  { key: 'tiktok', icon: 'logo-tiktok', color: '#111111', base: 'https://www.tiktok.com/@' },
  { key: 'youtube', icon: 'logo-youtube', color: '#FF0000', base: 'https://youtube.com/@' },
];

function toUrl(value, base = 'https://') {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^https?:\/\//i.test(text)) return text;
  if (/\.[a-z]{2,}(\/|$)/i.test(text) && base !== 'https://') return `https://${text}`;
  return `${base}${text.replace(/^@/, '')}`;
}

function whatsappUrl(number) {
  let digits = String(number || '').replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('9')) digits = `977${digits}`;
  return digits ? `https://wa.me/${digits}` : '';
}

function timeAgo(value) {
  if (!value) return '';
  const diff = Date.now() - new Date(value).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return 'Today';
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || 'S').toUpperCase();
}

export default function ShopProfileScreen({ route, navigation }) {
  const lazyScroll = useLazyScroll();
  const { colors, isDarkMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width, height: windowHeight } = useWindowDimensions();
  const { user } = useAuth();
  const requireLogin = useRequireLogin();
  const { shopId: rawShopId } = route.params || {};
  const shopId = rawShopId?._id || rawShopId?.id || rawShopId;

  const [shop, setShop] = useState(null);
  const [listings, setListings] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('products');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [sortKey, setSortKey] = useState('newest');
  const [chatBusy, setChatBusy] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [heroHeight, setHeroHeight] = useState(560);
  const [tabsHeight, setTabsHeight] = useState(54);
  const [productsTop, setProductsTop] = useState(0);
  const [splitTop, setSplitTop] = useState(0);
  const pagingRef = useRef({ shopId: null, page: 0, hasMore: false });
  const loadingMoreRef = useRef(false);
  const tabRef = useRef(tab);
  const scrollY = useRef(new Animated.Value(0)).current;
  const tabAnim = useRef(new Animated.Value(0)).current;
  const productPresets = useCategories('product');
  const barHeight = TOP_BAR_HEIGHT + insets.top;
  tabRef.current = tab;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        let { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          const asked = await Location.requestForegroundPermissionsAsync();
          status = asked.status;
        }
        if (status !== 'granted' || !active) return;
        const last = await Location.getLastKnownPositionAsync();
        if (last?.coords && active) {
          setUserCoords({ lat: last.coords.latitude, lng: last.coords.longitude });
        }
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (current?.coords && active) {
          setUserCoords({ lat: current.coords.latitude, lng: current.coords.longitude });
        }
      } catch {
        // Distance stays hidden when location is unavailable.
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadShopData = useCallback(
    async ({ silent } = {}) => {
      if (!silent) setLoading(true);
      const [shopRes, listingsRes, reviewsRes] = await Promise.all([
        api.getShopById(shopId),
        api.getShopListings(shopId, { page: 1, limit: SHOP_PAGE }),
        api.getShopReviews(shopId),
      ]);
      if (shopRes.data?.shop) setShop(shopRes.data.shop);
      const incoming = listingsRes.data?.listings || [];
      if (pagingRef.current.shopId === shopId && pagingRef.current.page > 1) {
        setListings((prev) => mergeById(prev, incoming));
      } else {
        setListings(incoming);
        pagingRef.current = { shopId, page: 1, hasMore: Boolean(listingsRes.data?.hasMore) };
      }
      setReviews(reviewsRes.data?.reviews || []);
      if (!silent) setLoading(false);
    },
    [shopId]
  );

  const loadMoreListings = useCallback(async () => {
    const paging = pagingRef.current;
    if (loadingMoreRef.current || !paging.hasMore || paging.shopId !== shopId) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const { data, error } = await api.getShopListings(shopId, { page: paging.page + 1, limit: SHOP_PAGE });
    if (!error && Array.isArray(data?.listings)) {
      pagingRef.current = { ...paging, page: paging.page + 1, hasMore: Boolean(data.hasMore) };
      setListings((prev) => mergeById(prev, data.listings));
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [shopId]);

  const loadMoreRef = useRef(loadMoreListings);
  loadMoreRef.current = loadMoreListings;

  const { refreshing, onRefresh } = usePullRefresh(() => loadShopData({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadShopData();
      if (shopId) pinnedStoresUtils.incrementUsage(shopId).catch(() => {});
    }, [loadShopData, shopId])
  );

  useEffect(() => {
    Animated.spring(tabAnim, {
      toValue: Math.max(0, TABS.findIndex((t) => t.key === tab)),
      useNativeDriver: true,
      damping: 22,
      stiffness: 220,
      mass: 0.6,
      overshootClamping: true,
    }).start();
  }, [tab, tabAnim]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (event) => {
          lazyScroll.onScroll(event);
          if (tabRef.current === 'products' && isNearEnd(event, 800)) loadMoreRef.current();
        },
      }),
    [scrollY, lazyScroll.onScroll]
  );

  const categoryChips = useMemo(() => {
    const counts = {};
    listings.forEach((listing) => {
      const label = String(listing.category || '').trim();
      if (!label) return;
      counts[label] = (counts[label] || 0) + 1;
    });
    const items = Object.keys(counts)
      .map((label) => {
        const preset = productPresets.find((item) => item.label === label);
        return {
          label,
          icon: preset?.icon || 'pricetag-outline',
          imageUrl: preset?.imageUrl || '',
          count: counts[label],
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return [{ label: 'All', icon: 'grid-outline', imageUrl: '', count: listings.length }, ...items];
  }, [listings, productPresets]);

  useEffect(() => {
    if (category !== 'All' && !categoryChips.some((item) => item.label === category)) {
      setCategory('All');
    }
  }, [category, categoryChips]);

  const matchesQuery = useVoiceSearchBox({
    value: query,
    onChange: setQuery,
    onFilters: (search) => {
      setSortKey({ 'price-low': 'price_low', 'price-high': 'price_high' }[search.sort] || 'newest');
    },
  });

  const visibleListings = useMemo(() => {
    let list = listings.filter(
      (l) => (category === 'All' || l.category === category) && matchesQuery.inPriceRange(l.price) && matchesQuery(l.title)
    );
    if (sortKey === 'price_low') list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sortKey === 'price_high') list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    return list;
  }, [listings, matchesQuery, category, sortKey]);

  const ratingBars = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
      counts[star - 1] += 1;
    });
    return counts;
  }, [reviews]);

  if (loading && !shop) {
    const skeletonCard = Math.floor((width - GRID_PADDING * 2 - GRID_GUTTER) / 2);
    return (
      <View style={styles.root}>
        <ThemeStatusBar />
        <View style={{ height: barHeight }} />
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={[styles.solidBtn, styles.skeletonBack, { top: insets.top + 8 }]}
        >
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.skeletonWrap}>
          <View style={styles.skeletonCard}>
            <Skeleton width={APP_ICON} height={APP_ICON} borderRadius={24} />
            <View style={styles.skeletonText}>
              <Skeleton width="70%" height={18} borderRadius={6} />
              <Skeleton width="45%" height={12} borderRadius={6} />
              <Skeleton width="35%" height={20} borderRadius={10} />
            </View>
          </View>
          <View style={styles.skeletonGrid}>
            {[0, 1, 2, 3].map((i) => (
              <ProductCardSkeleton key={i} width={skeletonCard} compact />
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <EmptyState
          compact
          icon="storefront-outline"
          title="Shop not found"
          body="This shop may have been removed or is no longer available."
        />
      </View>
    );
  }

  const ownerId = String(shop.owner?._id || shop.owner || '');
  const isOwner = Boolean(user?.id) && ownerId === String(user.id);
  const rating = Number(shop.ratingAverage) || 0;
  const reviewCount = Number(shop.reviewCount) || reviews.length;
  const isOpen = openStatus(shop.openingHours, shop.openDays);
  const social = shop.socialLinks || {};
  const sinceYear = shop.createdAt ? new Date(shop.createdAt).getFullYear() : null;
  const coords = shop.coordinates || {};
  const hasCoords =
    coords.lat != null && coords.lng != null && Number.isFinite(Number(coords.lat)) && Number.isFinite(Number(coords.lng));
  const placeText = shop.address || shop.location || '';
  const distanceLabel = hasCoords && userCoords
    ? formatDistanceLabel(haversineKm(userCoords.lat, userCoords.lng, Number(coords.lat), Number(coords.lng)))
    : null;
  const logo = shop.logo ? resolveMediaUrl(shop.logo) : '';
  const cardWidth = Math.floor((width - SIDEBAR_WIDTH - GRID_PADDING * 2 - GRID_GUTTER) / 2);
  const tabWidth = (width - 34) / TABS.length;
  const todayIndex = new Date().getDay();

  const titleOpacity = scrollY.interpolate({
    inputRange: [70, 120],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const tabShift = scrollY.interpolate({
    inputRange: [heroHeight - barHeight, heroHeight],
    outputRange: [0, barHeight],
    extrapolate: 'clamp',
  });
  // The category sidebar stays under the sticky tabs while the product grid scrolls, like Explore.
  const visibleTop = barHeight + tabsHeight;
  const pinStart = productsTop + splitTop - visibleTop;
  const sidebarPin = scrollY.interpolate({
    inputRange: [pinStart, pinStart + 1],
    outputRange: [0, 1],
    extrapolateLeft: 'clamp',
    extrapolateRight: 'extend',
  });
  const sidebarMaxHeight = Math.max(160, windowHeight - visibleTop - insets.bottom - 12);
  const tabSlide = tabAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, tabWidth, tabWidth * 2],
  });

  const ensureChat = async (failTitle) => {
    if (chatBusy || !ownerId) return null;
    setChatBusy(true);
    const { data, error } = await api.createChat({ userId: ownerId });
    setChatBusy(false);
    if (error || !data?.chat?.id) {
      Alert.alert(failTitle, error || 'Please try again.');
      return null;
    }
    return data;
  };

  const openChat = async () => {
    const data = await ensureChat('Chat failed');
    if (!data) return;
    navigation.navigate(ROUTES.CHAT, {
      chatId: data.chat.id,
      name: shop.name,
      otherUserId: data.chat.otherUser?.id || ownerId,
      image: resolveMediaUrl(shop.logo || ''),
    });
  };

  const startChat = () => requireLogin('chat', openChat);

  const openCall = async () => {
    const data = await ensureChat('Call failed');
    if (!data) return;
    navigation.navigate(ROUTES.CALL, {
      chatId: data.chat.id,
      name: shop.name,
      image: resolveMediaUrl(shop.logo || ''),
    });
  };

  const startCall = () => requireLogin('call', openCall);

  const openDirections = () => {
    const target = hasCoords ? `${coords.lat},${coords.lng}` : placeText;
    if (!target) return;
    Linking.openURL(
      `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(target)}`
    ).catch(() => Alert.alert('Map failed', 'Could not open a map app on this device.'));
  };

  const openLink = (url) => {
    if (url) Linking.openURL(url).catch(() => Alert.alert('Could not open', url));
  };

  const cycleSort = () => {
    const index = SORTS.findIndex((option) => option.key === sortKey);
    setSortKey(SORTS[(index + 1) % SORTS.length].key);
  };

  const shareShop = () => {
    Share.share({
      message: `${shop.name} on KinBech${shop.category ? ` · ${shop.category}` : ''}${
        placeText ? `\n${placeText}` : ''
      }`,
    }).catch(() => {});
  };

  const reportShop = () =>
    requireLogin('report', () => navigation.navigate(ROUTES.REPORT_BLOCK, { userId: ownerId }));

  const quickActions = isOwner
    ? [
        { key: 'add', icon: 'add-circle', label: 'Add', onPress: () => navigation.navigate(ROUTES.SHOP_POST_LISTING), primary: true },
        { key: 'edit', icon: 'create-outline', label: 'Edit', onPress: () => navigation.navigate(ROUTES.EDIT_SHOP) },
        { key: 'stats', icon: 'analytics-outline', label: 'Stats', onPress: () => navigation.navigate(ROUTES.SHOP_DASHBOARD) },
        { key: 'qr', icon: 'qr-code-outline', label: 'QR', onPress: () => navigation.navigate(ROUTES.SHOP_STOREFRONT_QR) },
      ]
    : [
        { key: 'chat', icon: 'chatbubble-ellipses', label: 'Chat', onPress: startChat, primary: true },
        { key: 'call', icon: 'call', label: 'Call', onPress: startCall, primary: true },
        placeText || hasCoords ? { key: 'map', icon: 'navigate', label: 'Directions', onPress: openDirections } : null,
      ].filter(Boolean);

  const infoRows = [
    placeText ? { icon: 'location-outline', label: 'Address', value: placeText, onPress: openDirections } : null,
    shop.phone ? { icon: 'call-outline', label: 'Phone', value: shop.phone } : null,
    shop.whatsapp
      ? { icon: 'logo-whatsapp', label: 'WhatsApp', value: shop.whatsapp, onPress: () => openLink(whatsappUrl(shop.whatsapp)) }
      : null,
    shop.email ? { icon: 'mail-outline', label: 'Email', value: shop.email, onPress: () => openLink(`mailto:${shop.email}`) } : null,
    shop.website
      ? { icon: 'globe-outline', label: 'Website', value: shop.website, onPress: () => openLink(toUrl(shop.website)) }
      : null,
    {
      icon: 'bicycle-outline',
      label: 'Delivery',
      value: shop.deliveryAvailable ? shop.deliveryAreas || 'Home delivery available' : 'Pickup / meetup only',
    },
    shop.paymentMethods?.length
      ? { icon: 'wallet-outline', label: 'Payments', value: shop.paymentMethods.join(' · ') }
      : null,
    shop.returnPolicy ? { icon: 'refresh-outline', label: 'Return policy', value: shop.returnPolicy } : null,
    shop.establishedYear ? { icon: 'ribbon-outline', label: 'Established', value: String(shop.establishedYear) } : null,
    {
      icon: shop.isVerified ? 'shield-checkmark' : 'shield-outline',
      label: 'Verification',
      value: shop.isVerified ? 'Business verified' : 'Not verified yet',
      valueColor: shop.isVerified ? colors.success : colors.textMuted,
    },
  ].filter(Boolean);

  const renderOpenPill = () =>
    isOpen == null ? null : (
      <View style={[styles.pill, { backgroundColor: isOpen ? colors.pastelGreen : colors.pastelRed }]}>
        {isOpen ? (
          <Ping size={6} color={colors.success} />
        ) : (
          <View style={[styles.pillDot, { backgroundColor: colors.danger }]} />
        )}
        <Text style={[styles.pillText, { color: isOpen ? colors.success : colors.danger }]}>
          {isOpen ? 'Open now' : 'Closed'}
        </Text>
      </View>
    );

  const metaParts = [
    `${listings.length}${pagingRef.current.hasMore ? '+' : ''} products`,
    distanceLabel ? `${distanceLabel} away` : sinceYear ? `Since ${sinceYear}` : null,
  ].filter(Boolean);

  const renderHero = () => (
    <View onLayout={(e) => setHeroHeight(e.nativeEvent.layout.height)} style={{ paddingTop: barHeight + 6 }}>
      <Reanimated.View entering={FadeIn.duration(220)} style={styles.identityCard}>
        <View style={styles.identityTop}>
          <View style={styles.appIconWrap}>
            <View style={styles.appIcon}>
              {logo ? (
                <Image source={{ uri: logo }} style={styles.fillImage} />
              ) : (
                <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.appIconFallback}>
                  <Text style={styles.appIconInitials}>{initials(shop.name)}</Text>
                </LinearGradient>
              )}
            </View>
            {shop.isVerified ? (
              <View style={styles.verifiedBadge}>
                <Icon name="checkmark" size={11} color="#FFFFFF" />
              </View>
            ) : null}
          </View>
          <View style={styles.identityCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {shop.name}
              </Text>
              {renderOpenPill()}
            </View>
            <View style={styles.metaLine}>
              <Icon name="star" size={11} color={colors.warning} />
              <Text style={styles.metaStrong}>{reviewCount ? rating.toFixed(1) : 'New'}</Text>
              {reviewCount ? <Text style={styles.metaText}>({reviewCount})</Text> : null}
              {metaParts.map((part) => (
                <Text key={part} style={styles.metaText} numberOfLines={1}>
                  {` · ${part}`}
                </Text>
              ))}
            </View>
            {placeText ? (
              <Pressable onPress={openDirections} style={styles.metaLine} hitSlop={4}>
                <Icon name="location" size={11} color={colors.primary} />
                <Text style={[styles.metaText, styles.metaFlex]} numberOfLines={1}>
                  {shop.category ? `${shop.category} · ` : ''}
                  {placeText}
                </Text>
              </Pressable>
            ) : shop.category ? (
              <Text style={styles.metaText} numberOfLines={1}>
                {shop.category}
              </Text>
            ) : null}
          </View>
        </View>
        {quickActions.length ? (
          <View style={styles.quickRow}>
            {quickActions.map((action, i) => (
              <PressableScale
                key={action.key}
                scaleTo={0.97}
                style={styles.quickItem}
                contentStyle={[styles.quickBtn, action.primary && styles.quickBtnPrimary]}
                onPress={action.onPress}
              >
                {chatBusy && (action.key === 'chat' || action.key === 'call') ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Icon name={action.icon} size={16} color={action.primary ? '#FFFFFF' : colors.primary} />
                )}
                <Text style={[styles.quickText, action.primary && styles.quickTextPrimary]} numberOfLines={1}>
                  {action.label}
                </Text>
              </PressableScale>
            ))}
          </View>
        ) : null}
      </Reanimated.View>
    </View>
  );

  const renderTabs = () => (
    <Animated.View
      onLayout={(e) => setTabsHeight(e.nativeEvent.layout.height)}
      style={[styles.tabWrap, { transform: [{ translateY: tabShift }] }]}
    >
      <View style={styles.tabBar}>
        <Animated.View style={[styles.tabIndicator, { width: tabWidth, transform: [{ translateX: tabSlide }] }]} />
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = t.key === 'products' ? listings.length : t.key === 'reviews' ? reviewCount : 0;
          return (
            <Pressable key={t.key} style={[styles.tabBtn, { width: tabWidth }]} onPress={() => setTab(t.key)}>
              <Icon name={active ? t.activeIcon : t.icon} size={14} color={active ? '#FFFFFF' : colors.textMuted} />
              <Text style={[styles.tabText, active && styles.tabTextActive]} numberOfLines={1}>
                {t.label}
              </Text>
              {count ? (
                <View style={[styles.tabCount, active && styles.tabCountActive]}>
                  <Text style={[styles.tabCountText, active && styles.tabCountTextActive]}>{count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Animated.View>
  );

  const renderProducts = () => (
    <View>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Icon name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search in ${shop.name}`}
            placeholderTextColor={colors.textMuted}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Icon name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
          <VoiceSearchToggle size={26} />
        </View>
        <Pressable onPress={cycleSort} style={[styles.sortBtn, sortKey !== 'newest' && styles.sortBtnActive]}>
          <Icon name="swap-vertical" size={14} color={sortKey !== 'newest' ? '#FFFFFF' : colors.text} />
          <Text style={[styles.sortBtnText, sortKey !== 'newest' && styles.sortBtnTextActive]} numberOfLines={1}>
            {SORTS.find((option) => option.key === sortKey)?.label || 'Newest'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.split} onLayout={(e) => setSplitTop(e.nativeEvent.layout.y)}>
        <Animated.View
          style={[styles.sidebar, { maxHeight: sidebarMaxHeight, transform: [{ translateY: sidebarPin }] }]}
        >
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} contentContainerStyle={styles.sidebarContent}>
            {categoryChips.map((cat) => {
              const active = cat.label === category;
              return (
                <Pressable
                  key={cat.label}
                  onPress={() => setCategory(cat.label)}
                  style={[styles.sideItem, active && styles.sideItemActive]}
                >
                  {active ? <View style={styles.sideIndicator} /> : null}
                  <View style={[styles.sideIcon, active && styles.sideIconActive]}>
                    {cat.imageUrl ? (
                      <Image source={{ uri: cat.imageUrl }} style={styles.fillImage} />
                    ) : (
                      <Icon name={cat.icon} size={16} color="#FFFFFF" />
                    )}
                  </View>
                  <Text style={[styles.sideLabel, active && styles.sideLabelActive]} numberOfLines={2}>
                    {cat.label}
                  </Text>
                  <Text style={styles.sideCount}>{cat.count}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Animated.View>

        <View style={styles.gridColumn}>
          {visibleListings.length === 0 ? (
            <View style={[styles.emptyBox, styles.emptyBoxGrid]}>
              <View style={styles.emptyIcon}>
                <Icon name="cube-outline" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.emptyTitle}>{listings.length ? 'No products match' : 'No products yet'}</Text>
              <Text style={styles.emptyBody}>
                {listings.length ? 'Try another search or category.' : "This shop hasn't added products yet."}
              </Text>
            </View>
          ) : (
            <LazyList
              data={visibleListings}
              columns={2}
              gap={GRID_GUTTER}
              style={styles.productGrid}
              estimatedRowHeight={compactCardLayout(cardWidth, { hideMeta: true }).height}
              renderItem={(listing, index, revisit) => {
                const id = listing._id || listing.id;
                const card = toCardItem({ ...listing, id });
                if (!card) return null;
                return (
                  <Reanimated.View key={String(id)} entering={revisit ? undefined : enterQuick(index)}>
                    <ProductCard
                      {...card}
                      condition={listing.condition}
                      postedAt={listing.createdAt}
                      compact
                      hideMeta
                      width={cardWidth}
                      onPress={() => openItemDetail(navigation, { listingId: id, item: listing })}
                    />
                  </Reanimated.View>
                );
              }}
            />
          )}
        </View>
      </View>
      {loadingMore ? (
        <View style={styles.loadMoreRow}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : null}
    </View>
  );

  const renderReviews = () => (
    <View style={styles.section}>
      <View style={styles.ratingCard}>
        <View style={styles.ratingBig}>
          <Text style={styles.ratingBigValue}>{reviewCount ? rating.toFixed(1) : '–'}</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Icon key={i} name={i <= Math.round(rating) ? 'star' : 'star-outline'} size={13} color={colors.warning} />
            ))}
          </View>
          <Text style={styles.ratingBigLabel}>{reviewCount} reviews</Text>
        </View>
        <View style={styles.bars}>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = ratingBars[star - 1];
            const pct = reviews.length ? count / reviews.length : 0;
            return (
              <View key={star} style={styles.barRow}>
                <Text style={styles.barLabel}>{star}</Text>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
                </View>
                <Text style={styles.barCount}>{count}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {reviews.length === 0 ? (
        <View style={styles.emptyBox}>
          <View style={styles.emptyIcon}>
            <Icon name="star-outline" size={22} color="#FFFFFF" />
          </View>
          <Text style={styles.emptyTitle}>No reviews yet</Text>
          <Text style={styles.emptyBody}>Reviews from buyers will appear here.</Text>
        </View>
      ) : (
        reviews.map((review, index) => (
          <Reanimated.View key={review._id} entering={enterQuick(index)} style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewAvatar}>
                {review.reviewer?.avatarUrl ? (
                  <Image source={{ uri: resolveMediaUrl(review.reviewer.avatarUrl) }} style={styles.fillImage} />
                ) : (
                  <Text style={styles.reviewInitials}>{initials(review.reviewer?.name || 'Buyer')}</Text>
                )}
              </View>
              <View style={styles.flex1}>
                <Text style={styles.reviewName} numberOfLines={1}>
                  {review.reviewer?.name || 'Buyer'}
                </Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Icon key={i} name={i <= review.rating ? 'star' : 'star-outline'} size={11} color={colors.warning} />
                  ))}
                </View>
              </View>
              <Text style={styles.reviewDate}>{timeAgo(review.createdAt)}</Text>
            </View>
            {review.review ? <Text style={styles.reviewText}>{review.review}</Text> : null}
            {review.listing?.title ? (
              <View style={styles.reviewItemRow}>
                <Icon name="bag-check-outline" size={12} color={colors.textMuted} />
                <Text style={styles.reviewItem} numberOfLines={1}>
                  Bought: {review.listing.title}
                </Text>
              </View>
            ) : null}
          </Reanimated.View>
        ))
      )}
    </View>
  );

  const renderCardHead = (icon, title, right = null) => (
    <View style={styles.cardHead}>
      <View style={styles.cardHeadIcon}>
        <Icon name={icon} size={14} color="#FFFFFF" />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
      {right}
    </View>
  );

  const renderAbout = () => (
    <View style={styles.section}>
      <Reanimated.View entering={enterQuick(0)} style={styles.card}>
        {renderCardHead('storefront', 'About the store')}
        {shop.tagline ? <Text style={styles.tagline}>{shop.tagline}</Text> : null}
        <Text style={styles.aboutText}>{shop.description?.trim() || 'No description provided.'}</Text>
        {SOCIAL_LINKS.some((s) => social[s.key]) ? (
          <View style={styles.socialRow}>
            {SOCIAL_LINKS.filter((s) => social[s.key]).map((s) => (
              <Pressable
                key={s.key}
                onPress={() => openLink(toUrl(social[s.key], s.base))}
                style={[styles.socialBtn, { backgroundColor: `${s.color}14` }]}
              >
                <Icon name={s.icon} size={18} color={s.color} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Reanimated.View>

      <Reanimated.View entering={enterQuick(1)} style={styles.card}>
        {renderCardHead('time', 'Opening hours', renderOpenPill())}
        <Text style={styles.hoursText}>{shop.openingHours || 'Hours not set'}</Text>
        <View style={styles.weekRow}>
          {WEEK_DAYS.map((day, i) => {
            const open = !shop.openDays?.length || shop.openDays.includes(day);
            const today = i === todayIndex;
            return (
              <View key={day} style={[styles.dayChip, open && styles.dayChipOpen, today && styles.dayChipToday]}>
                <Text style={[styles.dayText, open && styles.dayTextOpen]}>{day.slice(0, 2)}</Text>
              </View>
            );
          })}
        </View>
      </Reanimated.View>

      <Reanimated.View entering={enterQuick(2)} style={styles.card}>
        {renderCardHead('information-circle', 'Store details')}
        {infoRows.map((row, index) => (
          <Pressable
            key={row.label}
            style={[styles.infoRow, index < infoRows.length - 1 && styles.infoRowBorder]}
            onPress={row.onPress || undefined}
            disabled={!row.onPress}
          >
            <View style={styles.infoIcon}>
              <Icon name={row.icon} size={15} color="#FFFFFF" />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={[styles.infoValue, row.valueColor && { color: row.valueColor }]}>{row.value}</Text>
            </View>
            {row.onPress ? <Icon name="chevron-forward" size={15} color={colors.textMuted} /> : null}
          </Pressable>
        ))}
      </Reanimated.View>
    </View>
  );

  const btnStyle = styles.solidBtn;
  const btnIcon = colors.text;

  return (
    <View style={styles.root}>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <LazyScrollProvider value={lazyScroll.value}>
      <Animated.ScrollView
        ref={lazyScroll.scrollRef}
        onContentSizeChange={lazyScroll.onContentSizeChange}
        style={styles.flex1}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[1]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {renderHero()}
        {renderTabs()}
        <View onLayout={(e) => setProductsTop(e.nativeEvent.layout.y)}>
          {tab === 'products' ? renderProducts() : tab === 'reviews' ? renderReviews() : renderAbout()}
        </View>
      </Animated.ScrollView>
      </LazyScrollProvider>

      <View pointerEvents="box-none" style={[styles.topBar, { height: barHeight, paddingTop: insets.top }]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.topBarBg]} />
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={btnStyle}>
          <Icon name="chevron-back" size={22} color={btnIcon} />
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.topTitle, { opacity: titleOpacity }]}>
          <View style={styles.topLogo}>
            {logo ? (
              <Image source={{ uri: logo }} style={styles.fillImage} />
            ) : (
              <Text style={styles.topLogoText}>{initials(shop.name)}</Text>
            )}
          </View>
          <Text style={styles.topName} numberOfLines={1}>
            {shop.name}
          </Text>
        </Animated.View>
        <Pressable onPress={shareShop} hitSlop={10} style={btnStyle}>
          <Icon name="share-social-outline" size={18} color={btnIcon} />
        </Pressable>
        {!isOwner ? (
          <Pressable onPress={reportShop} hitSlop={10} style={btnStyle}>
            <Icon name="ellipsis-horizontal" size={18} color={btnIcon} />
          </Pressable>
        ) : null}
      </View>

    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex1: {
    flex: 1,
  },
  fillImage: {
    width: '100%',
    height: '100%',
  },
  skeletonWrap: {
    paddingHorizontal: GRID_PADDING,
    gap: 16,
    marginTop: 10,
  },
  skeletonBack: {
    position: 'absolute',
    left: 12,
  },
  skeletonCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 24,
    backgroundColor: colors.surface,
  },
  skeletonText: {
    flex: 1,
    gap: 8,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GUTTER,
  },
  loadMoreRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  topBarBg: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  solidBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topTitle: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  topLogo: {
    width: 30,
    height: 30,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  topLogoText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  topName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },


  identityCard: {
    marginHorizontal: GRID_PADDING,
    padding: 12,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  appIconWrap: {
    width: APP_ICON,
    height: APP_ICON,
  },
  appIcon: {
    width: APP_ICON,
    height: APP_ICON,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  appIconFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconInitials: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  verifiedBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    flexShrink: 1,
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: colors.text,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  tagline: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    fontStyle: 'italic',
    color: colors.textSecondary,
    marginBottom: 6,
  },


  tabWrap: {
    paddingTop: 8,
    paddingBottom: 6,
    paddingHorizontal: GRID_PADDING,
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabIndicator: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 3,
    borderRadius: 11,
    backgroundColor: colors.primary,
  },
  tabBtn: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    flexShrink: 1,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tabCount: {
    minWidth: 20,
    paddingHorizontal: 5,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  tabCountActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  tabCountText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.textMuted,
  },
  tabCountTextActive: {
    color: '#FFFFFF',
  },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: GRID_PADDING,
    paddingTop: 2,
    paddingBottom: 8,
  },
  searchBox: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 14,
    color: colors.text,
    minWidth: 0,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickItem: {
    flex: 1,
  },
  quickBtn: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  quickBtnPrimary: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  quickText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  quickTextPrimary: {
    color: '#FFFFFF',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  metaStrong: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.text,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
  metaFlex: {
    flex: 1,
  },
  sortBtn: {
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sortBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  sortBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  sortBtnTextActive: {
    color: '#FFFFFF',
  },
  split: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    zIndex: 2,
    backgroundColor: colors.surface,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sidebarContent: {
    paddingVertical: 4,
  },
  sideItem: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 2,
    marginHorizontal: 3,
    borderRadius: 12,
  },
  sideItemActive: {
    backgroundColor: colors.background,
  },
  sideIndicator: {
    position: 'absolute',
    left: -3,
    top: 8,
    bottom: 8,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: colors.primary,
  },
  sideIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  sideIconActive: {
    elevation: 3,
  },
  sideLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textAlign: 'center',
  },
  sideLabelActive: {
    color: colors.text,
    fontWeight: '800',
  },
  sideCount: {
    fontSize: 9.5,
    fontWeight: '700',
    color: colors.textMuted,
  },
  gridColumn: {
    flex: 1,
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GUTTER,
  },

  section: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 4,
    gap: 10,
  },
  ratingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ratingBig: {
    alignItems: 'center',
    gap: 3,
  },
  ratingBigValue: {
    fontSize: 36,
    fontWeight: '900',
    color: colors.text,
  },
  ratingBigLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 1,
  },
  bars: {
    flex: 1,
    gap: 5,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  barLabel: {
    width: 12,
    fontSize: 12,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  barTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.background,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.warning,
  },
  barCount: {
    width: 18,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  reviewCard: {
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 8,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  reviewAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  reviewInitials: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  reviewName: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.textMuted,
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  reviewItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  reviewItem: {
    flex: 1,
    fontSize: 12,
    color: colors.textMuted,
  },

  card: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  cardHeadIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.text,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  socialBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hoursText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  dayChip: {
    flex: 1,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dayChipOpen: {
    backgroundColor: colors.primary,
  },
  dayChipToday: {
    borderColor: colors.warning,
  },
  dayText: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
  },
  dayTextOpen: {
    color: '#FFFFFF',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBox: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 26,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyBoxGrid: {
    marginHorizontal: GRID_PADDING,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    backgroundColor: colors.primary,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },

});
