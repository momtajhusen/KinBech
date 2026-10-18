import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ROUTES, TABS, navigateToTab } from '../navigation/helpers';
import { api } from '../services/api';
import LogoutConfirmModal from '../components/LogoutConfirmModal';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

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
  const { width: windowWidth } = useWindowDimensions();
  const { user, logout } = useAuth();
  const [listings, setListings] = useState([]);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [myShop, setMyShop] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);

  const isShopAccount =
    user?.sellerTypePreference === 'shop' || user?.sellerTypePreference === 'both';

  const loadProfile = useCallback(async () => {
    const [{ data, error }, purchasesRes, shopRes, notesRes] = await Promise.all([
      api.getMyListings(),
      api.getMyPurchases(),
      isShopAccount ? api.getMyShop() : Promise.resolve({ data: null }),
      api.getNotifications(),
    ]);
    setUnreadCount(notesRes.data?.unreadCount || 0);
    if (error) {
      console.error('Failed to load profile data:', error);
      setListings([]);
    } else {
      setListings(data?.listings || []);
    }
    setPurchaseCount(purchasesRes.data?.listings?.length || 0);
    setMyShop(shopRes.data?.shop || null);
  }, [isShopAccount]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadProfile());

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const activeCount = listings.filter((l) => l.status !== 'sold').length;
  const soldCount = listings.filter((l) => l.status === 'sold').length;
  const hasShop = isShopAccount && myShop;
  const shopRating =
    myShop?.ratingAverage != null ? Number(myShop.ratingAverage).toFixed(1) : 'New';

  const STATS = [
    {
      label: 'Sold',
      value: soldCount,
      icon: 'bag-check-outline',
      tint: colors.gradientStart,
      onPress: () => navigation.navigate(ROUTES.MY_LISTINGS, { initialTab: 'sold' }),
    },
    {
      label: 'Active',
      value: activeCount,
      icon: 'grid-outline',
      tint: resolveColor('colors.menuBlue', colors),
      onPress: () => navigation.navigate(ROUTES.MY_LISTINGS, { initialTab: 'active' }),
    },
    {
      label: 'Bought',
      value: purchaseCount,
      icon: 'cart-outline',
      tint: resolveColor('colors.menuPurple', colors),
      onPress: () => navigation.navigate(ROUTES.MY_PURCHASES),
    },
    ...(hasShop
      ? [
          {
            label: 'Rating',
            value: shopRating,
            icon: 'star',
            tint: colors.rating,
            onPress: () => navigation.navigate(ROUTES.SHOP_DASHBOARD),
          },
        ]
      : []),
  ];

  const QUICK_ACTIONS = [
    ...(hasShop
      ? [
          {
            label: 'My Store',
            icon: 'storefront-outline',
            tint: colors.primary,
            bg: resolveColor('colors.pastelGreen', colors),
            onPress: () => navigation.navigate(ROUTES.SHOP_PROFILE, { shopId: myShop._id || myShop.id }),
          },
        ]
      : []),
    {
      label: 'Chats',
      icon: 'chatbubble-outline',
      tint: colors.gradientStart,
      bg: resolveColor('colors.pastelGreen', colors),
      onPress: () => navigateToTab(navigation, TABS.CHATS),
    },
    {
      label: 'Listings',
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
    ...(hasShop
      ? [
          {
            label: 'Shop Stats',
            icon: 'analytics-outline',
            tint: colors.primary,
            bg: resolveColor('colors.pastelGreen', colors),
            onPress: () => navigation.navigate(ROUTES.SHOP_DASHBOARD),
          },
        ]
      : []),
    {
      label: 'Purchases',
      icon: 'cart-outline',
      tint: resolveColor('colors.menuCyan', colors),
      bg: resolveColor('colors.pastelCyan', colors),
      onPress: () => navigation.navigate(ROUTES.MY_PURCHASES),
    },
    {
      label: 'Sales',
      icon: 'bag-check-outline',
      tint: resolveColor('colors.menuOrange', colors),
      bg: resolveColor('colors.pastelOrange', colors),
      onPress: () => navigation.navigate(ROUTES.MY_LISTINGS, { initialTab: 'sold' }),
    },
    {
      label: 'Wallet',
      icon: 'wallet-outline',
      tint: resolveColor('colors.menuPurple', colors),
      bg: resolveColor('colors.iconBackground', colors),
      onPress: () => navigation.navigate(ROUTES.WALLET),
    },
    ...(hasShop
      ? [
          {
            label: 'Shop QR',
            icon: 'qr-code-outline',
            tint: resolveColor('colors.menuPurple', colors),
            bg: resolveColor('colors.pastelIndigo', colors),
            onPress: () => navigation.navigate(ROUTES.SHOP_STOREFRONT_QR),
          },
        ]
      : []),
  ];

  const editRoute = isShopAccount ? ROUTES.EDIT_SHOP : ROUTES.EDIT_PROFILE;

  const MENU = [
    isShopAccount
      ? {
          label: 'Edit Store Profile',
          icon: 'storefront-outline',
          tint: colors.primary,
          bg: resolveColor('colors.pastelGreen', colors),
          onPress: () => navigation.navigate(editRoute),
        }
      : {
          label: 'Edit Profile',
          icon: 'person-outline',
          tint: resolveColor('colors.menuBlue', colors),
          bg: resolveColor('colors.pastelIndigo', colors),
          onPress: () => navigation.navigate(editRoute),
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
      badge: unreadCount,
      onPress: () => navigation.navigate(ROUTES.NOTIFICATIONS),
    },
    {
      label: 'Help Center',
      icon: 'help-circle-outline',
      tint: resolveColor('colors.menuCyan', colors),
      bg: resolveColor('colors.pastelCyan', colors),
      onPress: () => navigation.navigate(ROUTES.HELP),
    },
  ];

  const qaItemWidth = Math.max(56, (windowWidth - 32 - 2 - 12) / QUICK_ACTIONS.length);
  const headerName = hasShop ? myShop.name : user?.name || 'KinBech User';
  const headerImage = hasShop ? myShop.logo || user?.avatarUrl : user?.avatarUrl;
  const headerBio = hasShop ? myShop.tagline : user?.bio;
  const contactLine = (
    hasShop ? [user?.name ? `Owner: ${user.name}` : '', user?.phone] : [user?.phone, user?.location]
  )
    .filter(Boolean)
    .join('  ·  ');
  const joined = user?.joinedAt
    ? new Date(user.joinedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    : '';

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          {hasShop && myShop.coverImage ? (
            <>
              <Image source={{ uri: resolveMediaUrl(myShop.coverImage) }} style={styles.headerCover} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.5)', 'rgba(6,78,59,0.88)']}
                style={styles.headerCover}
                pointerEvents="none"
              />
            </>
          ) : null}
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Profile</Text>
            <Pressable
              onPress={() => navigation.navigate(ROUTES.SETTINGS)}
              hitSlop={10}
              style={styles.iconBtn}
            >
              <Ionicons name="settings-outline" size={18} color={colors.white} />
            </Pressable>
          </View>

          <Pressable style={styles.profileRow} onPress={() => navigation.navigate(editRoute)}>
            <View>
              <View style={[styles.avatar, isShopAccount && styles.avatarStore]}>
                {headerImage ? (
                  <Image source={{ uri: resolveMediaUrl(headerImage) }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name={isShopAccount ? 'storefront' : 'person'} size={28} color={colors.textMuted} />
                )}
              </View>
              <View style={styles.onlineDot} />
            </View>

            <View style={styles.profileInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>
                  {headerName}
                </Text>
                {(hasShop ? myShop.isVerified : user?.verified) ? (
                  <Ionicons name={hasShop ? 'shield-checkmark' : 'checkmark-circle'} size={15} color={colors.white} />
                ) : null}
              </View>
              {contactLine ? (
                <Text style={styles.contactText} numberOfLines={1}>
                  {contactLine}
                </Text>
              ) : null}
              <View style={styles.badges}>
                <View style={styles.badge}>
                  <Ionicons
                    name={hasShop ? 'storefront-outline' : 'person-outline'}
                    size={10}
                    color={colors.white}
                  />
                  <Text style={styles.badgeText}>{isShopAccount ? 'Store' : 'Individual'}</Text>
                </View>
                {joined ? (
                  <View style={styles.badge}>
                    <Ionicons name="calendar-outline" size={10} color={colors.white} />
                    <Text style={styles.badgeText}>Since {joined}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.8)" />
          </Pressable>
          {headerBio ? (
            <Text style={styles.bio} numberOfLines={2}>
              {headerBio}
            </Text>
          ) : null}
        </View>

        <View style={styles.statsCard}>
          {STATS.map((stat, i) => (
            <Pressable
              key={stat.label}
              style={[styles.stat, i > 0 && styles.statDivider]}
              onPress={stat.onPress}
            >
              <View style={styles.statValueRow}>
                <Ionicons name={stat.icon} size={13} color={stat.tint} />
                <Text style={styles.statValue}>{stat.value}</Text>
              </View>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.body}>
          <View style={styles.card}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.qaRow}
            >
              {QUICK_ACTIONS.map((a) => (
                <Pressable
                  key={a.label}
                  style={[styles.qaItem, { width: qaItemWidth }]}
                  onPress={a.onPress}
                >
                  <View style={[styles.qaIcon, { backgroundColor: a.bg }]}>
                    <Ionicons name={a.icon} size={17} color={a.tint} />
                  </View>
                  <Text style={styles.qaLabel} numberOfLines={1}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <View>
            <Text style={styles.menuTitle}>Account & settings</Text>
            <View style={styles.card}>
              {MENU.map((item, index) => (
                <Pressable
                  key={item.label}
                  style={[styles.menuRow, index < MENU.length - 1 && styles.menuRowBorder]}
                  onPress={item.onPress}
                >
                  <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
                    <Ionicons name={item.icon} size={16} color={item.tint} />
                  </View>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  {item.badge > 0 ? (
                    <View style={styles.menuBadge}>
                      <Text style={styles.menuBadgeText}>{item.badge > 9 ? '9+' : item.badge}</Text>
                    </View>
                  ) : null}
                  <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable style={styles.logoutBtn} onPress={() => setShowLogoutModal(true)}>
            <Ionicons name="log-out-outline" size={16} color={colors.danger} />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>

          <Text style={styles.appInfo}>KinBech v1.0.0</Text>
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
    paddingHorizontal: 16,
    paddingBottom: 40,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  headerCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStore: {
    borderRadius: 16,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: colors.gradientStart,
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  name: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
  contactText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  badgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: colors.white,
  },
  bio: {
    marginTop: 10,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.85)',
  },
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -26,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
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
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  body: {
    paddingHorizontal: 16,
    marginTop: 14,
    gap: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  qaRow: {
    paddingHorizontal: 6,
    paddingVertical: 10,
  },
  qaItem: {
    alignItems: 'center',
    gap: 5,
  },
  qaIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text,
  },
  menuTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 6,
    marginLeft: 2,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  menuBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  menuBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  logoutText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.danger,
  },
  appInfo: {
    textAlign: 'center',
    fontSize: 11,
    color: colors.textMuted,
  },
});
