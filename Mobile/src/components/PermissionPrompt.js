import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  Easing,
  Linking,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import Icon from './Icon';
import { isSignInModalPending, onSignInModalClosed } from './SignedInModal';
import {
  getFCMToken,
  getNotificationPermission,
  requestNotificationPermission,
  syncDeviceToken,
} from '../services/notifications';
import { useTheme, useThemedStyles } from '../theme';

const CARD_WIDTH = Math.min(Dimensions.get('window').width - 40, 380);
/** After "Maybe later", Home stays quiet this long before asking again. */
const REMIND_AFTER_MS = 45 * 1000;
let lastClosedAt = 0;

const ITEMS = [
  {
    key: 'notifications',
    icon: 'notifications',
    title: 'Notifications',
    body: 'Get buyer messages, calls and offers right away.',
  },
  {
    key: 'location',
    icon: 'location',
    title: 'Device location',
    body: 'See items and shops closest to you first.',
  },
];

async function readLocation() {
  const res = await Location.getForegroundPermissionsAsync();
  return { granted: res.status === 'granted', canAskAgain: res.canAskAgain !== false };
}

/** Native 0→1 loop on the UI thread. */
function useLoop(duration, { delay = 0, easing = Easing.inOut(Easing.sin), active = true } = {}) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      value.setValue(0);
      return undefined;
    }
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: true })),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, delay, active]);
  return value;
}

/** Scales its child in once on mount, e.g. the checkmark after a permission is granted. */
function PopIn({ children }) {
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 140, useNativeDriver: true }).start();
  }, [scale]);
  return <Animated.View style={{ transform: [{ scale }] }}>{children}</Animated.View>;
}

function AllowButton({ label, busy, attention, onPress, colors, styles }) {
  const pulse = useLoop(1100, { active: attention });
  const ripple = useLoop(1600, { active: attention, easing: Easing.out(Easing.quad) });
  const nudge = useLoop(900, { active: attention });
  return (
    <View style={styles.allowStage}>
      {attention ? (
        <Animated.Text
          style={[
            styles.pointer,
            { transform: [{ translateX: nudge.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 6, 0] }) }] },
          ]}
        >
          👉
        </Animated.Text>
      ) : null}
      <View>
        {attention ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ripple,
              {
                opacity: ripple.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                transform: [
                  { scaleX: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
                  { scaleY: ripple.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) },
                ],
              },
            ]}
          />
        ) : null}
        <Animated.View
          style={{
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] }) }],
          }}
        >
          <Pressable onPress={onPress} disabled={busy} style={({ pressed }) => [pressed && styles.pressed]}>
            <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.allowBtn}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.onGradient} />
              ) : (
                <Text style={styles.allowText}>{label}</Text>
              )}
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

function PermissionRow({ item, state, attention, busy, onAllow, colors, styles }) {
  const glow = useLoop(1400, { active: attention });
  const granted = Boolean(state?.granted);
  const blocked = Boolean(state && !granted && !state.canAskAgain);
  return (
    <View style={[styles.row, granted && styles.rowDone]}>
      {attention ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.rowGlow, { opacity: glow.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 1, 0.15] }) }]}
        />
      ) : null}
      {granted ? (
        <PopIn key="done">
          <View style={[styles.rowIcon, { backgroundColor: colors.success }]}>
            <Icon name="checkmark" size={18} color={colors.onGradient} />
          </View>
        </PopIn>
      ) : (
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rowIcon}>
          <Icon name={item.icon} size={18} color={colors.onGradient} />
        </LinearGradient>
      )}
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowBody}>
          {granted
            ? 'Allowed. Thank you!'
            : blocked
              ? 'Turned off. Tap Settings, then Permissions, and allow it.'
              : item.body}
        </Text>
      </View>
      {granted ? (
        <PopIn key="pill">
          <View style={styles.allowedPill}>
            <Icon name="checkmark-circle" size={13} color={colors.success} />
            <Text style={styles.allowedText}>Allowed</Text>
          </View>
        </PopIn>
      ) : (
        <AllowButton
          label={blocked ? 'Settings' : 'Allow'}
          busy={busy}
          attention={attention}
          onPress={onAllow}
          colors={colors}
          styles={styles}
        />
      )}
    </View>
  );
}

/**
 * Our own pre-permission sheet. The Android system dialog can't be restyled, so it only opens
 * when the user taps Allow here. Comes back on Home (and when the app returns) until both are allowed.
 */
