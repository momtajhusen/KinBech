import { useCallback, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import LogoutConfirmModal from '../components/LogoutConfirmModal';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const SELLER_LEVELS = {
  top: { label: 'Top Seller', icon: 'trophy-outline', tint: 'success', tip: 'You are one of the most trusted sellers on KinBech. Your badge shows on your listings.' },
  trusted: { label: 'Trusted Seller', icon: 'shield-checkmark-outline', tint: 'success', tip: 'Buyers see your Trusted Seller badge. Keep replying fast to reach Top Seller.' },
  standard: { label: 'Seller', icon: 'person-outline', tint: 'primary', tip: 'Reply quickly, keep listings up to date and complete deals to earn the Trusted Seller badge.' },
  new: { label: 'New seller', icon: 'sparkles-outline', tint: 'primary', tip: 'Complete a few deals and reply to buyers to build your level.' },
  watch: { label: 'Needs attention', icon: 'alert-circle-outline', tint: 'warning', tip: 'Some buyers had a poor experience. Reply faster and keep listings accurate. For now you can post up to 3 listings a day.' },
  restricted: { label: 'Limited', icon: 'lock-closed-outline', tint: 'deleteRed', tip: 'New listings are checked by our team before going live. Reply to buyers and keep listings accurate to lift this.' },
};

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
  const { user, logout, refreshUser } = useAuth();
  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;
  const [listings, setListings] = useState([]);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [myShop, setMyShop] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState(false);

  const isShopAccount =
    user?.sellerTypePreference === 'shop' || user?.sellerTypePreference === 'both';

  const loadProfile = useCallback(async () => {
    const [{ data, error }, purchasesRes, shopRes, notesRes] = await Promise.all([
      api.getMyListings(),
      api.getMyPurchases(),
      isShopAccount ? api.getMyShop() : Promise.resolve({ data: null }),
      api.getNotifications(),
    ]);
    Promise.resolve(refreshUserRef.current?.()).catch(() => {});
    setUnreadCount(notesRes.data?.unreadCount || 0);
    if (error) {
      console.error('Failed to load profile data:', error);
      setListings([]);
    } else {
      setListings(data?.listings || []);
    }
    setPurchaseCount(purchasesRes.data?.listings?.length || 0);
    setMyShop(shopRes.data?.shop || null);
    setStatsLoaded(true);
  }, [isShopAccount]);

  const { refreshing, onRefresh } = usePullRefresh(() => loadProfile());

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  const activeCount = listings.filter((l) => l.status === 'active').length;
  const soldCount = listings.filter((l) => l.status === 'sold').length;
  const attention = {
    review: listings.filter((l) => l.status === 'pending' || l.status === 'removed').length,
    hidden: listings.filter((l) => l.status === 'hidden').length,
    confirm: listings.filter((l) => l.autoSold || (l.status === 'active' && (l.needsConfirm || l.stockState === 'under_check'))).length,
  };
  const reviewCount = attention.review + attention.hidden + attention.confirm;
  const attentionText = [
    attention.review ? `${attention.review} in review` : '',
    attention.hidden ? `${attention.hidden} hidden` : '',
    attention.confirm ? `${attention.confirm} to confirm` : '',
  ].filter(Boolean).join(' · ');
  const level = listings.length ? SELLER_LEVELS[user?.trustTier] : null;
  const levelFacts = [
    user?.signals?.replyText,
    user?.signals?.dealsCompleted ? `${user.signals.dealsCompleted} deal${user.signals.dealsCompleted === 1 ? '' : 's'} done` : '',
    user?.signals?.reviewCount ? `★ ${Number(user.signals.ratingAverage).toFixed(1)} (${user.signals.reviewCount})` : '',
  ].filter(Boolean);
  const hasShop = isShopAccount && myShop;
  const shopRating =
    myShop?.ratingAverage != null ? Number(myShop.ratingAverage).toFixed(1) : 'New';

  const STATS = [
    {
      label: 'Active',
      value: activeCount,
      icon: 'grid-outline',
      tint: resolveColor('colors.menuBlue', colors),
      onPress: () => navigation.navigate(ROUTES.MY_LISTINGS, { initialTab: 'active' }),
    },
    {
      label: 'Sold',
      value: soldCount,
      icon: 'bag-check-outline',
      tint: colors.gradientStart,
      onPress: () => navigation.navigate(ROUTES.MY_LISTINGS, { initialTab: 'sold' }),
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
      label: 'My Listings',
      icon: 'list-outline',
      tint: resolveColor('colors.menuBlue', colors),
      bg: resolveColor('colors.pastelIndigo', colors),
      onPress: () => navigation.navigate(ROUTES.MY_LISTINGS),
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
      label: 'Saved',
      icon: 'heart-outline',
      tint: colors.danger,
      bg: resolveColor('colors.pastelRed', colors),
      onPress: () => navigation.navigate(ROUTES.WISHLIST),
    },
    {
      label: 'Wallet',
      icon: 'wallet-outline',
      tint: resolveColor('colors.menuPurple', colors),
      bg: resolveColor('colors.iconBackground', colors),
      onPress: () => navigation.navigate(ROUTES.WALLET),
    },
    {
      label: 'Invite',
      icon: 'gift-outline',
      tint: resolveColor('colors.menuOrange', colors),
      bg: resolveColor('colors.pastelOrange', colors),
      onPress: () => navigation.navigate(ROUTES.INVITE_FRIENDS),
    },
    ...(hasShop
      ? [
          {
            label: 'Recent',
            icon: 'time-outline',
            tint: resolveColor('colors.menuCyan', colors),
            bg: resolveColor('colors.pastelCyan', colors),
            onPress: () => navigation.navigate(ROUTES.RECENTLY_VIEWED),
          },
        ]
      : []),
  ];

  const editRoute = isShopAccount ? ROUTES.EDIT_SHOP : ROUTES.EDIT_PROFILE;

  const MENU_SECTIONS = [
    {
      title: 'Account',
      items: [
        isShopAccount
          ? {
              label: 'Edit Store Profile',
              hint: 'Store name, logo and details',
              icon: 'storefront-outline',
              tint: colors.primary,
              bg: resolveColor('colors.pastelGreen', colors),
              onPress: () => navigation.navigate(editRoute),
            }
          : {
              label: 'Edit Profile',
              hint: 'Name, photo and bio',
              icon: 'person-outline',
              tint: resolveColor('colors.menuBlue', colors),
              bg: resolveColor('colors.pastelIndigo', colors),
              onPress: () => navigation.navigate(editRoute),
            },
        {
          label: 'Address & Location',
          hint: 'Your area and meetup places',
          icon: 'location-outline',
          tint: colors.danger,
          bg: resolveColor('colors.pastelRed', colors),
          onPress: () => navigation.navigate(ROUTES.ADDRESSES),
        },
        {
          label: 'Payment Methods',
          hint: 'eSewa, Khalti, bank or cash',
          icon: 'card-outline',
          tint: resolveColor('colors.menuPurple', colors),
          bg: resolveColor('colors.iconBackground', colors),
          onPress: () => navigation.navigate(ROUTES.PAYMENT_METHODS),
        },
      ],
    },
    {
      title: 'Preferences',
      items: [
        {
          label: 'Notifications',
          hint: 'Messages, offers and listing updates',
          icon: 'notifications-outline',
          tint: resolveColor('colors.menuOrange', colors),
          bg: resolveColor('colors.pastelOrange', colors),
          badge: unreadCount,
          onPress: () => navigation.navigate(ROUTES.NOTIFICATIONS),
        },
        {
          label: 'Settings',
          hint: 'Theme, privacy and app settings',
          icon: 'settings-outline',
          tint: colors.textSecondary,
          bg: resolveColor('colors.iconBackground', colors),
          onPress: () => navigation.navigate(ROUTES.SETTINGS),
        },
      ],
    },
    {
      title: 'Support',
      items: [
        {
          label: 'Help Center',
          hint: 'FAQs and contact support',
          icon: 'help-circle-outline',
          tint: resolveColor('colors.menuCyan', colors),
          bg: resolveColor('colors.pastelCyan', colors),
          onPress: () => navigation.navigate(ROUTES.HELP),
        },
      ],
    },
  ];

  const headerName = hasShop ? myShop.name : user?.name || 'KinBech User';
  const headerImage = hasShop ? myShop.logo || user?.avatarUrl : user?.avatarUrl;
  const headerBio = hasShop ? myShop.tagline : user?.bio;
  const isVerified = hasShop ? myShop.isVerified : user?.verified;
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
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCover}
            pointerEvents="none"
          />
          {hasShop && myShop.coverImage ? (
            <>
              <Image source={{ uri: resolveMediaUrl(myShop.coverImage) }} style={styles.headerCover} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.45)', 'rgba(6,78,59,0.9)']}
                style={styles.headerCover}
                pointerEvents="none"
              />
            </>
          ) : null}
          <View style={styles.headerGlow} pointerEvents="none" />

          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>My Profile</Text>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => navigation.navigate(ROUTES.NOTIFICATIONS)}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityLabel="Notifications"
              >
                <Icon name="notifications-outline" size={18} color={colors.white} />
                {unreadCount > 0 ? <View style={styles.iconDot} /> : null}
              </Pressable>
              <Pressable
                onPress={() => navigation.navigate(ROUTES.SETTINGS)}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityLabel="Settings"
              >
                <Icon name="settings-outline" size={18} color={colors.white} />
              </Pressable>
            </View>
          </View>

          <View style={styles.identity}>
            <Pressable onPress={() => navigation.navigate(editRoute)} style={styles.avatarWrap}>
              <View style={[styles.avatarRing, isShopAccount && styles.avatarRingStore]}>
                <View style={[styles.avatar, isShopAccount && styles.avatarStore]}>
                  {headerImage ? (
                    <Image source={{ uri: resolveMediaUrl(headerImage) }} style={styles.avatarImage} />
                  ) : (
                    <Icon name={isShopAccount ? 'storefront' : 'person'} size={34} color={colors.textMuted} />
                  )}
                </View>
              </View>
              <View style={styles.editBadge}>
                <Icon name="pencil" size={11} color={colors.gradientStart} />
              </View>
            </Pressable>

            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>
                {headerName}
              </Text>
              {isVerified ? (
                <Icon name={hasShop ? 'shield-checkmark' : 'checkmark-circle'} size={17} color={colors.white} />
              ) : null}
            </View>
            {contactLine ? (
              <Text style={styles.contactText} numberOfLines={1}>
                {contactLine}
              </Text>
            ) : null}

            <View style={styles.badges}>
              <View style={styles.badge}>
                <Icon name={isShopAccount ? 'storefront-outline' : 'person-outline'} size={11} color={colors.white} />
                <Text style={styles.badgeText}>{isShopAccount ? 'Store' : 'Individual'}</Text>
              </View>
              {user?.isTester ? (
                <View style={styles.badge}>
                  <Icon name="flask-outline" size={11} color={colors.white} />
                  <Text style={styles.badgeText}>Tester mode</Text>
                </View>
              ) : null}
              {isVerified ? (
                <View style={styles.badge}>
                  <Icon name="shield-checkmark-outline" size={11} color={colors.white} />
                  <Text style={styles.badgeText}>Verified</Text>
                </View>
              ) : null}
              {joined ? (
                <View style={styles.badge}>
                  <Icon name="calendar-outline" size={11} color={colors.white} />
                  <Text style={styles.badgeText}>Since {joined}</Text>
                </View>
              ) : null}
            </View>

            {headerBio ? (
              <Text style={styles.bio} numberOfLines={2}>
                {headerBio}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.statsCard}>
          {STATS.map((stat, i) => (
            <Pressable
              key={stat.label}
              style={({ pressed }) => [styles.stat, i > 0 && styles.statDivider, pressed && styles.pressed]}
              onPress={stat.onPress}
            >
              <View style={[styles.statIcon, { backgroundColor: `${stat.tint}1F` }]}>
                <Icon name={stat.icon} size={14} color={stat.tint} />
              </View>
              {statsLoaded ? (
                <Text style={styles.statValue}>{stat.value}</Text>
              ) : (
                <ActivityIndicator size="small" color={stat.tint} style={styles.statSpinner} />
              )}
              <Text style={styles.statLabel}>{stat.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.body}>
          {reviewCount > 0 ? (
            <Pressable
              style={({ pressed }) => [styles.reviewBanner, pressed && styles.pressed]}
              onPress={() => navigation.navigate(ROUTES.MY_LISTINGS)}
            >
              <View style={styles.reviewIcon}>
                <Icon name="time-outline" size={16} color={colors.statusPending} />
              </View>
              <View style={styles.reviewCopy}>
                <Text style={styles.reviewTitle}>
                  {reviewCount === 1 ? '1 listing needs attention' : `${reviewCount} listings need attention`}
                </Text>
                <Text style={styles.reviewText}>{attentionText}. Tap to see why.</Text>
              </View>
              <Icon name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          ) : null}

          {level ? (
            <View>
              <Text style={styles.sectionTitle}>Your seller level</Text>
              <View style={[styles.card, styles.levelCard]}>
                <View style={styles.levelHead}>
                  <View style={[styles.reviewIcon, { backgroundColor: `${colors[level.tint] || colors.primary}1F` }]}>
                    <Icon name={level.icon} size={16} color={colors[level.tint] || colors.primary} />
                  </View>
                  <View style={styles.reviewCopy}>
                    <Text style={styles.reviewTitle}>{level.label}</Text>
                    {levelFacts.length ? <Text style={styles.reviewText}>{levelFacts.join(' · ')}</Text> : null}
                  </View>
                </View>
                <Text style={styles.levelTip}>{level.tip}</Text>
                {user?.strikeCount ? (
                  <Text style={[styles.levelTip, { color: colors.deleteRed }]}>
                    {user.strikeCount === 1 ? '1 warning' : `${user.strikeCount} warnings`} on your account. Another one can pause your account.
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View>
            <Text style={styles.sectionTitle}>Quick actions</Text>
            <View style={[styles.card, styles.qaGrid]}>
              {QUICK_ACTIONS.map((a) => (
                <Pressable
                  key={a.label}
                  style={({ pressed }) => [styles.qaItem, pressed && styles.pressed]}
                  onPress={a.onPress}
                >
                  <View style={[styles.qaIcon, { backgroundColor: a.bg }]}>
                    <Icon name={a.icon} size={20} color={a.tint} />
                  </View>
                  <Text style={styles.qaLabel} numberOfLines={1}>
                    {a.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {MENU_SECTIONS.map((section) => (
            <View key={section.title}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <View style={styles.card}>
                {section.items.map((item, index) => (
                  <Pressable
                    key={item.label}
                    style={({ pressed }) => [
                      styles.menuRow,
                      index < section.items.length - 1 && styles.menuRowBorder,
                      pressed && styles.menuRowPressed,
                    ]}
                    onPress={item.onPress}
                  >
                    <View style={[styles.menuIcon, { backgroundColor: item.bg }]}>
                      <Icon name={item.icon} size={17} color={item.tint} />
                    </View>
                    <View style={styles.menuCopy}>
                      <Text style={styles.menuLabel}>{item.label}</Text>
                      <Text style={styles.menuHint} numberOfLines={1}>
                        {item.hint}
                      </Text>
                    </View>
                    {item.badge > 0 ? (
                      <View style={styles.menuBadge}>
                        <Text style={styles.menuBadgeText}>{item.badge > 9 ? '9+' : item.badge}</Text>
                      </View>
                    ) : null}
                    <Icon name="chevron-forward" size={16} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed]}
            onPress={() => setShowLogoutModal(true)}
          >
            <Icon name="log-out-outline" size={17} color={colors.danger} />
            <Text style={styles.logoutText}>Log out</Text>
          </Pressable>

          <View style={styles.footer}>
            <Text style={styles.appName}>KinBech</Text>
            <Text style={styles.appInfo}>
              {Constants.expoConfig?.version
                ? `Buy and sell nearby · v${Constants.expoConfig.version}`
                : 'Buy and sell nearby'}
            </Text>
          </View>
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
    paddingHorizontal: 16,
    paddingBottom: 52,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.gradientStart,
  },
  headerCover: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  headerGlow: {
    position: 'absolute',
    top: -80,
    right: -60,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: 0.2,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.badge,
    borderWidth: 1.5,
    borderColor: colors.gradientStart,
  },
  identity: {
    alignItems: 'center',
    marginTop: 10,
  },
  avatarWrap: {
    marginBottom: 10,
  },
  avatarRing: {
    padding: 3,
    borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  avatarRingStore: {
    borderRadius: 26,
  },
  avatar: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarStore: {
    borderRadius: 22,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  editBadge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '90%',
  },
  name: {
    flexShrink: 1,
    fontSize: 21,
    fontWeight: '800',
    color: colors.white,
  },
  contactText: {
    marginTop: 3,
    fontSize: 12.5,
    color: 'rgba(255,255,255,0.85)',
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.white,
  },
  bio: {
    marginTop: 10,
    paddingHorizontal: 12,
    textAlign: 'center',
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.88)',
  },
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -32,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  statSpinner: {
    height: 24,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  pressed: {
    opacity: 0.7,
  },
  body: {
    paddingHorizontal: 16,
    marginTop: 18,
    gap: 18,
  },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${colors.statusPending}55`,
    backgroundColor: `${colors.statusPending}14`,
  },
  reviewIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.statusPending}22`,
  },
  reviewCopy: {
    flex: 1,
    gap: 2,
  },
  reviewTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  reviewText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  levelCard: {
    padding: 14,
    gap: 8,
  },
  levelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  levelTip: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  qaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: 8,
  },
  qaItem: {
    width: '25%',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  qaIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: colors.text,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuRowPressed: {
    backgroundColor: colors.iconBackground,
  },
  menuRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuCopy: {
    flex: 1,
    gap: 2,
  },
  menuLabel: {
    fontSize: 14.5,
    fontWeight: '700',
    color: colors.text,
  },
  menuHint: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  menuBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  menuBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.onPrimary,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${colors.danger}40`,
    backgroundColor: colors.dangerBackground,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.danger,
  },
  footer: {
    alignItems: 'center',
    gap: 2,
  },
  appName: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.textSecondary,
  },
  appInfo: {
    fontSize: 11,
    color: colors.textMuted,
  },
});
