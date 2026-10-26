import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import { Animated, Dimensions, Easing, Modal, Pressable, Text, View } from 'react-native';
import Icon from './Icon';
import BrandLogo from './BrandLogo';
import { BRAND_TAGLINE } from '../content/brand';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles } from '../theme';

const WELCOME_KEY = 'kinbech_welcome_seen';
const APP_NAME = 'KinBech';
const CARD_WIDTH = Math.min(Dimensions.get('window').width - 40, 380);
/** Whole intro length; every element animates inside its own window of this one native timeline. */
const INTRO_MS = 1700;

const FEATURES = [
  { icon: 'location', label: 'Deals from people near you' },
  { icon: 'camera', label: 'Sell in seconds with AI help' },
  { icon: 'shield-checkmark', label: 'Chat, call and meet safely' },
];

const SPARKS = [
  { top: 22, left: 26, size: 14, delay: 0 },
  { top: 46, right: 30, size: 11, delay: 300 },
  { top: 120, left: 18, size: 9, delay: 600 },
  { top: 132, right: 22, size: 13, delay: 150 },
  { top: 190, left: 46, size: 8, delay: 450 },
  { top: 182, right: 54, size: 10, delay: 750 },
];

/** Native 0→1 loop; the start delay runs once, then every iteration stays on the UI thread. */
function useLoop(duration, delay = 0, easing = Easing.linear) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: true })),
    ]);
    anim.start();
    return () => anim.stop();
    // `easing` is often an inline Easing.* call; restarting the loop on every render would cause a jump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, delay]);
  return value;
}

function Ripple({ delay, styles }) {
  const t = useLoop(2400, delay, Easing.out(Easing.quad));
  return (
    <Animated.View
      style={[
        styles.ripple,
        {
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.9] }) }],
        },
      ]}
    />
  );
}

function Spark({ spec, styles }) {
  const t = useLoop(1800, spec.delay);
  const { size, delay, ...pos } = spec;
  return (
    <Animated.Text
      style={[
        styles.spark,
        pos,
        {
          fontSize: size,
          opacity: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.15, 0.9, 0.15] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.7, 1.2, 0.7] }) }],
        },
      ]}
    >
      ✦
    </Animated.Text>
  );
}

