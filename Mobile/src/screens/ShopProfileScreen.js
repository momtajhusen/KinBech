import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import {
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
import ScreenLoader from '../components/ScreenLoader';
import EmptyState from '../components/EmptyState';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { useAuth } from '../context/AuthContext';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const COVER_HEIGHT = 70;
const LOGO_SIZE = 56;

const SORTS = [
  { key: 'newest', label: 'Newest' },
  { key: 'price_low', label: 'Price ↑' },
  { key: 'price_high', label: 'Price ↓' },
];

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

  const loadShopData = useCallback(
    async ({ silent } = {}) => {
      if (!silent) setLoading(true);
      const [shopRes, listingsRes, reviewsRes] = await Promise.all([
        api.getShopById(shopId),
        api.getShopListings(shopId),
        api.getShopReviews(shopId),
      ]);
      if (shopRes.data?.shop) setShop(shopRes.data.shop);
      setListings(listingsRes.data?.listings || []);
      setReviews(reviewsRes.data?.reviews || []);
      if (!silent) setLoading(false);
    },
    [shopId]
  );

  const { refreshing, onRefresh } = usePullRefresh(() => loadShopData({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadShopData();
    }, [loadShopData])
  );

  const categories = useMemo(() => {
    const set = new Set(listings.map((l) => l.category).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [listings]);

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
    return <ScreenLoader label="Loading shop" />;
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
  const coverHeight = shop.coverImage ? Math.round((width * 7) / 16) : COVER_HEIGHT;
  const social = shop.socialLinks || {};
  const sinceYear = shop.createdAt ? new Date(shop.createdAt).getFullYear() : null;
  const coords = shop.coordinates || {};
  const hasCoords =
    coords.lat != null && coords.lng != null && Number.isFinite(Number(coords.lat)) && Number.isFinite(Number(coords.lng));
  const placeText = shop.address || shop.location || '';
  const cardWidth = (width - 32 - 8) / 2;

  const startChat = async () => {
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
        ...(shop.phone ? [{ key: 'call', icon: 'call-outline', label: 'Call', onPress: callShop }] : []),
        ...(hasCoords || placeText ? [{ key: 'dir', icon: 'navigate-outline', label: 'Directions', onPress: openDirections }] : []),
        { key: 'share', icon: 'share-social-outline', label: 'Share', onPress: shareShop },
      ];

  const stats = [
    { label: reviewCount ? `${reviewCount} reviews` : 'No reviews', value: reviewCount ? rating.toFixed(1) : '–', icon: 'star', tint: colors.warning },
    { label: 'Products', value: listings.length, icon: 'cube-outline', tint: colors.primary },
    { label: 'Since', value: sinceYear || '–', icon: 'calendar-outline', tint: colors.menuBlue },
  ];

  const renderProducts = () => (
    <View>
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={15} color={colors.textMuted} />
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
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
        <Pressable
          style={styles.sortBtn}
          onPress={() => {
            const i = SORTS.findIndex((s) => s.key === sortKey);
            setSortKey(SORTS[(i + 1) % SORTS.length].key);
          }}
        >
          <Ionicons name="swap-vertical" size={14} color={colors.primary} />
          <Text style={styles.sortText}>{SORTS.find((s) => s.key === sortKey)?.label}</Text>
        </Pressable>
      </View>

      {categories.length > 2 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {categories.map((cat) => (
            <Pressable
              key={cat}
              style={[styles.chip, category === cat && styles.chipActive]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>{cat}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {visibleListings.length === 0 ? (
        <View style={[styles.emptyBox, styles.emptyBoxInset]}>
          <Ionicons name="cube-outline" size={22} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>
            {listings.length ? 'No products match' : 'No products yet'}
          </Text>
          <Text style={styles.emptyBody}>
            {listings.length ? 'Try another search or category.' : "This shop hasn't added products yet."}
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {visibleListings.map((listing) => {
            const id = listing._id || listing.id;
            return (
              <Pressable
                key={id}
                style={[styles.productCard, { width: cardWidth }]}
                onPress={() => openItemDetail(navigation, { listingId: id, item: listing })}
              >
                <View style={styles.productImageWrap}>
                  {listing.photos?.[0] ? (
                    <Image
                      source={{ uri: resolveMediaUrl(listing.photos[0]) }}
                      style={styles.fillImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name="image-outline" size={24} color={colors.textMuted} />
                  )}
                  {listing.isOnSale ? (
                    <View style={styles.saleTag}>
                      <Text style={styles.saleTagText}>SALE</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productTitle} numberOfLines={1}>
                    {listing.title}
                  </Text>
                  <View style={styles.priceRow}>
                    <Text style={styles.productPrice}>{formatPrice(listing.price)}</Text>
                    {listing.originalPrice && Number(listing.originalPrice) > Number(listing.price) ? (
                      <Text style={styles.oldPrice}>{formatPrice(listing.originalPrice)}</Text>
                    ) : null}
                  </View>
                  {listing.condition ? (
                    <Text style={styles.productMeta} numberOfLines={1}>
                      {listing.condition}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderReviews = () => (
    <View style={styles.section}>
      <View style={styles.ratingCard}>
        <View style={styles.ratingBig}>
          <Text style={styles.ratingBigValue}>{reviewCount ? rating.toFixed(1) : '–'}</Text>
          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((i) => (
              <Ionicons
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
          <Ionicons name="star-outline" size={22} color={colors.textMuted} />
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
                  <Ionicons name="person" size={14} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.flex1}>
                <Text style={styles.reviewName} numberOfLines={1}>
                  {review.reviewer?.name || 'Buyer'}
                </Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Ionicons
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

  const renderAbout = () => (
    <View style={styles.section}>
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
                <Ionicons name={s.icon} size={18} color={s.color} />
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
              <Ionicons name={row.icon} size={15} color={colors.primary} />
            </View>
            <View style={styles.flex1}>
              <Text style={styles.infoLabel}>{row.label}</Text>
              <Text style={[styles.infoValue, row.valueColor && { color: row.valueColor }]}>{row.value}</Text>
            </View>
            {row.extra ? (
              <Text style={[styles.infoExtra, { color: row.extraColor }]}>{row.extra}</Text>
            ) : null}
            {row.onPress ? <Ionicons name="chevron-forward" size={15} color={colors.textMuted} /> : null}
          </Pressable>
        ))}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.cover, { height: coverHeight + insets.top }]}>
          {shop.coverImage ? (
            <>
              <Image source={{ uri: resolveMediaUrl(shop.coverImage) }} style={styles.fillImage} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.45)', 'transparent']}
                style={[styles.coverShade, { height: insets.top + 56 }]}
                pointerEvents="none"
              />
            </>
          ) : (
            <LinearGradient
              colors={colors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.fillImage}
            >
              <Ionicons name="storefront" size={150} color="rgba(255,255,255,0.08)" style={styles.coverWatermark} />
            </LinearGradient>
          )}
          <View style={[styles.coverBar, { top: insets.top + 8 }]}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.coverBtn}>
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </Pressable>
            <View style={styles.coverBarRight}>
              <Pressable onPress={shareShop} hitSlop={10} style={styles.coverBtn}>
                <Ionicons name="share-social-outline" size={17} color="#fff" />
              </Pressable>
              {!isOwner ? (
                <Pressable
                  onPress={() => navigation.navigate(ROUTES.REPORT_BLOCK, { userId: ownerId })}
                  hitSlop={10}
                  style={styles.coverBtn}
                >
                  <Ionicons name="ellipsis-horizontal" size={17} color="#fff" />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.identity}>
          <View style={styles.logoRow}>
            <View style={styles.logo}>
              {shop.logo ? (
                <Image source={{ uri: resolveMediaUrl(shop.logo) }} style={styles.fillImage} />
              ) : (
                <Ionicons name="storefront" size={28} color={colors.primary} />
              )}
            </View>
            {isOpen != null ? (
              <View style={[styles.openPill, { backgroundColor: isOpen ? colors.pastelGreen : colors.pastelRed }]}>
                <View style={[styles.openDot, { backgroundColor: isOpen ? colors.success : colors.danger }]} />
                <Text style={[styles.openText, { color: isOpen ? colors.success : colors.danger }]}>
                  {isOpen ? 'Open now' : 'Closed'}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {shop.name}
            </Text>
            {shop.isVerified ? <Ionicons name="shield-checkmark" size={14} color={colors.primary} /> : null}
          </View>
          {shop.tagline ? (
            <Text style={styles.tagline} numberOfLines={2}>
              {shop.tagline}
            </Text>
          ) : null}
          <View style={styles.metaRow}>
            <View style={styles.storeTag}>
              <Ionicons name="storefront" size={10} color={colors.onPrimary} />
              <Text style={styles.storeTagText}>STORE</Text>
            </View>
            {shop.category ? <Text style={styles.metaText}>{shop.category}</Text> : null}
            {shop.isVerified ? <Text style={styles.verifiedText}>· Business verified</Text> : null}
            {shop.deliveryAvailable ? (
              <View style={styles.deliveryTag}>
                <Ionicons name="bicycle" size={10} color={colors.menuBlue} />
                <Text style={styles.deliveryTagText}>Delivery</Text>
              </View>
            ) : null}
          </View>
          {placeText ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={13} color={colors.textMuted} />
              <Text style={styles.locationText} numberOfLines={1}>
                {placeText}
              </Text>
            </View>
          ) : null}

          <View style={styles.statsCard}>
            {stats.map((s, i) => (
              <View key={s.label} style={[styles.stat, i > 0 && styles.statDivider]}>
                <View style={styles.statTop}>
                  <Ionicons name={s.icon} size={12} color={s.tint} />
                  <Text style={styles.statValue}>{s.value}</Text>
                </View>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.actionsRow}>
            {actions.map((a) => (
              <Pressable
                key={a.key}
                style={[styles.actionBtn, a.primary && styles.actionBtnPrimary]}
                onPress={a.onPress}
              >
                <Ionicons name={a.icon} size={16} color={a.primary ? colors.onPrimary : colors.primary} />
                <Text style={[styles.actionText, a.primary && styles.actionTextPrimary]} numberOfLines={1}>
                  {a.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.tabsTrack}>
          {[
            { key: 'products', label: `Products · ${listings.length}` },
            { key: 'reviews', label: `Reviews · ${reviews.length}` },
            { key: 'about', label: 'About' },
          ].map((t) => (
            <Pressable
              key={t.key}
              style={[styles.tabBtn, tab === t.key && styles.tabBtnActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === 'products' ? renderProducts() : tab === 'reviews' ? renderReviews() : renderAbout()}
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
  cover: {
    overflow: 'hidden',
  },
  coverWatermark: {
    position: 'absolute',
    right: -20,
    bottom: -30,
  },
  coverShade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
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
  coverBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  coverBarRight: {
    flexDirection: 'row',
    gap: 8,
  },
  coverBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  identity: {
    paddingHorizontal: 14,
    marginTop: -LOGO_SIZE / 2,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  logo: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: 14,
    borderWidth: 2.5,
    borderColor: colors.background,
    backgroundColor: colors.pastelGreen,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  openPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: 2,
  },
  openDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  openText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    minWidth: 0,
  },
  tagline: {
    marginTop: 0,
    fontSize: 11,
    color: colors.textSecondary,
    minWidth: 0,
  },
  deliveryTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: colors.pastelBlue,
  },
  deliveryTagText: {
    fontSize: 8.5,
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
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  storeTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: colors.onPrimary,
    minWidth: 0,
  },
  metaText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    minWidth: 0,
  },
  verifiedText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
    minWidth: 0,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  locationText: {
    flex: 1,
    fontSize: 10,
    color: colors.textMuted,
    minWidth: 0,
  },
  statsCard: {
    flexDirection: 'row',
    marginTop: 6,
    paddingVertical: 6,
    borderRadius: 10,
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
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    minWidth: 0,
  },
  statLabel: {
    fontSize: 9,
    color: colors.textMuted,
    minWidth: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 5,
    marginTop: 6,
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
    marginHorizontal: 14,
    marginTop: 8,
    padding: 2.5,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.iconBackground,
  },
  tabBtn: {
    flex: 1,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.textMuted,
    minWidth: 0,
  },
  tabTextActive: {
    color: colors.onPrimary,
    minWidth: 0,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  searchBox: {
    flex: 1,
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 11,
    color: colors.text,
    minWidth: 0,
  },
  sortBtn: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  sortText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: colors.text,
    minWidth: 0,
  },
  chipRow: {
    gap: 4,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  chipText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text,
    minWidth: 0,
  },
  chipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
    minWidth: 0,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  productCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  productImageWrap: {
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  saleTag: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  saleTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#fff',
  },
  productInfo: {
    paddingHorizontal: 6,
    paddingVertical: 5,
    gap: 0,
  },
  productTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
    minWidth: 0,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  productPrice: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.price,
    minWidth: 0,
  },
  oldPrice: {
    fontSize: 9,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
    minWidth: 0,
  },
  productMeta: {
    fontSize: 9,
    color: colors.textMuted,
    minWidth: 0,
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
    fontSize: 10,
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
    width: 9,
    fontSize: 10,
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
    fontSize: 10,
    color: colors.textMuted,
    minWidth: 0,
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
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    minWidth: 0,
  },
  reviewDate: {
    fontSize: 10,
    color: colors.textMuted,
    minWidth: 0,
  },
  reviewText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.text,
    minWidth: 0,
  },
  reviewItem: {
    fontSize: 10,
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
    fontSize: 12,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 5,
    minWidth: 0,
  },
  aboutText: {
    fontSize: 12,
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
    fontSize: 10,
    color: colors.textMuted,
    minWidth: 0,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text,
    minWidth: 0,
  },
  infoExtra: {
    fontSize: 10,
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
    fontSize: 12.5,
    fontWeight: '700',
    color: colors.text,
    minWidth: 0,
  },
  emptyBody: {
    fontSize: 11,
    color: colors.textMuted,
    minWidth: 0,
  },
});
