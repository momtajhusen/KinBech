import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, AppState, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { useIsFocused } from '@react-navigation/native';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';
import { useRequireLogin } from './LoginPrompt';
import { useVoiceSearch, VoiceTalkButton } from './VoiceAssistant';
import { useAuth } from '../context/AuthContext';
import { callHaptic } from '../services/callHaptics';
import { navigationRef } from '../navigation/navigationRef';
import { navigateToTab, ROUTES, TABS } from '../navigation/helpers';
import { useTheme } from '../theme';
import { isAdminUser } from '../utils/admin';

// Voice search does not open on these screens.
const QUIET_ROUTES = new Set(['Splash', 'Onboarding', 'Login', 'ProfileSetup', 'Call']);

const AWAY_MS = 1500;
const ORB = 92;
// App brand greens, deep to bright, so the orb matches the dark green header and buttons.
const ORB_COLORS = ['#022C22', '#065F46', '#10B981', '#6EE7B7'];
const RIM_COLORS = ['#A7F3D0', 'rgba(16,185,129,0)', '#34D399', 'rgba(6,95,70,0)'];
const DEPTH_COLORS = ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', 'rgba(2,44,34,0.45)'];

// Where a voice search looks, by screen (keys match the server's spoken lines); other screens search on Explore.
const AREA_BY_ROUTE = {
  [ROUTES.SEARCH_RESULTS]: 'search-results',
  [ROUTES.WISHLIST]: 'saved',
  [ROUTES.MY_LISTINGS]: 'my-listings',
  [ROUTES.SHOP_PROFILE]: 'shop',
  [ROUTES.HELP]: 'help',
  [ROUTES.ALL_CATEGORIES]: 'categories',
  [ROUTES.STORE_CATEGORY_SELECTION]: 'store-categories',
};

// The one line the card shows for each area.
const AREA_TITLES = {
  explore: 'What do you want to search?',
  'search-results': 'What do you want to search?',
  saved: 'What to find in your saved items?',
  'my-listings': 'What to find in your listings?',
  shop: 'What to find in this shop?',
  help: 'What do you need help with?',
  categories: 'Which category are you looking for?',
  'store-categories': 'Which store category do you want?',
};

// The voice card is always dark green, on light and dark themes alike.
const CARD_COLORS = ['#113A2E', '#0B1F18', '#08130F'];
const CARD_TEXT = '#F0FDF4';
const CARD_MUTED = 'rgba(209,250,229,0.72)';
const CARD_MINT = '#6EE7B7';
const CARD_WARN = '#FBBF24';

let hostOpen = false;
const hostListeners = new Set();
let hostToggle = null;

function setHostOpen(open) {
  hostOpen = open;
  hostListeners.forEach((listener) => listener());
}

const subscribeHost = (listener) => {
  hostListeners.add(listener);
  return () => hostListeners.delete(listener);
};
const readHost = () => hostOpen;

/** The voice search button for any search box; it opens the voice search card. */
export function VoiceSearchToggle({ size }) {
  const { colors } = useTheme();
  useSyncExternalStore(subscribeHost, readHost);
  return <VoiceTalkButton colors={colors} size={size} onPress={() => hostToggle?.()} />;
}

// The focused screen's own search box, when it has one; a voice search then fills that box.
let boxEntry = null;

const cleanWords = (text) => String(text || '').replace(/\s+/g, ' ').trim();

/**
 * Puts a screen's own search box in voice search, so a voice search said there searches that screen's own data
 * (my listings, saved items, a shop's items, help topics, categories) instead of opening Explore.
 * Every item named fills the box ("dustbin and chair") and each one, or another spelling the AI gave, matches.
 * `onFilters(search)` sets the screen's own sort/condition/price controls from the search; `onSearch(text, turn)`
 * replaces the plain fill. `searchAll` screens search the server with the AI's English phrase.
 * Returns `matches(...texts)`, with `matches.inPriceRange(price)` for a spoken price range on screens without one.
 */
