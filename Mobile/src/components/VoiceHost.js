import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Alert, AppState, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CommonActions, useIsFocused } from '@react-navigation/native';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRequireLogin } from './LoginPrompt';
import { prepareVoiceGreeting, useVoiceChat, VoiceTalkButton } from './VoiceAssistant';
import { useAuth } from '../context/AuthContext';
import { navigationRef } from '../navigation/navigationRef';
import { navigateToTab, ROUTES, TABS } from '../navigation/helpers';
import { useTheme } from '../theme';
import { isAdminUser } from '../utils/admin';

// An open voice chat hides and waits on these screens until the buyer leaves.
const QUIET_ROUTES = new Set(['Splash', 'Onboarding', 'Login', 'ProfileSetup', 'Call']);

const ORB = 46;
// App brand greens, deep to bright, so the orb matches the dark green header and buttons.
const ORB_COLORS = ['#022C22', '#065F46', '#10B981', '#6EE7B7'];
const RIM_COLORS = ['#A7F3D0', 'rgba(16,185,129,0)', '#34D399', 'rgba(6,95,70,0)'];
const DEPTH_COLORS = ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)', 'rgba(2,44,34,0.45)'];

// Keys match the backend's screen list.
const VOICE_SCREENS = {
  explore: () => navigateToTab(navigationRef, TABS.EXPLORE),
  back: () => {
    if (navigationRef.canGoBack()) navigationRef.goBack();
  },
  home: () => navigateToTab(navigationRef, TABS.HOME),
  saved: () => navigationRef.navigate(ROUTES.WISHLIST),
  chats: () => navigateToTab(navigationRef, TABS.CHATS),
  notifications: () => navigationRef.navigate(ROUTES.NOTIFICATIONS),
  sell: () => navigateToTab(navigationRef, TABS.POST),
  profile: () => navigateToTab(navigationRef, TABS.PROFILE),
  'my-listings': () => navigationRef.navigate(ROUTES.MY_LISTINGS),
  purchases: () => navigationRef.navigate(ROUTES.MY_PURCHASES),
  'recently-viewed': () => navigationRef.navigate(ROUTES.RECENTLY_VIEWED),
  settings: () => navigationRef.navigate(ROUTES.SETTINGS),
  help: () => navigationRef.navigate(ROUTES.HELP),
  'all-categories': () => navigationRef.navigate(ROUTES.ALL_CATEGORIES),
  'edit-profile': () => navigationRef.navigate(ROUTES.EDIT_PROFILE),
  privacy: () => navigationRef.navigate(ROUTES.PRIVACY),
  language: () => navigationRef.navigate(ROUTES.LANGUAGE_SELECT),
  addresses: () => navigationRef.navigate(ROUTES.ADDRESSES),
  'payment-methods': () => navigationRef.navigate(ROUTES.PAYMENT_METHODS),
  wallet: () => navigationRef.navigate(ROUTES.WALLET),
  plan: () => navigationRef.navigate(ROUTES.SUBSCRIPTION),
  'payment-history': () => navigationRef.navigate(ROUTES.PAYMENT_HISTORY),
  invite: () => navigationRef.navigate(ROUTES.INVITE_FRIENDS),
  contact: () => navigationRef.navigate(ROUTES.CONTACT_US),
  legal: () => navigationRef.navigate(ROUTES.LEGAL_HUB),
  'shop-dashboard': () => navigationRef.navigate(ROUTES.SHOP_DASHBOARD),
};

/** Mounts a tab in the background (React Navigation preload), so opening it later is instant. */
function preloadTab(tab) {
  if (!navigationRef.isReady()) return;
  const tabs = navigationRef.getRootState()?.routes?.find((route) => route.name === ROUTES.MAIN_TABS)?.state;
  if (!tabs?.key || !tabs.routeNames?.includes(tab)) return;
  const shown = tabs.routes?.find((route) => route.name === tab);
  if (!shown || tabs.preloadedRouteKeys?.includes(shown.key) || tabs.history?.some((entry) => entry.key === shown.key)) return;
  navigationRef.dispatch({ ...CommonActions.preload(tab), target: tabs.key });
}

