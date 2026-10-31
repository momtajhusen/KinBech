import {
  CommonActions,
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  useNavigation,
} from '@react-navigation/native';
import { navigationRef, flushPendingCallNavigation } from './navigationRef';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useEffect, useMemo, useRef } from 'react';
import { AppState, BackHandler, Platform, ToastAndroid } from 'react-native';

import BottomTabBar from '../components/BottomTabBar';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { consumeNativePendingCall } from '../services/callWatch';
import { autoAllowBackground, shareMediaBaseWithNative } from '../services/callReadiness';
import CallSetupModal from '../components/CallSetupModal';
import VoiceHost from '../components/VoiceHost';
import { getNotificationPermission, syncDeviceToken } from '../services/notifications';
import { resolveMediaUrl } from '../utils/listing';
import {
  consumeInitialCallNotification,
  dismissIncomingCallNotification,
  isCallDeclined,
  subscribeCallNotificationEvents,
  subscribeIncomingCall,
} from '../services/callNotifications';
import {
  dismissNativeIncomingCall,
  ensureCallKeep,
  hideIncomingCallBanner,
  markCallUiMounted,
  presentIncomingCall,
  releaseIncomingCall,
} from '../services/CallKeepManager';
import { getActiveChatId, playNewMessageSound, stopCallSounds } from '../services/sounds';
import {
  consumeInitialAlert,
  consumePendingChatAlert,
  displayAlert,
  ensureAlertChannel,
  isForSignedInUser,
  subscribeAlertPress,
  subscribeNativeChatAlert,
  subscribeQueuedAlertOpen,
} from '../services/pushAlerts';
import { useTheme } from '../theme';
import CallScreen from '../screens/CallScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ExploreScreen from '../screens/ExploreScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SplashScreen from '../screens/SplashScreen';
import SignedInModal from '../components/SignedInModal';
import AccountChoiceModal from '../components/AccountChoiceModal';
import AdminTabBar from '../components/admin/AdminTabBar';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import { setPresenceEnabled, trackScreen } from '../services/presence';
import { ADMIN_ROUTES, isAdminUser } from '../utils/admin';

