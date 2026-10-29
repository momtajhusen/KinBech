import { formatNpr } from './admin';

/** App route name -> what an admin sees on the Live screen. `kind` groups screens by intent. */
const SCREENS = {
  Onboarding: { label: 'Onboarding', icon: 'sparkles', kind: 'start' },
  Login: { label: 'Login', icon: 'log-in', kind: 'start' },
  ProfileSetup: { label: 'Profile setup', icon: 'person-add', kind: 'start' },
  Home: { label: 'Home', icon: 'home', kind: 'browse' },
  Explore: { label: 'Explore', icon: 'compass', kind: 'browse' },
  AllCategories: { label: 'Categories', icon: 'grid', kind: 'browse' },
  SearchResults: { label: 'Search', icon: 'search', kind: 'browse' },
  ItemDetail: { label: 'Item detail', icon: 'pricetag', kind: 'browse' },
  SellerProfile: { label: 'Seller profile', icon: 'person', kind: 'browse' },
  ShopProfile: { label: 'Shop page', icon: 'storefront', kind: 'browse' },
  RecentlyViewed: { label: 'Recently viewed', icon: 'time', kind: 'browse' },
  Wishlist: { label: 'Wishlist', icon: 'heart', kind: 'browse' },
  Post: { label: 'Sell tab', icon: 'add-circle', kind: 'sell' },
  PostListing: { label: 'Posting an ad', icon: 'add-circle', kind: 'sell' },
  SellerTypeSelection: { label: 'Choosing seller type', icon: 'swap-horizontal', kind: 'sell' },
  StoreCategorySelection: { label: 'Choosing shop category', icon: 'grid', kind: 'sell' },
  IndividualPostListing: { label: 'Posting an ad', icon: 'create', kind: 'sell' },
  ShopPostListing: { label: 'Posting a shop ad', icon: 'create', kind: 'sell' },
  ListingSuccess: { label: 'Ad posted', icon: 'checkmark-circle', kind: 'sell' },
  EditListing: { label: 'Editing an ad', icon: 'create', kind: 'sell' },
  MyListings: { label: 'My listings', icon: 'pricetags', kind: 'sell' },
  CreateShop: { label: 'Creating a shop', icon: 'storefront', kind: 'sell' },
  ShopVerification: { label: 'Shop verification', icon: 'shield-checkmark', kind: 'sell' },
  ShopDashboard: { label: 'Shop dashboard', icon: 'analytics', kind: 'sell' },
  ShopStorefrontQr: { label: 'Shop QR', icon: 'qr-code', kind: 'sell' },
  EditShop: { label: 'Editing shop', icon: 'create', kind: 'sell' },
  Chats: { label: 'Chat list', icon: 'chatbubbles', kind: 'chat' },
  Chat: { label: 'Chatting', icon: 'chatbubble-ellipses', kind: 'chat' },
  Call: { label: 'On a call', icon: 'call', kind: 'chat' },
  RateReview: { label: 'Writing a review', icon: 'star', kind: 'chat' },
  ReportBlockUser: { label: 'Reporting a user', icon: 'flag', kind: 'chat' },
  MyPurchases: { label: 'My purchases', icon: 'bag-check', kind: 'account' },
  Profile: { label: 'Profile tab', icon: 'person-circle', kind: 'account' },
  EditProfile: { label: 'Editing profile', icon: 'create', kind: 'account' },
  Settings: { label: 'Settings', icon: 'settings', kind: 'account' },
  Notifications: { label: 'Notifications', icon: 'notifications', kind: 'account' },
  InviteFriends: { label: 'Invite friends', icon: 'gift', kind: 'account' },
  Wallet: { label: 'Wallet', icon: 'wallet', kind: 'account' },
  Subscription: { label: 'Plans', icon: 'diamond', kind: 'account' },
  PaymentHistory: { label: 'Payment history', icon: 'receipt', kind: 'account' },
  PaymentMethods: { label: 'Payment methods', icon: 'card', kind: 'account' },
  SavedAddresses: { label: 'Saved addresses', icon: 'location', kind: 'account' },
  HelpSupport: { label: 'Help & support', icon: 'help-circle', kind: 'account' },
  ContactUs: { label: 'Contact us', icon: 'mail', kind: 'account' },
  TesterMode: { label: 'Tester mode', icon: 'flask', kind: 'account' },
  Privacy: { label: 'Privacy', icon: 'lock-closed', kind: 'account' },
  LanguageSelect: { label: 'Language', icon: 'globe', kind: 'account' },
  CurrencySelect: { label: 'Currency', icon: 'cash', kind: 'account' },
  Info: { label: 'Info', icon: 'information-circle', kind: 'account' },
  Terms: { label: 'Terms', icon: 'document-text', kind: 'account' },
  PrivacyPolicy: { label: 'Privacy policy', icon: 'document-text', kind: 'account' },
  LegalHub: { label: 'Legal', icon: 'document-text', kind: 'account' },
  LegalDocument: { label: 'Legal document', icon: 'document-text', kind: 'account' },
};

export const KIND_TONE = { start: 'muted', browse: 'info', sell: 'success', chat: 'warning', account: 'muted' };

export function screenInfo(name) {
  return SCREENS[name] || { label: name || 'Unknown', icon: 'phone-portrait', kind: 'account' };
}

export function screenLabel(name) {
  return screenInfo(name).label;
}

/** One line of what they are doing, e.g. "Viewing iPhone 13 · Rs. 50,000". */
export function liveDoing(session) {
  const { screen, params = {}, context = {} } = session;
  const price = context.listingPrice != null ? ` · ${formatNpr(context.listingPrice)}` : '';
  switch (screen) {
    case 'ItemDetail':
      return context.listingTitle ? `Viewing ${context.listingTitle}${price}` : 'Viewing an item';
    case 'EditListing':
      return context.listingTitle ? `Editing ${context.listingTitle}` : 'Editing an ad';
    case 'SellerProfile':
      return context.personName ? `Looking at ${context.personName}'s profile` : 'Looking at a seller';
    case 'ShopProfile':
      return context.shopName ? `Browsing ${context.shopName}` : 'Browsing a shop';
    case 'SearchResults':
      if (params.query) return `Searching "${params.query}"`;
      return params.category ? `Browsing ${params.category}` : 'Browsing results';
    case 'Explore':
      return params.category ? `Exploring ${params.category}` : 'Exploring';
    case 'Chat':
      if (context.personName && context.listingTitle) return `Chatting with ${context.personName} about ${context.listingTitle}`;
      return context.personName ? `Chatting with ${context.personName}` : 'In a chat';
    case 'Call':
      return context.listingTitle ? `On a call about ${context.listingTitle}` : 'On a call';
    default:
      return `On ${screenLabel(screen)}`;
  }
}

/** "45s", "3m 20s", "1h 05m". */
export function liveDuration(from, now = Date.now()) {
  if (!from) return '';
  const sec = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ${String(sec % 60).padStart(2, '0')}s`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
}