export function useVoiceSearchBox({ value, onChange, onSearch, onFilters, searchAll = false }) {
  const [voiceWords, setVoiceWords] = useState(null);
  const [voiceRange, setVoiceRange] = useState(null);
  const voiceTextRef = useRef('');
  const focused = useIsFocused();
  const text = String(value || '');
  const applyRef = useRef(null);
  applyRef.current = (turn) => {
    const search = turn.search || {};
    const items = (Array.isArray(search.items) && search.items.length ? search.items : [search.query])
      .map(cleanWords)
      .filter(Boolean);
    // A whole-catalogue screen searches the AI's English phrase; a screen's own list shows the items ("mobile and
    // dustbin"), each matched with its other spellings, while order and price go to `onFilters`.
    const words = searchAll
      ? cleanWords(search.english || items.join(' and ') || search.category || turn.heard)
      : cleanWords(items.join(' and ') || search.category);
    const alts = [...items, ...(Array.isArray(search.alts) ? search.alts : [])].map(cleanWords).filter(Boolean);
    voiceTextRef.current = words.toLowerCase();
    setVoiceWords(alts.length ? { text: words.toLowerCase(), alts: alts.map((alt) => alt.toLowerCase()) } : null);
    setVoiceRange(search.minPrice || search.maxPrice ? { min: search.minPrice || 0, max: search.maxPrice || 0 } : null);
    onFilters?.(search);
    if (onSearch) onSearch(words, { ...turn, search: { ...search, alts } });
    else onChange(words);
  };

  useEffect(() => {
    if (!focused) return undefined;
    const handle = { apply: (turn) => applyRef.current(turn) };
    boxEntry = handle;
    return () => {
      if (boxEntry === handle) boxEntry = null;
    };
  }, [focused]);

  const needle = cleanWords(text).toLowerCase();
  // Typing something else in the box ends the spoken price range.
  useEffect(() => {
    if (needle !== voiceTextRef.current) setVoiceRange(null);
  }, [needle]);

  const words = useMemo(() => {
    if (!needle) return [];
    return voiceWords?.text === needle ? [needle, ...voiceWords.alts] : [needle];
  }, [needle, voiceWords]);

  return useMemo(() => {
    const matches = (...texts) => !words.length || texts.some((item) => {
      const hay = String(item || '').toLowerCase();
      return hay && words.some((word) => hay.includes(word));
    });
    matches.inPriceRange = (price) => {
      if (!voiceRange) return true;
      const amount = Number(price) || 0;
      return (!voiceRange.min || amount >= voiceRange.min) && (!voiceRange.max || amount <= voiceRange.max);
    };
    return matches;
  }, [words, voiceRange]);
}

let exploreTurn = null;
let exploreHeard = '';
let exploreReader = null;

/**
 * Explore runs voice searches said on screens without their own box; it may mount only after the app opens it.
 * `onHeard(text, true)` gets the spoken words first (a rough search at once), `handler(turn)` the AI's search.
 */
export function useExploreVoiceTurns(handler, onHeard) {
  const handlerRef = useRef({ handler, onHeard });
  handlerRef.current = { handler, onHeard };
  useEffect(() => {
    const read = () => {
      const heard = exploreHeard;
      const turn = exploreTurn;
      exploreHeard = '';
      exploreTurn = null;
      if (heard) handlerRef.current.onHeard?.(heard, true);
      if (turn) handlerRef.current.handler(turn);
    };
    exploreReader = read;
    read();
    return () => {
      if (exploreReader === read) exploreReader = null;
    };
  }, []);
}

function sendToExplore({ heard = '', turn = null }) {
  exploreHeard = heard;
  exploreTurn = turn;
  exploreReader?.();
  navigateToTab(navigationRef, TABS.EXPLORE);
}

const goToRoute = (route, params) => navigationRef.isReady() && navigationRef.navigate(route, params);
const goToTab = (tab) => navigationRef.isReady() && navigateToTab(navigationRef, tab);

