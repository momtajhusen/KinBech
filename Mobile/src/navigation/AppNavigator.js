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
import { shareMediaBaseWithNative } from '../services/callReadiness';
import CallSetupModal from '../components/CallSetupModal';
import { syncDeviceToken } from '../services/notifications';
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
import AllCategoriesScreen from '../screens/AllCategoriesScreen';
import CallScreen from '../screens/CallScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateShopScreen from '../screens/CreateShopScreen';
import ShopVerificationScreen from '../screens/ShopVerificationScreen';
import InviteFriendsScreen from '../screens/InviteFriendsScreen';
import CurrencySelectScreen from '../screens/CurrencySelectScreen';
import EditListingScreen from '../screens/EditListingScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import EditShopScreen from '../screens/EditShopScreen';
import ExploreScreen from '../screens/ExploreScreen';
import HelpSupportScreen from '../screens/HelpSupportScreen';
import HomeScreen from '../screens/HomeScreen';
import IndividualPostListingScreen from '../screens/IndividualPostListingScreen';
import InfoScreen from '../screens/InfoScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import LanguageSelectScreen from '../screens/LanguageSelectScreen';
import LoginScreen from '../screens/LoginScreen';
import MyListingsScreen from '../screens/MyListingsScreen';
import MyPurchasesScreen from '../screens/MyPurchasesScreen';
import RecentlyViewedScreen from '../screens/RecentlyViewedScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import PostListingScreen from '../screens/PostListingScreen';
import PrivacyPolicyScreen from '../screens/PrivacyPolicyScreen';
import PrivacyScreen from '../screens/PrivacyScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ProfileSetupScreen from '../screens/ProfileSetupScreen';
import RateReviewScreen from '../screens/RateReviewScreen';
import ReportBlockUserScreen from '../screens/ReportBlockUserScreen';
import SearchResultsScreen from '../screens/SearchResultsScreen';
import SellerProfileScreen from '../screens/SellerProfileScreen';
import SellerTypeSelectionScreen from '../screens/SellerTypeSelectionScreen';
import SettingsScreen from '../screens/SettingsScreen';
import StoreCategorySelectionScreen from '../screens/StoreCategorySelectionScreen';
import ShopPostListingScreen from '../screens/ShopPostListingScreen';
import ShopProfileScreen from '../screens/ShopProfileScreen';
import ShopDashboardScreen from '../screens/ShopDashboardScreen';
import SplashScreen from '../screens/SplashScreen';
import SignedInModal from '../components/SignedInModal';
import AccountChoiceModal from '../components/AccountChoiceModal';
import TermsScreen from '../screens/TermsScreen';
import LegalHubScreen from '../screens/LegalHubScreen';
import LegalDocumentScreen from '../components/LegalDocumentScreen';
import WishlistScreen from '../screens/WishlistScreen';
import SavedAddressesScreen from '../screens/SavedAddressesScreen';
import PaymentMethodsScreen from '../screens/PaymentMethodsScreen';
import WalletScreen from '../screens/WalletScreen';
import SubscriptionScreen from '../screens/SubscriptionScreen';
import PaymentHistoryScreen from '../screens/PaymentHistoryScreen';
import TesterModeScreen from '../screens/TesterModeScreen';
import ContactUsScreen from '../screens/ContactUsScreen';
import ListingSuccessScreen from '../screens/ListingSuccessScreen';
import ShopStorefrontQrScreen from '../screens/ShopStorefrontQrScreen';
import AdminTabBar from '../components/admin/AdminTabBar';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminReportsScreen from '../screens/admin/AdminReportsScreen';
import AdminListingsScreen from '../screens/admin/AdminListingsScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminMoreScreen from '../screens/admin/AdminMoreScreen';
import AdminShopsScreen from '../screens/admin/AdminShopsScreen';
import AdminReviewsScreen from '../screens/admin/AdminReviewsScreen';
import AdminPaymentsScreen from '../screens/admin/AdminPaymentsScreen';
import AdminSupportScreen from '../screens/admin/AdminSupportScreen';
import AdminUserDetailScreen from '../screens/admin/AdminUserDetailScreen';
import AdminTestersScreen from '../screens/admin/AdminTestersScreen';
import AdminScamScreen from '../screens/admin/AdminScamScreen';
import AdminLiveScreen from '../screens/admin/AdminLiveScreen';
import { setPresenceEnabled, trackScreen } from '../services/presence';
import { ADMIN_ROUTES, isAdminUser } from '../utils/admin';

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

  useEffect(() => {
    if (!ready || !isLoggedIn) return undefined;
    syncDeviceToken({ force: true }).catch(() => {});
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncDeviceToken().catch(() => {});
    });
    return () => sub.remove();
  }, [ready, isLoggedIn, userId]);

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
      <Tab.Screen name="Post" component={PostListingScreen} options={{ title: 'Sell' }} />
      <Tab.Screen name="Chats" component={ChatListScreen} options={{ title: 'Chats' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
    </Tab.Navigator>
  );
}

