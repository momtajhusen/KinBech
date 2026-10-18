import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
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
import ScreenLoader from '../components/ScreenLoader';
import { INDIVIDUAL_GRADIENT } from '../components/SellerProfileCard';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useAuth } from '../context/AuthContext';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

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
  const [wishlistIds, setWishlistIds] = useState(new Set());
  const [chatBusy, setChatBusy] = useState(false);

  const loadSeller = useCallback(
    async ({ silent } = {}) => {
      if (!sellerId) {
        setLoading(false);
        return;
      }
      if (!silent) setLoading(true);
      const sellerRes = await api.getSeller(sellerId);
      const sellerData = sellerRes.data?.seller;
      if (sellerData) setSeller(sellerData);

      if (sellerData?.sellerType !== 'shop') {
        const res = await api.getListings({
          status: 'all',
          page: 1,
          limit: 50,
          seller: String(sellerData?.userId || sellerId),
          sellerType: 'individual',
        });
        setListings(Array.isArray(res.data?.listings) ? res.data.listings : []);
      }
      setLoading(false);

      const wish = await api.getWishlist();
      setWishlistIds(
        new Set(
          (wish.data?.listings || wish.data?.wishlist || [])
            .map((l) => String(l._id || l.id || l.listingId || ''))
            .filter(Boolean)
        )
      );
    },
    [sellerId]
  );

  const { refreshing, onRefresh } = usePullRefresh(() => loadSeller({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadSeller();
    }, [loadSeller])
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
            <Ionicons name="chevron-back" size={20} color="#fff" />
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
  const cardWidth = (width - 32 - 10) / 2;

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

  const toggleWish = async (listing) => {
    const id = String(listing._id || listing.id || '');
    if (!id) return;
    setWishlistIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    await api.toggleWishlist(id);
  };

  const stats = [
    { label: 'Active', value: activeCount, icon: 'grid-outline' },
    { label: 'Sold', value: soldCount, icon: 'bag-check-outline' },
    { label: 'Member since', value: sinceYear || '–', icon: 'calendar-outline' },
  ];

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <LinearGradient
          colors={INDIVIDUAL_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 8 }]}
        >
          <Ionicons name="person" size={130} color="rgba(255,255,255,0.07)" style={styles.watermark} />
          <View style={styles.headerBar}>
            <Pressable style={styles.headerBtn} onPress={() => navigation.goBack()} hitSlop={10}>
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </Pressable>
            {!isMe ? (
              <Pressable
                style={styles.headerBtn}
                hitSlop={10}
                onPress={() => navigation.navigate(ROUTES.REPORT_BLOCK, { userId })}
              >
                <Ionicons name="ellipsis-horizontal" size={18} color="#fff" />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              {seller?.avatarUrl ? (
                <Image source={{ uri: resolveMediaUrl(seller.avatarUrl) }} style={styles.fillImage} />
              ) : (
                <Ionicons name="person" size={30} color={colors.menuBlue} />
              )}
            </View>
            <View style={styles.flex1}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {seller?.name || 'Seller'}
                </Text>
                {verified ? <Ionicons name="checkmark-circle" size={16} color="#fff" /> : null}
              </View>
              <View style={styles.badges}>
                <View style={styles.badge}>
                  <Ionicons name="person" size={10} color="#fff" />
                  <Text style={styles.badgeText}>INDIVIDUAL</Text>
                </View>
                {verified ? (
                  <View style={styles.badge}>
                    <Ionicons name="call" size={9} color="#fff" />
                    <Text style={styles.badgeText}>Phone verified</Text>
                  </View>
                ) : null}
              </View>
              {seller?.location ? (
                <View style={styles.locationRow}>
                  <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.85)" />
                  <Text style={styles.locationText} numberOfLines={1}>
                    {seller.location}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </LinearGradient>

        <View style={styles.statsCard}>
          {stats.map((s, i) => (
            <View key={s.label} style={[styles.stat, i > 0 && styles.statDivider]}>
              <View style={styles.statTop}>
                <Ionicons name={s.icon} size={13} color={colors.menuBlue} />
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.body}>
          {isMe ? (
            <Pressable style={[styles.actionBtn, styles.actionPrimary]} onPress={() => navigation.navigate(ROUTES.EDIT_PROFILE)}>
              <Ionicons name="create-outline" size={16} color="#fff" />
              <Text style={styles.actionPrimaryText}>Edit profile</Text>
            </Pressable>
          ) : (
            <View style={styles.actionsRow}>
              <Pressable style={[styles.actionBtn, styles.actionPrimary, styles.flex1]} onPress={startChat}>
                <Ionicons name="chatbubble-ellipses-outline" size={16} color="#fff" />
                <Text style={styles.actionPrimaryText}>{chatBusy ? 'Opening…' : 'Chat with seller'}</Text>
              </Pressable>
              {seller?.phone ? (
                <Pressable
                  style={[styles.actionBtn, styles.actionSecondary]}
                  onPress={() => Linking.openURL(`tel:${seller.phone}`).catch(() => {})}
                >
                  <Ionicons name="call-outline" size={16} color={colors.menuBlue} />
                  <Text style={styles.actionSecondaryText}>Call</Text>
                </Pressable>
              ) : null}
            </View>
          )}

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
              <Ionicons name="swap-vertical" size={14} color={colors.menuBlue} />
              <Text style={styles.sortText}>{SORTS.find((s) => s.key === sortKey)?.label}</Text>
            </Pressable>
          </View>

          {loading && listings.length === 0 ? (
            <ScreenLoader compact label="Loading items" />
          ) : visibleListings.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="cube-outline" size={22} color={colors.textMuted} />
              <Text style={styles.emptyTitle}>No {status === 'all' ? '' : `${status} `}items</Text>
              <Text style={styles.emptyBody}>Try another tab.</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {visibleListings.map((listing) => {
                const id = listing._id || listing.id;
                const wished = wishlistIds.has(String(id));
                const isSold = listing.status === 'sold';
                return (
                  <Pressable
                    key={id}
                    style={[styles.card, { width: cardWidth }]}
                    onPress={() => openItemDetail(navigation, { listingId: id, item: listing, sharedId: id })}
                  >
                    <View style={styles.cardImage}>
                      {listing.photos?.[0] ? (
                        <Image
                          source={{ uri: resolveMediaUrl(listing.photos[0]) }}
                          style={styles.fillImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                      )}
                      {isSold ? (
                        <View style={styles.soldTag}>
                          <Text style={styles.soldTagText}>SOLD</Text>
                        </View>
                      ) : null}
                      {!isMe ? (
                        <Pressable style={styles.heartBtn} hitSlop={6} onPress={() => toggleWish(listing)}>
                          <Ionicons
                            name={wished ? 'heart' : 'heart-outline'}
                            size={15}
                            color={wished ? colors.danger : colors.text}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {listing.title}
                      </Text>
                      <Text style={styles.cardPrice}>{formatPrice(listing.price)}</Text>
                      {listing.condition || listing.category ? (
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {[listing.condition, listing.category].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
      {loading && !seller ? <ScreenLoader overlay label="Loading seller" /> : null}
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
    paddingHorizontal: 16,
    paddingBottom: 40,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  watermark: {
    position: 'absolute',
    right: -18,
    bottom: -24,
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: colors.pastelBlue,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#fff',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#fff',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  locationText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -26,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    shadowColor: colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
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
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 10.5,
    color: colors.textMuted,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  actionPrimary: {
    backgroundColor: colors.menuBlue,
  },
  actionPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  actionSecondary: {
    borderWidth: 1.5,
    borderColor: colors.menuBlue,
    backgroundColor: colors.pastelBlue,
  },
  actionSecondaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.menuBlue,
  },
  aboutCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  aboutText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.iconBackground,
  },
  segmentBtn: {
    height: 28,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.menuBlue,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: '#fff',
  },
  sortBtn: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sortText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardImage: {
    aspectRatio: 1.15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  soldTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: colors.statusSold,
  },
  soldTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#fff',
  },
  heartBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
  },
  cardInfo: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 2,
  },
  cardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
  },
  cardPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.price,
  },
  cardMeta: {
    fontSize: 10.5,
    color: colors.textMuted,
  },
  emptyBox: {
    alignItems: 'center',
    gap: 4,
    paddingVertical: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  emptyBody: {
    fontSize: 12,
    color: colors.textMuted,
  },
});
