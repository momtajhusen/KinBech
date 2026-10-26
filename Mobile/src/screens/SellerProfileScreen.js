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
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import ProductCard from '../components/ProductCard';
import { ProductCardSkeleton } from '../components/SkeletonLoader';
import { isNearEnd } from '../utils/scroll';
import { formatDistanceLabel, resolveMediaUrl, toCardItem } from '../utils/listing';
import { haversineKm } from '../utils/locations';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useAuth } from '../context/AuthContext';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import pinnedStoresUtils from '../utils/pinnedStores';

const STATUS_TABS = [
  { key: 'active', label: 'Active' },
  { key: 'sold', label: 'Sold' },
  { key: 'all', label: 'All' },
];

const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'price_low', label: 'Price ↑' },
  { key: 'price_high', label: 'Price ↓' },
];

const SELLER_PAGE = 30;

function fetchSellerListings(sellerId, page) {
  return api.getListings({
    status: 'all',
    page,
    limit: SELLER_PAGE,
    seller: sellerId,
    sellerType: 'individual',
  });
}

function mergeById(prev, incoming) {
  const byId = new Map(prev.map((item) => [String(item._id || item.id), item]));
  incoming.forEach((item) => byId.set(String(item._id || item.id), item));
  return [...byId.values()];
}

export default function SellerProfileScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const initialSeller = route?.params?.seller;
  const sellerId =
    route?.params?.sellerId || initialSeller?._id || initialSeller?.id || initialSeller?.userId;

  const [seller, setSeller] = useState(initialSeller || null);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('active');
  const [sortKey, setSortKey] = useState('newest');
  const [chatBusy, setChatBusy] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const pagingRef = useRef(null);
  const loadingMoreRef = useRef(false);

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

  const loadSeller = useCallback(
    async ({ silent } = {}) => {
      if (!sellerId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      const guessId = String(initialSeller?.userId || sellerId);
      const wantsListings = initialSeller?.sellerType !== 'shop' && !initialSeller?.shopId;
      const [sellerRes, guessRes] = await Promise.all([
        api.getSeller(sellerId),
        wantsListings ? fetchSellerListings(guessId, 1) : Promise.resolve(null),
      ]);
      const sellerData = sellerRes.data?.seller;
      if (sellerData) setSeller(sellerData);

      if (sellerData?.sellerType !== 'shop') {
        const ownerId = String(sellerData?.userId || sellerId);
        const res = guessRes && ownerId === guessId ? guessRes : await fetchSellerListings(ownerId, 1);
        const incoming = Array.isArray(res.data?.listings) ? res.data.listings : [];
        const paging = pagingRef.current;
        if (paging?.ownerId === ownerId && paging.page > 1) {
          setListings((prev) => mergeById(prev, incoming));
        } else {
          setListings(incoming);
          pagingRef.current = { ownerId, page: 1, hasMore: Boolean(res.data?.hasMore) };
        }
      }
      setLoading(false);
    },
    [sellerId, initialSeller]
  );

  const loadMoreListings = useCallback(async () => {
    const paging = pagingRef.current;
    if (loadingMoreRef.current || !paging?.hasMore) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    const res = await fetchSellerListings(paging.ownerId, paging.page + 1);
    if (!res.error && Array.isArray(res.data?.listings)) {
      pagingRef.current = { ...paging, page: paging.page + 1, hasMore: Boolean(res.data.hasMore) };
      setListings((prev) => mergeById(prev, res.data.listings));
    }
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(() => loadSeller({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadSeller();
      if (sellerId && initialSeller?.sellerType !== 'shop' && !initialSeller?.shopId) {
        pinnedStoresUtils.incrementUsage(sellerId).catch(() => {});
      }
    }, [loadSeller, sellerId, initialSeller])
  );

  useEffect(() => {
    if (seller?.sellerType === 'shop' && (seller.shopId || seller._id)) {
      navigation.replace(ROUTES.SHOP_PROFILE, { shopId: seller.shopId || seller._id });
    }
  }, [seller, navigation]);

  const visibleListings = useMemo(() => {
    let list = status === 'all' ? listings : listings.filter((l) => l.status === status);
    if (sortKey === 'price_low') list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
    else if (sortKey === 'price_high') list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
    else list = [...list].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    return list;
  }, [listings, status, sortKey]);

  if (!seller && !loading) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <View style={[styles.header, { paddingTop: insets.top + 8, paddingBottom: 16 }]}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={22} color={colors.text} />
          </Pressable>
        </View>
        <EmptyState compact icon="person-outline" title="Seller not found" body="This profile is unavailable right now." />
      </View>
    );
  }

  const userId = String(seller?.userId || seller?._id || seller?.id || '');
  const isMe = Boolean(user?.id) && String(user.id) === userId;
  const verified = Boolean(seller?.verified);
  const activeCount = seller?.activeCount ?? listings.filter((l) => l.status === 'active').length;
  const soldCount = seller?.soldCount ?? listings.filter((l) => l.status === 'sold').length;
  const sinceYear = seller?.memberSince ? new Date(seller.memberSince).getFullYear() : null;
  const cardWidth = Math.floor((width - 28 - 8) / 2);
  const placeText = String(seller?.location || '').trim();
  const sellerPoint = seller?.coordinates || {};
  const hasCoords = Number.isFinite(Number(sellerPoint.lat)) && Number.isFinite(Number(sellerPoint.lng));
  const distanceLabel = hasCoords && userCoords
    ? formatDistanceLabel(haversineKm(userCoords.lat, userCoords.lng, Number(sellerPoint.lat), Number(sellerPoint.lng)))
    : null;

  const startChat = async () => {
    if (chatBusy || !userId) return;
    setChatBusy(true);
    const { data, error } = await api.createChat({ userId });
    setChatBusy(false);
    if (error) {
      Alert.alert('Chat failed', error);
      return;
    }
    navigation.navigate(ROUTES.CHAT, {
      chatId: data.chat.id,
      name: seller?.name,
      otherUserId: data.chat.otherUser?.id || userId,
    });
  };

  const stats = [
    { label: 'Active', value: activeCount, icon: 'grid-outline' },
    { label: 'Sold', value: soldCount, icon: 'bag-check-outline' },
    { label: 'Member since', value: sinceYear || '–', icon: 'calendar-outline' },
  ];

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerBar}>
          <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={10}>
            <Icon name="chevron-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.flex1} />
          {!isMe ? (
            <Pressable
              style={styles.headerBtn}
              hitSlop={10}
              onPress={() => navigation.navigate(ROUTES.REPORT_BLOCK, { userId })}
            >
              <Icon name="ellipsis-horizontal" size={18} color={colors.text} />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            {seller?.avatarUrl ? (
              <Image source={{ uri: resolveMediaUrl(seller.avatarUrl) }} style={styles.fillImage} />
            ) : (
              <Icon name="person" size={22} color={colors.primary} />
            )}
          </View>
          <View style={styles.flex1}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {seller?.name || 'Seller'}
              </Text>
              {verified ? <Icon name="shield-checkmark" size={16} color={colors.primary} /> : null}
            </View>
            <View style={styles.badges}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>INDIVIDUAL</Text>
              </View>
              {verified ? <Text style={styles.verifiedText}>Phone verified</Text> : null}
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

        <View style={styles.actionsRow}>
          {isMe ? (
            <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={() => navigation.navigate(ROUTES.EDIT_PROFILE)}>
              <Icon name="create-outline" size={18} color="#fff" />
              <Text style={styles.actionPrimaryText}>Edit profile</Text>
            </Pressable>
          ) : (
            <>
              <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={startChat}>
                <Icon name="chatbubble-ellipses-outline" size={18} color="#fff" />
                <Text style={styles.actionPrimaryText}>{chatBusy ? 'Opening…' : 'Chat'}</Text>
              </Pressable>
              {seller?.phone ? (
                <Pressable
                  style={[styles.actionBtn, styles.actionCall]}
                  onPress={() => Linking.openURL(`tel:${seller.phone}`).catch(() => {})}
                >
                  <Icon name="call-outline" size={18} color="#fff" />
                  <Text style={styles.actionPrimaryText}>Call</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.flex1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
        scrollEventThrottle={100}
        onScroll={(event) => {
          if (isNearEnd(event, 800)) loadMoreListings();
        }}
      >

        <View style={styles.statsCard}>
          {stats.map((s, i) => (
            <View key={s.label} style={[styles.stat, i > 0 && styles.statDivider]}>
              <View style={styles.statTop}>
                <Icon name={s.icon} size={13} color={colors.menuBlue} />
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.body}>
          {seller?.description?.trim() ? (
            <View style={styles.aboutCard}>
              <Text style={styles.aboutText} numberOfLines={4}>
                {seller.description.trim()}
              </Text>
            </View>
          ) : null}

          <View style={styles.listHeader}>
            <View style={styles.segment}>
              {STATUS_TABS.map((t) => (
                <Pressable
                  key={t.key}
                  style={[styles.segmentBtn, status === t.key && styles.segmentBtnActive]}
                  onPress={() => setStatus(t.key)}
                >
                  <Text style={[styles.segmentText, status === t.key && styles.segmentTextActive]}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={styles.sortBtn}
              onPress={() => {
                const i = SORTS.findIndex((s) => s.key === sortKey);
                setSortKey(SORTS[(i + 1) % SORTS.length].key);
              }}
            >
              <Icon name="swap-vertical" size={14} color={colors.menuBlue} />
              <Text style={styles.sortText}>{SORTS.find((s) => s.key === sortKey)?.label}</Text>
            </Pressable>
          </View>

          {loading && listings.length === 0 ? (
            <View style={styles.grid}>
              {[0, 1, 2, 3].map((i) => (
                <ProductCardSkeleton key={i} width={cardWidth} compact />
              ))}
            </View>
          ) : visibleListings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Icon name="cube-outline" size={22} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No {status === 'all' ? '' : `${status} `}items</Text>
              <Text style={styles.emptyBody}>Try another tab.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
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
        </View>
      </ScrollView>
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
  header: {
    paddingHorizontal: 14,
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
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.pastelBlue,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  name: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primarySoft || `${colors.primary}18`,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: colors.primary,
  },
  verifiedText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
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
    marginHorizontal: 14,
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 16,
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
  body: {
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 10,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    borderRadius: 21,
  },
  actionPrimary: {
    backgroundColor: colors.primary,
  },
  actionCall: {
    backgroundColor: '#059669',
  },
  actionPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  aboutCard: {
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  aboutText: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    padding: 3,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.iconBackground,
  },
  segmentBtn: {
    flex: 1,
    height: 32,
    paddingHorizontal: 8,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.onPrimary,
  },
  sortBtn: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sortText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  loadMoreRow: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    gap: 2,
    paddingVertical: 16,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    minWidth: 0,
  },
  emptyBody: {
    fontSize: 10.5,
    color: colors.textMuted,
    minWidth: 0,
  },
});
