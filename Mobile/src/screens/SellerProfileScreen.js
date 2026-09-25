import { useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, ScrollView as RNScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openItemDetail, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'price_low', label: 'Price: Low → High' },
  { key: 'price_high', label: 'Price: High → Low' },
  { key: 'popular', label: 'Most viewed' },
];

const STATUS_OPTIONS = [
  { key: 'active', label: 'Active' },
  { key: 'sold', label: 'Sold' },
  { key: 'all', label: 'All' },
];

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    backgroundColor: colors.gradientStart,
    paddingTop: 0,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  moreBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.surface,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  profileInfoWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  tagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statCol: {
    alignItems: 'flex-start',
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    paddingVertical: 14,
    position: 'relative',
    marginRight: 28,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.gradientStart,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: colors.gradientStart,
    borderRadius: 2,
  },
  filterScroll: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.gradientStart,
    borderColor: colors.gradientStart,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextActive: {
    color: colors.onPrimary,
    fontWeight: '700',
  },
  chipMuted: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  chipMutedActive: {
    color: colors.onPrimary,
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  clearChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: `${colors.gradientStart}18`,
  },
  clearChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.gradientStart,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  listingCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: colors.surface,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  listingImageWrap: {
    width: '100%',
    height: ((SCREEN_WIDTH - 44) / 2) * 0.62,
    backgroundColor: colors.iconBackground,
    position: 'relative',
  },
  listingImageContent: {
    width: '100%',
    height: '100%',
  },
  statusBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  favoriteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listingInfo: {
    padding: 10,
  },
  listingTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    lineHeight: 17,
  },
  listingPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.gradientStart,
    marginBottom: 6,
  },
  listingMeta: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  listingLocationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  listingLocationText: {
    fontSize: 11,
    color: colors.textMuted,
    flex: 1,
  },
  galleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    gap: 4,
  },
  galleryItem: {
    width: (SCREEN_WIDTH - 24) / 3,
    height: (SCREEN_WIDTH - 24) / 3,
    backgroundColor: colors.iconBackground,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.8,
  },
  imageViewerClose: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  imageViewerCounter: {
    position: 'absolute',
    bottom: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  imageViewerCounterText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  aboutSection: {
    padding: 20,
  },
  aboutTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 12,
  },
  aboutText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  aboutInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
    flexWrap: 'wrap',
  },
  aboutInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aboutInfoText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: '70%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 12,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 14,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  sheetOptionTextActive: {
    color: colors.gradientStart,
    fontWeight: '800',
  },
  sheetSectionLabel: {
    marginTop: 16,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: '800',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
    marginBottom: 8,
  },
  sheetBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetBtnPrimary: {
    backgroundColor: colors.gradientStart,
    borderColor: colors.gradientStart,
  },
  sheetBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  sheetBtnTextPrimary: {
    color: colors.onPrimary,
  },
  emptyWrap: {
    paddingVertical: 24,
  },
});

