import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Dimensions, Easing, Image, Modal, Pressable, Text, View } from 'react-native';
import Icon from './Icon';
import { GoogleLogo } from './GoogleButton';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles } from '../theme';

const CARD_WIDTH = Math.min(Dimensions.get('window').width - 36, 390);
/** Lets the login screen/sheet finish leaving before the card comes in. */
const SHOW_DELAY_MS = 450;

const listeners = new Set();
const closeListeners = new Set();
let pending = false;

/** Called by the Google sign-in hook once the session is saved. */
export function announceSignIn(payload) {
  if (!listeners.size) return;
  pending = true;
  setTimeout(() => listeners.forEach((listener) => listener(payload)), SHOW_DELAY_MS);
}

/** Other first-run modals (permissions) wait while this one is coming up or open. */
export function isSignInModalPending() {
  return pending;
}

export function onSignInModalClosed(callback) {
  closeListeners.add(callback);
  return () => closeListeners.delete(callback);
}

const CONFETTI = [
  { top: 16, left: 24, size: 13, delay: 0, char: '✦' },
  { top: 40, right: 28, size: 10, delay: 250, char: '●' },
  { top: 96, left: 14, size: 8, delay: 500, char: '●' },
  { top: 120, right: 18, size: 14, delay: 120, char: '✦' },
  { top: 170, left: 40, size: 9, delay: 380, char: '✦' },
  { top: 160, right: 50, size: 8, delay: 650, char: '●' },
];

function useLoop(duration, delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(value, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true })),
    ]);
    anim.start();
    return () => anim.stop();
  }, [value, duration, delay]);
  return value;
}

function Confetti({ spec, styles }) {
  const t = useLoop(1800, spec.delay);
  const { size, delay, char, ...pos } = spec;
  return (
    <Animated.Text
      style={[
        styles.confetti,
        pos,
        {
          fontSize: size,
          opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0.95, 0.2] }),
          transform: [
            { translateY: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 0] }) },
            { scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.8, 1.15, 0.8] }) },
          ],
        },
      ]}
    >
      {char}
    </Animated.Text>
  );
}