function AdminTabs() {
  return (
    <Tab.Navigator tabBar={(props) => <AdminTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Dashboard' }} />
      <Tab.Screen name="AdminReports" component={AdminReportsScreen} options={{ title: 'Reports' }} />
      <Tab.Screen name="AdminListings" component={AdminListingsScreen} options={{ title: 'Listings' }} />
      <Tab.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: 'Users' }} />
      <Tab.Screen name="AdminMore" component={AdminMoreScreen} options={{ title: 'More' }} />
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
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} />
        <Stack.Screen name="AdminTabs" component={AdminTabs} />
        <Stack.Screen name="AdminShops" component={AdminShopsScreen} />
        <Stack.Screen name="AdminReviews" component={AdminReviewsScreen} />
        <Stack.Screen name="AdminPayments" component={AdminPaymentsScreen} />
        <Stack.Screen name="AdminSupport" component={AdminSupportScreen} />
        <Stack.Screen name="AdminUserDetail" component={AdminUserDetailScreen} />
        <Stack.Screen name="AdminTesters" component={AdminTestersScreen} />
        <Stack.Screen name="AdminScam" component={AdminScamScreen} />
        <Stack.Screen name="AdminLive" component={AdminLiveScreen} />

        <Stack.Screen name="AllCategories" component={AllCategoriesScreen} />
        <Stack.Screen name="SearchResults" component={SearchResultsScreen} />
        <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
        <Stack.Screen name="PostListing" component={PostListingScreen} />
        <Stack.Screen name="SellerTypeSelection" component={SellerTypeSelectionScreen} />
        <Stack.Screen name="StoreCategorySelection" component={StoreCategorySelectionScreen} />
        <Stack.Screen name="IndividualPostListing" component={IndividualPostListingScreen} />
        <Stack.Screen name="ShopPostListing" component={ShopPostListingScreen} />
        <Stack.Screen name="CreateShop" component={CreateShopScreen} />
        <Stack.Screen name="ShopVerification" component={ShopVerificationScreen} />
        <Stack.Screen name="InviteFriends" component={InviteFriendsScreen} />
        <Stack.Screen name="EditListing" component={EditListingScreen} />
        <Stack.Screen name="MyListings" component={MyListingsScreen} />
        <Stack.Screen name="MyPurchases" component={MyPurchasesScreen} />
        <Stack.Screen name="RecentlyViewed" component={RecentlyViewedScreen} />
        <Stack.Screen name="ListingSuccess" component={ListingSuccessScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Call" component={CallScreen} options={{ freezeOnBlur: false }} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Wishlist" component={WishlistScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="RateReview" component={RateReviewScreen} />
        <Stack.Screen name="ReportBlockUser" component={ReportBlockUserScreen} />
        <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
        <Stack.Screen name="Info" component={InfoScreen} />
        <Stack.Screen name="SellerProfile" component={SellerProfileScreen} />
        <Stack.Screen name="ShopProfile" component={ShopProfileScreen} />
        <Stack.Screen name="ShopDashboard" component={ShopDashboardScreen} />
        <Stack.Screen name="ShopStorefrontQr" component={ShopStorefrontQrScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
        <Stack.Screen name="EditShop" component={EditShopScreen} />
        <Stack.Screen name="Privacy" component={PrivacyScreen} />
        <Stack.Screen name="LanguageSelect" component={LanguageSelectScreen} />
        <Stack.Screen name="CurrencySelect" component={CurrencySelectScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="LegalHub" component={LegalHubScreen} />
        <Stack.Screen name="LegalDocument" component={LegalDocumentScreen} />
        <Stack.Screen name="SavedAddresses" component={SavedAddressesScreen} />
        <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} />
        <Stack.Screen name="Wallet" component={WalletScreen} />
        <Stack.Screen name="Subscription" component={SubscriptionScreen} />
        <Stack.Screen name="PaymentHistory" component={PaymentHistoryScreen} />
        <Stack.Screen name="TesterMode" component={TesterModeScreen} />
        <Stack.Screen name="ContactUs" component={ContactUsScreen} />
      </Stack.Navigator>
      <SignedInModal />
      <AccountChoiceModal />
    </NavigationContainer>
  );
}