let hostState = { open: false, phase: 'idle', level: null };
const hostListeners = new Set();
let hostToggle = null;

function setHostState(patch) {
  hostState = { ...hostState, ...patch };
  hostListeners.forEach((listener) => listener());
}

const subscribeHost = (listener) => {
  hostListeners.add(listener);
  return () => hostListeners.delete(listener);
};
const readHost = () => hostState;

/** The app-wide voice chat state, for buttons that open it (e.g. inside Explore's search bar). */
export function useVoiceHost() {
  const state = useSyncExternalStore(subscribeHost, readHost);
  return { ...state, toggle: () => hostToggle?.() };
}

/** The voice chat button for any search box; it opens or closes the app-wide voice chat. */
export function VoiceSearchToggle({ size }) {
  const { colors } = useTheme();
  const voice = useVoiceHost();
  return (
    <VoiceTalkButton
      active={voice.open}
      phase={voice.phase}
      level={voice.level}
      colors={colors}
      size={size}
      onPress={voice.toggle}
    />
  );
}

let screenEntry = null;

/**
 * Lets the focused screen take part in the voice chat. `getCurrent()` returns `{ current?, screen }` where
 * `screen` may hold `about` (facts shown), `commands` ([{ key, label }] it can do) and numbered `items`/`sellers`;
 * `onHeard(text, done)` gets live words; `onTurn(turn)` acts on the AI's answer and returns `{ act }` (run at
 * once, e.g. navigation), null, or undefined to leave the turn to the app (search, screens, stop).
 */
export function useVoiceScreen(entry) {
  const focused = useIsFocused();
  const entryRef = useRef(entry);
  entryRef.current = entry;
  useEffect(() => {
    if (!focused) return undefined;
    const handle = { get: () => entryRef.current };
    screenEntry = handle;
    return () => {
      if (screenEntry === handle) screenEntry = null;
    };
  }, [focused]);
}

const cleanWords = (text) => String(text || '').replace(/\s+/g, ' ').trim();

/**
 * Puts a screen's own search box in the voice chat: live words show in it while the buyer talks and a voice
 * search fills it there instead of opening Explore. `label` says what the box searches; `searchAll` when it
 * searches every listing. `onSearch(text, turn)` replaces the plain fill (e.g. to also set filters).
 * Returns `matches(...texts)`: true when one of the texts has the box words, or another spelling the AI gave
 * for a voice search ("chair" also finds "kursi" and "कुर्सी").
 */
export function useVoiceSearchBox({ label, value, onChange, onSearch, searchAll = false }) {
  const [voiceWords, setVoiceWords] = useState(null);
  const beforeRef = useRef(null);
  const text = String(value || '');

  useVoiceScreen({
    getCurrent: () => ({ screen: { searchBox: label, searchText: text, searchAll } }),
    onHeard: (heard) => {
      const clean = cleanWords(heard);
      if (!clean) return;
      if (beforeRef.current == null) beforeRef.current = text;
      onChange(clean);
    },
    onTurn: (turn) => {
      const before = beforeRef.current;
      beforeRef.current = null;
      const action = turn?.action;
      if (turn?.where === 'here' && (action === 'search' || action === 'clear')) {
        const search = (action === 'search' && turn.search) || {};
        const words = cleanWords(search.query || search.category);
        const alts = search.query && Array.isArray(search.alts) ? search.alts.map(cleanWords).filter(Boolean) : [];
        setVoiceWords(alts.length ? { text: words.toLowerCase(), alts: alts.map((alt) => alt.toLowerCase()) } : null);
        if (onSearch) onSearch(words, turn);
        else onChange(words);
        return null;
      }
      if (before != null) onChange(before);
      return undefined;
    },
  });

  const needle = cleanWords(text).toLowerCase();
  const words = useMemo(() => {
    if (!needle) return [];
    return voiceWords?.text === needle ? [needle, ...voiceWords.alts] : [needle];
  }, [needle, voiceWords]);

  return useCallback(
    (...texts) => !words.length || texts.some((item) => {
      const hay = String(item || '').toLowerCase();
      return hay && words.some((word) => hay.includes(word));
    }),
    [words]
  );
}

