import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useMemo } from 'react';

import BottomTabBar from '../components/BottomTabBar';
import { lazyScreen } from './lazyScreen';
import { useTheme } from '../theme';
import AllCategoriesScreen from '../screens/AllCategoriesScreen';
import ChatListScreen from '../screens/ChatListScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateShopScreen from '../screens/CreateShopScreen';
import CurrencySelectScreen from '../screens/CurrencySelectScreen';
import EditListingScreen from '../screens/EditListingScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import EmptyStateScreen from '../screens/EmptyStateScreen';
import ExploreScreen from '../screens/ExploreScreen';
import HelpSupportScreen from '../screens/HelpSupportScreen';
import HomeScreen from '../screens/HomeScreen';
import IndividualPostListingScreen from '../screens/IndividualPostListingScreen';
import InfoScreen from '../screens/InfoScreen';
import ItemDetailScreen from '../screens/ItemDetailScreen';
import LanguageSelectScreen from '../screens/LanguageSelectScreen';
import LoginScreen from '../screens/LoginScreen';
import MeetupConfirmationScreen from '../screens/MeetupConfirmationScreen';
import MyListingsScreen from '../screens/MyListingsScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import OtpVerificationScreen from '../screens/OtpVerificationScreen';
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
import TermsScreen from '../screens/TermsScreen';
import LegalHubScreen from '../screens/LegalHubScreen';
import LegalDocumentScreen from '../components/LegalDocumentScreen';
import WishlistScreen from '../screens/WishlistScreen';
import SavedAddressesScreen from '../screens/SavedAddressesScreen';
import PaymentMethodsScreen from '../screens/PaymentMethodsScreen';
import WalletScreen from '../screens/WalletScreen';
import ContactUsScreen from '../screens/ContactUsScreen';

const ListingSuccessScreen = lazyScreen(() => import('../screens/ListingSuccessScreen'));
const ShopStorefrontQrScreen = lazyScreen(() => import('../screens/ShopStorefrontQrScreen'));
const MapExploreScreen = lazyScreen(() => import('../screens/MapExploreScreen'));

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

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

export default function AppNavigator() {
  const { colors, isDark } = useTheme();

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
    <NavigationContainer theme={navigationTheme}>
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
        <Stack.Screen name="OtpVerification" component={OtpVerificationScreen} />
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} />

        <Stack.Screen name="AllCategories" component={AllCategoriesScreen} />
        <Stack.Screen name="SearchResults" component={SearchResultsScreen} />
        <Stack.Screen
          name="ItemDetail"
          component={ItemDetailScreen}
          options={({ route: navRoute }) => ({
            animation: 'default',
            animationDuration: 380,
            presentation: 'card',
            fullScreenGestureEnabled: true,
            sharedElements: () => {
              const sharedId = navRoute?.params?.sharedId;
              if (!sharedId) return [];
              return [
                {
                  id: `item.${sharedId}.photo`,
                  animation: 'move',
                  resize: 'cover',
                },
                {
                  id: `item.${sharedId}.title`,
                  animation: 'fade',
                },
                {
                  id: `item.${sharedId}.price`,
                  animation: 'fade',
                },
              ];
            },
          })}
        />
        <Stack.Screen name="PostListing" component={PostListingScreen} />
        <Stack.Screen name="SellerTypeSelection" component={SellerTypeSelectionScreen} />
        <Stack.Screen name="StoreCategorySelection" component={StoreCategorySelectionScreen} />
        <Stack.Screen name="IndividualPostListing" component={IndividualPostListingScreen} />
        <Stack.Screen name="ShopPostListing" component={ShopPostListingScreen} />
        <Stack.Screen name="CreateShop" component={CreateShopScreen} />
        <Stack.Screen name="EditListing" component={EditListingScreen} />
        <Stack.Screen name="MyListings" component={MyListingsScreen} />
        <Stack.Screen name="ListingSuccess" component={ListingSuccessScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Wishlist" component={WishlistScreen} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} />
        <Stack.Screen name="RateReview" component={RateReviewScreen} />
        <Stack.Screen name="ReportBlockUser" component={ReportBlockUserScreen} />
        <Stack.Screen name="MeetupConfirmation" component={MeetupConfirmationScreen} />
        <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
        <Stack.Screen name="EmptyState" component={EmptyStateScreen} />
        <Stack.Screen name="Info" component={InfoScreen} />
        <Stack.Screen name="SellerProfile" component={SellerProfileScreen} />
        <Stack.Screen name="ShopProfile" component={ShopProfileScreen} />
        <Stack.Screen name="ShopDashboard" component={ShopDashboardScreen} />
        <Stack.Screen name="ShopStorefrontQr" component={ShopStorefrontQrScreen} />
        <Stack.Screen name="MapExplore" component={MapExploreScreen} />
        <Stack.Screen name="EditProfile" component={EditProfileScreen} />
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
        <Stack.Screen name="ContactUs" component={ContactUsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