// Screens outside the first tabs load on first open, so app start parses less code.
const loadPostListingScreen = () => require('../screens/PostListingScreen').default;
const loadAllCategoriesScreen = () => require('../screens/AllCategoriesScreen').default;
const loadChatScreen = () => require('../screens/ChatScreen').default;
const loadCreateShopScreen = () => require('../screens/CreateShopScreen').default;
const loadShopVerificationScreen = () => require('../screens/ShopVerificationScreen').default;
const loadInviteFriendsScreen = () => require('../screens/InviteFriendsScreen').default;
const loadCurrencySelectScreen = () => require('../screens/CurrencySelectScreen').default;
const loadEditListingScreen = () => require('../screens/EditListingScreen').default;
const loadEditProfileScreen = () => require('../screens/EditProfileScreen').default;
const loadEditShopScreen = () => require('../screens/EditShopScreen').default;
const loadHelpSupportScreen = () => require('../screens/HelpSupportScreen').default;
const loadIndividualPostListingScreen = () => require('../screens/IndividualPostListingScreen').default;
const loadInfoScreen = () => require('../screens/InfoScreen').default;
const loadItemDetailScreen = () => require('../screens/ItemDetailScreen').default;
const loadLanguageSelectScreen = () => require('../screens/LanguageSelectScreen').default;
const loadMyListingsScreen = () => require('../screens/MyListingsScreen').default;
const loadMyPurchasesScreen = () => require('../screens/MyPurchasesScreen').default;
const loadRecentlyViewedScreen = () => require('../screens/RecentlyViewedScreen').default;
const loadNotificationsScreen = () => require('../screens/NotificationsScreen').default;
const loadPrivacyPolicyScreen = () => require('../screens/PrivacyPolicyScreen').default;
const loadPrivacyScreen = () => require('../screens/PrivacyScreen').default;
const loadProfileSetupScreen = () => require('../screens/ProfileSetupScreen').default;
const loadRateReviewScreen = () => require('../screens/RateReviewScreen').default;
const loadReportBlockUserScreen = () => require('../screens/ReportBlockUserScreen').default;
const loadSearchResultsScreen = () => require('../screens/SearchResultsScreen').default;
const loadSellerProfileScreen = () => require('../screens/SellerProfileScreen').default;
const loadSellerTypeSelectionScreen = () => require('../screens/SellerTypeSelectionScreen').default;
const loadSettingsScreen = () => require('../screens/SettingsScreen').default;
const loadStoreCategorySelectionScreen = () => require('../screens/StoreCategorySelectionScreen').default;
const loadShopPostListingScreen = () => require('../screens/ShopPostListingScreen').default;
const loadShopProfileScreen = () => require('../screens/ShopProfileScreen').default;
const loadShopDashboardScreen = () => require('../screens/ShopDashboardScreen').default;
const loadTermsScreen = () => require('../screens/TermsScreen').default;
const loadLegalHubScreen = () => require('../screens/LegalHubScreen').default;
const loadLegalDocumentScreen = () => require('../components/LegalDocumentScreen').default;
const loadWishlistScreen = () => require('../screens/WishlistScreen').default;
const loadSavedAddressesScreen = () => require('../screens/SavedAddressesScreen').default;
const loadPaymentMethodsScreen = () => require('../screens/PaymentMethodsScreen').default;
const loadWalletScreen = () => require('../screens/WalletScreen').default;
const loadSubscriptionScreen = () => require('../screens/SubscriptionScreen').default;
const loadPaymentHistoryScreen = () => require('../screens/PaymentHistoryScreen').default;
const loadTesterModeScreen = () => require('../screens/TesterModeScreen').default;
const loadContactUsScreen = () => require('../screens/ContactUsScreen').default;
const loadListingSuccessScreen = () => require('../screens/ListingSuccessScreen').default;
const loadShopStorefrontQrScreen = () => require('../screens/ShopStorefrontQrScreen').default;
const loadAdminReportsScreen = () => require('../screens/admin/AdminReportsScreen').default;
const loadAdminListingsScreen = () => require('../screens/admin/AdminListingsScreen').default;
const loadAdminUsersScreen = () => require('../screens/admin/AdminUsersScreen').default;
const loadAdminMoreScreen = () => require('../screens/admin/AdminMoreScreen').default;
const loadAdminShopsScreen = () => require('../screens/admin/AdminShopsScreen').default;
const loadAdminReviewsScreen = () => require('../screens/admin/AdminReviewsScreen').default;
const loadAdminPaymentsScreen = () => require('../screens/admin/AdminPaymentsScreen').default;
const loadAdminSupportScreen = () => require('../screens/admin/AdminSupportScreen').default;
const loadAdminUserDetailScreen = () => require('../screens/admin/AdminUserDetailScreen').default;
const loadAdminTestersScreen = () => require('../screens/admin/AdminTestersScreen').default;
const loadAdminScamScreen = () => require('../screens/admin/AdminScamScreen').default;
const loadAdminLiveScreen = () => require('../screens/admin/AdminLiveScreen').default;

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function IncomingCallBridge() {
  const navigation = useNavigation();
  // The saved token is enough: waiting for /auth/me delays an answered call by a network round trip.
  const { isLoggedIn } = useAuth();
  const ringingChatRef = useRef('');

  useEffect(() => {
    if (!isLoggedIn) return undefined;

    const open = (call) => {
      if (!call?.chatId || isCallDeclined(call.chatId)) return;
      const state = navigation.getState?.();
      const current = state?.routes?.[state.index];
      if (current?.name === 'Call' && String(current.params?.chatId) === String(call.chatId)) {
        // The poll can open the ringing screen just before the Answer tap arrives.
        if (call.autoAnswer && !current.params?.autoAnswer) {
          navigation.dispatch({ ...CommonActions.setParams({ autoAnswer: true }), source: current.key });
        }
        return;
      }
      if (call.autoAnswer) {
        navigation.navigate('Call', {
          chatId: call.chatId,
          name: call.callerName,
          image: call.callerImage || undefined,
          incoming: true,
          autoAnswer: true,
          listing: call.listing,
        });
        return;
      }
      presentIncomingCall({
        chatId: call.chatId,
        callerName: call.callerName,
        callerImage: call.callerImage || '',
        listing: call.listing,
      });
    };

    const readInitial = async () => {
      const pending = await consumeNativePendingCall();
      if (pending?.chatId && !isCallDeclined(pending.chatId)) {
        const { data } = await api.getIncomingCall();
        if (String(data?.call?.chatId) === String(pending.chatId)) open(pending);
      }
      const call = await consumeInitialCallNotification();
      if (call) open(call);
    };

    const checkNow = async () => {
      const { data, error } = await api.getIncomingCall();
      if (error) return;
      if (!data?.call?.chatId) {
        if (ringingChatRef.current) {
          const endedChatId = ringingChatRef.current;
          ringingChatRef.current = '';
          releaseIncomingCall(endedChatId);
          dismissIncomingCallNotification(endedChatId);
          dismissNativeIncomingCall(endedChatId);
          stopCallSounds();
        }
        hideIncomingCallBanner();
        return;
      }
      if (isCallDeclined(data.call.chatId)) return;
      ringingChatRef.current = String(data.call.chatId);
      open({
        chatId: data.call.chatId,
        callerName: data.call.callerName,
        callerImage: resolveMediaUrl(data.call.callerImage),
        listing: data.call.listing,
      });
    };

    markCallUiMounted();
    ensureCallKeep().catch(() => {});
    shareMediaBaseWithNative();
    readInitial();
    const poll = setInterval(checkNow, 2000);
    const unsubscribeCalls = subscribeIncomingCall(open);
    const unsubscribeEvents = subscribeCallNotificationEvents(open);
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        readInitial();
        checkNow();
        return;
      }
      if (ringingChatRef.current) stopCallSounds();
    });

    return () => {
      clearInterval(poll);
      unsubscribeCalls();
      unsubscribeEvents();
      appState.remove();
    };
  }, [isLoggedIn, navigation]);

  return null;
}