let exploreTurn = null;
let exploreHeard = '';
let exploreReader = null;

/**
 * Explore runs the searches said on other screens; it may mount only after the app opens it.
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

// Plain "open X" / "go back" / "open the first one" commands are understood on the phone, so the screen changes
// the moment the buyer stops talking. Only when nothing else is left in the sentence: "home theater" stays a search.
const QUICK_SCREENS = [
  ['back', /go back|wapas|vapas|wapis|pichhe|piche|pachhadi|pachadi|firta|phirta|back|वापस|पीछे|पिछे|पछाडि|पछाडी|फिर्ता/],
  ['my-listings', /(my|meri|mero|mera) (listings|listing|ads)|मेरी लिस्टिंग्स|मेरी लिस्टिंग|मेरो लिस्टिङ|मेरा लिस्टिंग|माई लिस्टिंग्स|माई लिस्टिंग/],
  ['edit-profile', /edit profile|profile edit|एडिट प्रोफाइल|प्रोफाइल एडिट/],
  ['payment-methods', /payment methods|payment method|पेमेंट मेथड/],
  ['payment-history', /payment history|पेमेंट हिस्ट्री/],
  ['all-categories', /all categories|categories|category list|सभी कैटेगरी|कैटेगरीज|कैटेगरी|सबै क्याटेगोरी|क्याटेगोरी/],
  ['wallet', /wallet|वॉलेट|वालेट/],
  ['plan', /subscription|my plan|मेरा प्लान|सब्सक्रिप्शन/],
  ['invite', /invite friends|invite|refer|इनवाइट|रेफर/],
  ['language', /language|भाषा/],
  ['privacy', /privacy settings|privacy|प्राइवेसी सेटिंग्स|प्राइवेसी/],
  ['addresses', /saved addresses|addresses|address|एड्रेस|पता/],
  ['contact', /contact us|contact|कॉन्टैक्ट|सम्पर्क|संपर्क/],
  ['legal', /terms|policies|policy|नियम|शर्तें|पॉलिसी/],
  ['recently-viewed', /recently viewed|हाल ही में देखे|भर्खरै हेरेका/],
  ['purchases', /(my )?purchases|मेरी खरीदारी|मेरो खरिद|पर्चेसेस/],
  ['notifications', /notifications|notification|नोटिफिकेशन्स|नोटिफिकेशन|सूचनाएं|सूचना/],
  ['settings', /settings|setting|सेटिंग्स|सेटिंग/],
  ['saved', /saved items|saved|wishlist|सेव्ड आइटम्स|सेव्ड|सेव किए हुए|सेव की हुई|सेव गरेका|विशलिस्ट/],
  ['chats', /chats|chat|inbox|messages|चैट्स|चैट|इनबॉक्स|मैसेजेस/],
  ['profile', /profile|प्रोफाइल|प्रोफ़ाइल/],
  ['explore', /explore|एक्सप्लोर/],
  ['home', /home|होम/],
  ['help', /help center|help|हेल्प/],
];
const QUICK_ORDINALS = [
  [1, /pehla|pahla|pehli|pahli|pehle|pahile|pahilo|first|पहला|पहली|पहले|पहिलो|पहिले|फर्स्ट/],
  [2, /doosra|dusra|dusri|dosro|second|दूसरा|दूसरी|दुसरा|दोस्रो|सेकंड/],
  [3, /teesra|tisra|tisri|tesro|third|तीसरा|तीसरी|तेस्रो|थर्ड/],
  [4, /chautha|chauthi|chautho|fourth|चौथा|चौथी|चौथो/],
  [5, /paanchva|panchwa|pachau|fifth|पाँचवाँ|पांचवा|पाँचौं/],
];
const QUICK_VERBS = new Set(('kholo khol kholna kholnu kholdo kholdeu kholiye kholidinu kholnus kholnuhos open jao jaao jau jaau '
  + 'jaiye chalo chaliye go dikhao dikhaao dikhaiye dikhado dekhau dekhaunu dekhaunus dekhaideu lijau laijau take show badlo change '
  + 'खोलो खोल खोलिए खोलिये खोलना खोल्नु खोल्नुस् खोल्नुहोस् खोलिदिनु खोलिदेउ जाओ जाऊ जाउ जाइए जानुस् जानुहोस् चलो चलिए '
  + 'दिखाओ दिखाइए दिखा देखाउ देखाऊ देखाउनुस् देखाइदेउ लैजाउ बदलो बदलें फेर्नु').split(' '));
const QUICK_PICK_WORDS = new Set('wala wali vala wale one number item वाला वाली वाले नंबर आइटम'.split(' '));
const QUICK_FILLER = new Set(('please pls plz ma me mein mai par pe pr page screen tab ko lai mujhe malai ab abhi zara jara ek baar '
  + 'karo kar do dijiye na ta la the to a my can you kinbech section wala wali le items mera meri mero '
  + 'प्लीज मा में मे पर पे पेज स्क्रीन टैब को लाई मुझे मलाई अब अभी ज़रा जरा एक बार करो कर दो दीजिए दिजिए न ना त ल ला है हो ले किनबेच मेरा मेरी मेरो मेरे').split(' '));
// Talk about a seller ("seller se chat karo") is the item page's own command, so the AI decides those.
const QUICK_SKIP = /seller|सेलर|विक्रेता|shop|दुकान|पसल|मालिक/;

/** `{ screen }` or `{ pick }` when the whole sentence is a plain navigation command, else null. */
function quickCommand(text) {
  let rest = ` ${String(text || '').toLowerCase().replace(/[।,.?!]/g, ' ').replace(/\s+/g, ' ').trim()} `;
  if (rest.trim().split(' ').length > 6 || QUICK_SKIP.test(rest)) return null;
  let found = null;
  for (const [screen, pattern] of QUICK_SCREENS) {
    if (pattern.test(rest)) {
      found = { screen };
      rest = rest.replace(pattern, ' ');
      break;
    }
  }
  if (!found) {
    for (const [pick, pattern] of QUICK_ORDINALS) {
      if (pattern.test(rest)) {
        found = { pick };
        rest = rest.replace(pattern, ' ');
        break;
      }
    }
  }
  if (!found) return null;
  const words = rest.split(' ').filter(Boolean);
  const hasVerb = words.some((word) => QUICK_VERBS.has(word));
  const left = words.filter((word) => !QUICK_VERBS.has(word) && !QUICK_FILLER.has(word) && !QUICK_PICK_WORDS.has(word));
  if (left.length) return null;
  if (found.pick && !hasVerb && !words.some((word) => QUICK_PICK_WORDS.has(word))) return null;
  if (found.screen && found.screen !== 'back' && !hasVerb && words.length) return null;
  return found;
}