export default function WelcomeModal() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { user } = useAuth();
  const focused = useIsFocused();
  const [visible, setVisible] = useState(false);
  const introStartedRef = useRef(false);
  const progress = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(1)).current;
  const float = useLoop(3000, 0, Easing.inOut(Easing.sin));

  useEffect(() => {
    if (!focused) return undefined;
    let timer;
    let cancelled = false;
    AsyncStorage.getItem(WELCOME_KEY)
      .then((seen) => {
        if (!seen && !cancelled) timer = setTimeout(() => setVisible(true), 120);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [focused]);

  const startIntro = () => {
    if (introStartedRef.current) return;
    introStartedRef.current = true;
    Animated.timing(progress, {
      toValue: 1,
      duration: INTRO_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    if (!visible) return undefined;
    const fallback = setTimeout(startIntro, 300);
    return () => clearTimeout(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const close = () => {
    AsyncStorage.setItem(WELCOME_KEY, '1').catch(() => {});
    Animated.timing(exit, {
      toValue: 0,
      duration: 240,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  if (!visible || !colors) return null;

  /** Maps points inside [start, start + duration] ms of the intro to output values. */
  const seg = (start, duration, points, outputs) =>
    progress.interpolate({
      inputRange: points.map((f) => Math.min(1, (start + f * duration) / INTRO_MS)),
      outputRange: outputs,
      extrapolate: 'clamp',
    });
  const fadeIn = (start, duration) => seg(start, duration, [0, 1], [0, 1]);
  const pop = (start, duration, from) => seg(start, duration, [0, 0.6, 0.8, 1], [from, 1.08, 0.97, 1]);
  const riseIn = (start, from = 16, duration = 360) => ({
    opacity: fadeIn(start, duration * 0.7),
    transform: [{ translateY: seg(start, duration, [0, 0.7, 1], [from, -2, 0]) }],
  });

  const firstName = String(user?.name || '').trim().split(/\s+/)[0];

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      hardwareAccelerated
      onShow={startIntro}
      onRequestClose={close}
    >
      <Animated.View style={[styles.backdrop, { opacity: Animated.multiply(fadeIn(0, 260), exit) }]} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              opacity: Animated.multiply(fadeIn(0, 200), exit),
              transform: [
                { translateY: seg(0, 480, [0, 0.65, 1], [70, -6, 0]) },
                {
                  scale: Animated.multiply(
                    seg(0, 480, [0, 0.65, 1], [0.88, 1.015, 1]),
                    exit.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] })
                  ),
                },
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
            {SPARKS.map((spec, i) => (
              <Spark key={i} spec={spec} styles={styles} />
            ))}

            <Pressable onPress={close} hitSlop={10} style={styles.closeBtn} accessibilityLabel="Close">
              <Icon name="close" size={18} color={colors.onGradient} />
            </Pressable>

            <View style={styles.logoStage}>
              <Ripple delay={0} styles={styles} />
              <Ripple delay={1200} styles={styles} />
              <Animated.View
                style={[
                  styles.logoWrap,
                  {
                    opacity: fadeIn(150, 250),
                    transform: [
                      { translateY: float.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -6, 0] }) },
                      { scale: pop(150, 520, 0.3) },
                      { rotate: seg(150, 520, [0, 0.6, 1], ['-25deg', '6deg', '0deg']) },
                    ],
                  },
                ]}
              >
                <BrandLogo size={78} />
              </Animated.View>
            </View>

            <View style={styles.nameRow}>
              {APP_NAME.split('').map((ch, i) => {
                const start = 380 + i * 55;
                return (
                  <Animated.Text
                    key={`${ch}${i}`}
                    style={[
                      styles.nameLetter,
                      i >= 3 && styles.nameLetterAccent,
                      {
                        opacity: fadeIn(start, 150),
                        transform: [
                          { translateY: seg(start, 340, [0, 0.6, 1], [22, -3, 0]) },
                          { scale: pop(start, 340, 0.4) },
                        ],
                      },
                    ]}
                  >
                    {ch}
                  </Animated.Text>
                );
              })}
            </View>
            <Animated.Text style={[styles.tagline, riseIn(780, 10)]}>{BRAND_TAGLINE}</Animated.Text>
          </LinearGradient>

          <View style={styles.body}>
            <Animated.Text style={[styles.greeting, riseIn(840)]}>
              {firstName ? `Welcome, ${firstName}!` : 'Welcome!'}
            </Animated.Text>
            <Animated.Text style={[styles.subtitle, riseIn(900)]}>
              Welcome to Nepal's local marketplace. Here is what you can do:
            </Animated.Text>

            <View style={styles.features}>
              {FEATURES.map((f, i) => {
                const start = 960 + i * 90;
                return (
                  <Animated.View
                    key={f.label}
                    style={[
                      styles.featureRow,
                      {
                        opacity: fadeIn(start, 250),
                        transform: [{ translateX: seg(start, 420, [0, 0.7, 1], [-28, 2, 0]) }],
                      },
                    ]}
                  >
                    <LinearGradient
                      colors={colors.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.featureIcon}
                    >
                      <Icon name={f.icon} size={16} color={colors.onGradient} />
                    </LinearGradient>
                    <Text style={styles.featureText}>{f.label}</Text>
                    <Icon name="checkmark-circle" size={18} color={colors.accentText || colors.primary} />
                  </Animated.View>
                );
              })}
            </View>

            <Animated.View style={{ opacity: fadeIn(1300, 200), transform: [{ scale: pop(1300, 400, 0.85) }] }}>
              <Pressable onPress={close} style={({ pressed }) => [pressed && styles.pressed]}>
                <LinearGradient
                  colors={colors.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>Start Exploring</Text>
                  <Icon name="arrow-forward" size={18} color={colors.onGradient} />
                </LinearGradient>
              </Pressable>
            </Animated.View>
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  hero: {
    alignItems: 'center',
    paddingTop: 30,
    paddingBottom: 24,
  },
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
  spark: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.85)',
  },
  logoStage: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  nameRow: {
    flexDirection: 'row',
    marginTop: 14,
  },
  nameLetter: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.onGradient,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  nameLetterAccent: {
    color: '#A7F3D0',
  },
  tagline: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: 'rgba(255,255,255,0.88)',
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 20,
    paddingBottom: 22,
  },
  greeting: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.textMuted,
    textAlign: 'center',
  },
  features: {
    marginTop: 16,
    marginBottom: 20,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: `${colors.primary}10`,
    borderWidth: 1,
    borderColor: `${colors.primary}22`,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 16,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.onGradient,
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
});