export default function PermissionPrompt({ enabled, onLocationGranted }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const focused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const [perms, setPerms] = useState({ notifications: null, location: null });
  const [busy, setBusy] = useState('');
  const [shownKeys, setShownKeys] = useState([]);
  const visibleRef = useRef(false);
  const openingRef = useRef(false);
  const mountedRef = useRef(true);
  const anim = useRef(new Animated.Value(0)).current;
  const onLocationRef = useRef(onLocationGranted);
  onLocationRef.current = onLocationGranted;

  const bell = useLoop(1800, { active: visible });
  const pin = useLoop(1400, { active: visible, delay: 300 });
  const shield = useLoop(2600, { active: visible });

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const refresh = useCallback(async () => {
    const [notifications, location] = await Promise.all([getNotificationPermission(), readLocation()]);
    if (mountedRef.current) {
      setPerms((prev) => ({
        notifications: { ...notifications, canAskAgain: prev.notifications?.canAskAgain ?? notifications.canAskAgain },
        location,
      }));
    }
    return { notifications, location };
  }, []);

  const maybeShow = useCallback(async () => {
    if (visibleRef.current || openingRef.current || isSignInModalPending()) return;
    if (Date.now() - lastClosedAt < REMIND_AFTER_MS) return;
    openingRef.current = true;
    try {
      const current = await refresh();
      const missing = ITEMS.filter((item) => !current[item.key].granted).map((item) => item.key);
      if (!missing.length || !mountedRef.current) return;
      setShownKeys(missing);
      // Lets the welcome modal's window finish closing before this one opens.
      await new Promise((resolve) => setTimeout(resolve, 250));
      if (mountedRef.current) setVisible(true);
    } catch {
      // Permission checks failing just means no prompt this time.
    } finally {
      openingRef.current = false;
    }
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !focused) return undefined;
    maybeShow();
    return onSignInModalClosed(() => maybeShow());
  }, [enabled, focused, maybeShow]);

  useEffect(() => {
    if (!enabled || !focused) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (visibleRef.current) {
        // Back from the system dialog or Settings: pick up whatever changed there.
        refresh().then((next) => {
          if (next.location.granted) onLocationRef.current?.();
          if (next.notifications.granted) getFCMToken().then(() => syncDeviceToken()).catch(() => {});
        });
        return;
      }
      maybeShow();
    });
    return () => sub.remove();
  }, [enabled, focused, maybeShow, refresh]);

  useEffect(() => {
    if (!visible) return;
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [visible, anim]);

  const close = useCallback(() => {
    lastClosedAt = Date.now();
    Animated.timing(anim, { toValue: 0, duration: 220, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      if (mountedRef.current) setVisible(false);
    });
  }, [anim]);

  const items = ITEMS.filter((item) => shownKeys.includes(item.key));
  const pending = items.filter((item) => !perms[item.key]?.granted);
  const allGranted = items.length > 0 && pending.length === 0;
  const focusKey = pending[0]?.key;

  useEffect(() => {
    if (!visible || !allGranted) return undefined;
    const timer = setTimeout(close, 1400);
    return () => clearTimeout(timer);
  }, [visible, allGranted, close]);

  const allow = async (key) => {
    const state = perms[key];
    if (busy || state?.granted) return;
    if (state && !state.canAskAgain) {
      Linking.openSettings().catch(() => {});
      return;
    }
    setBusy(key);
    try {
      if (key === 'notifications') {
        const result = await requestNotificationPermission();
        setPerms((prev) => ({ ...prev, notifications: result }));
        if (result.granted) getFCMToken().then(() => syncDeviceToken()).catch(() => {});
      } else {
        const res = await Location.requestForegroundPermissionsAsync();
        const result = { granted: res.status === 'granted', canAskAgain: res.canAskAgain !== false };
        setPerms((prev) => ({ ...prev, location: result }));
        if (result.granted) onLocationRef.current?.();
      }
    } catch {
      // The system dialog failed to open; the row stays as it was.
    } finally {
      setBusy('');
    }
  };

  if (!visible) return null;

  const heroTitle = allGranted
    ? "You're all set!"
    : pending.length === items.length
      ? 'Get the most out of KinBech'
      : 'Almost there, one more';

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent hardwareAccelerated onRequestClose={close}>
      <Animated.View style={[styles.backdrop, { opacity: anim }]} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              opacity: anim,
              transform: [
                { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
                { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        >
          <LinearGradient
            colors={colors.gradientSplash || colors.gradient}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.hero}
          >
            <Pressable onPress={close} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close">
              <Icon name="close" size={18} color={colors.onGradient} />
            </Pressable>
            <View style={styles.heroIcons}>
              <Animated.View
                style={[
                  styles.heroBubble,
                  styles.heroBubbleSmall,
                  perms.notifications?.granted && styles.heroBubbleDone,
                  {
                    transform: [
                      {
                        rotate: bell.interpolate({
                          inputRange: [0, 0.1, 0.2, 0.3, 0.4, 1],
                          outputRange: ['0deg', '-14deg', '12deg', '-8deg', '0deg', '0deg'],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <Icon name={perms.notifications?.granted ? 'checkmark' : 'notifications'} size={20} color={colors.onGradient} />
              </Animated.View>
              <Animated.View
                style={[
                  styles.heroBubble,
                  { transform: [{ translateY: shield.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 0] }) }] },
                ]}
              >
                <Icon name={allGranted ? 'checkmark-circle' : 'shield-checkmark'} size={34} color={colors.onGradient} />
              </Animated.View>
              <Animated.View
                style={[
                  styles.heroBubble,
                  styles.heroBubbleSmall,
                  perms.location?.granted && styles.heroBubbleDone,
                  {
                    transform: [
                      { translateY: pin.interpolate({ inputRange: [0, 0.3, 0.5, 1], outputRange: [0, -9, 0, 0] }) },
                    ],
                  },
                ]}
              >
                <Icon name={perms.location?.granted ? 'checkmark' : 'location'} size={20} color={colors.onGradient} />
              </Animated.View>
            </View>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
            <Text style={styles.heroSub}>
              {allGranted
                ? 'Buyers can reach you and nearby deals come first.'
                : 'Tap Allow so you never miss a buyer and see deals near you.'}
            </Text>
            {items.length > 1 ? (
              <View style={styles.stepDots}>
                {items.map((item) => (
                  <View key={item.key} style={[styles.stepDot, perms[item.key]?.granted && styles.stepDotDone]} />
                ))}
              </View>
            ) : null}
          </LinearGradient>

          <View style={styles.body}>
            {items.map((item) => (
              <PermissionRow
                key={item.key}
                item={item}
                state={perms[item.key]}
                attention={item.key === focusKey}
                busy={busy === item.key}
                onAllow={() => allow(item.key)}
                colors={colors}
                styles={styles}
              />
            ))}

            {allGranted ? (
              <Pressable onPress={close} style={({ pressed }) => [styles.ctaWrap, pressed && styles.pressed]}>
                <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                  <Text style={styles.ctaText}>Continue</Text>
                  <Icon name="arrow-forward" size={18} color={colors.onGradient} />
                </LinearGradient>
              </Pressable>
            ) : (
              <Pressable onPress={close} hitSlop={8} style={styles.laterBtn}>
                <Text style={styles.laterText}>Remind me later</Text>
              </Pressable>
            )}
            <Text style={styles.footNote}>We only use these for chats, calls and nearby results.</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) => ({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay || 'rgba(0,0,0,0.55)',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: CARD_WIDTH,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.card || colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  hero: { alignItems: 'center', paddingTop: 30, paddingBottom: 20, paddingHorizontal: 22 },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    zIndex: 2,
  },
  heroIcons: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroBubble: {
    width: 76,
    height: 76,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  heroBubbleSmall: { width: 48, height: 48, borderRadius: 17 },
  heroBubbleDone: { backgroundColor: colors.success, borderColor: 'rgba(255,255,255,0.5)' },
  heroTitle: {
    marginTop: 16,
    fontSize: 21,
    fontWeight: '800',
    color: colors.onGradient,
    textAlign: 'center',
  },
  heroSub: {
    marginTop: 6,
    fontSize: 13.5,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
  },
  stepDots: { flexDirection: 'row', gap: 6, marginTop: 12 },
  stepDot: { width: 22, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  stepDotDone: { backgroundColor: colors.onGradient },
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 18, gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: `${colors.primary}10`,
    borderWidth: 1,
    borderColor: `${colors.primary}22`,
  },
  rowGlow: {
    position: 'absolute',
    top: -1,
    left: -1,
    right: -1,
    bottom: -1,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  rowDone: { backgroundColor: `${colors.success}12`, borderColor: `${colors.success}33` },
  rowIcon: { width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1 },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  rowBody: { marginTop: 2, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  allowStage: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  pointer: { fontSize: 16 },
  ripple: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  allowBtn: {
    minWidth: 74,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allowText: { fontSize: 13, fontWeight: '800', color: colors.onGradient },
  allowedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: 15,
    backgroundColor: `${colors.success}1F`,
  },
  allowedText: { fontSize: 12, fontWeight: '800', color: colors.success },
  ctaWrap: { marginTop: 6 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: colors.onGradient },
  laterBtn: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 16, marginTop: 2 },
  laterText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  footNote: { fontSize: 11.5, color: colors.textMuted, textAlign: 'center' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