/** Runs a quick command on the focused screen; true when it did something. */
function runQuickCommand(command) {
  const entry = screenEntry?.get();
  let act = null;
  if (command.screen) {
    act = VOICE_SCREENS[command.screen];
  } else {
    const screen = entry?.getCurrent?.()?.screen || {};
    const action = screen.items?.length ? 'open_item' : screen.sellers?.length ? 'open_seller' : null;
    const size = action === 'open_item' ? screen.items.length : screen.sellers?.length || 0;
    if (!action || command.pick > size) return false;
    act = entry.onTurn?.({ action, pick: command.pick })?.act;
  }
  if (!act) return false;
  // Puts back what the live words typed into the screen's search box.
  if (command.screen) entry?.onTurn?.({ action: 'chat' });
  act();
  return true;
}

// Words that ask for an item ("mujhe kursi chahiye", "find a bike"). Said on a screen without its own search,
// Explore opens with a rough search right away instead of after the AI's answer.
const WANT_WORDS = /chahiye|chaiye|chahie|chahiyo|chainchha|chahincha|khojo|khojnu|dhundo|dhundho|dhoondo|search|find|looking for|kinnu|kharidna|चाहिए|चाहिये|चाहियो|चाहिन्छ|खोज|ढूंढ|ढूँढ|ढूढ|सर्च|किन्नु|खरीदना/;

function sendHeardToExplore(text) {
  exploreHeard = text;
  exploreTurn = null;
  exploreReader?.();
  navigateToTab(navigationRef, TABS.EXPLORE);
}

