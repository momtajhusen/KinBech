import { memo, useEffect } from 'react';
import { StackActions } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import BrandLogo from '../components/BrandLogo';
import { BRAND_TAGLINE } from '../content/brand';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { isAdminUser } from '../utils/admin';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

// Must match plugins/withLaunchGradient.js (the native window drawn before JS loads).
const LAUNCH_GRADIENT = ['#0B0F17', '#1F2937', '#047857'];
const VERTICAL = { start: { x: 0.5, y: 0 }, end: { x: 0.5, y: 1 } };

const LOGO_SIZE = 116;
const STAGE_SIZE = LOGO_SIZE + 44;
const GLOW_SIZE = 330;
const TITLE = 'KinBech';
const STAY_MS = 1500;
const EXIT_MS = 320;
const RINGS = [0, 1, 2];
const PARTICLES = [
  { left: '12%', top: '72%', size: 4, delay: 0, duration: 3400 },
  { left: '26%', top: '84%', size: 3, delay: 900, duration: 3000 },
  { left: '40%', top: '78%', size: 5, delay: 400, duration: 3800 },
  { left: '58%', top: '88%', size: 3, delay: 1300, duration: 3200 },
  { left: '70%', top: '74%', size: 4, delay: 200, duration: 3600 },
  { left: '84%', top: '82%', size: 3, delay: 700, duration: 3100 },
  { left: '18%', top: '40%', size: 3, delay: 1100, duration: 3300 },
  { left: '80%', top: '36%', size: 4, delay: 500, duration: 3500 },
];
const STARS = [
  { left: '16%', top: '17%', size: 14, delay: 0 },
  { left: '82%', top: '22%', size: 10, delay: 500 },
  { left: '10%', top: '58%', size: 9, delay: 900 },
  { left: '86%', top: '62%', size: 12, delay: 300 },
];

const loop = (duration, delay = 0, reverse = true) =>
  withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }), -1, reverse));

function Glow() {
  const enter = useSharedValue(0);
  const breathe = useSharedValue(0);

  useEffect(() => {
    enter.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) });
    breathe.value = loop(1800, 700);
  }, [enter, breathe]);

  const style = useAnimatedStyle(() => ({
    opacity: enter.value * (0.85 + breathe.value * 0.15),
    transform: [{ scale: (0.55 + enter.value * 0.45) * (1 + breathe.value * 0.07) }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.glow, style]}>
      <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
        <Defs>
          <RadialGradient id="splashGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#6EE7B7" stopOpacity="0.42" />
            <Stop offset="0.45" stopColor="#10B981" stopOpacity="0.16" />
            <Stop offset="1" stopColor="#10B981" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#splashGlow)" />
      </Svg>
    </Animated.View>
  );
}

/** "Nearby" ripple that keeps spreading out from the logo. */
function Ring({ index }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      380 + index * 650,
      withRepeat(withTiming(1, { duration: 1950, easing: Easing.out(Easing.quad) }), -1, false)
    );
  }, [t, index]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.12, 1], [0, 0.55, 0]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.85, 2.3]) }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.ring, style]} />;
}

function Logo() {
  const enter = useSharedValue(0);
  const float = useSharedValue(0);
  const shine = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 11, stiffness: 120, mass: 0.9 });
    float.value = loop(1700, 750);
    shine.value = withDelay(620, withTiming(1, { duration: 780, easing: Easing.inOut(Easing.cubic) }));
  }, [enter, float, shine]);

  const wrapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0, 0.45], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: -6 * float.value },
      { scale: interpolate(enter.value, [0, 1], [0.35, 1]) },
      { rotate: `${(1 - enter.value) * -16}deg` },
    ],
  }));

  const shineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shine.value, [0, 0.15, 0.85, 1], [0, 1, 1, 0]),
    transform: [{ translateX: interpolate(shine.value, [0, 1], [-LOGO_SIZE * 1.1, LOGO_SIZE * 1.1]) }, { rotate: '20deg' }],
  }));

  return (
    <Animated.View style={[styles.logoWrap, wrapStyle]}>
      <BrandLogo size={LOGO_SIZE} />
      <Animated.View pointerEvents="none" style={[styles.shine, shineStyle]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </Animated.View>
  );
}

function Letter({ char, index, textStyle }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(420 + index * 55, withSpring(1, { damping: 13, stiffness: 170 }));
  }, [p, index]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 0.6], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: (1 - p.value) * 22 }, { scale: interpolate(p.value, [0, 1], [0.7, 1]) }],
  }));

  return <Animated.Text style={[textStyle, style]}>{char}</Animated.Text>;
}

function Tagline({ textStyle }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(880, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
  }, [p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value * 0.95,
    transform: [{ translateY: (1 - p.value) * 10 }],
  }));

  return <Animated.Text style={[textStyle, style]}>{BRAND_TAGLINE}</Animated.Text>;
}

function Particle({ left, top, size, delay, duration }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
  }, [t, delay, duration]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.2, 0.75, 1], [0, 0.75, 0.5, 0]),
    transform: [{ translateY: -170 * t.value }, { translateX: Math.sin(t.value * Math.PI * 2) * 8 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.particle, { left, top, width: size, height: size, borderRadius: size / 2 }, style]}
    />
  );
}

function Star({ left, top, size, delay }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = loop(1100, delay);
  }, [t, delay]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.2 + t.value * 0.65,
    transform: [{ scale: 0.75 + t.value * 0.35 }, { rotate: `${t.value * 45}deg` }],
  }));

  return <Animated.Text style={[styles.star, { left, top, fontSize: size }, style]}>✦</Animated.Text>;
}