/**
 * What the app can open by voice. The keys and labels go to the AI with the spoken words, and it picks the one the
 * buyer asked for, in any words; a new place only needs an entry here.
 */
const VOICE_PLACES = {
  'explore-products': { label: 'Explore products tab: all items for sale', open: () => sendToExplore({ turn: { action: 'view', tab: 'products' } }) },
  'explore-sellers': { label: 'Explore sellers tab: all sellers and shops', open: () => sendToExplore({ turn: { action: 'view', tab: 'sellers' } }) },
  'seller-profile': {
    label: 'the profile page of one seller or shop',
    takesName: true,
    open: (act) => {
      const target = act.target;
      if (!target) {
        Alert.alert('Voice', `No seller named "${act.name}" was found.`);
        return;
      }
      if (target.kind === 'shop') goToRoute(ROUTES.SHOP_PROFILE, { shopId: target.id });
      else goToRoute(ROUTES.SELLER_PROFILE, { sellerId: target.id });
    },
  },
  home: { label: 'Home feed', open: () => goToTab(TABS.HOME) },
  chats: { label: 'my chats', open: () => goToTab(TABS.CHATS) },
  sell: { label: 'post a new item to sell', open: () => goToTab(TABS.POST) },
  profile: { label: 'my profile and account', open: () => goToTab(TABS.PROFILE) },
  saved: { label: 'my saved items (wishlist)', open: () => goToRoute(ROUTES.WISHLIST) },
  'my-listings': { label: 'my listings (items I sell)', open: () => goToRoute(ROUTES.MY_LISTINGS) },
  purchases: { label: 'my purchases', open: () => goToRoute(ROUTES.MY_PURCHASES) },
  'recently-viewed': { label: 'recently viewed items', open: () => goToRoute(ROUTES.RECENTLY_VIEWED) },
  notifications: { label: 'notifications', open: () => goToRoute(ROUTES.NOTIFICATIONS) },
  categories: { label: 'all categories', open: () => goToRoute(ROUTES.ALL_CATEGORIES) },
  settings: { label: 'settings', open: () => goToRoute(ROUTES.SETTINGS) },
  'edit-profile': { label: 'edit my profile (name, photo, bio)', open: () => goToRoute(ROUTES.EDIT_PROFILE) },
  wallet: { label: 'wallet and boost credits', open: () => goToRoute(ROUTES.WALLET) },
  plan: { label: 'my plan / subscription', open: () => goToRoute(ROUTES.SUBSCRIPTION) },
  'payment-methods': { label: 'saved payment methods (eSewa, Khalti, IME, bank)', open: () => goToRoute(ROUTES.PAYMENT_METHODS) },
  addresses: { label: 'saved addresses', open: () => goToRoute(ROUTES.ADDRESSES) },
  invite: { label: 'invite friends (referral code)', open: () => goToRoute(ROUTES.INVITE_FRIENDS) },
  help: { label: 'help and support', open: () => goToRoute(ROUTES.HELP) },
  contact: { label: 'contact KinBech', open: () => goToRoute(ROUTES.CONTACT_US) },
  'shop-dashboard': { label: 'my shop dashboard', open: () => goToRoute(ROUTES.SHOP_DASHBOARD) },
};
const VOICE_PLACE_LIST = Object.entries(VOICE_PLACES).map(([key, place]) => ({ key, label: place.label, takesName: Boolean(place.takesName) }));

/** Does what the buyer asked the app to do; false when it was a search. */
function runVoiceAct(act) {
  if (act?.do === 'open' && VOICE_PLACES[act.open]) {
    VOICE_PLACES[act.open].open(act);
    return true;
  }
  if (act?.do === 'back') {
    if (navigationRef.isReady() && navigationRef.canGoBack()) navigationRef.goBack();
    return true;
  }
  return act?.do === 'none';
}

const hasSearch = (search) => Boolean(
  search && (search.query || search.category || search.minPrice || search.maxPrice || search.condition || search.nearby
    || (search.sort && search.sort !== 'relevance') || search.where?.length || search.order?.length)
);

