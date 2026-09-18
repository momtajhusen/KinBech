import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Text,
  View,
  Image,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSharedTransition } from '../context/SharedTransitionContext';
import { openItemDetail, navigateToTab, ROUTES, TABS } from '../navigation/helpers';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import { formatPrice } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const STATUS_STYLES = {
  active: { bg: 'statusActive', label: 'Active' },
  pending: { bg: 'statusPending', label: 'Pending' },
  sold: { bg: 'statusSold', label: 'Sold' },
};

function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

export default function MyListingsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const { tryBeginNavigation } = useSharedTransition();
  const [tab, setTab] = useState(route?.params?.initialTab || 'active');
  const [sortBy, setSortBy] = useState('newest');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [myShop, setMyShop] = useState(null);

  const isShopAccount =
    user?.sellerTypePreference === 'shop' || user?.sellerTypePreference === 'both';

  const loadListings = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, shopRes] = await Promise.all([
      api.getMyListings(),
      isShopAccount ? api.getMyShop() : Promise.resolve({ data: null }),
    ]);
    setLoading(false);
    if (error) {
      console.error('Failed to load my listings:', error);
      setListings([]);
    } else {
      setListings(
        (data?.listings || []).map((listing) => ({
          ...listing,
          id: listing.id || listing._id,
          imageUrl: listing.photos?.[0] || '',
          views: listing.views ?? 0,
          chats: listing.chats ?? 0,
        }))
      );
    }
    setMyShop(shopRes.data?.shop || null);
  }, [isShopAccount]);

  const { refreshing, onRefresh } = usePullRefresh(loadListings);

  useFocusEffect(
    useCallback(() => {
      loadListings();
    }, [loadListings])
  );

  const filteredListings = useMemo(() => {
    let items = listings.filter((item) =>
      tab === 'active' ? item.status !== 'sold' : item.status === 'sold'
    );
    if (sortBy === 'newest') {
      items = [...items].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    } else if (sortBy === 'priceLow') {
      items = [...items].sort((a, b) => Number(a.price) - Number(b.price));
    } else if (sortBy === 'priceHigh') {
      items = [...items].sort((a, b) => Number(b.price) - Number(a.price));
    }
    return items;
  }, [listings, tab, sortBy]);

  const activeCount = listings.filter((l) => l.status !== 'sold').length;
  const soldCount = listings.filter((l) => l.status === 'sold').length;

  const handleEdit = (item) => {
    navigation.navigate(ROUTES.EDIT_LISTING, { listingId: item.id, listing: item });
  };

  const handleDelete = (item) => {
    Alert.alert('Delete listing', 'Remove this listing?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await api.deleteListing(item.id);
          if (!error) {
            setListings((prev) => prev.filter((row) => row.id !== item.id));
          } else {
            Alert.alert('Error', 'Could not delete listing');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.navBtn}>
              <Ionicons name="chevron-back" size={24} color={colors.onPrimary} />
            </Pressable>
            <Text style={styles.headerTitle}>My Listings</Text>
            <View style={styles.headerActions}>
              {isShopAccount && myShop ? (
                <Pressable
                  onPress={() => navigation.navigate(ROUTES.SHOP_DASHBOARD)}
                  hitSlop={12}
                  style={styles.navBtn}
                >
                  <Ionicons name="analytics-outline" size={22} color={colors.onPrimary} />
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => navigation.navigate(ROUTES.POST_LISTING)}
                hitSlop={12}
                style={styles.navBtn}
              >
                <Ionicons name="add" size={26} color={colors.onPrimary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.profileRow}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="person" size={38} color={colors.text} />
                  </View>
                )}
              </View>
              <View style={styles.onlineIndicator} />
            </View>
            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{user?.name || 'Seller'}</Text>
                <Ionicons name="checkmark-circle" size={18} color={colors.onPrimary} />
              </View>
              <Text style={styles.tagline}>Manage your listings 🛍️</Text>
              <View style={styles.statsRow}>
                <View style={styles.statCol}>
                  <View style={styles.statTop}>
                    <Ionicons name="grid" size={14} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.statValue}>{activeCount}</Text>
                  </View>
                  <Text style={styles.statLabel}>Active</Text>
                </View>
                <View style={styles.statCol}>
                  <View style={styles.statTop}>
                    <Ionicons name="bag-check" size={14} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.statValue}>{soldCount}</Text>
                  </View>
                  <Text style={styles.statLabel}>Sold</Text>
                </View>
                {isShopAccount && myShop ? (
                  <View style={styles.statCol}>
                    <View style={styles.statTop}>
                      <Ionicons name="star" size={14} color="#FFD700" />
                      <Text style={styles.statValue}>
                        {myShop.reviewCount
                          ? Number(myShop.ratingAverage || 0).toFixed(1)
                          : 'New'}
                      </Text>
                    </View>
                    <Text style={styles.statLabel}>Rating</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.tabSwitcher}>
            <Pressable onPress={() => setTab('active')} style={styles.tabButtonWrap}>
              {tab === 'active' ? (
                <View style={styles.tabButtonActive}>
                  <Text style={styles.tabLabelActive}>Active ({activeCount})</Text>
                </View>
              ) : (
                <View style={styles.tabButtonInactive}>
                  <Text style={styles.tabLabelInactive}>Active ({activeCount})</Text>
                </View>
              )}
            </Pressable>

            <Pressable onPress={() => setTab('sold')} style={styles.tabButtonWrap}>
              {tab === 'sold' ? (
                <View style={styles.tabButtonActive}>
                  <Text style={styles.tabLabelActive}>Sold ({soldCount})</Text>
                </View>
              ) : (
                <View style={styles.tabButtonInactive}>
                  <Text style={styles.tabLabelInactive}>Sold ({soldCount})</Text>
                </View>
              )}
            </Pressable>
          </View>
        </View>

        <View style={styles.toolbarRow}>
          <Pressable style={styles.sortBtn}>
            <Ionicons name="swap-vertical" size={16} color={colors.textSecondary} />
            <Text style={styles.sortLabel}>Sort</Text>
            <Text style={styles.sortValue}>
              {sortBy === 'newest' ? 'Newest' : sortBy === 'priceLow' ? 'Price ↑' : 'Price ↓'}
            </Text>
            <Ionicons name="chevron-down" size={14} color={colors.textSecondary} />
          </Pressable>
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={() => navigation.navigate(ROUTES.POST_LISTING)}
            style={styles.postBtn}
          >
            <Ionicons name="add-circle" size={16} color={colors.onPrimary} />
            <Text style={styles.postBtnText}>Post New</Text>
          </Pressable>
        </View>

        {filteredListings.length === 0 ? (
          <EmptyState
            compact
            icon={tab === 'active' ? 'pricetag-outline' : 'checkmark-circle-outline'}
            title={tab === 'active' ? 'No active listings' : 'No sold listings yet'}
            body={
              tab === 'active'
                ? 'Post an item and it will show up here for buyers.'
                : 'When a listing is marked sold, it will appear in this tab.'
            }
            buttonLabel={tab === 'active' ? 'Create listing' : undefined}
            onButtonPress={tab === 'active' ? () => navigation.navigate(ROUTES.POST_LISTING) : undefined}
          />
        ) : (
          <View style={styles.listContent}>
            {filteredListings.map((item) => (
              <View key={item.id} style={styles.card}>
                <Pressable
                  style={styles.cardRow}
                  onPress={() =>
                    tryBeginNavigation(item.id, () =>
                      openItemDetail(navigation, { listingId: item.id, item, sharedId: item.id })
                    )
                  }
                >
                  <View style={styles.cardImageWrap}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" sharedTransitionTag={`item.${item.id}.photo`} />
                    ) : (
                      <View style={[styles.cardImage, { alignItems: 'center', justifyContent: 'center' }]} sharedTransitionTag={`item.${item.id}.photo`}>
                        <Ionicons name="image-outline" size={32} color={colors.textMuted} />
                      </View>
                    )}
                    <View style={[
                      styles.statusBadge,
                      { backgroundColor: resolveColor(
                        `colors.${STATUS_STYLES[item.status]?.bg || 'statusActive'}`,
                        colors
                      )}
                    ]}>
                      <Text style={styles.statusLabel}>
                        {STATUS_STYLES[item.status]?.label || 'Active'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.cardInfo}>
                    <Text style={styles.cardTitle} numberOfLines={2} sharedTransitionTag={`item.${item.id}.title`}>
                      {item.title}
                    </Text>
                    <Text style={styles.cardPrice} sharedTransitionTag={`item.${item.id}.price`}>{formatPrice(item.price)}</Text>

                    <View style={styles.statsRowMini}>
                      <View style={styles.miniStat}>
                        <Ionicons name="eye-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.miniStatText}>{item.views}</Text>
                      </View>
                      <View style={styles.miniStat}>
                        <Ionicons name="chatbubble-outline" size={13} color={colors.textMuted} />
                        <Text style={styles.miniStatText}>{item.chats}</Text>
                      </View>
                      {item.location ? (
                        <View style={styles.miniStat}>
                          <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                          <Text style={styles.miniStatText} numberOfLines={1}>
                            {item.location}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </Pressable>

                <View style={styles.cardActions}>
                  <Pressable
                    style={styles.actionBtnShare}
                    hitSlop={6}
                    onPress={() =>
                      navigation.navigate(ROUTES.LISTING_SUCCESS, {
                        mode: 'share',
                        listing: {
                          id: item.id,
                          title: item.title,
                          price: item.price,
                          location: item.location,
                          imageUrl: item.imageUrl || item.photos?.[0],
                          condition: item.condition,
                          category: item.category,
                        },
                      })
                    }
                  >
                    <Ionicons name="share-social-outline" size={16} color={colors.textSecondary} />
                  </Pressable>
                  <Pressable
                    style={styles.actionBtnMarkSold}
                    hitSlop={6}
                    onPress={() =>
                      Alert.alert(
                        'Mark as Sold',
                        'Mark this listing as sold?',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Mark Sold',
                            onPress: async () => {
                              const { error } = await api.updateListing(item.id, { status: 'sold' });
                              if (!error) {
                                setListings((prev) =>
                                  prev.map((l) => (l.id === item.id ? { ...l, status: 'sold' } : l))
                                );
                              }
                            },
                          },
                        ]
                      )
                    }
                  >
                    <Ionicons name="bag-check-outline" size={16} color={colors.gradientStart} />
                  </Pressable>
                  <Pressable
                    style={styles.actionBtnEdit}
                    onPress={() => handleEdit(item)}
                    hitSlop={6}
                  >
                    <Ionicons name="pencil" size={16} color={colors.gradientStart} />
                  </Pressable>
                  <Pressable
                    style={styles.actionBtnDelete}
                    onPress={() => handleDelete(item)}
                    hitSlop={6}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.deleteRed} />
                  </Pressable>
                </View>
              </View>
            ))}
            <View style={{ height: 24 }} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.tabBar, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable style={styles.tabBarItem} onPress={() => navigateToTab(navigation, TABS.HOME)}>
          <Ionicons name="home-outline" size={22} color={colors.textMuted} />
          <Text style={styles.tabBarLabel}>Home</Text>
        </Pressable>
        <Pressable style={styles.tabBarItem} onPress={() => navigateToTab(navigation, TABS.EXPLORE)}>
          <Ionicons name="compass-outline" size={22} color={colors.textMuted} />
          <Text style={styles.tabBarLabel}>Explore</Text>
        </Pressable>

        <Pressable
          style={styles.fabWrap}
          onPress={() => navigateToTab(navigation, TABS.POST)}
        >
          <View style={styles.fab}>
            <Ionicons name="add" size={28} color={colors.white} />
          </View>
        </Pressable>

        <Pressable style={styles.tabBarItem} onPress={() => navigateToTab(navigation, TABS.CHATS)}>
          <View>
            <Ionicons name="chatbubble-outline" size={22} color={colors.textMuted} />
            <View style={styles.chatDot} />
          </View>
          <Text style={styles.tabBarLabel}>Chats</Text>
        </Pressable>
        <Pressable
          style={[styles.tabBarItem, { opacity: 0.95 }]}
          onPress={() => navigateToTab(navigation, TABS.PROFILE)}
        >
          <Ionicons name="person" size={22} color={colors.gradientStart} />
          <Text style={[styles.tabBarLabel, { color: colors.gradientStart, fontWeight: '700' }]}>
            Profile
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.gradientStart,
    paddingHorizontal: 16,
    paddingBottom: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
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
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.gradientStart,
  },
  profileInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  tagline: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 0,
  },
  statCol: {
    flex: 1,
    alignItems: 'flex-start',
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.white,
  },
  statLabel: {
    fontSize: 11,
    color: colors.gradientEnd,
    fontWeight: '600',
  },
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 14,
    padding: 4,
  },
  tabButtonWrap: {
    flex: 1,
  },
  tabButtonActive: {
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  tabButtonInactive: {
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: 'center',
  },
  tabLabelActive: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gradientStart,
  },
  tabLabelInactive: {
    fontSize: 14,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  sortBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  sortValue: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  postBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: colors.gradientStart,
  },
  postBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  loading: {
    paddingVertical: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    paddingVertical: 80,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyPostBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: colors.gradientStart,
  },
  emptyPostBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cardImageWrap: {
    position: 'relative',
    width: 96,
    height: 96,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
    overflow: 'hidden',
    flexShrink: 0,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  statusBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  cardInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 4,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 18,
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.price,
  },
  statsRowMini: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 2,
  },
  miniStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  miniStatText: {
    fontSize: 11,
    color: colors.textMuted,
    maxWidth: 90,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actionBtnShare: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.photoPlusBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnMarkSold: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.pastelGreen,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnEdit: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.photoPlusBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnDelete: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.deleteBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingTop: 10,
  },
  tabBarItem: {
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  tabBarLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
  },
  chatDot: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.progressOrange,
  },
  fabWrap: {
    marginTop: -30,
    flex: 1,
    alignItems: 'center',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gradientStart,
    shadowColor: colors.gradientStart,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
