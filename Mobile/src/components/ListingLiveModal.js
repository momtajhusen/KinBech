import { useEffect } from 'react';
import { Image, Modal, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Easing,
  FadeIn,
  FadeInDown,
  ZoomIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';
import { Float, Ping, PressableScale, Reanimated, Shimmer } from './Motion';
import { callHaptic } from '../services/callHaptics';
import { formatNpr } from '../utils/currency';
import { useTheme, useThemedStyles } from '../theme';

const HERO_HEIGHT = 200;
const HERO_CENTER = 108;
const BADGE = 88;

const THEMES = {
  live: {
    hero: ['#022C22', '#065F46', '#10B981'],
    badge: ['#10B981', '#047857'],
    accent: '#047857',
    dot: '#EF4444',
    pill: 'LIVE',
    icon: 'checkmark',
  },
  review: {
    hero: ['#451A03', '#B45309', '#F59E0B'],
    badge: ['#F59E0B', '#B45309'],
    accent: '#B45309',
    dot: '#FDE68A',
    pill: 'IN REVIEW',
    icon: 'time-outline',
  },
};

const PERKS = {
  live: [
    { icon: 'eye-outline', text: 'Nearby buyers see it' },
    { icon: 'chatbubbles-outline', text: 'Chats come to you' },
  ],
  review: [
    { icon: 'shield-checkmark-outline', text: 'Quick safety check' },
    { icon: 'notifications-outline', text: 'We notify you' },
  ],
};

const CONFETTI_COLORS = ['#FFFFFF', '#FCD34D', '#6EE7B7', '#A7F3D0', '#FDE68A', '#34D399'];
const CONFETTI = Array.from({ length: 20 }, (_, i) => {
  const angle = (i / 20) * Math.PI * 2 + (i % 2 ? 0.16 : -0.1);
  const distance = 92 + (i % 4) * 24;
  const dot = i % 3 === 0;
  return {
    dx: Math.cos(angle) * distance,
    dy: Math.sin(angle) * distance * 0.7,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    width: dot ? 7 : 10,
    height: dot ? 7 : 4,
    radius: dot ? 4 : 1,
    spin: (i % 2 ? 1 : -1) * (220 + i * 18),
    delay: 260 + (i % 5) * 30,
  };
});

const SPARKLES = [
  { top: 26, left: 30, size: 16, duration: 1500 },
  { top: 44, right: 34, size: 20, duration: 1900 },
  { top: 136, left: 54, size: 12, duration: 1700 },
  { top: 146, right: 58, size: 14, duration: 1400 },
];

function ConfettiPiece({ piece }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(piece.delay, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }));
    return () => cancelAnimation(p);
  }, [p, piece.delay]);
  const animated = useAnimatedStyle(() => ({
    opacity: Math.min(1, p.value * 12) * (1 - Math.max(0, (p.value - 0.62) / 0.38)),
    transform: [
      { translateX: piece.dx * p.value },
      { translateY: piece.dy * p.value + 34 * p.value * p.value },
      { rotate: `${piece.spin * p.value}deg` },
    ],
  }));
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        fx.confetti,
        {
          width: piece.width,
          height: piece.height,
          borderRadius: piece.radius,
          marginLeft: -piece.width / 2,
          marginTop: -piece.height / 2,
          backgroundColor: piece.color,
        },
        animated,
      ]}
    />
  );
}

function Ring({ delay }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1));
    return () => cancelAnimation(p);
  }, [delay, p]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.6 * (1 - p.value),
    transform: [{ scale: 1 + p.value * 1.6 }],
  }));
  return <Reanimated.View pointerEvents="none" style={[fx.ring, animated]} />;
}

function Badge({ theme }) {
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.value = withDelay(140, withSpring(1, { damping: 8, stiffness: 150, mass: 0.8 }));
    return () => cancelAnimation(pop);
  }, [pop]);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { rotate: `${(1 - pop.value) * -140}deg` }],
  }));
  return (
    <Reanimated.View style={[fx.badgeWrap, animated]}>
      <Float distance={4} duration={1800}>
        <View style={fx.badge}>
          <LinearGradient colors={theme.badge} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fx.badgeInner}>
            <Reanimated.View entering={ZoomIn.delay(420).springify().damping(10)}>
              <Icon name={theme.icon} size={38} color="#FFFFFF" />
            </Reanimated.View>
          </LinearGradient>
        </View>
      </Float>
    </Reanimated.View>
  );
}