const DIRECT_ALERT_ROUTES = new Set([
  'TesterMode',
  'Subscription',
  'MyListings',
  'PostListing',
  'EditProfile',
  'Wishlist',
  'Notifications',
]);

const ADMIN_TAB_ROUTES = new Set(['AdminDashboard', 'AdminReports', 'AdminListings', 'AdminUsers', 'AdminMore']);

function PushAlertBridge() {
  const navigation = useNavigation();
  const { ready, isLoggedIn } = useAuth();
  const seenRef = useRef(new Set());
  const primedRef = useRef(false);

  useEffect(() => {
    if (!ready || !isLoggedIn) return undefined;

    const openAlert = async (data) => {
      if (!data || !(await isForSignedInUser(data))) return;
      if (ADMIN_TAB_ROUTES.has(data.route)) {
        navigation.navigate('AdminTabs', { screen: data.route });
        return;
      }
      if (data.route === 'AdminUserDetail' && data.userId) {
        navigation.navigate('AdminUserDetail', { userId: String(data.userId) });
        return;
      }
      if (data.route === 'AdminShops') {
        navigation.navigate('AdminShops', { initial: data.initial || undefined });
        return;
      }
      if (ADMIN_ROUTES.has(data.route)) {
        navigation.navigate(data.route);
        return;
      }
      if (data.type === 'admin') {
        navigation.navigate('AdminTabs', { screen: 'AdminDashboard' });
        return;
      }
      if (data.chatId) {
        navigation.navigate('Chat', {
          chatId: String(data.chatId),
          name: data.name || undefined,
        });
        return;
      }
      if (data.route === 'ItemDetail' && data.listingId) {
        navigation.navigate('ItemDetail', { listingId: String(data.listingId) });
        return;
      }
      if (data.route === 'Explore') {
        navigation.navigate('MainTabs', {
          screen: 'Explore',
          params: { category: data.category || undefined, ts: Date.now() },
        });
        return;
      }
      if (data.route === 'Chats') {
        navigation.navigate('MainTabs', { screen: 'Chats' });
        return;
      }
      if (DIRECT_ALERT_ROUTES.has(data.route)) {
        navigation.navigate(data.route);
        return;
      }
      navigation.navigate('Notifications');
    };

    consumeInitialAlert().then(openAlert);
    consumePendingChatAlert().then((pending) => {
      if (pending?.chatId) openAlert(pending);
    });
    const unsubscribe = subscribeAlertPress(openAlert);
    const unsubscribeNative = subscribeNativeChatAlert(openAlert);
    const unsubscribeQueued = subscribeQueuedAlertOpen(openAlert);
    ensureAlertChannel().catch(() => {});

    const tick = async () => {
      const { data, error } = await api.getNotifications();
      if (error || !data?.notifications) return;
      const fresh = [];
      data.notifications.forEach((item) => {
        const id = String(item.id);
        if (!item.unread || seenRef.current.has(id)) return;
        seenRef.current.add(id);
        if (primedRef.current) fresh.push(item);
      });
      primedRef.current = true;
      for (const item of fresh) {
        const chatId = item.params?.chatId ? String(item.params.chatId) : '';
        // The push already showed it (system tray in background, onMessage in foreground).
        if (item.pushed) continue;
        if (item.type === 'chat' && chatId && chatId === getActiveChatId()) continue;
        if (item.type === 'call' && /incoming/i.test(item.title || '') && chatId) {
          continue;
        }
        await displayAlert({
          id: item.type === 'chat' && chatId ? `msg-${chatId}` : `note-${item.id}`,
          title: item.title,
          body: item.body,
          image: item.params?.image || '',
          data: {
            type: item.type || '',
            notificationId: String(item.id),
            chatId,
            name: item.params?.name || '',
            image: item.params?.image || '',
            listingImage: item.params?.listingImage || '',
            listingTitle: item.params?.listingTitle || '',
            route: item.route || '',
            listingId: item.params?.listingId ? String(item.params.listingId) : '',
            category: item.params?.category || '',
            bigPicture: item.params?.bigPicture || '',
            digest: item.params?.digest ? '1' : '',
          },
        });
      }
    };

    tick();
    const timer = setInterval(tick, 8000);
    return () => {
      clearInterval(timer);
      unsubscribe();
      unsubscribeNative();
      unsubscribeQueued();
      primedRef.current = false;
      seenRef.current = new Set();
    };
  }, [ready, isLoggedIn, navigation]);

  return null;
}

