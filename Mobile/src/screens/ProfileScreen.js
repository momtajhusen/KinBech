import { useCallback, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import { ActivityIndicator, Image, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { INFO_COPY, ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import GradientButton from '../components/GradientButton';
import LogoutConfirmModal from '../components/LogoutConfirmModal';
import { AlertModal } from '../components/AlertModal';
import { resolveMediaUrl } from '../utils/listing';
import { openCallSetup, readCallReadiness } from '../services/callReadiness';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { useAccountStatus } from '../hooks/useAccountStatus';
import { useAccountSwitch } from '../hooks/useAccountSwitch';
import AccountStatusCard from '../components/AccountStatusCard';
import TesterModeButton from '../components/TesterModeButton';

const SELLER_LEVELS = {
  top: { label: 'Top Seller', icon: 'trophy-outline', tint: 'success', tip: 'You are one of the most trusted sellers on KinBech. Your badge shows on your listings.' },
  trusted: { label: 'Trusted Seller', icon: 'shield-checkmark-outline', tint: 'success', tip: 'Buyers see your Trusted Seller badge. Keep replying fast to reach Top Seller.' },
  standard: { label: 'Seller', icon: 'person-outline', tint: 'primary', tip: 'Reply quickly, keep listings up to date and complete deals to earn the Trusted Seller badge.' },
  new: { label: 'New seller', icon: 'sparkles-outline', tint: 'primary', tip: 'Complete a few deals and reply to buyers to build your level.' },
  watch: { label: 'Needs attention', icon: 'alert-circle-outline', tint: 'warning', tip: 'Some buyers had a poor experience. Reply faster and keep listings accurate. For now you can post up to 3 listings a day.' },
  restricted: { label: 'Limited', icon: 'lock-closed-outline', tint: 'deleteRed', tip: 'New listings are checked by our team before going live. Reply to buyers and keep listings accurate to lift this.' },
};

const INDIVIDUAL_LOOK = {
  label: 'Individual seller',
  icon: 'person',
  tint: '#047857',
  accent: '#6EE7B7',
  accentSoft: 'rgba(110,231,183,0.18)',
  overlay: ['rgba(0,0,0,0.45)', 'rgba(6,78,59,0.9)'],
};

const STORE_LOOK = {
  label: 'Store account',
  icon: 'storefront',
  tint: '#0E7490',
  accent: '#FBBF24',
  accentSoft: 'rgba(251,191,36,0.16)',
  gradient: ['#0B1324', '#12324F', '#0E7490'],
  overlay: ['rgba(11,19,36,0.55)', 'rgba(14,116,144,0.92)'],
};

function SectionTitle({ title, tint, styles }) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionBar, { backgroundColor: tint }]} />
      <Text style={styles.sectionHeadText}>{title}</Text>
    </View>
  );
}

function resolveColor(colorRef, colors) {
  if (typeof colorRef === 'string' && colorRef.startsWith('colors.')) {
    const colorKey = colorRef.replace('colors.', '');
    return colors[colorKey] || colorRef;
  }
  return colorRef;
}

export default function ProfileScreen(props) {
  const { isLoggedIn } = useAuth();
  return isLoggedIn ? <MemberProfile {...props} /> : <GuestProfile {...props} />;
}

const GUEST_PERKS = [
  { icon: 'chatbubble-ellipses-outline', title: 'Chat with buyers and sellers', hint: 'Ask questions and plan a meetup' },
  { icon: 'heart-outline', title: 'Save items you like', hint: 'Find them again anytime' },
  { icon: 'pricetag-outline', title: 'Sell for free', hint: 'Post an item in a minute' },
];