function Progress() {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(250, withTiming(1, { duration: STAY_MS, easing: Easing.inOut(Easing.cubic) }));
  }, [p]);

  const trackStyle = useAnimatedStyle(() => ({ opacity: interpolate(p.value, [0, 0.1], [0, 1], Extrapolation.CLAMP) }));
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: p.value }] }));

  return (
    <Animated.View style={[styles.track, trackStyle]}>
      <Animated.View style={[styles.fill, fillStyle]} />
    </Animated.View>
  );
}

/**
 * All animated parts live here, memoized, so auth updates re-rendering the screen
 * never snap settled Reanimated styles back to their first frame.
 */
const SplashArt = memo(function SplashArt({ exit, themeGradient, titleStyle, taglineStyle }) {
  const overlay = useSharedValue(0);

  useEffect(() => {
    overlay.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.quad) });
  }, [overlay]);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: overlay.value }));
  const contentStyle = useAnimatedStyle(() => ({
    opacity: 1 - exit.value,
    transform: [{ scale: 1 + exit.value * 0.12 }],
  }));

  return (
    <>
      <LinearGradient colors={LAUNCH_GRADIENT} {...VERTICAL} style={StyleSheet.absoluteFill} />
      {themeGradient.join() !== LAUNCH_GRADIENT.join() ? (
        <Animated.View style={[StyleSheet.absoluteFill, overlayStyle]}>
          <LinearGradient colors={themeGradient} {...VERTICAL} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}

      <Animated.View style={[StyleSheet.absoluteFill, contentStyle]}>
        {PARTICLES.map((it, i) => (
          <Particle key={`p${i}`} {...it} />
        ))}
        {STARS.map((it, i) => (
          <Star key={`s${i}`} {...it} />
        ))}

        <View style={styles.center}>
          <View style={styles.stage}>
            <Glow />
            {RINGS.map((i) => (
              <Ring key={i} index={i} />
            ))}
            <Logo />
          </View>
          <View style={styles.titleRow}>
            {TITLE.split('').map((char, i) => (
              <Letter key={i} char={char} index={i} textStyle={titleStyle} />
            ))}
          </View>
          <Tagline textStyle={taglineStyle} />
        </View>

        <View style={styles.bottom}>
          <Progress />
        </View>
      </Animated.View>
    </>
  );
});

export default function SplashScreen({ navigation, route }) {
  const { colors } = useTheme();
  const themed = useThemedStyles(createStyles);
  const themeGradient = colors.gradientSplash || LAUNCH_GRADIENT;
  const { ready, isLoggedIn, onboarded, user } = useAuth();
  const exit = useSharedValue(0);

  useEffect(() => {
    if (!ready) {
      return undefined;
    }

    // A call answered from the lock screen or banner opens on top of Splash, and a plain
    // replace() swaps the focused route, which would close that call. Replace only Splash.
    const leaveSplash = (name) => {
      navigation.dispatch({
        ...StackActions.replace(name),
        source: route.key,
        target: navigation.getState().key,
      });
    };

    const nextRoute = () => {
      if (isLoggedIn) {
        if (isAdminUser(user)) return 'AdminTabs';
        if (!user?.profileComplete) return ROUTES.PROFILE_SETUP;
        return ROUTES.MAIN_TABS;
      }
      return onboarded ? ROUTES.MAIN_TABS : ROUTES.ONBOARDING;
    };

    const timer = setTimeout(() => {
      const name = nextRoute();
      exit.value = withTiming(1, { duration: EXIT_MS, easing: Easing.in(Easing.cubic) }, () => {
        scheduleOnRN(leaveSplash, name);
      });
    }, STAY_MS);

    return () => clearTimeout(timer);
  }, [ready, isLoggedIn, onboarded, user, navigation, route.key, exit]);

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <SplashArt exit={exit} themeGradient={themeGradient} titleStyle={themed.title} taglineStyle={themed.tagline} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LAUNCH_GRADIENT[0],
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stage: {
    width: STAGE_SIZE,
    height: STAGE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    top: (STAGE_SIZE - GLOW_SIZE) / 2,
    left: (STAGE_SIZE - GLOW_SIZE) / 2,
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
  ring: {
    position: 'absolute',
    top: (STAGE_SIZE - LOGO_SIZE) / 2,
    left: (STAGE_SIZE - LOGO_SIZE) / 2,
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE * 0.32,
    borderWidth: 1.5,
    borderColor: 'rgba(167,243,208,0.75)',
  },
  logoWrap: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE * 0.22,
    overflow: 'hidden',
    backgroundColor: '#047857',
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  shine: {
    position: 'absolute',
    top: -LOGO_SIZE * 0.3,
    left: LOGO_SIZE * 0.25,
    width: LOGO_SIZE * 0.5,
    height: LOGO_SIZE * 1.6,
  },
  titleRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  particle: {
    position: 'absolute',
    backgroundColor: 'rgba(209,250,229,0.9)',
  },
  star: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.7)',
  },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 72,
    alignItems: 'center',
  },
  track: {
    width: 120,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  fill: {
    width: '100%',
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#A7F3D0',
    transformOrigin: 'left',
  },
});

const createStyles = (colors) => ({
  title: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.onGradient,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 10,
  },
  tagline: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 1.2,
    color: colors.onGradient,
  },
});