/** Without a saved token the server cannot wake a killed or locked phone for calls. */
function DeviceTokenBridge() {
  const { ready, isLoggedIn, user } = useAuth();
  const userId = user?._id || user?.id || '';
  const callsOn = isLoggedIn && !isAdminUser(user);

  useEffect(() => {
    if (!ready || !isLoggedIn) return undefined;
    syncDeviceToken({ force: true }).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncDeviceToken().catch(() => {});
    });
    return () => sub.remove();
  }, [ready, isLoggedIn, userId]);

  // Waits for notification permission so Android's background dialog never stacks on the permission prompt.
  useEffect(() => {
    if (!ready || !callsOn) return undefined;
    const askBackground = () =>
      getNotificationPermission()
        .then(({ granted }) => granted && autoAllowBackground())
        .catch(() => {});
    const timer = setTimeout(askBackground, 3000);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') askBackground();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [ready, callsOn]);

  return null;
}

function MessageSoundBridge() {
  const { ready, isLoggedIn } = useAuth();
  const seenRef = useRef(new Map());
  const primedRef = useRef(false);

  useEffect(() => {
    if (!ready || !isLoggedIn) return undefined;
    let cancelled = false;

    const tick = async () => {
      const { data, error } = await api.getChats();
      if (cancelled || error) return;
      const chats = data?.chats || [];
      let incoming = null;
      const next = new Map();
      chats.forEach((chat) => {
        const id = String(chat.id);
        const at = chat.lastMessageAt ? new Date(chat.lastMessageAt).getTime() : 0;
        next.set(id, at);
        const previous = seenRef.current.get(id) || 0;
        if (
          primedRef.current &&
          at > previous &&
          chat.lastMessageMine === false &&
          chat.lastMessageKind !== 'call' &&
          id !== getActiveChatId() &&
          (!incoming || at > incoming.at)
        ) {
          incoming = { id, at };
        }
      });
      seenRef.current = next;
      primedRef.current = true;
      if (incoming) playNewMessageSound(incoming.id, incoming.at);
    };

    tick();
    const timer = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      primedRef.current = false;
      seenRef.current = new Map();
    };
  }, [ready, isLoggedIn]);

  return null;
}

const EXIT_WINDOW_MS = 2000;

