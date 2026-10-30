import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { FadeInDown, ZoomIn } from 'react-native-reanimated';
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
import ProductCard from '../components/ProductCard';
import { Ping, PressableScale, Reanimated, Shimmer, enterCard } from '../components/Motion';
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

const BANNER_HEIGHT = 200;
const TOP_BAR_HEIGHT = 52;
const APP_ICON = 84;
const GRID_GUTTER = 10;
const GRID_PADDING = 12;
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
  const { colors, isDarkMode } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
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
  const [solidBar, setSolidBar] = useState(false);
  const [heroHeight, setHeroHeight] = useState(560);
  const pagingRef = useRef({ shopId: null, page: 0, hasMore: false });
  const loadingMoreRef = useRef(false);
  const solidBarRef = useRef(false);
  const tabRef = useRef(tab);
  const scrollY = useRef(new Animated.Value(0)).current;
  const tabAnim = useRef(new Animated.Value(0)).current;
  const productPresets = useCategories('product');
  const bannerHeight = BANNER_HEIGHT + insets.top;
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
      damping: 18,
      stiffness: 190,
      mass: 0.7,
    }).start();
  }, [tab, tabAnim]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        listener: (event) => {
          const solid = event.nativeEvent.contentOffset.y > bannerHeight - barHeight - 40;
          if (solid !== solidBarRef.current) {
            solidBarRef.current = solid;
            setSolidBar(solid);
          }
          if (tabRef.current === 'products' && isNearEnd(event, 800)) loadMoreRef.current();
        },
      }),
    [scrollY, bannerHeight, barHeight]
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
    label: `Items of the shop ${shop?.name || 'open now'}`,
    value: query,
    onChange: setQuery,
  });

  const visibleListings = useMemo(() => {
    let list = listings.filter(
      (l) => (category === 'All' || l.category === category) && matchesQuery(l.title)
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
        <ThemeStatusBar variant="header" />
        <Skeleton width="100%" height={bannerHeight} borderRadius={0} />
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={10}
          style={[styles.glassBtn, styles.skeletonBack, { top: insets.top + 8 }]}
        >
          <Icon name="chevron-back" size={22} color="#FFFFFF" />
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
  const cover = shop.coverImage ? resolveMediaUrl(shop.coverImage) : '';
  const logo = shop.logo ? resolveMediaUrl(shop.logo) : '';
  const cardWidth = Math.floor((width - GRID_PADDING * 2 - GRID_GUTTER) / 2);
  const tabWidth = (width - 34) / TABS.length;
  const todayIndex = new Date().getDay();

  const bannerShift = scrollY.interpolate({
    inputRange: [-bannerHeight, 0, bannerHeight],
    outputRange: [-bannerHeight / 2, 0, bannerHeight * 0.3],
    extrapolateRight: 'clamp',
  });
  const bannerScale = scrollY.interpolate({
    inputRange: [-bannerHeight, 0],
    outputRange: [2, 1],
    extrapolate: 'clamp',
  });
  const barOpacity = scrollY.interpolate({
    inputRange: [bannerHeight - barHeight - 80, bannerHeight - barHeight - 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const tabShift = scrollY.interpolate({
    inputRange: [heroHeight - barHeight, heroHeight],
    outputRange: [0, barHeight],
    extrapolate: 'clamp',
  });
  const tabSlide = tabAnim.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, tabWidth, tabWidth * 2],
  });

  const openChat = async () => {
    if (chatBusy || !ownerId) return;
    setChatBusy(true);
    const { data, error } = await api.createChat({ userId: ownerId });
    setChatBusy(false);
    if (error) {
      Alert.alert('Chat failed', error);
      return;
    }
    navigation.navigate(ROUTES.CHAT, {
      chatId: data.chat.id,
      name: shop.name,
      otherUserId: data.chat.otherUser?.id || ownerId,
      image: resolveMediaUrl(shop.logo || ''),
    });
  };

  const startChat = () => requireLogin('chat', openChat);

  const callShop = () => {
    if (shop.phone) Linking.openURL(`tel:${shop.phone}`).catch(() => {});
  };

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
        { key: 'edit', icon: 'create-outline', label: 'Edit shop', onPress: () => navigation.navigate(ROUTES.EDIT_SHOP) },
        { key: 'stats', icon: 'analytics-outline', label: 'Stats', onPress: () => navigation.navigate(ROUTES.SHOP_DASHBOARD) },
        { key: 'qr', icon: 'qr-code-outline', label: 'Store QR', onPress: () => navigation.navigate(ROUTES.SHOP_STOREFRONT_QR) },
        { key: 'share', icon: 'share-social-outline', label: 'Share', onPress: shareShop },
      ]
    : [
        shop.phone ? { key: 'call', icon: 'call-outline', label: 'Call', onPress: callShop } : null,
        shop.whatsapp
          ? { key: 'whatsapp', icon: 'logo-whatsapp', label: 'WhatsApp', onPress: () => openLink(whatsappUrl(shop.whatsapp)) }
          : null,
        placeText || hasCoords ? { key: 'map', icon: 'navigate-outline', label: 'Directions', onPress: openDirections } : null,
        { key: 'share', icon: 'share-social-outline', label: 'Share', onPress: shareShop },
      ].filter(Boolean);

  const stats = [
    {
      key: 'rating',
      icon: 'star',
      value: reviewCount ? rating.toFixed(1) : 'New',
      label: reviewCount ? `${reviewCount} review${reviewCount === 1 ? '' : 's'}` : 'Rating',
    },
    {
      key: 'products',
      icon: 'cube',
      value: `${listings.length}${pagingRef.current.hasMore ? '+' : ''}`,
      label: 'Products',
    },
    distanceLabel
      ? { key: 'distance', icon: 'navigate', value: distanceLabel, label: 'Away' }
      : { key: 'since', icon: 'calendar', value: sinceYear || '–', label: 'On KinBech' },
  ];

  const highlights = [
    shop.isVerified ? { icon: 'shield-checkmark', text: 'Verified business' } : null,
    shop.deliveryAvailable ? { icon: 'bicycle', text: 'Home delivery' } : { icon: 'walk', text: 'Pickup & meetup' },
    shop.paymentMethods?.length ? { icon: 'wallet', text: shop.paymentMethods.slice(0, 3).join(' · ') } : null,
    shop.returnPolicy ? { icon: 'refresh', text: 'Returns accepted' } : null,
    shop.establishedYear ? { icon: 'ribbon', text: `Since ${shop.establishedYear}` } : null,
  ].filter(Boolean);

  const infoRows = [
    placeText ? { icon: 'location-outline', label: 'Address', value: placeText, onPress: openDirections } : null,
    shop.phone ? { icon: 'call-outline', label: 'Phone', value: shop.phone, onPress: isOwner ? null : callShop } : null,
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

  const renderHero = () => (
    <View onLayout={(e) => setHeroHeight(e.nativeEvent.layout.height)}>
      <Animated.View
        style={[styles.banner, { height: bannerHeight, transform: [{ translateY: bannerShift }, { scale: bannerScale }] }]}
      >
        {cover ? (
          <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        ) : (
          <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill}>
            <View style={styles.bannerArt}>
              <Icon name="storefront" size={170} color="rgba(255,255,255,0.08)" />
            </View>
            <Text style={[styles.bannerWatermark, { top: insets.top + 56 }]} numberOfLines={1}>
              {shop.name}
            </Text>
          </LinearGradient>
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.3)']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
        <Shimmer duration={2600} pause={2600} color="rgba(255,255,255,0.12)" />
      </Animated.View>

      <Reanimated.View entering={FadeInDown.delay(60).springify().damping(16)} style={styles.identityCard}>
        <View style={styles.identityTop}>
          <Reanimated.View entering={ZoomIn.delay(200).springify().damping(11)} style={styles.appIconWrap}>
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
                <Icon name="checkmark" size={12} color="#FFFFFF" />
              </View>
            ) : null}
          </Reanimated.View>
          <View style={styles.identityCopy}>
            <Text style={styles.name} numberOfLines={2}>
              {shop.name}
            </Text>
            <Text style={styles.subline} numberOfLines={1}>
              {shop.category || 'Local store'}
              {shop.isVerified ? ' · Verified' : ''}
            </Text>
            <View style={styles.pillRow}>
              <View style={[styles.pill, styles.pillStore]}>
                <Icon name="storefront" size={10} color="#FFFFFF" />
                <Text style={[styles.pillText, styles.pillStoreText]}>STORE</Text>
              </View>
              {renderOpenPill()}
            </View>
          </View>
        </View>

        {shop.tagline ? (
          <Text style={styles.tagline} numberOfLines={3}>
            {shop.tagline}
          </Text>
        ) : null}

        <View style={styles.statsRow}>
          {stats.map((s, i) => (
            <View key={s.key} style={[styles.stat, i > 0 && styles.statDivider]}>
              <View style={styles.statTop}>
                <Icon name={s.icon} size={14} color={s.key === 'rating' ? colors.warning : colors.primary} />
                <Text style={styles.statValue} numberOfLines={1}>
                  {s.value}
                </Text>
              </View>
              <Text style={styles.statLabel} numberOfLines={1}>
                {s.label}
              </Text>
            </View>
          ))}
        </View>

        {placeText ? (
          <Pressable onPress={openDirections} style={styles.addressRow}>
            <View style={styles.addressIcon}>
              <Icon name="location" size={14} color="#FFFFFF" />
            </View>
            <Text style={styles.addressText} numberOfLines={1}>
              {placeText}
            </Text>
            {distanceLabel ? <Text style={styles.addressDistance}>{distanceLabel}</Text> : null}
            <Icon name="chevron-forward" size={14} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </Reanimated.View>

      <View style={styles.quickRow}>
        {quickActions.map((action, i) => (
          <PressableScale
            key={action.key}
            entering={enterCard(i, 60)}
            style={styles.quickItem}
            contentStyle={styles.quickInner}
            onPress={action.onPress}
          >
            <View style={styles.quickIcon}>
              <Icon name={action.icon} size={20} color="#FFFFFF" />
            </View>
            <Text style={styles.quickLabel} numberOfLines={1}>
              {action.label}
            </Text>
          </PressableScale>
        ))}
      </View>

      {highlights.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightRow}>
          {highlights.map((h, i) => (
            <Reanimated.View key={h.text} entering={enterCard(i, 50)} style={styles.highlight}>
              <View style={styles.highlightIcon}>
                <Icon name={h.icon} size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.highlightText} numberOfLines={1}>
                {h.text}
              </Text>
            </Reanimated.View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );

  const renderTabs = () => (
    <Animated.View style={[styles.tabWrap, { transform: [{ translateY: tabShift }] }]}>
      <View style={styles.tabBar}>
        <Animated.View style={[styles.tabIndicator, { width: tabWidth, transform: [{ translateX: tabSlide }] }]} />
        {TABS.map((t) => {
          const active = tab === t.key;
          const count = t.key === 'products' ? listings.length : t.key === 'reviews' ? reviewCount : 0;
          return (
            <Pressable key={t.key} style={[styles.tabBtn, { width: tabWidth }]} onPress={() => setTab(t.key)}>
              <Icon name={active ? t.activeIcon : t.icon} size={15} color={active ? '#FFFFFF' : colors.textMuted} />
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
          <VoiceSearchToggle size={28} />
        </View>
      </View>

      {categoryChips.length > 2 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
          {categoryChips.map((cat) => {
            const active = cat.label === category;
            return (
              <Pressable
                key={cat.label}
                onPress={() => setCategory(cat.label)}
                style={[styles.catChip, active && styles.catChipActive]}
              >
                <View style={[styles.catIcon, active && styles.catIconActive]}>
                  {cat.imageUrl ? (
                    <Image source={{ uri: cat.imageUrl }} style={styles.fillImage} />
                  ) : (
                    <Icon name={cat.icon} size={14} color={active ? colors.primary : '#FFFFFF'} />
                  )}
                </View>
                <Text style={[styles.catLabel, active && styles.catLabelActive]} numberOfLines={1}>
                  {cat.label}
                </Text>
                <Text style={[styles.catCount, active && styles.catCountActive]}>{cat.count}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.sortBar}>
        <Text style={styles.resultText}>
          {visibleListings.length} {visibleListings.length === 1 ? 'item' : 'items'}
        </Text>
        <View style={styles.sortChips}>
          {SORTS.map((option) => {
            const active = sortKey === option.key;
            return (
              <Pressable
                key={option.key}
                style={[styles.sortChip, active && styles.sortChipActive]}
                onPress={() => setSortKey(option.key)}
              >
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {visibleListings.length === 0 ? (
        <View style={[styles.emptyBox, styles.emptyBoxInset]}>
          <View style={styles.emptyIcon}>
            <Icon name="cube-outline" size={22} color="#FFFFFF" />
          </View>
          <Text style={styles.emptyTitle}>{listings.length ? 'No products match' : 'No products yet'}</Text>
          <Text style={styles.emptyBody}>
            {listings.length ? 'Try another search or category.' : "This shop hasn't added products yet."}
          </Text>
        </View>
      ) : (
        <View style={styles.productGrid}>
          {visibleListings.map((listing, index) => {
            const id = listing._id || listing.id;
            const card = toCardItem({ ...listing, id });
            if (!card) return null;
            return (
              <Reanimated.View key={String(id)} entering={enterCard(index)}>
                <ProductCard
                  {...card}
                  condition={listing.condition}
                  postedAt={listing.createdAt}
                  compact
                  width={cardWidth}
                  onPress={() => openItemDetail(navigation, { listingId: id, item: listing })}
                />
              </Reanimated.View>
            );
          })}
        </View>
      )}
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
          <Reanimated.View key={review._id} entering={enterCard(index)} style={styles.reviewCard}>
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
      <Reanimated.View entering={enterCard(0)} style={styles.card}>
        {renderCardHead('storefront', 'About the store')}
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

      <Reanimated.View entering={enterCard(1)} style={styles.card}>
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

      <Reanimated.View entering={enterCard(2)} style={styles.card}>
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

  const btnStyle = solidBar ? styles.solidBtn : styles.glassBtn;
  const btnIcon = solidBar ? colors.text : '#FFFFFF';

  return (
    <View style={styles.root}>
      <StatusBar style={solidBar ? (isDarkMode ? 'light' : 'dark') : 'light'} />
      <Animated.ScrollView
        style={styles.flex1}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        stickyHeaderIndices={[1]}
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {renderHero()}
        {renderTabs()}
        <View>{tab === 'products' ? renderProducts() : tab === 'reviews' ? renderReviews() : renderAbout()}</View>
      </Animated.ScrollView>

      <View pointerEvents="box-none" style={[styles.topBar, { height: barHeight, paddingTop: insets.top }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.topBarBg, { opacity: barOpacity }]} />
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={btnStyle}>
          <Icon name="chevron-back" size={22} color={btnIcon} />
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.topTitle, { opacity: barOpacity }]}>
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

      <Reanimated.View
        entering={FadeInDown.delay(350).springify().damping(16)}
        style={[styles.bottomBar, { paddingBottom: insets.bottom + 10 }]}
      >
        {isOwner ? (
          <PressableScale
            style={styles.flex1}
            contentStyle={styles.ctaBtn}
            onPress={() => navigation.navigate(ROUTES.SHOP_POST_LISTING)}
          >
            <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
            <Shimmer duration={2000} pause={2200} />
            <Icon name="add-circle" size={20} color="#FFFFFF" />
            <Text style={styles.ctaText}>Add product</Text>
          </PressableScale>
        ) : (
          <>
            {shop.phone ? (
              <PressableScale contentStyle={styles.ctaIconBtn} onPress={callShop}>
                <Icon name="call" size={20} color={colors.primary} />
              </PressableScale>
            ) : null}
            <PressableScale style={styles.flex1} contentStyle={styles.ctaBtn} onPress={startChat} disabled={chatBusy}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
              <Shimmer duration={2000} pause={2200} />
              {chatBusy ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Icon name="chatbubble-ellipses" size={19} color="#FFFFFF" />
              )}
              <Text style={styles.ctaText}>{chatBusy ? 'Opening chat…' : 'Chat with store'}</Text>
            </PressableScale>
          </>
        )}
      </Reanimated.View>
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
    marginTop: -44,
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
  glassBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15,23,42,0.38)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
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

  banner: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#065F46',
  },
  bannerArt: {
    position: 'absolute',
    right: -24,
    bottom: -30,
    transform: [{ rotate: '-12deg' }],
  },
  bannerWatermark: {
    position: 'absolute',
    left: 18,
    right: 18,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -0.5,
    color: 'rgba(255,255,255,0.16)',
  },

  identityCard: {
    marginTop: -64,
    marginHorizontal: GRID_PADDING,
    padding: 14,
    gap: 12,
    borderRadius: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  identityTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  appIconWrap: {
    width: APP_ICON,
    height: APP_ICON,
  },
  appIcon: {
    width: APP_ICON,
    height: APP_ICON,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.surface,
    backgroundColor: colors.background,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  appIconFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appIconInitials: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  verifiedBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2.5,
    borderColor: colors.surface,
  },
  identityCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 21,
    lineHeight: 25,
    fontWeight: '900',
    letterSpacing: -0.3,
    color: colors.text,
  },
  subline: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textMuted,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  pillStore: {
    backgroundColor: colors.primary,
  },
  pillStoreText: {
    color: '#FFFFFF',
    letterSpacing: 0.6,
  },
  tagline: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '900',
    color: colors.text,
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addressIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  addressDistance: {
    fontSize: 12.5,
    fontWeight: '800',
    color: colors.primary,
  },

  quickRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: GRID_PADDING,
    marginTop: 14,
  },
  quickItem: {
    flex: 1,
  },
  quickInner: {
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  quickLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  highlightRow: {
    gap: 8,
    paddingHorizontal: GRID_PADDING,
    paddingTop: 12,
    paddingBottom: 2,
  },
  highlight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 5,
    paddingRight: 11,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  highlightIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  highlightText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },

  tabWrap: {
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 12,
    backgroundColor: colors.background,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabIndicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  tabBtn: {
    height: 38,
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
    paddingHorizontal: GRID_PADDING,
    paddingTop: 4,
  },
  searchBox: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: 22,
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
  catRow: {
    gap: 8,
    paddingHorizontal: GRID_PADDING,
    paddingTop: 12,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingLeft: 5,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  catIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  catIconActive: {
    backgroundColor: '#FFFFFF',
  },
  catLabel: {
    maxWidth: 130,
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  catLabelActive: {
    color: '#FFFFFF',
  },
  catCount: {
    fontSize: 11.5,
    fontWeight: '800',
    color: colors.textMuted,
  },
  catCountActive: {
    color: 'rgba(255,255,255,0.85)',
  },
  sortBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID_PADDING,
    paddingVertical: 12,
  },
  resultText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  sortChips: {
    flexDirection: 'row',
    gap: 6,
  },
  sortChip: {
    paddingHorizontal: 11,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: colors.text,
    borderColor: colors.text,
  },
  sortChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  sortChipTextActive: {
    color: colors.background,
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
  emptyBoxInset: {
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

  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: GRID_PADDING,
    paddingTop: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  ctaIconBtn: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  ctaBtn: {
    height: 52,
    borderRadius: 18,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
