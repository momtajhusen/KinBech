import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon';
import * as Location from 'expo-location';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductCardSkeleton, Skeleton } from '../components/SkeletonLoader';
import { isNearEnd } from '../utils/scroll';
import VoiceSearchButton from '../components/VoiceSearchButton';
import EmptyState from '../components/EmptyState';
import ProductCard from '../components/ProductCard';
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

const LOGO_SIZE = 48;
const SIDEBAR_WIDTH = 62;
const GRID_GUTTER = 8;
const GRID_PADDING = 10;
const SHOP_PAGE = 30;

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

export default function ShopProfileScreen({ route, navigation }) {
  const { colors } = useTheme();
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
  const pagingRef = useRef({ shopId: null, page: 0, hasMore: false });
  const loadingMoreRef = useRef(false);
  const productPresets = useCategories('product');

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

  const { refreshing, onRefresh } = usePullRefresh(() => loadShopData({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadShopData();
      if (shopId) pinnedStoresUtils.incrementUsage(shopId).catch(() => {});
    }, [loadShopData, shopId])
  );

  const sidebarCategories = useMemo(() => {
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
          tint: preset?.tint || preset?.color || '#F59E0B',
          imageUrl: preset?.imageUrl || '',
          count: counts[label],
        };
      })
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
    return [
      { label: 'All', icon: 'grid-outline', tint: '#047857', imageUrl: '', count: listings.length },
      ...items,
    ];
  }, [listings, productPresets]);

  useEffect(() => {
    if (category !== 'All' && !sidebarCategories.some((item) => item.label === category)) {
      setCategory('All');
    }
  }, [category, sidebarCategories]);

  const visibleListings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    let list = listings.filter(
      (l) =>
        (category === 'All' || l.category === category) &&
        (!needle || String(l.title || '').toLowerCase().includes(needle))
    );
    if (sortKey === 'price_low') list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sortKey === 'price_high') list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    return list;
  }, [listings, query, category, sortKey]);

  const ratingBars = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    reviews.forEach((r) => {
      const star = Math.min(5, Math.max(1, Math.round(Number(r.rating) || 0)));
      counts[star - 1] += 1;
    });
    return counts;
  }, [reviews]);

  if (loading && !shop) {
    const skeletonCard = Math.floor((width - 36) / 2);
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <View style={[styles.skeletonWrap, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.skeletonBack}>
            <Icon name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <Skeleton width="100%" height={140} borderRadius={18} />
          <View style={styles.skeletonRow}>
            <Skeleton width={56} height={56} borderRadius={28} />
            <View style={styles.skeletonText}>
              <Skeleton width="60%" height={16} borderRadius={6} />
              <Skeleton width="40%" height={12} borderRadius={6} />
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
  const cardWidth = Math.floor((width - SIDEBAR_WIDTH - GRID_PADDING * 2 - GRID_GUTTER) / 2);

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

  const actions = isOwner
    ? [
        { key: 'edit', icon: 'create-outline', label: 'Edit shop', primary: true, onPress: () => navigation.navigate(ROUTES.EDIT_SHOP) },
        { key: 'stats', icon: 'analytics-outline', label: 'Stats', onPress: () => navigation.navigate(ROUTES.SHOP_DASHBOARD) },
        { key: 'qr', icon: 'qr-code-outline', label: 'QR', onPress: () => navigation.navigate(ROUTES.SHOP_STOREFRONT_QR) },
        { key: 'share', icon: 'share-social-outline', label: 'Share', onPress: shareShop },
      ]
    : [
        { key: 'chat', icon: 'chatbubble-ellipses-outline', label: chatBusy ? 'Opening…' : 'Chat', primary: true, onPress: startChat },
        { key: 'share', icon: 'share-social-outline', label: 'Share', onPress: shareShop },
      ];

  const stats = [
    { label: reviewCount ? `${reviewCount} reviews` : 'No reviews', value: reviewCount ? rating.toFixed(1) : '–', icon: 'star', tint: colors.warning },
    { label: 'Products', value: listings.length, icon: 'cube-outline', tint: colors.primary },
    { label: 'Since', value: sinceYear || '–', icon: 'calendar-outline', tint: colors.menuBlue },
  ];

  const renderProducts = () => (
    <View style={styles.catalog}>
      <View style={styles.sidebar}>
        <ScrollView
          style={styles.sidebarList}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.sidebarContent, { paddingBottom: insets.bottom }]}
        >
          {sidebarCategories.map((cat) => {
            const isActive = cat.label === category;
            const tint = cat.tint || colors.primary;
            return (
              <Pressable
                key={cat.label}
                style={[styles.sideItem, isActive && styles.sideItemActive]}
                onPress={() => setCategory(cat.label)}
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
                    <Icon name={cat.icon} size={16} color={isActive ? '#FFFFFF' : tint} />
                  )}
                </View>
                <Text numberOfLines={2} style={[styles.sideLabel, isActive && styles.sideLabelActive]}>
                  {cat.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.mainContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
        scrollEventThrottle={100}
        onScroll={(event) => {
          if (isNearEnd(event, 800)) loadMoreListings();
        }}
      >
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Icon name="search" size={15} color={colors.textMuted} />
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
            <VoiceSearchButton color={colors.textMuted} size={18} onResult={(text) => setQuery(text)} />
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.sortScroll}
          contentContainerStyle={styles.sortRow}
        >
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
        </ScrollView>

        {visibleListings.length === 0 ? (
          <View style={[styles.emptyBox, styles.emptyBoxInset]}>
            <Icon name="cube-outline" size={22} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>
              {listings.length ? 'No products match' : 'No products yet'}
            </Text>
            <Text style={styles.emptyBody}>
              {listings.length ? 'Try another search or category.' : "This shop hasn't added products yet."}
            </Text>
          </View>
        ) : (
          <View style={styles.productGrid}>
            {visibleListings.map((listing) => {
              const id = listing._id || listing.id;
              const card = toCardItem({ ...listing, id });
              if (!card) return null;
              return (
                <ProductCard
                  key={String(id)}
                  {...card}
                  condition={listing.condition}
                  postedAt={listing.createdAt}
                  compact
                  width={cardWidth}
                  onPress={() => openItemDetail(navigation, { listingId: id, item: listing })}
                />
              );
            })}
          </View>
        )}
        {loadingMore ? (
          <View style={styles.loadMoreRow}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );

  const renderReviews = () => (
    <View style={styles.section}>
      <View style={styles.ratingCard}>
        <View style={styles.ratingBig}>
          <Text style={styles.ratingBigValue}>{reviewCount ? rating.toFixed(1) : '–'}</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Icon
                key={i}
                name={i <= Math.round(rating) ? 'star' : 'star-outline'}
                size={12}
                color={colors.warning}
              />
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
          <Icon name="star-outline" size={22} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No reviews yet</Text>
          <Text style={styles.emptyBody}>Reviews from buyers will appear here.</Text>
        </View>
      ) : (
        reviews.map((review) => (
          <View key={review._id} style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <View style={styles.reviewAvatar}>
                {review.reviewer?.avatarUrl ? (
                  <Image source={{ uri: resolveMediaUrl(review.reviewer.avatarUrl) }} style={styles.fillImage} />
                ) : (
                  <Icon name="person" size={14} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.flex1}>
                <Text style={styles.reviewName} numberOfLines={1}>
                  {review.reviewer?.name || 'Buyer'}
                </Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Icon
                      key={i}
                      name={i <= review.rating ? 'star' : 'star-outline'}
                      size={10}
                      color={colors.warning}
                    />
                  ))}
                </View>
              </View>
              <Text style={styles.reviewDate}>{timeAgo(review.createdAt)}</Text>
            </View>
            {review.review ? <Text style={styles.reviewText}>{review.review}</Text> : null}
            {review.listing?.title ? (
              <Text style={styles.reviewItem} numberOfLines={1}>
                Bought: {review.listing.title}
              </Text>
            ) : null}
          </View>
        ))
      )}
    </View>
  );

  const infoRows = [
    {
      icon: 'time-outline',
      label: 'Opening hours',
      value: shop.openingHours || 'Not set',
      extra: isOpen == null ? null : isOpen ? 'Open now' : 'Closed',
      extraColor: isOpen ? colors.success : colors.danger,
    },
    shop.openDays?.length && shop.openDays.length < 7
      ? { icon: 'calendar-number-outline', label: 'Open on', value: shop.openDays.join(', ') }
      : null,
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

  const renderStoreSummary = () => (
    <View style={styles.summary}>
      {shop.tagline ? (
        <Text style={styles.tagline} numberOfLines={2}>
          {shop.tagline}
        </Text>
      ) : null}
      <View style={styles.metaRow}>
        <View style={styles.storeTag}>
          <Icon name="storefront" size={10} color={colors.onPrimary} />
          <Text style={styles.storeTagText}>STORE</Text>
        </View>
        {shop.category ? <Text style={styles.metaText}>{shop.category}</Text> : null}
        {shop.isVerified ? <Text style={styles.verifiedText}>Business verified</Text> : null}
        {shop.deliveryAvailable ? (
          <View style={styles.deliveryTag}>
            <Icon name="bicycle" size={10} color={colors.menuBlue} />
            <Text style={styles.deliveryTagText}>Delivery</Text>
          </View>
        ) : null}
      </View>
      {placeText || distanceLabel ? (
        <View style={styles.locationRow}>
          <Icon name="location-outline" size={14} color={colors.textMuted} />
          {placeText ? (
            <Text style={styles.locationText} numberOfLines={1}>{placeText}</Text>
          ) : null}
          {distanceLabel ? (
            <Text style={styles.distanceText}>{placeText ? `· ${distanceLabel}` : distanceLabel}</Text>
          ) : null}
        </View>
      ) : null}
      <View style={styles.statsCard}>
        {stats.map((s, i) => (
          <View key={s.label} style={[styles.stat, i > 0 && styles.statDivider]}>
            <View style={styles.statTop}>
              <Icon name={s.icon} size={14} color={s.tint} />
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
            <Text style={styles.statLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );

  const renderAbout = () => (
    <View style={styles.section}>
      {renderStoreSummary()}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>About</Text>
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
      </View>
      <View style={styles.card}>
        {infoRows.map((row, index) => (
          <Pressable
            key={row.label}
            style={[styles.infoRow, index < infoRows.length - 1 && styles.infoRowBorder]}
            onPress={row.onPress || undefined}
            disabled={!row.onPress}
          >
            <View style={styles.infoIcon}>
              <Icon name={row.icon} size={15} color={colors.primary} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={[styles.infoValue, row.valueColor && { color: row.valueColor }]}>{row.value}</Text>
            </View>
            {row.extra ? (
              <Text style={[styles.infoExtra, { color: row.extraColor }]}>{row.extra}</Text>
            ) : null}
            {row.onPress ? <Icon name="chevron-forward" size={15} color={colors.textMuted} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.topBar}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.topBtn}>
            <Icon name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.topBarSpacer} />
          <Pressable onPress={shareShop} hitSlop={10} style={styles.topBtn}>
            <Icon name="share-social-outline" size={18} color={colors.text} />
          </Pressable>
          {!isOwner ? (
            <Pressable
              onPress={() => requireLogin('report', () => navigation.navigate(ROUTES.REPORT_BLOCK, { userId: ownerId }))}
              hitSlop={10}
              style={styles.topBtn}
            >
              <Icon name="ellipsis-horizontal" size={18} color={colors.text} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.identityRow}>
          <View style={styles.logo}>
            {shop.logo ? (
              <Image source={{ uri: resolveMediaUrl(shop.logo) }} style={styles.fillImage} />
            ) : (
              <Icon name="storefront" size={22} color={colors.primary} />
            )}
          </View>
          <View style={styles.headerCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{shop.name}</Text>
              {shop.isVerified ? <Icon name="shield-checkmark" size={16} color={colors.primary} /> : null}
            </View>
            <View style={styles.detailRow}>
              <Icon name="star" size={13} color={colors.warning} />
              <Text style={styles.detailStrong}>{reviewCount ? rating.toFixed(1) : 'New'}</Text>
              {shop.category ? (
                <Text style={styles.detailMuted} numberOfLines={1}>· {shop.category}</Text>
              ) : <View style={styles.flex1} />}
              {isOpen != null ? (
                <View style={[styles.openPill, { backgroundColor: isOpen ? colors.pastelGreen : colors.pastelRed }]}>
                  <View style={[styles.openDot, { backgroundColor: isOpen ? colors.success : colors.danger }]} />
                  <Text style={[styles.openText, { color: isOpen ? colors.success : colors.danger }]}>
                    {isOpen ? 'Open' : 'Closed'}
                  </Text>
                </View>
              ) : null}
            </View>
            {placeText || distanceLabel ? (
              <View style={styles.locationRow}>
                <Icon name="location-outline" size={14} color={colors.textMuted} />
                {placeText ? (
                  <Text style={styles.locationText} numberOfLines={1}>{placeText}</Text>
                ) : null}
                {distanceLabel ? (
            <Text style={styles.distanceText}>{placeText ? `· ${distanceLabel}` : distanceLabel}</Text>
          ) : null}
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.contactRow}>
          {(() => {
            const rowItems = [
              {
                key: 'products',
                icon: 'grid-outline',
                label: 'Items',
                onPress: () => setTab('products'),
              },
              ...actions
                .filter((action) => action.key !== 'share')
                .map((action) => ({
                  ...action,
                  label: action.key === 'edit' ? 'Edit' : action.label,
                })),
              {
                key: 'reviews',
                icon: 'star-outline',
                label: 'Reviews',
                onPress: () => setTab('reviews'),
              },
              {
                key: 'about',
                icon: 'information-circle-outline',
                label: 'About',
                onPress: () => setTab('about'),
              },
            ];
            const rowGap = 6;
            const rowWidth = width - 24;
            const buttonWidth = Math.floor((rowWidth - rowGap * (rowItems.length - 1)) / rowItems.length);
            return rowItems.map((action) => {
            const isCall = action.key === 'call';
            const selected = action.key === tab;
            const filled = (action.primary || isCall) && !selected;
            const iconName = selected && action.key === 'reviews'
              ? 'star'
              : selected && action.key === 'products'
                ? 'grid'
                : action.icon;
            return (
              <Pressable
                key={action.key}
                accessibilityLabel={action.label}
                style={[
                  styles.contactBtn,
                  { width: buttonWidth, height: Math.min(buttonWidth, 40) },
                  filled && action.primary && styles.contactBtnPrimary,
                  filled && isCall && styles.contactBtnCall,
                  selected && styles.contactBtnSelected,
                ]}
                onPress={action.onPress}
              >
                <Icon
                  name={iconName}
                  size={18}
                  color={filled ? '#fff' : selected ? colors.primary : colors.text}
                />
              </Pressable>
            );
            });
          })()}
        </View>
      </View>

        {tab === 'products' ? (
          renderProducts()
        ) : (
          <ScrollView
            style={styles.mainContent}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
            refreshControl={refreshControl(colors, refreshing, onRefresh)}
          >
            {tab === 'reviews' ? renderReviews() : renderAbout()}
          </ScrollView>
        )}
    </View>
  );
}

const createStyles = (colors) => ({
  skeletonWrap: {
    paddingHorizontal: 14,
    gap: 14,
  },
  skeletonBack: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  skeletonText: {
    flex: 1,
    gap: 8,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  loadMoreRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },
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
  header: {
    paddingHorizontal: 12,
    paddingBottom: 14,
    gap: 12,
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarSpacer: {
    flex: 1,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  detailStrong: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  detailMuted: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  topBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contactBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  contactBtnPrimary: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  contactBtnCall: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  contactText: {
    width: '100%',
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
  },
  contactTextFilled: {
    color: '#fff',
  },
  contactBtnSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  contactTextSelected: {
    color: colors.primary,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  socialBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    gap: 8,
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pastelGreen,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openPill: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  openDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  openText: {
    fontSize: 12,
    fontWeight: '800',
  },
  name: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    minWidth: 0,
  },
  tagline: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  deliveryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.pastelBlue,
  },
  deliveryTagText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.menuBlue,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
  },
  storeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  storeTagText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: colors.onPrimary,
  },
  metaText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  locationText: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.textMuted,
  },
  distanceText: {
    flexShrink: 0,
    fontSize: 13,
    fontWeight: '700',
    color: colors.primary,
  },
  statsCard: {
    flexDirection: 'row',
    marginTop: 0,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 0,
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 0,
  },
  actionBtn: {
    flex: 1,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  actionBtnPrimary: {
    flex: 1.4,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  actionText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text,
    minWidth: 0,
  },
  actionTextPrimary: {
    color: colors.onPrimary,
    minWidth: 0,
  },
  tabsTrack: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    padding: 3,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.iconBackground,
  },
  tabBtn: {
    flex: 1,
    height: 34,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabTextActive: {
    color: colors.onPrimary,
    minWidth: 0,
  },
  catalog: {
    flex: 1,
    flexDirection: 'row',
    marginTop: 10,
  },
  sidebar: {
    width: SIDEBAR_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderTopRightRadius: 22,
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
  mainContent: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: GRID_PADDING,
    paddingTop: 0,
  },
  searchBox: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 20,
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
  sortScroll: {
    flexGrow: 0,
  },
  sortRow: {
    paddingHorizontal: GRID_PADDING,
    paddingVertical: 8,
    gap: 6,
    alignItems: 'center',
  },
  sortChip: {
    paddingHorizontal: 11,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  sortChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  sortChipTextActive: {
    color: '#fff',
  },
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GUTTER,
  },
  section: {
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 8,
  },
  ratingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  ratingBig: {
    alignItems: 'center',
    gap: 2,
  },
  ratingBigValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    minWidth: 0,
  },
  ratingBigLabel: {
    fontSize: 12,
    color: colors.textMuted,
    minWidth: 0,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 1,
  },
  bars: {
    flex: 1,
    gap: 3,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  barLabel: {
    width: 12,
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    minWidth: 0,
  },
  barTrack: {
    flex: 1,
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
    backgroundColor: colors.iconBackground,
  },
  barFill: {
    height: '100%',
    borderRadius: 2.5,
    backgroundColor: colors.warning,
  },
  barCount: {
    width: 16,
    textAlign: 'right',
    fontSize: 12,
    color: colors.textMuted,
  },
  reviewCard: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 5,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reviewAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  reviewName: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    minWidth: 0,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.textMuted,
    minWidth: 0,
  },
  reviewText: {
    fontSize: 14,
    lineHeight: 17,
    color: colors.text,
    minWidth: 0,
  },
  reviewItem: {
    fontSize: 12,
    color: colors.textMuted,
    minWidth: 0,
  },
  card: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 5,
    minWidth: 0,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 17,
    color: colors.textSecondary,
    minWidth: 0,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
  },
  infoLabel: {
    fontSize: 12,
    color: colors.textMuted,
    minWidth: 0,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    minWidth: 0,
  },
  infoExtra: {
    fontSize: 12,
    fontWeight: '800',
    minWidth: 0,
  },
  emptyBox: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 18,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyBoxInset: {
    marginHorizontal: 14,
    marginTop: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    minWidth: 0,
  },
  emptyBody: {
    fontSize: 13,
    color: colors.textMuted,
    minWidth: 0,
  },
});