function AndroidBackHandler() {
  const lastPress = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;

    const onBack = () => {
      if (!navigationRef.isReady()) return true;
      const state = navigationRef.getRootState();
      const route = state?.routes?.[state.index];

      if (state && state.index > 0) {
        navigationRef.goBack();
        return true;
      }

      if (route?.name === 'MainTabs') {
        const tab = route.state;
        const tabName = tab?.routes?.[tab.index ?? 0]?.name || 'Home';
        if (tabName !== 'Home') {
          navigationRef.navigate('MainTabs', { screen: 'Home' });
          return true;
        }
      } else if (route?.name === 'AdminTabs') {
        const tab = route.state;
        const tabName = tab?.routes?.[tab.index ?? 0]?.name || 'AdminDashboard';
        if (tabName !== 'AdminDashboard') {
          navigationRef.navigate('AdminTabs', { screen: 'AdminDashboard' });
          return true;
        }
      } else if (ADMIN_ROUTES.has(route?.name)) {
        navigationRef.reset({ index: 0, routes: [{ name: 'AdminTabs' }] });
        return true;
      } else if (route?.name && route.name !== 'Login' && route.name !== 'Onboarding' && route.name !== 'Splash') {
        navigationRef.reset({
          index: 0,
          routes: [{ name: 'MainTabs', params: { screen: 'Home' } }],
        });
        return true;
      }

      const now = Date.now();
      if (now - lastPress.current < EXIT_WINDOW_MS) {
        BackHandler.exitApp();
        return true;
      }
      lastPress.current = now;
      ToastAndroid.show('Press back again to exit', ToastAndroid.SHORT);
      return true;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => subscription.remove();
  }, []);

  return null;
}

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
      <Tab.Screen 
        name="Explore" 
        component={ExploreScreen} 
        options={{ title: 'Explore' }}
        initialParams={{ category: undefined }}
      />
      <Tab.Screen name="Post" getComponent={loadPostListingScreen} options={{ title: 'Sell' }} />
      <Tab.Screen name="Chats" component={ChatListScreen} options={{ title: 'Chats' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

function AdminTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <AdminTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="AdminReports" getComponent={loadAdminReportsScreen} options={{ title: 'Reports' }} />
      <Tab.Screen name="AdminListings" getComponent={loadAdminListingsScreen} options={{ title: 'Listings' }} />
      <Tab.Screen name="AdminUsers" getComponent={loadAdminUsersScreen} options={{ title: 'Users' }} />
      <Tab.Screen name="AdminMore" getComponent={loadAdminMoreScreen} options={{ title: 'More' }} />
    </Tab.Navigator>
  );
}

/** Platform admins only see the admin panel; everyone else never lands on it. */
function syncAdminRoot(user, isLoggedIn) {
  if (!navigationRef.isReady()) return;
  const state = navigationRef.getRootState();
  const name = state?.routes?.[state.index]?.name;
  if (!name || name === 'Splash' || (isLoggedIn && !user)) return;
  const admin = isLoggedIn && isAdminUser(user);
  if (admin && !ADMIN_ROUTES.has(name)) {
    navigationRef.reset({ index: 0, routes: [{ name: 'AdminTabs' }] });
  } else if (!admin && ADMIN_ROUTES.has(name)) {
    navigationRef.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
  }
}