/** Shows a finished voice search: in the focused screen's own box, else on Explore. */
function deliverSearch(text, searchPromise) {
  const box = boxEntry;
  let settled = false;
  let found = null;
  searchPromise.then((search) => {
    settled = true;
    found = search;
  });
  const finish = (search) => {
    if (runVoiceAct(search?.act)) return;
    if (!search && !box) {
      sendToExplore({ heard: text });
      return;
    }
    if (box) {
      box.apply({ action: 'search', where: 'here', heard: text, search: hasSearch(search) ? search : { query: text } });
    } else if (hasSearch(search)) {
      sendToExplore({ turn: { action: 'search', heard: text, search } });
    }
  };
  // The answer is usually back while "searching" plays; otherwise Explore starts a rough search from the words.
  setTimeout(() => {
    if (settled) {
      if (!box && !hasSearch(found) && !found?.act) sendToExplore({ heard: text });
      else finish(found);
      return;
    }
    searchPromise.then(finish);
  }, 0);
}

function useRouteName() {
  const [name, setName] = useState('');
  useEffect(() => {
    const read = () => setName(navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name || '' : '');
    read();
    return navigationRef.addListener('state', read);
  }, []);
  return name;
}

function ringStyle(amount, grow, fade) {
  'worklet';
  return {
    opacity: fade * (0.55 + amount * 0.45),
    transform: [{ scale: 1 + grow * (0.25 + amount * 0.75) }],
  };
}

function waveStyle(step, strength) {
  'worklet';
  return {
    opacity: (1 - step) * (0.25 + strength * 0.5),
    transform: [{ scale: 1 + step * (1.1 + strength * 0.9) }],
  };
}

/**
 * The glowing voice orb inside the card: a swirling green core with a shining rim, glow that follows the
 * voice while listening and sonar waves that run faster while it searches.
 */