function memberSince(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

function detailRows(info) {
  const { user, isNew, deletionCancelled } = info;
  if (isNew) {
    return [
      { icon: 'person-circle', title: 'Set up your profile', text: 'Add your name, photo and location. It takes a minute.' },
      { icon: 'storefront', title: 'Choose how you sell', text: 'As an individual, or open your own shop.' },
      { icon: 'chatbubbles', title: 'Start chatting', text: 'Message sellers and buyers near you.' },
    ];
  }
  const rows = [];
  if (deletionCancelled) {
    rows.push({ icon: 'refresh', title: 'Account restored', text: 'Deletion was cancelled. Your listings and shop are visible again.' });
  }
  rows.push({
    icon: user?.sellerTypePreference === 'shop' ? 'storefront' : 'person',
    title: user?.sellerTypePreference === 'shop' ? 'Selling as a shop' : 'Selling as an individual',
    text: user?.location ? `Near ${user.location}` : 'Add your location to see deals nearby',
  });
  const since = memberSince(user?.joinedAt || user?.createdAt);
  const sold = Number(user?.soldCount) || 0;
  const bought = Number(user?.boughtCount) || 0;
  rows.push({
    icon: 'calendar',
    title: since ? `Member since ${since}` : 'KinBech member',
    text: sold || bought ? `${sold} sold · ${bought} bought` : 'Your chats, saved items and listings are synced',
  });
  return rows;
}

export default function SignedInModal() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [info, setInfo] = useState(null);
  const enter = useRef(new Animated.Value(0)).current;
  const badge = useRef(new Animated.Value(0)).current;
  const rows = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const listener = (payload) => setInfo(payload);
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, []);

  useEffect(() => {
    if (!info) return;
    enter.setValue(0);
    badge.setValue(0);
    rows.forEach((row) => row.setValue(0));
    Animated.parallel([
      Animated.spring(enter, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(260),
        Animated.spring(badge, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      ]),
      Animated.stagger(
        90,
        rows.map((row) => Animated.timing(row, { toValue: 1, duration: 360, delay: 380, easing: Easing.out(Easing.cubic), useNativeDriver: true }))
      ),
    ]).start();
  }, [info, enter, badge, rows]);

  const close = () => {
    Animated.timing(enter, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setInfo(null);
      pending = false;
      closeListeners.forEach((callback) => callback());
    });
  };

  if (!info || !colors) return null;

  const { user, google, isNew } = info;
  const name = String(user?.name || google?.name || '').trim();
  const firstName = name.split(/\s+/)[0];
  const email = user?.email || google?.email || '';
  const avatar = resolveMediaUrl(user?.avatarUrl || '') || google?.photo || '';
  const initial = (name || email || '?').charAt(0).toUpperCase();
  const details = detailRows(info).slice(0, rows.length);

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent hardwareAccelerated onRequestClose={close}>
      <Animated.View style={[styles.backdrop, { opacity: enter }]} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              opacity: enter,
              transform: [
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [80, 0] }) },
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
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
            {CONFETTI.map((spec, i) => (
              <Confetti key={i} spec={spec} styles={styles} />
            ))}
            <View style={styles.statusPill}>
              <Icon name="checkmark-circle" size={13} color={colors.onGradient} />
              <Text style={styles.statusText}>{isNew ? 'ACCOUNT CREATED' : 'SIGNED IN'}</Text>
            </View>

            <View style={styles.avatarStage}>
              <View style={styles.avatarRing}>
                <View style={styles.avatarInner}>
                  {avatar ? (
                    <Image source={{ uri: avatar }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  )}
                </View>
              </View>
              <Animated.View style={[styles.googleBadge, { transform: [{ scale: badge }] }]}>
                <GoogleLogo size={16} />
              </Animated.View>
              <Animated.View style={[styles.checkBadge, { transform: [{ scale: badge }] }]}>
                <Icon name="checkmark" size={14} color="#FFFFFF" />
              </Animated.View>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            <Text style={styles.title}>
              {isNew ? `Welcome to KinBech${firstName ? `, ${firstName}` : ''}!` : `Welcome back${firstName ? `, ${firstName}` : ''}!`}
            </Text>
            {name ? <Text style={styles.name} numberOfLines={1}>{name}</Text> : null}
            {email ? (
              <View style={styles.emailPill}>
                <Icon name="mail" size={13} color={colors.textMuted} />
                <Text style={styles.emailText} numberOfLines={1}>{email}</Text>
                <Icon name="shield-checkmark" size={13} color={colors.success} />
              </View>
            ) : null}

            <View style={styles.details}>
              {details.map((row, index) => (
                <Animated.View
                  key={row.title}
                  style={[
                    styles.detailRow,
                    index > 0 && styles.detailDivider,
                    {
                      opacity: rows[index],
                      transform: [{ translateX: rows[index].interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
                    },
                  ]}
                >
                  <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.detailIcon}>
                    <Icon name={row.icon} size={16} color={colors.onGradient} />
                  </LinearGradient>
                  <View style={styles.detailCopy}>
                    <Text style={styles.detailTitle}>{row.title}</Text>
                    <Text style={styles.detailText} numberOfLines={2}>{row.text}</Text>
                  </View>
                </Animated.View>
              ))}
            </View>

            <Pressable onPress={close} style={({ pressed }) => [pressed && styles.pressed]}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
                <Text style={styles.ctaText}>{isNew ? 'Set up my profile' : 'Continue'}</Text>
                <Icon name="arrow-forward" size={18} color={colors.onGradient} />
              </LinearGradient>
            </Pressable>
            <Text style={styles.footNote}>Signed in securely with Google</Text>
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
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: colors.card || colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  hero: { alignItems: 'center', paddingTop: 22, paddingBottom: 64 },
  confetti: { position: 'absolute', color: 'rgba(255,255,255,0.9)' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  statusText: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.6, color: colors.onGradient },
  avatarStage: { position: 'absolute', bottom: -52, width: 108, height: 108 },
  avatarRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    padding: 4,
    backgroundColor: colors.card || colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 50,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitial: { fontSize: 40, fontWeight: '800', color: colors.onGradient },
  googleBadge: {
    position: 'absolute',
    left: 2,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: colors.card || colors.surface,
  },
  checkBadge: {
    position: 'absolute',
    right: 2,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.success,
    borderWidth: 3,
    borderColor: colors.card || colors.surface,
  },
  body: { paddingTop: 62, paddingHorizontal: 20, paddingBottom: 18, alignItems: 'stretch' },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, textAlign: 'center' },
  name: { marginTop: 2, fontSize: 14.5, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  emailPill: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '100%',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted || colors.iconBackground,
  },
  emailText: { flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  details: {
    marginTop: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: `${colors.primary}0D`,
    borderWidth: 1,
    borderColor: `${colors.primary}22`,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11 },
  detailDivider: { borderTopWidth: 1, borderTopColor: `${colors.primary}1A` },
  detailIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  detailCopy: { flex: 1 },
  detailTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  detailText: { marginTop: 1, fontSize: 12, lineHeight: 16, color: colors.textMuted },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 15,
  },
  ctaText: { fontSize: 16, fontWeight: '700', color: colors.onGradient },
  footNote: { marginTop: 10, fontSize: 11.5, color: colors.textMuted, textAlign: 'center' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