function LiveContent({ inReview, title, message, listing, onClose }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const theme = inReview ? THEMES.review : THEMES.live;
  const perks = inReview ? PERKS.review : PERKS.live;
  const price = Number(String(listing?.price ?? '').replace(/[^\d.]/g, '')) || 0;

  useEffect(() => {
    callHaptic(inReview ? 'ringing' : 'answer');
  }, [inReview]);

  return (
    <Reanimated.View entering={FadeIn.duration(220)} style={styles.backdrop}>
      <Reanimated.View entering={cardIn} style={styles.card}>
        <LinearGradient colors={theme.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Shimmer duration={2400} pause={1600} color="rgba(255,255,255,0.16)" />
          <View pointerEvents="none" style={fx.glow} />
          {[0, 800, 1600].map((delay) => (
            <Ring key={delay} delay={delay} />
          ))}
          {inReview ? null : CONFETTI.map((piece, i) => <ConfettiPiece key={i} piece={piece} />)}
          {SPARKLES.map((s, i) => (
            <Reanimated.View
              key={i}
              entering={ZoomIn.delay(520 + i * 90).springify().damping(12)}
              style={[fx.sparkle, { top: s.top, left: s.left, right: s.right }]}
            >
              <Float distance={5} duration={s.duration}>
                <Icon name="sparkles" size={s.size} color="rgba(255,255,255,0.85)" />
              </Float>
            </Reanimated.View>
          ))}
          <Badge theme={theme} />
          <Reanimated.View entering={FadeInDown.delay(300).springify().damping(14)} style={styles.livePill}>
            <Ping size={8} color={theme.dot} />
            <Text style={styles.livePillText}>{theme.pill}</Text>
          </Reanimated.View>
        </LinearGradient>

        <View style={styles.body}>
          <Reanimated.Text entering={FadeInDown.delay(320).duration(420)} style={styles.title}>
            {title}
          </Reanimated.Text>
          <Reanimated.Text entering={FadeInDown.delay(380).duration(420)} style={styles.message}>
            {message}
          </Reanimated.Text>

          {listing?.title ? (
            <Reanimated.View entering={FadeInDown.delay(440).springify().damping(15)} style={styles.preview}>
              {listing.photo ? (
                <Image source={{ uri: listing.photo }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Icon name="image-outline" size={22} color={colors.textMuted} />
                </View>
              )}
              <View style={styles.previewCopy}>
                <Text style={styles.previewTitle} numberOfLines={1}>
                  {listing.title}
                </Text>
                {price > 0 ? (
                  <Text style={[styles.previewPrice, { color: theme.accent }]}>{formatNpr(price)}</Text>
                ) : null}
              </View>
              <View style={[styles.status, { backgroundColor: `${theme.accent}1A` }]}>
                <View style={[styles.statusDot, { backgroundColor: theme.accent }]} />
                <Text style={[styles.statusText, { color: theme.accent }]}>{inReview ? 'Review' : 'Active'}</Text>
              </View>
            </Reanimated.View>
          ) : null}

          <View style={styles.perks}>
            {perks.map((perk, i) => (
              <Reanimated.View
                key={perk.icon}
                entering={FadeInDown.delay(500 + i * 70).springify().damping(15)}
                style={styles.perk}
              >
                <View style={[styles.perkIcon, { backgroundColor: theme.accent }]}>
                  <Icon name={perk.icon} size={14} color="#FFFFFF" />
                </View>
                <Text style={styles.perkText} numberOfLines={2}>
                  {perk.text}
                </Text>
              </Reanimated.View>
            ))}
          </View>

          <Reanimated.View entering={FadeInDown.delay(620).springify().damping(15)}>
            <PressableScale contentStyle={styles.primary} onPress={onClose}>
              <LinearGradient
                colors={theme.badge.slice().reverse()}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Shimmer duration={1800} pause={1400} />
              <Text style={styles.primaryText}>View My Listings</Text>
              <Icon name="arrow-forward" size={18} color="#FFFFFF" />
            </PressableScale>
          </Reanimated.View>
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
}

function cardIn() {
  'worklet';
  const spring = { damping: 14, stiffness: 150, mass: 0.8 };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 70 }, { scale: 0.82 }] },
    animations: {
      opacity: withTiming(1, { duration: 240 }),
      transform: [{ translateY: withSpring(0, spring) }, { scale: withSpring(1, spring) }],
    },
  };
}

/** Celebration shown right after a listing is posted, or sent for review. */
export default function ListingLiveModal({ visible, onClose, ...rest }) {
  return (
    <Modal visible={!!visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {visible ? <LiveContent {...rest} onClose={onClose} /> : null}
    </Modal>
  );
}

const fx = StyleSheet.create({
  confetti: {
    position: 'absolute',
    left: '50%',
    top: HERO_CENTER,
  },
  ring: {
    position: 'absolute',
    left: '50%',
    top: HERO_CENTER - BADGE / 2,
    width: BADGE,
    height: BADGE,
    marginLeft: -BADGE / 2,
    borderRadius: BADGE / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  glow: {
    position: 'absolute',
    left: '50%',
    top: HERO_CENTER - 75,
    width: 150,
    height: 150,
    marginLeft: -75,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  sparkle: {
    position: 'absolute',
  },
  badgeWrap: {
    position: 'absolute',
    left: '50%',
    top: HERO_CENTER - BADGE / 2,
    marginLeft: -BADGE / 2,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    padding: 7,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  badgeInner: {
    flex: 1,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
      backgroundColor: 'rgba(2,6,23,0.72)',
    },
    card: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 30,
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000000',
      shadowOpacity: 0.35,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 16 },
      elevation: 18,
    },
    hero: {
      height: HERO_HEIGHT,
      overflow: 'hidden',
    },
    livePill: {
      position: 'absolute',
      top: 14,
      left: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.28)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
    },
    livePillText: {
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.4,
      color: '#FFFFFF',
    },
    body: {
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 20,
    },
    title: {
      fontSize: 24,
      fontWeight: '900',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    message: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: 'center',
    },
    preview: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 18,
      padding: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    thumb: {
      width: 54,
      height: 54,
      borderRadius: 14,
      backgroundColor: colors.surface,
    },
    thumbEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    previewCopy: {
      flex: 1,
      gap: 3,
    },
    previewTitle: {
      fontSize: 14.5,
      fontWeight: '800',
      color: colors.text,
    },
    previewPrice: {
      fontSize: 14,
      fontWeight: '900',
    },
    status: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
      borderRadius: 999,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusText: {
      fontSize: 11,
      fontWeight: '800',
    },
    perks: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 12,
      marginBottom: 18,
    },
    perk: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    perkIcon: {
      width: 26,
      height: 26,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    perkText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 15,
      color: colors.text,
    },
    primary: {
      height: 54,
      borderRadius: 18,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
  });