function VoiceOrb({ phase, level, onPress }) {
  const pulse = useSharedValue(0);
  const spin = useSharedValue(0);
  const wave = useSharedValue(0);

  useEffect(() => {
    spin.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [spin]);

  const speaking = phase === 'searching';
  const listening = phase === 'listening';
  const resting = phase === 'retry' || phase === 'idle';

  useEffect(() => {
    cancelAnimation(pulse);
    cancelAnimation(wave);
    if (listening || resting) {
      pulse.value = withTiming(0, { duration: 200 });
    } else {
      pulse.value = withRepeat(withTiming(1, { duration: 480, easing: Easing.inOut(Easing.quad) }), -1, true);
    }
    wave.value = 0;
    if (!resting) {
      wave.value = withRepeat(
        withTiming(1, { duration: speaking ? 1100 : 2000, easing: Easing.out(Easing.quad) }),
        -1,
        false
      );
    }
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(wave);
    };
  }, [listening, resting, speaking, pulse, wave]);

  const amount = () => {
    'worklet';
    return listening ? 0.15 + level.value * 0.85 : pulse.value;
  };
  const innerRing = useAnimatedStyle(() => ringStyle(amount(), 0.2, 0.6));
  const middleRing = useAnimatedStyle(() => ringStyle(amount(), 0.42, 0.32));
  const outerRing = useAnimatedStyle(() => ringStyle(amount(), 0.7, 0.16));
  const waveA = useAnimatedStyle(() => waveStyle(wave.value, speaking ? 1 : listening ? level.value : 0.4));
  const waveB = useAnimatedStyle(() => waveStyle((wave.value + 0.5) % 1, speaking ? 1 : listening ? level.value : 0.4));
  const breatheStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + amount() * 0.08 }] }));
  const coreStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const rimStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 720}deg` }] }));

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel="Speak again"
      style={styles.orbBox}
    >
      <Reanimated.View pointerEvents="none" style={[styles.wave, waveA]} />
      <Reanimated.View pointerEvents="none" style={[styles.wave, waveB]} />
      <Reanimated.View pointerEvents="none" style={[styles.ring, styles.ringOuter, outerRing]} />
      <Reanimated.View pointerEvents="none" style={[styles.ring, styles.ringMiddle, middleRing]} />
      <Reanimated.View pointerEvents="none" style={[styles.ring, innerRing]} />
      <Reanimated.View pointerEvents="none" style={[styles.rim, rimStyle]}>
        <LinearGradient colors={RIM_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      </Reanimated.View>
      <Reanimated.View pointerEvents="none" style={[styles.coreShadow, breatheStyle]}>
        <Reanimated.View style={[styles.orbCore, coreStyle]}>
          <LinearGradient colors={ORB_COLORS} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        </Reanimated.View>
        <LinearGradient colors={DEPTH_COLORS} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.depth} />
        {resting ? null : <View style={styles.shine} />}
      </Reanimated.View>
      {resting ? (
        <View pointerEvents="none" style={styles.orbIcon}>
          <View style={styles.micBubble}>
            <Icon name="mic" size={30} color="#FFFFFF" />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

/** The centred voice search card: one line saying what to search, the orb, the live words, then "searching". */
function VoiceSearchCard({ area, phase, heard, level, onListenAgain, onClose }) {
  const { width } = useWindowDimensions();
  const enter = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 16, stiffness: 180 });
  }, [enter]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: Math.min(enter.value, 1) }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(enter.value * 1.4, 1),
    transform: [{ scale: 0.88 + enter.value * 0.12 }, { translateY: (1 - enter.value) * 24 }],
  }));

  let status = '';
  if (phase === 'listening') status = heard ? '' : 'Listening...';
  else if (phase === 'searching') status = 'Searching...';
  else if (phase === 'retry') status = 'Tap the mic to try again';

  return (
    <View style={styles.center}>
      <Reanimated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close voice search" />
      </Reanimated.View>
      <Reanimated.View style={[styles.card, { width: Math.min(width - 40, 360) }, cardStyle]}>
        <LinearGradient colors={CARD_COLORS} start={{ x: 0, y: 0 }} end={{ x: 0.4, y: 1 }} style={StyleSheet.absoluteFill} />
        <Svg pointerEvents="none" width="100%" height={300} style={styles.cardGlow}>
          <Defs>
            <RadialGradient id="voiceCardGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#10B981" stopOpacity={0.28} />
              <Stop offset="1" stopColor="#10B981" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="url(#voiceCardGlow)" />
        </Svg>
        <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
          <Icon name="close" size={18} color={CARD_MUTED} />
        </Pressable>

        <Text style={styles.title} numberOfLines={2}>{AREA_TITLES[area] || AREA_TITLES.explore}</Text>

        <View style={styles.orbStage}>
          <View pointerEvents="none" style={styles.halo} />
          <VoiceOrb phase={phase} level={level} onPress={phase === 'retry' ? onListenAgain : null} />
        </View>

        <View style={styles.words}>
          {heard ? <Text style={styles.heard} numberOfLines={3}>{`“${heard}”`}</Text> : null}
          {status ? (
            <View style={styles.statusRow}>
              {phase === 'searching' ? <ActivityIndicator size="small" color={CARD_MINT} /> : null}
              {phase === 'listening' ? <View style={styles.liveDot} /> : null}
              <Text style={[styles.status, phase === 'retry' && { color: CARD_WARN }]}>{status}</Text>
            </View>
          ) : null}
        </View>
      </Reanimated.View>
    </View>
  );
}

/**
 * Voice search for the whole app; mounted once inside the navigator and opened from the voice button in
 * any search box. It never speaks: it listens once, closes, and does what the buyer asked (results or an action).
 */
export default function VoiceHost() {
  const { user, isLoggedIn } = useAuth();
  const requireLogin = useRequireLogin();
  const routeName = useRouteName();
  const [open, setOpen] = useState(false);

  const hidden = !routeName || QUIET_ROUTES.has(routeName) || (isLoggedIn && isAdminUser(user));

  useEffect(() => {
    if (!isLoggedIn) setOpen(false);
  }, [isLoggedIn]);

  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  // The microphone permission sheet pauses the app for a moment; only a real trip away closes voice search.
  useEffect(() => {
    let timer = null;
    const sub = AppState.addEventListener('change', (state) => {
      clearTimeout(timer);
      if (state !== 'active') timer = setTimeout(() => setOpen(false), AWAY_MS);
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);

  const close = useCallback(() => setOpen(false), []);

  const onResult = useCallback((text, searchPromise) => {
    setOpen(false);
    deliverSearch(text, searchPromise);
  }, []);

  const onFail = useCallback((reason) => {
    setOpen(false);
    if (reason === 'mic') {
      Alert.alert('Microphone', 'Allow the microphone so you can search by voice.');
    } else {
      Alert.alert('Voice search', 'The microphone stopped working. Tap the voice button to try again.');
    }
  }, []);

  // Fixed when the card opens, so the spoken line and the card match the screen it was opened on.
  const [area, setArea] = useState('explore');
  const voice = useVoiceSearch({ open, area, places: VOICE_PLACE_LIST, onResult, onFail });

  const toggle = useCallback(() => {
    if (open) setOpen(false);
    else {
      requireLogin('voice', () => {
        setArea(AREA_BY_ROUTE[routeName] || 'explore');
        setOpen(true);
      });
    }
  }, [open, requireLogin, routeName]);

  useEffect(() => {
    hostToggle = toggle;
  }, [toggle]);

  const wasOpenRef = useRef(false);
  useEffect(() => {
    setHostOpen(open);
    if (open !== wasOpenRef.current) callHaptic(open ? 'toggleOn' : 'toggleOff');
    wasOpenRef.current = open;
  }, [open]);

  return (
    <Modal
      visible={open && !hidden}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <VoiceSearchCard
        area={area}
        phase={voice.phase}
        heard={voice.heard}
        level={voice.level}
        onListenAgain={voice.listenAgain}
        onClose={close}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    backgroundColor: 'rgba(2,8,6,0.72)',
  },
  card: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 26,
    paddingHorizontal: 24,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.2)',
    overflow: 'hidden',
    elevation: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
  },
  cardGlow: {
    position: 'absolute',
    top: 70,
    left: 0,
  },
  close: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  title: {
    marginTop: 10,
    paddingHorizontal: 18,
    color: CARD_TEXT,
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 28,
    textAlign: 'center',
  },
  orbStage: {
    height: 220,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 196,
    height: 196,
    borderRadius: 98,
    borderWidth: 1,
    borderColor: 'rgba(110,231,183,0.12)',
  },
  words: {
    minHeight: 56,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heard: {
    color: CARD_TEXT,
    fontSize: 19,
    fontWeight: '700',
    lineHeight: 26,
    textAlign: 'center',
  },
  statusRow: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CARD_MINT,
  },
  status: {
    color: CARD_MUTED,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  orbBox: {
    width: ORB,
    height: ORB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    borderWidth: 1.5,
    borderColor: '#34D399',
  },
  ring: {
    position: 'absolute',
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    backgroundColor: '#10B981',
  },
  ringMiddle: {
    backgroundColor: '#047857',
  },
  ringOuter: {
    backgroundColor: '#34D399',
  },
  rim: {
    position: 'absolute',
    width: ORB + 8,
    height: ORB + 8,
    borderRadius: (ORB + 8) / 2,
    overflow: 'hidden',
  },
  coreShadow: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#10B981',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  orbCore: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ORB / 2,
    overflow: 'hidden',
  },
  depth: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: ORB / 2,
  },
  shine: {
    position: 'absolute',
    top: ORB * 0.14,
    left: ORB * 0.2,
    width: ORB * 0.34,
    height: ORB * 0.2,
    borderRadius: ORB * 0.17,
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  orbIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: ORB,
    height: ORB,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
});