function GuestProfile({ navigation }) {
  const { colors, isDark, setTheme, THEME_OPTIONS } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  const helpItems = [
    {
      label: 'Help Center',
      hint: 'FAQs and how KinBech works',
      icon: 'help-circle-outline',
      tint: resolveColor('colors.menuCyan', colors),
      bg: resolveColor('colors.pastelCyan', colors),
      onPress: () => navigation.navigate(ROUTES.HELP),
    },
    {
      label: 'Safe buying tips',
      hint: 'Meet, check and pay safely',
      icon: 'shield-checkmark-outline',
      tint: colors.primary,
      bg: resolveColor('colors.pastelGreen', colors),
      onPress: () => navigation.navigate(ROUTES.INFO, INFO_COPY.Article),
    },
    {
      label: 'Legal & Policies',
      hint: 'Terms, privacy and permissions',
      icon: 'library-outline',
      tint: resolveColor('colors.menuBlue', colors),
      bg: resolveColor('colors.pastelIndigo', colors),
      onPress: () => navigation.navigate(ROUTES.LEGAL_HUB),
    },
  ];

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 96 }}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <LinearGradient
            colors={[colors.gradientStart, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCover}
            pointerEvents="none"
          />
          <View style={styles.headerGlow} pointerEvents="none" />
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Profile</Text>
          </View>
          <View style={styles.identity}>
            <View style={[styles.avatarWrap, styles.avatarRing]}>
              <View style={styles.avatar}>
                <Icon name="person" size={34} color={colors.textMuted} />
              </View>
            </View>
            <Text style={styles.name}>Welcome to KinBech</Text>
            <Text style={styles.contactText}>Buy and sell with people near you</Text>
          </View>
        </View>

        <View style={styles.guestCard}>
          <Text style={styles.guestTitle}>Log in to get more from KinBech</Text>
          {GUEST_PERKS.map((perk) => (
            <View key={perk.title} style={styles.guestPerk}>
              <View style={styles.guestPerkIcon}>
                <Icon name={perk.icon} size={17} color={colors.primary} />
              </View>
              <View style={styles.menuCopy}>
                <Text style={styles.menuLabel}>{perk.title}</Text>
                <Text style={styles.menuHint}>{perk.hint}</Text>
              </View>
            </View>
          ))}
          <GradientButton
            title="Log in or sign up"
            icon="arrow-forward"
            onPress={() => navigation.navigate(ROUTES.LOGIN)}
            style={styles.guestCta}
          />
        </View>

        <View style={styles.body}>
          <View>
            <Text style={styles.sectionTitle}>Preferences</Text>
            <View style={styles.card}>
              <View style={styles.menuRow}>
                <View style={[styles.menuIcon, { backgroundColor: resolveColor('colors.iconBackground', colors) }]}>
                  <Icon name="moon-outline" size={17} color={resolveColor('colors.menuPurple', colors)} />
                </View>
                <View style={styles.menuCopy}>
                  <Text style={styles.menuLabel}>Dark mode</Text>
                  <Text style={styles.menuHint} numberOfLines={1}>Easier on the eyes at night</Text>
                </View>
                <Switch
                  value={isDark}
                  onValueChange={(value) => setTheme(value ? THEME_OPTIONS.DARK : THEME_OPTIONS.LIGHT)}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            </View>
          </View>

          <View>
            <Text style={styles.sectionTitle}>Help & Safety</Text>
            <View style={styles.card}>
              {helpItems.map((item, index) => (
                <Pressable
                  key={item.label}
                  style={({ pressed }) => [
                    styles.menuRow,
                    index < helpItems.length - 1 && styles.menuRowBorder,
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
                  <Icon name="chevron-forward" size={16} color={colors.textTertiary} />
                </Pressable>
              ))}
            </View>
          </View>

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
    </View>
  );
}

function MemberProfile({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, logout, refreshUser } = useAuth();
  const { linked, switching, error: switchError, switchNow } = useAccountSwitch();
  const refreshUserRef = useRef(refreshUser);
  refreshUserRef.current = refreshUser;
  const [listings, setListings] = useState([]);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showLevelInfo, setShowLevelInfo] = useState(false);
  const [myShop, setMyShop] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const { status: accountStatus, reload: reloadAccountStatus } = useAccountStatus();

  const isShopAccount = user?.sellerTypePreference === 'shop';

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

  const { refreshing, onRefresh } = usePullRefresh(() => Promise.all([loadProfile(), reloadAccountStatus()]));

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
        {
          label: 'Plans & post limits',
          hint: 'Posts left today and seller plans',
          icon: 'rocket-outline',
          tint: colors.primary,
          bg: resolveColor('colors.pastelGreen', colors),
          onPress: () => navigation.navigate(ROUTES.SUBSCRIPTION),
        },
        {
          label: 'Plan bills',
          hint: 'Payment history and receipts',
          icon: 'receipt-outline',
          tint: resolveColor('colors.menuOrange', colors),
          bg: resolveColor('colors.pastelOrange', colors),
          onPress: () => navigation.navigate(ROUTES.PAYMENT_HISTORY),
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
        ...(readCallReadiness()
          ? [
              {
                label: 'Call settings',
                hint: 'Ring when the app is closed or locked',
                icon: 'call-outline',
                tint: colors.success,
                bg: resolveColor('colors.iconBackground', colors),
                onPress: openCallSetup,
              },
            ]
          : []),
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
  const look = isShopAccount ? STORE_LOOK : { ...INDIVIDUAL_LOOK, gradient: ['#064E3B', colors.gradientStart, colors.gradientEnd] };
  const sectionTint = isShopAccount ? STORE_LOOK.tint : colors.primary;

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 96 }}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={[styles.header, styles.memberHeader, { paddingTop: insets.top + 6, backgroundColor: look.gradient[0] }]}>
          <LinearGradient
            colors={look.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCover}
            pointerEvents="none"
          />
          {hasShop && myShop.coverImage ? (
            <>
              <Image source={{ uri: resolveMediaUrl(myShop.coverImage) }} style={styles.headerCover} resizeMode="cover" />
              <LinearGradient colors={look.overlay} style={styles.headerCover} pointerEvents="none" />
            </>
          ) : null}
          <View style={styles.headerGlow} pointerEvents="none" />
          <View style={[styles.headerGlowSm, { backgroundColor: look.accentSoft }]} pointerEvents="none" />
          {isShopAccount ? <View style={styles.storeStripe} pointerEvents="none" /> : null}

          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>{isShopAccount ? 'My Store' : 'My Profile'}</Text>
            <View style={styles.headerActions}>
              <TesterModeButton style={styles.testerBtn} />
              <Pressable
                onPress={() => navigation.navigate(ROUTES.NOTIFICATIONS)}
                hitSlop={8}
                style={styles.iconBtn}
                accessibilityLabel="Notifications"
              >
                <Icon name="notifications-outline" size={18} color={colors.white} />
                {unreadCount > 0 ? <View style={[styles.iconDot, { borderColor: look.gradient[1] }]} /> : null}
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

          <View style={styles.identityRow}>
            <Pressable onPress={() => navigation.navigate(editRoute)}>
              <LinearGradient
                colors={[look.accent, 'rgba(255,255,255,0.35)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.idRing, isShopAccount && styles.idRingStore]}
              >
                <View style={[styles.idAvatar, isShopAccount && styles.idAvatarStore]}>
                  {headerImage ? (
                    <Image source={{ uri: resolveMediaUrl(headerImage) }} style={styles.avatarImage} />
                  ) : (
                    <Icon name={look.icon} size={30} color={look.tint} />
                  )}
                </View>
              </LinearGradient>
              <View style={[styles.editBadge, styles.idEditBadge]}>
                <Icon name="pencil" size={10} color={look.tint} />
              </View>
            </Pressable>

            <View style={styles.identityCopy}>
              <View style={styles.chipRow}>
                <View style={[styles.typeChip, { backgroundColor: look.accentSoft, borderColor: `${look.accent}88` }]}>
                  <Icon name={look.icon} size={11} color={look.accent} />
                  <Text style={[styles.typeChipText, { color: look.accent }]}>{look.label}</Text>
                </View>
                {level ? (
                  <Pressable
                    onPress={() => setShowLevelInfo(true)}
                    hitSlop={6}
                    style={({ pressed }) => [styles.levelPill, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityLabel={`Seller level: ${level.label}. Tap for details.`}
                  >
                    <Icon name={level.icon} size={11} color={colors.white} />
                    <Text style={styles.levelPillText} numberOfLines={1}>{level.label}</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={[styles.nameRow, styles.idNameRow]}>
                <Text style={[styles.name, styles.idName]} numberOfLines={1}>
                  {headerName}
                </Text>
                {isVerified ? (
                  <Icon name={hasShop ? 'shield-checkmark' : 'checkmark-circle'} size={17} color={look.accent} />
                ) : null}
              </View>
              {contactLine ? (
                <Text style={styles.contactText} numberOfLines={1}>
                  {contactLine}
                </Text>
              ) : null}
            </View>
          </View>

          {headerBio ? (
            <Text style={[styles.bio, styles.idBio]} numberOfLines={2}>
              {headerBio}
            </Text>
          ) : null}

          <View style={[styles.badges, styles.idBadges]}>
              {isVerified ? (
                <View style={[styles.badge, styles.idBadge]}>
                  <Icon name="shield-checkmark-outline" size={11} color={colors.white} />
                  <Text style={styles.badgeText}>Verified</Text>
                </View>
              ) : null}
              {joined ? (
                <View style={[styles.badge, styles.idBadge]}>
                  <Icon name="calendar-outline" size={11} color={colors.white} />
                  <Text style={styles.badgeText}>Since {joined}</Text>
                </View>
              ) : null}
          </View>
        </View>

        <View style={styles.statsCard}>
          {STATS.map((stat) => (
            <Pressable
              key={stat.label}
              style={({ pressed }) => [styles.stat, { backgroundColor: `${stat.tint}12` }, pressed && styles.pressed]}
              onPress={stat.onPress}
            >
              <View style={[styles.statIcon, { backgroundColor: stat.tint }]}>
                <Icon name={stat.icon} size={12} color="#FFFFFF" />
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
          {accountStatus ? (
            <View>
              <SectionTitle title="Account status" tint={sectionTint} styles={styles} />
              <AccountStatusCard
                status={accountStatus}
                user={user}
                onOpenPlans={() => navigation.navigate(ROUTES.SUBSCRIPTION)}              />
            </View>
          ) : null}

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

          <View>
            <SectionTitle title="Quick actions" tint={sectionTint} styles={styles} />
            <View style={styles.qaGrid}>
              {QUICK_ACTIONS.map((a) => (
                <Pressable
                  key={a.label}
                  style={({ pressed }) => [styles.qaCell, pressed && styles.pressed]}
                  onPress={a.onPress}
                >
                  <View style={[styles.qaItem, { backgroundColor: `${a.tint}10`, borderColor: `${a.tint}26` }]}>
                    <View style={[styles.qaIcon, { backgroundColor: a.tint }]}>
                      <Icon name={a.icon} size={15} color="#FFFFFF" />
                    </View>
                    <Text style={styles.qaLabel} numberOfLines={1}>
                      {a.label}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {MENU_SECTIONS.map((section) => (
            <View key={section.title}>
              <SectionTitle title={section.title} tint={sectionTint} styles={styles} />
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
                      <Icon name={item.icon} size={15} color={item.tint} />
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
                    <View style={styles.menuChevron}>
                      <Icon name="chevron-forward" size={13} color={colors.textTertiary} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}

          {linked ? (
            <View>
              <View style={styles.card}>
                <Pressable
                  style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  onPress={switchNow}
                  disabled={switching}
                >
                  <View style={[styles.menuIcon, { backgroundColor: `${colors.primary}1A` }]}>
                    <Icon name="swap-horizontal" size={15} color={colors.primary} />
                  </View>
                  <View style={styles.menuCopy}>
                    <Text style={styles.menuLabel}>Switch to admin panel</Text>
                    <Text style={styles.menuHint} numberOfLines={1}>
                      Same Google account · no need to log out
                    </Text>
                  </View>
                  <View style={styles.menuChevron}>
                    {switching ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Icon name="chevron-forward" size={13} color={colors.textTertiary} />
                    )}
                  </View>
                </Pressable>
              </View>
              {switchError ? <Text style={styles.switchError}>{switchError}</Text> : null}
            </View>
          ) : null}

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
          navigation.reset({ index: 0, routes: [{ name: ROUTES.MAIN_TABS }] });
        }}
      />
      {level ? (
        <AlertModal
          visible={showLevelInfo}
          onClose={() => setShowLevelInfo(false)}
          type={level.tint === 'warning' || level.tint === 'deleteRed' ? 'warning' : 'info'}
          title={`Seller level: ${level.label}`}
          message={[levelFacts.join(' · '), level.tip].filter(Boolean).join('\n\n')}
          primaryButton={{ text: 'OK', onPress: () => setShowLevelInfo(false) }}
        />
      ) : null}
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
  headerGlowSm: {
    position: 'absolute',
    bottom: -70,
    left: -50,
    width: 170,
    height: 170,
    borderRadius: 85,
  },
  storeStripe: {
    position: 'absolute',
    top: 0,
    right: 54,
    width: 26,
    height: '160%',
    backgroundColor: 'rgba(251,191,36,0.10)',
    transform: [{ rotate: '24deg' }],
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  identityCopy: {
    flex: 1,
    alignItems: 'flex-start',
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
    borderWidth: 1,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  levelPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  levelPillText: {
    flexShrink: 1,
    fontSize: 10.5,
    fontWeight: '800',
    color: colors.white,
  },
  typeChipText: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  idRing: {
    padding: 2.5,
    borderRadius: 36,
  },
  idRingStore: {
    borderRadius: 20,
  },
  idAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.white,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  idAvatarStore: {
    borderRadius: 17,
  },
  idEditBadge: {
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  idNameRow: {
    maxWidth: '100%',
  },
  idName: {
    fontSize: 20,
  },
  memberHeader: {
    paddingBottom: 38,
  },
  idBio: {
    marginTop: 8,
    paddingHorizontal: 0,
    textAlign: 'left',
  },
  idBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  idBadges: {
    justifyContent: 'flex-start',
    marginTop: 8,
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
  testerBtn: { width: 36, height: 36, borderRadius: 18 },
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
    gap: 8,
    marginHorizontal: 16,
    marginTop: -26,
    padding: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
    paddingVertical: 7,
    borderRadius: 12,
  },
  statIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 15.5,
    fontWeight: '800',
    color: colors.text,
  },
  statSpinner: {
    height: 21,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  pressed: {
    opacity: 0.7,
  },
  guestCard: {
    marginHorizontal: 16,
    marginTop: -32,
    padding: 16,
    gap: 12,
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
  guestTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 2,
  },
  guestPerk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  guestPerkIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '16',
  },
  guestCta: {
    marginTop: 4,
  },
  body: {
    paddingHorizontal: 16,
    marginTop: 14,
    gap: 14,
  },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${colors.statusPending}55`,
    backgroundColor: `${colors.statusPending}14`,
  },
  reviewIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.statusPending}22`,
  },
  reviewCopy: {
    flex: 1,
    gap: 2,
  },
  reviewTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  reviewText: {
    fontSize: 11.5,
    color: colors.textSecondary,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionBar: {
    width: 3,
    height: 13,
    borderRadius: 2,
  },
  sectionHeadText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  qaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -3,
  },
  qaCell: {
    width: '25%',
    padding: 3,
  },
  qaItem: {
    alignItems: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1,
  },
  qaIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuChevron: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted || colors.iconBackground,
  },
  menuRowPressed: {
    backgroundColor: colors.iconBackground,
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
  menuCopy: {
    flex: 1,
    gap: 1,
  },
  menuLabel: {
    fontSize: 13.5,
    fontWeight: '700',
    color: colors.text,
  },
  menuHint: {
    fontSize: 11.5,
    color: colors.textMuted,
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
  switchError: {
    marginTop: 6,
    marginHorizontal: 4,
    fontSize: 12,
    fontWeight: '600',
    color: colors.danger,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
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