export default function AppNavigator() {
  const { colors, isDark } = useTheme();
  const { user, isLoggedIn } = useAuth();
  const adminMode = isLoggedIn && isAdminUser(user);
  const authRef = useRef({ user, isLoggedIn });
  authRef.current = { user, isLoggedIn };

  useEffect(() => {
    syncAdminRoot(user, isLoggedIn);
  }, [user, isLoggedIn]);

  useEffect(() => {
    setPresenceEnabled(!adminMode);
  }, [adminMode]);

  const navigationTheme = useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.badge,
        header: colors.surface,
        headerTitle: colors.text,
      },
    };
  }, [colors, isDark]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => {
        flushPendingCallNavigation();
        trackScreen(navigationRef.getCurrentRoute());
      }}
      onStateChange={() => {
        syncAdminRoot(authRef.current.user, authRef.current.isLoggedIn);
        trackScreen(navigationRef.getCurrentRoute());
      }}
    >
      <AndroidBackHandler />
      <DeviceTokenBridge />
      <PushAlertBridge />
      {adminMode ? null : (
        <>
          <IncomingCallBridge />
          <MessageSoundBridge />
          <CallSetupModal />
        </>
      )}
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: 'transparent' },
          animation: 'fade_from_bottom',
          animationDuration: 320,
          presentation: 'card',
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          fullScreenGestureEnabled: true,
          orientation: 'portrait',
        }}
      >
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="ProfileSetup" getComponent={loadProfileSetupScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
        <Stack.Screen name="AdminShops" getComponent={loadAdminShopsScreen} />
        <Stack.Screen name="AdminReviews" getComponent={loadAdminReviewsScreen} />
        <Stack.Screen name="AdminPayments" getComponent={loadAdminPaymentsScreen} />
        <Stack.Screen name="AdminSupport" getComponent={loadAdminSupportScreen} />
        <Stack.Screen name="AdminUserDetail" getComponent={loadAdminUserDetailScreen} />
        <Stack.Screen name="AdminTesters" getComponent={loadAdminTestersScreen} />
        <Stack.Screen name="AdminScam" getComponent={loadAdminScamScreen} />
        <Stack.Screen name="AdminLive" getComponent={loadAdminLiveScreen} />

        <Stack.Screen name="AllCategories" getComponent={loadAllCategoriesScreen} />
        <Stack.Screen name="SearchResults" getComponent={loadSearchResultsScreen} />
        <Stack.Screen name="ItemDetail" getComponent={loadItemDetailScreen} />
        <Stack.Screen name="PostListing" getComponent={loadPostListingScreen} />
        <Stack.Screen name="SellerTypeSelection" getComponent={loadSellerTypeSelectionScreen} />
        <Stack.Screen name="StoreCategorySelection" getComponent={loadStoreCategorySelectionScreen} />
        <Stack.Screen name="IndividualPostListing" getComponent={loadIndividualPostListingScreen} />
        <Stack.Screen name="ShopPostListing" getComponent={loadShopPostListingScreen} />
        <Stack.Screen name="CreateShop" getComponent={loadCreateShopScreen} />
        <Stack.Screen name="ShopVerification" getComponent={loadShopVerificationScreen} />
        <Stack.Screen name="InviteFriends" getComponent={loadInviteFriendsScreen} />
        <Stack.Screen name="EditListing" getComponent={loadEditListingScreen} />
        <Stack.Screen name="MyListings" getComponent={loadMyListingsScreen} />
        <Stack.Screen name="MyPurchases" getComponent={loadMyPurchasesScreen} />
        <Stack.Screen name="RecentlyViewed" getComponent={loadRecentlyViewedScreen} />
        <Stack.Screen name="ListingSuccess" getComponent={loadListingSuccessScreen} />
        <Stack.Screen name="Chat" getComponent={loadChatScreen} />
        <Stack.Screen name="Call" component={CallScreen} options={{ freezeOnBlur: false }} />
        <Stack.Screen name="Settings" getComponent={loadSettingsScreen} />
        <Stack.Screen name="Wishlist" getComponent={loadWishlistScreen} />
        <Stack.Screen name="Notifications" getComponent={loadNotificationsScreen} />
        <Stack.Screen name="RateReview" getComponent={loadRateReviewScreen} />
        <Stack.Screen name="ReportBlockUser" getComponent={loadReportBlockUserScreen} />
        <Stack.Screen name="HelpSupport" getComponent={loadHelpSupportScreen} />
        <Stack.Screen name="Info" getComponent={loadInfoScreen} />
        <Stack.Screen name="SellerProfile" getComponent={loadSellerProfileScreen} />
        <Stack.Screen name="ShopProfile" getComponent={loadShopProfileScreen} />
        <Stack.Screen name="ShopDashboard" getComponent={loadShopDashboardScreen} />
        <Stack.Screen name="ShopStorefrontQr" getComponent={loadShopStorefrontQrScreen} />
        <Stack.Screen name="EditProfile" getComponent={loadEditProfileScreen} />
        <Stack.Screen name="EditShop" getComponent={loadEditShopScreen} />
        <Stack.Screen name="Privacy" getComponent={loadPrivacyScreen} />
        <Stack.Screen name="LanguageSelect" getComponent={loadLanguageSelectScreen} />
        <Stack.Screen name="CurrencySelect" getComponent={loadCurrencySelectScreen} />
        <Stack.Screen name="Terms" getComponent={loadTermsScreen} />
        <Stack.Screen name="PrivacyPolicy" getComponent={loadPrivacyPolicyScreen} />
        <Stack.Screen name="LegalHub" getComponent={loadLegalHubScreen} />
        <Stack.Screen name="LegalDocument" getComponent={loadLegalDocumentScreen} />
        <Stack.Screen name="SavedAddresses" getComponent={loadSavedAddressesScreen} />
        <Stack.Screen name="PaymentMethods" getComponent={loadPaymentMethodsScreen} />
        <Stack.Screen name="Wallet" getComponent={loadWalletScreen} />
        <Stack.Screen name="Subscription" getComponent={loadSubscriptionScreen} />
        <Stack.Screen name="PaymentHistory" getComponent={loadPaymentHistoryScreen} />
        <Stack.Screen name="TesterMode" getComponent={loadTesterModeScreen} />
        <Stack.Screen name="ContactUs" getComponent={loadContactUsScreen} />
      </Stack.Navigator>
      <VoiceHost />
      <SignedInModal />
      <AccountChoiceModal />
    </NavigationContainer>
  );
}
