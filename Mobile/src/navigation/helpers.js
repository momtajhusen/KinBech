export const ROUTES = {
  SPLASH: 'Splash',
  ONBOARDING: 'Onboarding',
  LOGIN: 'Login',
  PROFILE_SETUP: 'ProfileSetup',
  MAIN_TABS: 'MainTabs',
  ALL_CATEGORIES: 'AllCategories',
  EXPLORE: 'Explore',
  SEARCH_RESULTS: 'SearchResults',
  ITEM_DETAIL: 'ItemDetail',
  POST_LISTING: 'PostListing',
  EDIT_LISTING: 'EditListing',
  MY_LISTINGS: 'MyListings',
  MY_PURCHASES: 'MyPurchases',
  RECENTLY_VIEWED: 'RecentlyViewed',
  LISTING_SUCCESS: 'ListingSuccess',
  CHAT: 'Chat',
  CALL: 'Call',
  SETTINGS: 'Settings',
  WISHLIST: 'Wishlist',
  NOTIFICATIONS: 'Notifications',
  RATE_REVIEW: 'RateReview',
  REPORT_BLOCK: 'ReportBlockUser',
  HELP: 'HelpSupport',
  INFO: 'Info',
  SELLER_PROFILE: 'SellerProfile',
  EDIT_PROFILE: 'EditProfile',
  PRIVACY: 'Privacy',
  LANGUAGE_SELECT: 'LanguageSelect',
  CURRENCY_SELECT: 'CurrencySelect',
  TERMS: 'Terms',
  PRIVACY_POLICY: 'PrivacyPolicy',
  LEGAL_HUB: 'LegalHub',
  LEGAL_DOCUMENT: 'LegalDocument',
  ADDRESSES: 'SavedAddresses',
  PAYMENT_METHODS: 'PaymentMethods',
  WALLET: 'Wallet',
  SUBSCRIPTION: 'Subscription',
  PAYMENT_HISTORY: 'PaymentHistory',
  TESTER_MODE: 'TesterMode',
  CONTACT_US: 'ContactUs',
  // Seller type routes
  SELLER_TYPE_SELECTION: 'SellerTypeSelection',
  STORE_CATEGORY_SELECTION: 'StoreCategorySelection',
  INDIVIDUAL_POST_LISTING: 'IndividualPostListing',
  SHOP_POST_LISTING: 'ShopPostListing',
  CREATE_SHOP: 'CreateShop',
  EDIT_SHOP: 'EditShop',
  SHOP_VERIFICATION: 'ShopVerification',
  INVITE_FRIENDS: 'InviteFriends',
  SHOP_PROFILE: 'ShopProfile',
  SHOP_DASHBOARD: 'ShopDashboard',
  SHOP_STOREFRONT_QR: 'ShopStorefrontQr',
};

export const TABS = {
  HOME: 'Home',
  EXPLORE: 'Explore',
  POST: 'Post',
  CHATS: 'Chats',
  PROFILE: 'Profile',
};

export function navigateToTab(navigation, screen, params) {
  navigation.navigate(ROUTES.MAIN_TABS, { screen, params });
}

export function openItemDetail(navigationOrId, params) {
  if (navigationOrId && typeof navigationOrId.navigate === 'function') {
    const listingId = params?.listingId || params?.id || params?.item?.id || params?.item?._id;
    navigationOrId.navigate(ROUTES.ITEM_DETAIL, {
      listingId,
      item: params?.item,
      sharedId: params?.sharedId || listingId,
      searchQuery: params?.searchQuery || '',
    });
    return;
  }
  const listingId = navigationOrId;
  return (navigation) => {
    navigation.navigate(ROUTES.ITEM_DETAIL, { listingId });
  };
}

export const INFO_COPY = {
  SafetyTips: {
    title: 'Stay Safe',
    body: 'A few habits keep most deals safe.',
    points: [
      'Meet in a busy public place during the day.',
      'Bring a friend for costly items.',
      'Inspect and test the item before you pay.',
      'Keep the conversation in KinBech chat.',
      'Never share an OTP or bank PIN.',
    ],
    buttonRoute: ROUTES.HELP,
    buttonLabel: 'Help Center',
  },
  Article: {
    title: 'Safe Buying & Selling',
    body: 'KinBech deals happen face to face, and payment goes straight to the seller. These habits protect both sides.',
    points: [
      'Check the seller first: trust level, reviews, and Verified badge on shops.',
      'Keep chat and calls inside KinBech, so reports have the full history.',
      'Meet in a busy public place, like a mall, cafe or near a police post.',
      'Inspect and test the item before paying. Never send an advance or "booking" payment.',
      'Pay in person with cash, eSewa, Khalti, IME Pay or bank transfer, and only once you are happy.',
      'Never share an OTP, bank PIN or wallet password. KinBech will never ask for them.',
      'Sellers: do not hand over the item until the payment shows in your account.',
      'After the deal, mark it done in the chat and leave an honest review.',
      'If something feels wrong, leave, then report or block the user from the chat menu.',
    ],
  },
};
