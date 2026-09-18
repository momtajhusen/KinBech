import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import {
  openItemDetail,
  ROUTES,
  TABS,
  navigateToTab,
} from '../navigation/helpers';
import { api } from '../services/api';
import EmptyState from '../components/EmptyState';
import LogoutConfirmModal from '../components/LogoutConfirmModal';
import { formatPrice } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

export default function ProfileScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [tab, setTab] = useState('purchases');
  const [listings, setListings] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [myShop, setMyShop] = useState(null);

  const isShopAccount =
    user?.sellerTypePreference === 'shop' || user?.sellerTypePreference === 'both';

  const loadProfile = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    const [{ data, error }, purchasesRes, shopRes] = await Promise.all([
      api.getMyListings(),
      api.getMyPurchases(),
      isShopAccount ? api.getMyShop() : Promise.resolve({ data: null }),
    ]);
    if (error) {
      console.error('Failed to load profile data:', error);
      setListings([]);
    } else {
      setListings(
        (data?.listings || []).map((listing) => ({
          ...listing,
          id: listing.id || listing._id,
        }))
      );
    }
    setPurchases(
      (purchasesRes.data?.listings || []).map((listing) => ({
        ...listing,
        id: listing.id || listing._id,
      }))
    );
    setMyShop(shopRes.data?.shop || null);
    if (!silent) setLoading(false);
  }, [isShopAccount]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadProfile({ silent: true }));

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const activeCount = listings.filter((l) => l.status !== 'sold').length;
  const soldCount = listings.filter((l) => l.status === 'sold').length;
  const shopRating =
    myShop?.ratingAverage != null ? Number(myShop.ratingAverage).toFixed(1) : 'New';

  const STATS = [
    {
      label: 'Items Sold',
      value: soldCount,
      icon: 'bag-check-outline',
      iconBg: resolveColor('colors.pastelGreen', colors),
      iconColor: colors.gradientStart,
    },
    {
      label: 'Active',
      value: activeCount,
      icon: 'grid-outline',
      iconBg: resolveColor('colors.pastelIndigo', colors),
      iconColor: resolveColor('colors.menuBlue', colors),
    },
    ...(isShopAccount && myShop
      ? [
          {
            label: 'Rating',
            value: shopRating,
            icon: 'star',
            iconBg: resolveColor('colors.photoPlusBackground', colors),
            iconColor: colors.rating,
          },
        ]
      : []),
  ];

  const QUICK_ACTIONS = [
    ...(isShopAccount && myShop
      ? [
          {
            label: 'Shop Stats',
            icon: 'analytics-outline',
            tint: colors.primary,
            bg: resolveColor('colors.pastelGreen', colors),
            onPress: () => navigation.navigate(ROUTES.SHOP_DASHBOARD),
          },
          {
            label: 'Shop QR',
            icon: 'qr-code-outline',
            tint: resolveColor('colors.menuPurple', colors),
            bg: resolveColor('colors.pastelIndigo', colors),
            onPress: () => navigation.navigate(ROUTES.SHOP_STOREFRONT_QR),
          },
        ]
      : []),
    {
      label: 'My Listings',
      icon: 'list-outline',
      tint: resolveColor('colors.menuBlue', colors),
      bg: resolveColor('colors.pastelIndigo', colors),
      onPress: () => navigation.navigate(ROUTES.MY_LISTINGS),
    },
    {
      label: 'Saved',
      icon: 'heart-outline',
      tint: colors.danger,
      bg: resolveColor('colors.pastelRed', colors),
      onPress: () => navigation.navigate(ROUTES.WISHLIST),
    },
    {
      label: 'Chats',
      icon: 'chatbubble-outline',
      tint: colors.gradientStart,
      bg: resolveColor('colors.pastelGreen', colors),
      onPress: () => navigateToTab(navigation, TABS.CHATS),
    },
    {
      label: 'Wallet',
      icon: 'wallet-outline',
      tint: resolveColor('colors.menuPurple', colors),
      bg: resolveColor('colors.iconBackground', colors),
      onPress: () => navigation.navigate(ROUTES.WALLET),
    },
  ];

  const MENU = [
    {
      label: 'Edit Profile',
      icon: 'person-outline',
      tint: resolveColor('colors.menuBlue', colors),
      bg: resolveColor('colors.pastelIndigo', colors),
      onPress: () => navigation.navigate(ROUTES.EDIT_PROFILE),
    },
    {
      label: 'Address & Location',
      icon: 'location-outline',
      tint: colors.danger,
      bg: resolveColor('colors.pastelRed', colors),
      onPress: () => navigation.navigate(ROUTES.ADDRESSES),
    },
    {
      label: 'Payment Methods',
      icon: 'card-outline',
      tint: resolveColor('colors.menuPurple', colors),
      bg: resolveColor('colors.iconBackground', colors),
      onPress: () => navigation.navigate(ROUTES.PAYMENT_METHODS),
    },
    {
      label: 'Notifications',
      icon: 'notifications-outline',
      tint: resolveColor('colors.menuOrange', colors),
      bg: resolveColor('colors.pastelOrange', colors),
      onPress: () => navigation.navigate(ROUTES.NOTIFICATIONS),
    },
    {
      label: 'Help Center',
      icon: 'help-circle-outline',
      tint: resolveColor('colors.menuCyan', colors),
      bg: resolveColor('colors.pastelCyan', colors),
      onPress: () => navigation.navigate(ROUTES.HELP),
    },
    {
      label: 'Logout',
      icon: 'log-out-outline',
      tint: resolveColor('colors.menuOrange', colors),
      bg: resolveColor('colors.pastelOrange', colors),
      onPress: () => setShowLogoutModal(true),
    },
  ];

  const displaySales = tab === 'sales' ? listings : [];
  const displayPurchases = tab === 'purchases' ? purchases : [];
  const activeItems = tab === 'sales' ? displaySales : displayPurchases;

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Profile</Text>
            <Pressable
              onPress={() => navigation.navigate(ROUTES.SETTINGS)}
              hitSlop={10}
              style={styles.iconBtn}
            >
              <Ionicons name="settings-outline" size={22} color={colors.white} />
            </Pressable>
          </View>

          <View style={styles.profileMainRow}>
            <View style={styles.avatarContainer}>
              <View style={styles.avatar}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View
                    style={{
                      width: '100%',
                      height: '100%',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="person" size={50} color={colors.text} />
                  </View>
                )}
              </View>
              <View style={styles.onlineIndicator} />
            </View>

            <View style={styles.profileInfoWrap}>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{user?.name || 'KinBech User'}</Text>
                {user?.verified ? (
                  <Ionicons name="checkmark-circle" size={18} color={colors.white} />
                ) : null}
              </View>

              {user?.bio ? <Text style={styles.bio}>{user.bio}</Text> : null}

              <View style={styles.contactRow}>
                {user?.phone ? (
                  <View style={styles.contactItem}>
                    <Ionicons name="call-outline" size={12} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.contactText}>{user.phone}</Text>
                  </View>
                ) : null}
                {user?.location ? (
                  <View style={styles.contactItem}>
                    <Ionicons name="location-outline" size={12} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.contactText}>{user.location}</Text>
                  </View>
                ) : null}
              </View>

              <View style={styles.quickBadges}>
                {isShopAccount && myShop ? (
                  <View style={styles.quickBadge}>
                    <Ionicons name="star" size={11} color="#FFD700" />
                    <Text style={styles.quickBadgeText}>
                      {myShop.reviewCount
                        ? `${Number(myShop.ratingAverage || 0).toFixed(1)} Rating`
                        : 'New Shop'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.quickBadge}>
                    <Ionicons
                      name={isShopAccount ? 'storefront-outline' : 'person-outline'}
                      size={11}
                      color="rgba(255,255,255,0.8)"
                    />
                    <Text style={styles.quickBadgeText}>
                      {isShopAccount ? 'Shop Seller' : 'Individual Seller'}
                    </Text>
                  </View>
                )}
                {user?.joinedAt ? (
                  <View style={styles.quickBadge}>
                    <Ionicons name="calendar-outline" size={11} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.quickBadgeText}>
                      {new Date(user.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={styles.statsCard}>
            {STATS.map((stat, i) => (
              <View key={stat.label} style={styles.statWrap}>
                <View style={[styles.statIconWrap, { backgroundColor: stat.iconBg }]}>
                  <Ionicons name={stat.icon} size={18} color={stat.iconColor} />
                </View>
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
                {i < STATS.length - 1 ? <View style={styles.statDivider} /> : null}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.quickActionsRow}>
            {QUICK_ACTIONS.map((a) => (
              <Pressable
                key={a.label}
                style={styles.qaItem}
                onPress={a.onPress}
                hitSlop={6}
              >
                <View style={[styles.qaIcon, { backgroundColor: a.bg }]}>
                  <Ionicons name={a.icon} size={22} color={a.tint} />
                </View>
                <Text style={styles.qaLabel}>{a.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.tabsTrack}>
            <Pressable
              style={[styles.tabBtn, tab === 'purchases' && styles.tabBtnActive]}
              onPress={() => setTab('purchases')}
            >
              <Ionicons
                name="cart-outline"
                size={16}
                color={tab === 'purchases' ? colors.onPrimary : colors.textMuted}
              />
              <Text style={[styles.tabBtnText, tab === 'purchases' && styles.tabBtnTextActive]}>
                My Purchases
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabBtn, tab === 'sales' && styles.tabBtnActive]}
              onPress={() => setTab('sales')}
            >
              <Ionicons
                name="bag-handle-outline"
                size={16}
                color={tab === 'sales' ? colors.onPrimary : colors.textMuted}
              />
              <Text style={[styles.tabBtnText, tab === 'sales' && styles.tabBtnTextActive]}>
                My Sales
              </Text>
            </Pressable>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              {tab === 'sales' ? 'Recent Sales' : 'Recent Purchases'}
            </Text>
            <Pressable
              style={styles.viewAllRow}
              onPress={() =>
                tab === 'sales'
                  ? navigation.navigate(ROUTES.MY_LISTINGS)
                  : navigation.navigate(ROUTES.WALLET)
              }
            >
              <Text style={styles.viewAllText}>View All</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.gradientStart} />
            </Pressable>
          </View>

          {activeItems.length === 0 ? (
            <EmptyState
              compact
              icon={tab === 'sales' ? 'bag-handle-outline' : 'cart-outline'}
              title={tab === 'sales' ? 'No sales yet' : 'No purchases yet'}
              body={
                tab === 'sales'
                  ? 'Items you sell will appear here.'
                  : 'Items you buy will appear here.'
              }
              buttonLabel={tab === 'sales' ? 'Post a listing' : undefined}
              onButtonPress={tab === 'sales' ? () => navigation.navigate(ROUTES.POST_LISTING) : undefined}
            />
          ) : (
            <View style={styles.grid}>
              {activeItems.slice(0, 4).map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.txCard}
                  onPress={() => openItemDetail(navigation, { listingId: item.id, item })}
                >
                  <View style={styles.txThumb}>
                    {item.photos?.[0] ? (
                      <Image
                        source={{ uri: item.photos[0] }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="cube-outline" size={30} color={colors.textMuted} />
                    )}
                    <View
                      style={[
                        styles.txStatus,
                        item.status === 'sold'
                          ? { backgroundColor: colors.statusSold }
                          : { backgroundColor: colors.statusActive },
                      ]}
                    >
                      <Text style={styles.txStatusText}>
                        {item.status === 'sold' ? 'Sold' : 'Active'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 12 }}>
                    <Text style={styles.txTitle} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.txPrice}>{formatPrice(item.price)}</Text>
                    <View style={styles.txFooter}>
                      <Ionicons
                        name={item.status === 'sold' ? 'checkmark-done' : 'time-outline'}
                        size={12}
                        color={colors.textMuted}
                      />
                      <Text style={styles.txDate}>
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })
                          : 'Recently'}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>Account & Settings</Text>
            {MENU.map((item, index) => (
              <Pressable
                key={item.label}
                style={[
                  styles.menuRow,
                  index < MENU.length - 1 && styles.menuRowBorder,
                ]}
                onPress={item.onPress}
                hitSlop={6}
              >
                <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
                  <Ionicons name={item.icon} size={18} color={item.tint} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </View>

          <Text style={styles.appInfo}>KinBech v1.0.0 · Made with ❤️</Text>
        </View>
      </ScrollView>

      <LogoutConfirmModal
        visible={showLogoutModal}
        userName={user?.name}
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={async () => {
          setShowLogoutModal(false);
          await logout();
          navigation.reset({ index: 0, routes: [{ name: ROUTES.LOGIN }] });
        }}
      />
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.gradientStart,
    paddingHorizontal: 20,
    paddingBottom: 30,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.surface,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.success,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  editAvatarBtn: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.gradientStart,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  profileInfoWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 4,
    gap: 6,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  bio: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 18,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  contactText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  quickBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  quickBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  quickBadgeText: {
    fontSize: 11,
    color: colors.white,
    fontWeight: '600',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 10,
    marginTop: 22,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  statWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    flexWrap: 'wrap',
    paddingHorizontal: 6,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  statValue: {
    width: '100%',
    marginTop: 4,
    marginBottom: 2,
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  statLabel: {
    width: '100%',
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  statDivider: {
    position: 'absolute',
    right: 0,
    top: '15%',
    height: '70%',
    width: 1,
    backgroundColor: colors.border,
  },
  body: {
    paddingHorizontal: 16,
    marginTop: 24,
    gap: 18,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  qaItem: {
    alignItems: 'center',
    width: (SCREEN_WIDTH - 32 - 3 * 14) / 4,
    gap: 6,
  },
  qaIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: 11.5,
    color: colors.text,
    fontWeight: '600',
    textAlign: 'center',
  },
  tabsTrack: {
    flexDirection: 'row',
    backgroundColor: colors.iconBackground,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: {
    flex: 1,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
  },
  tabBtnTextActive: {
    color: colors.onPrimary,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
  },
  viewAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.gradientStart,
  },
  loadingBox: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  emptySubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.gradientStart,
  },
  emptyCtaText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.onPrimary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  txCard: {
    width: (SCREEN_WIDTH - 44) / 2,
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  txThumb: {
    height: 110,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  txStatus: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  txStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.white,
  },
  txTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  txPrice: {
    marginTop: 2,
    fontSize: 15,
    fontWeight: '800',
    color: colors.price,
  },
  txFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  txDate: {
    fontSize: 11,
    color: colors.textMuted,
  },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  menuTitle: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '700',
    marginBottom: 6,
    marginHorizontal: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: colors.text,
  },
  appInfo: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContent: {
    backgroundColor: colors.background,
    borderRadius: 24,
    padding: 24,
    width: '85%',
    maxWidth: 320,
    alignItems: 'center',
    shadowColor: colors.shadow,
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  modalIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  modalLogoutButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.danger,
    alignItems: 'center',
  },
  modalLogoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.white,
  },
});