function sortListings(list, sortKey) {
  const arr = [...list];
  switch (sortKey) {
    case 'oldest':
      return arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    case 'price_low':
      return arr.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    case 'price_high':
      return arr.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    case 'popular':
      return arr.sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
    case 'newest':
    default:
      return arr.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
}

function yearFromDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

export default function SellerProfileScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const initialSeller = route?.params?.seller;
  const sellerId =
    route?.params?.sellerId || initialSeller?._id || initialSeller?.id || initialSeller?.userId;

  const [seller, setSeller] = useState(initialSeller || null);
  const [allListings, setAllListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('active');
  const [sortKey, setSortKey] = useState('newest');
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterCondition, setFilterCondition] = useState('All');
  const [activeTab, setActiveTab] = useState('listings');
  const [selectedImage, setSelectedImage] = useState(null);
  const [imageViewerVisible, setImageViewerVisible] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [draftCategory, setDraftCategory] = useState('All');
  const [draftCondition, setDraftCondition] = useState('All');
  const [wishlistIds, setWishlistIds] = useState(new Set());

  const loadSeller = useCallback(
    async ({ silent } = {}) => {
      if (!sellerId) {
        if (!silent) setLoading(false);
        return;
      }
      if (!silent) setLoading(true);

      const sellerRes = await api.getSeller(sellerId);
      const sellerData = sellerRes.data?.seller;
      if (sellerData) setSeller(sellerData);

      const isShop = sellerData?.sellerType === 'shop' || Boolean(sellerData?.shopId);
      const listingParams = {
        status: 'all',
        page: 1,
        limit: 50,
      };
      if (isShop && (sellerData.shopId || sellerId)) {
        listingParams.shopId = String(sellerData.shopId || sellerId);
        listingParams.sellerType = 'shop';
      } else {
        listingParams.seller = String(sellerData?.userId || sellerId);
        listingParams.sellerType = 'individual';
      }

      const res = await api.getListings(listingParams);
      let resultListings = [];
      if (!res.error && Array.isArray(res.data?.listings)) {
        resultListings = res.data.listings;
      }
      setAllListings(resultListings);
      setLoading(false);

      // Wishlist ids for heart state (best-effort)
      try {
        const wish = await api.getWishlist();
        const ids = new Set(
          (wish.data?.listings || wish.data?.wishlist || [])
            .map((l) => String(l._id || l.id || l.listingId || ''))
            .filter(Boolean),
        );
        setWishlistIds(ids);
      } catch {
        /* ignore */
      }
    },
    [sellerId],
  );

  const { refreshing, onRefresh } = usePullRefresh(() => loadSeller({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadSeller();
    }, [loadSeller]),
  );

  const categories = useMemo(() => {
    const set = new Set();
    allListings.forEach((l) => {
      if (l.category) set.add(l.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [allListings]);

  const conditions = useMemo(() => {
    const set = new Set();
    allListings.forEach((l) => {
      if (l.condition) set.add(l.condition);
    });
    return ['All', ...Array.from(set)];
  }, [allListings]);

  const filteredListings = useMemo(() => {
    let list = allListings;
    if (filterStatus !== 'all') {
      list = list.filter((l) => l.status === filterStatus);
    }
    if (filterCategory !== 'All') {
      list = list.filter((l) => l.category === filterCategory);
    }
    if (filterCondition !== 'All') {
      list = list.filter((l) => l.condition === filterCondition);
    }
    return sortListings(list, sortKey);
  }, [allListings, filterStatus, filterCategory, filterCondition, sortKey]);

  const galleryPhotos = useMemo(() => {
    const photos = [];
    allListings.forEach((listing) => {
      (listing.photos || []).forEach((photo) => {
        const uri = resolveMediaUrl(photo);
        if (uri && !photos.includes(uri)) photos.push(uri);
      });
    });
    return photos;
  }, [allListings]);

  const activeCount =
    seller?.activeCount ?? allListings.filter((l) => l.status === 'active').length;
  const soldCount =
    seller?.soldCount ?? allListings.filter((l) => l.status === 'sold').length;

  const sortLabel = SORT_OPTIONS.find((o) => o.key === sortKey)?.label || 'Newest';
  const hasExtraFilters = filterCategory !== 'All' || filterCondition !== 'All';

  const handleListingPress = (listing) => {
    const id = listing._id || listing.id;
    openItemDetail(navigation, { listingId: id, item: listing, sharedId: id });
  };

  const toggleWish = async (listing, e) => {
    e?.stopPropagation?.();
    const id = String(listing._id || listing.id);
    if (!id) return;
    const next = new Set(wishlistIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setWishlistIds(next);
    await api.toggleWishlist(id);
  };

  const openFilterSheet = () => {
    setDraftCategory(filterCategory);
    setDraftCondition(filterCondition);
    setFilterSheetOpen(true);
  };

  const applyFilters = () => {
    setFilterCategory(draftCategory);
    setFilterCondition(draftCondition);
    setFilterSheetOpen(false);
  };

  const clearFilters = () => {
    setFilterCategory('All');
    setFilterCondition('All');
    setDraftCategory('All');
    setDraftCondition('All');
    setFilterSheetOpen(false);
  };

  if (!seller && !loading) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color={colors.onPrimary} />
          </Pressable>
        </View>
        <EmptyState
          compact
          icon="person-outline"
          title="Seller not found"
          body="This profile is unavailable right now."
        />
      </View>
    );
  }

  const isShop = seller?.sellerType === 'shop';
  const verified = Boolean(seller?.verified);
  const memberYear = yearFromDate(seller?.memberSince);

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerTop}>
            <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="chevron-back" size={22} color={colors.onPrimary} />
            </Pressable>
            <Pressable
              style={styles.moreBtn}
              onPress={() =>
                navigation.navigate(ROUTES.REPORT_BLOCK, {
                  userId: seller?.userId || seller?._id || seller?.id,
                })
              }
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.onPrimary} />
            </Pressable>
          </View>

          <View style={styles.profileRow}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                {seller?.avatarUrl ? (
                  <Image
                    source={{ uri: resolveMediaUrl(seller.avatarUrl) }}
                    style={styles.avatarImage}
                  />
                ) : (
                  <View
                    style={{
                      width: '100%',
                      height: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name={isShop ? 'storefront' : 'person'} size={32} color={colors.text} />
                  </View>
                )}
              </View>
            </View>

            <View style={styles.profileInfoWrap}>
              <View style={styles.profileInfo}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>
                    {seller?.name || 'Seller'}
                  </Text>
                  {verified ? (
                    <Ionicons name="checkmark-circle" size={18} color={colors.onPrimary} />
                  ) : null}
                </View>
                <Text style={styles.tagline}>
                  {isShop ? 'Shop' : 'Individual Seller'}
                  {seller?.verificationLabel ? ` · ${seller.verificationLabel}` : ''}
                </Text>

                <View style={styles.statsRow}>
                  <View style={styles.statCol}>
                    <View style={styles.statTop}>
                      <Ionicons name="cube-outline" size={15} color="rgba(255,255,255,0.85)" />
                      <Text style={styles.statValue}>{activeCount}</Text>
                    </View>
                    <Text style={styles.statLabel}>Active</Text>
                  </View>
                  <View style={styles.statCol}>
                    <View style={styles.statTop}>
                      <Ionicons name="bag-check-outline" size={15} color="rgba(255,255,255,0.85)" />
                      <Text style={styles.statValue}>{soldCount}</Text>
                    </View>
                    <Text style={styles.statLabel}>Sold</Text>
                  </View>
                  {seller?.rating > 0 ? (
                    <View style={styles.statCol}>
                      <View style={styles.statTop}>
                        <Ionicons name="star" size={15} color="#FBBF24" />
                        <Text style={styles.statValue}>{Number(seller.rating).toFixed(1)}</Text>
                      </View>
                      <Text style={styles.statLabel}>
                        {seller.reviewsCount || 0} reviews
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.tabsRow}>
          {[
            { key: 'listings', icon: 'grid', label: 'Listings' },
            { key: 'gallery', icon: 'images', label: 'Gallery' },
            { key: 'about', icon: 'person-outline', label: 'About' },
          ].map((tab) => (
            <Pressable key={tab.key} style={styles.tabItem} onPress={() => setActiveTab(tab.key)}>
              <Ionicons
                name={tab.icon}
                size={18}
                color={activeTab === tab.key ? colors.gradientStart : colors.textSecondary}
              />
              <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {activeTab === tab.key ? <View style={styles.tabIndicator} /> : null}
            </Pressable>
          ))}
        </View>

        {activeTab === 'listings' && (
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterScroll}
            >
              <Pressable
                style={[styles.chip, styles.chipActive]}
                onPress={() => setSortSheetOpen(true)}
              >
                <Ionicons name="swap-vertical" size={15} color={colors.onPrimary} />
                <Text style={[styles.chipMuted, styles.chipMutedActive]}>Sort</Text>
                <Text style={[styles.chipText, styles.chipTextActive]}>{sortLabel}</Text>
                <Ionicons name="chevron-down" size={14} color={colors.onPrimary} />
              </Pressable>

              {STATUS_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.chip, filterStatus === opt.key && styles.chipActive]}
                  onPress={() => setFilterStatus(opt.key)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      filterStatus === opt.key && styles.chipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}

              <Pressable
                style={[styles.chip, hasExtraFilters && styles.chipActive]}
                onPress={openFilterSheet}
              >
                <Ionicons
                  name="filter"
                  size={15}
                  color={hasExtraFilters ? colors.onPrimary : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.chipText,
                    hasExtraFilters && styles.chipTextActive,
                  ]}
                >
                  Filter{hasExtraFilters ? ' · On' : ''}
                </Text>
                <Ionicons
                  name="chevron-down"
                  size={14}
                  color={hasExtraFilters ? colors.onPrimary : colors.textSecondary}
                />
              </Pressable>
            </ScrollView>

            {hasExtraFilters ? (
              <View style={styles.activeFiltersRow}>
                {filterCategory !== 'All' ? (
                  <View style={styles.clearChip}>
                    <Text style={styles.clearChipText}>{filterCategory}</Text>
                  </View>
                ) : null}
                {filterCondition !== 'All' ? (
                  <View style={styles.clearChip}>
                    <Text style={styles.clearChipText}>{filterCondition}</Text>
                  </View>
                ) : null}
                <Pressable style={styles.clearChip} onPress={clearFilters}>
                  <Text style={styles.clearChipText}>Clear</Text>
                </Pressable>
              </View>
            ) : null}

            {loading ? (
              <View style={styles.emptyWrap}>
                <EmptyState compact icon="hourglass-outline" title="Loading…" body="" />
              </View>
            ) : filteredListings.length === 0 ? (
              <View style={styles.emptyWrap}>
                <EmptyState
                  compact
                  icon="cube-outline"
                  title="No listings"
                  body={
                    hasExtraFilters || filterStatus !== 'all'
                      ? 'No items match your sort/filter. Try All or clear filters.'
                      : 'This seller has not posted any items yet.'
                  }
                />
              </View>
            ) : (
              <View style={styles.grid}>
                {filteredListings.map((listing) => {
                  const id = listing._id || listing.id;
                  const wished = wishlistIds.has(String(id));
                  const isSold = listing.status === 'sold';
                  return (
                    <Pressable
                      key={id}
                      style={styles.listingCard}
                      onPress={() => handleListingPress(listing)}
                    >
                      <View style={styles.listingImageWrap}>
                        {listing.photos?.[0] ? (
                          <Image
                            source={{ uri: resolveMediaUrl(listing.photos[0]) }}
                            style={styles.listingImageContent}
                            resizeMode="cover"
                          />
                        ) : (
                          <View
                            style={{
                              width: '100%',
                              height: '100%',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Ionicons name="image-outline" size={32} color={colors.textMuted} />
                          </View>
                        )}
                        <View
                          style={[
                            styles.statusBadge,
                            {
                              backgroundColor: isSold ? '#6B7280' : colors.gradientStart,
                            },
                          ]}
                        >
                          <Text style={styles.statusBadgeText}>
                            {isSold ? 'Sold' : 'Active'}
                          </Text>
                        </View>
                        <Pressable
                          style={styles.favoriteBtn}
                          hitSlop={6}
                          onPress={(e) => toggleWish(listing, e)}
                        >
                          <Ionicons
                            name={wished ? 'heart' : 'heart-outline'}
                            size={17}
                            color={wished ? '#EF4444' : colors.text}
                          />
                        </Pressable>
                      </View>

                      <View style={styles.listingInfo}>
                        <Text style={styles.listingTitle} numberOfLines={2}>
                          {listing.title}
                        </Text>
                        <Text style={styles.listingPrice}>{formatPrice(listing.price)}</Text>
                        {listing.category ? (
                          <Text style={styles.listingMeta} numberOfLines={1}>
                            {listing.category}
                            {listing.condition ? ` · ${listing.condition}` : ''}
                          </Text>
                        ) : null}
                        <View style={styles.listingLocationRow}>
                          <Ionicons name="location-outline" size={11} color={colors.textMuted} />
                          <Text style={styles.listingLocationText} numberOfLines={1}>
                            {listing.location || seller?.location || 'Nepal'}
                          </Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {activeTab === 'gallery' && (
          <View style={styles.galleryGrid}>
            {galleryPhotos.length === 0 ? (
              <View style={[styles.emptyWrap, { width: '100%' }]}>
                <EmptyState
                  compact
                  icon="images-outline"
                  title="No photos"
                  body="Photos from listings will appear here."
                />
              </View>
            ) : (
              galleryPhotos.map((uri, index) => (
                <Pressable
                  key={`${uri}-${index}`}
                  style={styles.galleryItem}
                  onPress={() => {
                    setSelectedImage(uri);
                    setGalleryIndex(index);
                    setImageViewerVisible(true);
                  }}
                >
                  <Image source={{ uri }} style={styles.galleryImage} resizeMode="cover" />
                </Pressable>
              ))
            )}
          </View>
        )}

        {activeTab === 'about' && (
          <View style={styles.aboutSection}>
            <Text style={styles.aboutTitle}>About {seller?.name || 'this seller'}</Text>
            <Text style={styles.aboutText}>
              {seller?.description?.trim()
                ? seller.description.trim()
                : isShop
                  ? 'Shop on KinBech. Browse their listings for products and offers.'
                  : 'Individual seller on KinBech. Chat to ask about items before buying.'}
            </Text>
            <View style={styles.aboutInfoRow}>
              {seller?.location ? (
                <View style={styles.aboutInfoItem}>
                  <Ionicons name="location-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.aboutInfoText}>{seller.location}</Text>
                </View>
              ) : null}
              {memberYear ? (
                <View style={styles.aboutInfoItem}>
                  <Ionicons name="time-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.aboutInfoText}>Member since {memberYear}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.aboutInfoRow}>
              {verified ? (
                <View style={styles.aboutInfoItem}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.success} />
                  <Text style={styles.aboutInfoText}>
                    {seller.verificationLabel || 'Verified'}
                  </Text>
                </View>
              ) : (
                <View style={styles.aboutInfoItem}>
                  <Ionicons name="shield-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.aboutInfoText}>Not verified yet</Text>
                </View>
              )}
              {seller?.category ? (
                <View style={styles.aboutInfoItem}>
                  <Ionicons name="pricetag-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.aboutInfoText}>{seller.category}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Sort sheet */}
      <Modal
        visible={sortSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setSortSheetOpen(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setSortSheetOpen(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Sort listings</Text>
            {SORT_OPTIONS.map((opt) => (
              <Pressable
                key={opt.key}
                style={styles.sheetOption}
                onPress={() => {
                  setSortKey(opt.key);
                  setSortSheetOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.sheetOptionText,
                    sortKey === opt.key && styles.sheetOptionTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
                {sortKey === opt.key ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.gradientStart} />
                ) : (
                  <View style={{ width: 22 }} />
                )}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Filter sheet */}
      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <Pressable style={styles.sheetOverlay} onPress={() => setFilterSheetOpen(false)}>
          <Pressable
            style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filter listings</Text>
            <RNScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetSectionLabel}>Category</Text>
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  style={styles.sheetOption}
                  onPress={() => setDraftCategory(cat)}
                >
                  <Text
                    style={[
                      styles.sheetOptionText,
                      draftCategory === cat && styles.sheetOptionTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                  {draftCategory === cat ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.gradientStart} />
                  ) : (
                    <View style={{ width: 22 }} />
                  )}
                </Pressable>
              ))}

              <Text style={styles.sheetSectionLabel}>Condition</Text>
              {conditions.map((cond) => (
                <Pressable
                  key={cond}
                  style={styles.sheetOption}
                  onPress={() => setDraftCondition(cond)}
                >
                  <Text
                    style={[
                      styles.sheetOptionText,
                      draftCondition === cond && styles.sheetOptionTextActive,
                    ]}
                  >
                    {cond}
                  </Text>
                  {draftCondition === cond ? (
                    <Ionicons name="checkmark-circle" size={22} color={colors.gradientStart} />
                  ) : (
                    <View style={{ width: 22 }} />
                  )}
                </Pressable>
              ))}
            </RNScrollView>

            <View style={styles.sheetActions}>
              <Pressable style={styles.sheetBtn} onPress={clearFilters}>
                <Text style={styles.sheetBtnText}>Clear</Text>
              </Pressable>
              <Pressable
                style={[styles.sheetBtn, styles.sheetBtnPrimary]}
                onPress={applyFilters}
              >
                <Text style={[styles.sheetBtnText, styles.sheetBtnTextPrimary]}>Apply</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={imageViewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewerVisible(false)}
      >
        <View style={styles.imageViewerOverlay}>
          <Pressable
            style={styles.imageViewerClose}
            onPress={() => setImageViewerVisible(false)}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>

          {selectedImage ? (
            <Image
              source={{ uri: selectedImage }}
              style={styles.imageViewerImage}
              resizeMode="contain"
            />
          ) : null}

          <View style={styles.imageViewerCounter}>
            <Text style={styles.imageViewerCounterText}>
              {galleryPhotos.length
                ? `${galleryIndex + 1} / ${galleryPhotos.length}`
                : 'Photo'}
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}