/** What the app does with a turn the screen left alone. */
function appTurn(turn, close) {
  const action = turn?.action;
  if (action === 'stop') return { afterSpeak: close };
  if (action === 'go') {
    const go = VOICE_SCREENS[turn.screen];
    return go ? { act: go } : null;
  }
  if (action === 'search' || action === 'browse' || action === 'clear') {
    exploreTurn = turn;
    exploreReader?.();
    navigateToTab(navigationRef, TABS.EXPLORE);
  }
  return null;
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

// Permission and system sheets pause the app for a moment; only a real trip away stops the voice chat.
const AWAY_MS = 1500;

function useAppActive() {
  const [active, setActive] = useState(true);
  useEffect(() => {
    let timer = null;
    const sub = AppState.addEventListener('change', (state) => {
      clearTimeout(timer);
      if (state === 'active') setActive(true);
      else timer = setTimeout(() => setActive(false), AWAY_MS);
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, []);
  return active;
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
 * The small glowing orb shown while the voice chat is on: a swirling green core with a shining rim,
 * glow that follows the voice and sonar waves that run faster while it talks. Tap closes.
 */
function VoiceOrb({ phase, level, insets, onClose }) {
  const appear = useSharedValue(0);
  const pulse = useSharedValue(0);
  const spin = useSharedValue(0);
  const wave = useSharedValue(0);

  useEffect(() => {
    appear.value = withSpring(1, { damping: 13, stiffness: 160 });
    spin.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [appear, spin]);

  useEffect(() => {
    cancelAnimation(pulse);
    cancelAnimation(wave);
    if (phase === 'listening' || phase === 'idle') {
      pulse.value = withTiming(0, { duration: 200 });
    } else {
      pulse.value = withRepeat(
        withTiming(1, { duration: phase === 'speaking' ? 480 : 850, easing: Easing.inOut(Easing.quad) }),
        -1,
        true
      );
    }
    wave.value = 0;
    wave.value = withRepeat(
      withTiming(1, { duration: phase === 'speaking' ? 1100 : 2000, easing: Easing.out(Easing.quad) }),
      -1,
      false
    );
    return () => {
      cancelAnimation(pulse);
      cancelAnimation(wave);
    };
  }, [phase, pulse, wave]);

  const listening = phase === 'listening';
  const speaking = phase === 'speaking';
  const innerRing = useAnimatedStyle(() => ringStyle(listening ? 0.15 + level.value * 0.85 : pulse.value, 0.35, 0.6));
  const middleRing = useAnimatedStyle(() => ringStyle(listening ? 0.15 + level.value * 0.85 : pulse.value, 0.75, 0.32));
  const outerRing = useAnimatedStyle(() => ringStyle(listening ? 0.15 + level.value * 0.85 : pulse.value, 1.25, 0.16));
  const waveA = useAnimatedStyle(() => waveStyle(wave.value, speaking ? 1 : listening ? level.value : 0.4));
  const waveB = useAnimatedStyle(() => waveStyle((wave.value + 0.5) % 1, speaking ? 1 : listening ? level.value : 0.4));
  const breatheStyle = useAnimatedStyle(() => {
    const amount = listening ? level.value : pulse.value;
    return { transform: [{ scale: 1 + amount * 0.12 }] };
  });
  const coreStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const rimStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${-spin.value * 720}deg` }] }));
  const wrapStyle = useAnimatedStyle(() => ({
    opacity: appear.value,
    transform: [{ translateY: (1 - appear.value) * 30 }, { scale: 0.5 + appear.value * 0.5 }],
  }));

  return (
    <Reanimated.View pointerEvents="box-none" style={[styles.orbWrap, { bottom: insets.bottom + 92 }, wrapStyle]}>
      <Pressable
        onPress={onClose}
        hitSlop={18}
        accessibilityRole="button"
        accessibilityLabel="Stop talking to KinBech"
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
          <View style={styles.shine} />
        </Reanimated.View>
      </Pressable>
    </Reanimated.View>
  );
}

/**
 * Runs the voice chat for the whole app; mounted once inside the navigator. It is opened from the voice
 * button in any search box, and its orb then stays over every screen until the buyer closes it.
 */
export default function VoiceHost() {
  const insets = useSafeAreaInsets();
  const { user, isLoggedIn } = useAuth();
  const requireLogin = useRequireLogin();
  const routeName = useRouteName();
  const appActive = useAppActive();
  const [open, setOpen] = useState(false);
  const routeRef = useRef(routeName);
  routeRef.current = routeName;

  const hidden = !routeName || QUIET_ROUTES.has(routeName) || (isLoggedIn && isAdminUser(user));

  useEffect(() => {
    if (isLoggedIn) prepareVoiceGreeting();
    else setOpen(false);
  }, [isLoggedIn]);

  const close = useCallback(() => setOpen(false), []);

  const getCurrent = useCallback(() => {
    const own = screenEntry?.get()?.getCurrent?.() || {};
    return { ...own, screen: { ...(own.screen || {}), page: routeRef.current } };
  }, []);

  // Set when this sentence was already done on the phone; the AI's own action for it is then skipped.
  const quickDoneRef = useRef(false);
  // Set when the sentence already opened Explore; the AI's picks and commands were about the old screen.
  const movedRef = useRef(false);

  const onHeard = useCallback((text, done) => {
    const entry = screenEntry?.get();
    if (done) {
      const command = quickCommand(text);
      quickDoneRef.current = Boolean(command) && runQuickCommand(command);
      movedRef.current = false;
      if (quickDoneRef.current) return;
      // Screens with their own search box or actions (item page) keep the words; others search on Explore now.
      if (!entry?.onHeard && !entry?.getCurrent?.()?.screen?.commands?.length && WANT_WORDS.test(text.toLowerCase())) {
        movedRef.current = true;
        sendHeardToExplore(text);
        return;
      }
    }
    entry?.onHeard?.(text, done);
  }, []);

  const onTurn = useCallback((turn) => {
    const action = turn?.action;
    if (quickDoneRef.current) {
      quickDoneRef.current = false;
      return action === 'stop' ? { afterSpeak: close } : null;
    }
    if (movedRef.current) {
      movedRef.current = false;
      if (action === 'open_item' || action === 'open_seller' || action === 'do') return null;
    }
    const own = screenEntry?.get()?.onTurn?.(turn);
    return own !== undefined ? own : appTurn(turn, close);
  }, [close]);

  // Explore is where spoken searches land; mount it while the chat opens so it shows at once.
  useEffect(() => {
    if (open) preloadTab(TABS.EXPLORE);
  }, [open]);

  const onFail = useCallback((reason) => {
    setOpen(false);
    if (reason === 'mic') {
      Alert.alert('Microphone', 'Allow the microphone so you can talk to KinBech.');
    } else if (reason === 'error') {
      Alert.alert('Voice chat', 'The microphone stopped working. Tap the voice button to try again.');
    }
  }, []);

  const voice = useVoiceChat({
    active: open,
    paused: hidden || !appActive,
    getCurrent,
    onHeard,
    onTurn,
    onFail,
  });

  const toggle = useCallback(() => {
    if (open) setOpen(false);
    else requireLogin('voice', () => setOpen(true));
  }, [open, requireLogin]);

  useEffect(() => {
    hostToggle = toggle;
  }, [toggle]);

  useEffect(() => {
    setHostState({ open, phase: voice.phase, level: voice.level });
  }, [open, voice.phase, voice.level]);

  if (hidden || !open) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <VoiceOrb phase={voice.phase} level={voice.level} insets={insets} onClose={close} />
    </View>
  );
}

const styles = StyleSheet.create({
  orbWrap: {
    position: 'absolute',
    right: 30,
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
    width: ORB + 6,
    height: ORB + 6,
    borderRadius: (ORB + 6) / 2,
    overflow: 'hidden',
  },
  coreShadow: {
    width: ORB,
    height: ORB,
    borderRadius: ORB / 2,
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#10B981',
    shadowOpacity: 0.7,
    shadowRadius: 12,
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
    transform: [{ rotate: '-25deg' }],
  },
});
