import { useEffect, useRef } from 'react';
import { StackActions } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Easing, Text, View } from 'react-native';
import BrandLogo from '../components/BrandLogo';
import { BRAND_TAGLINE } from '../content/brand';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { isAdminUser } from '../utils/admin';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

export default function SplashScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { ready, isLoggedIn, onboarded, user } = useAuth();
  const logoScale = useRef(new Animated.Value(0.72)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(logoScale, {
        toValue: 1,
        tension: 90,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(fade, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();

    const twinkle = Animated.loop(
      Animated.sequence([
        Animated.timing(spark, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(spark, {
          toValue: 0.28,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    twinkle.start();
    return () => twinkle.stop();
  }, [fade, logoScale, spark]);

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

    const timer = setTimeout(() => {
      if (isLoggedIn) {
        if (isAdminUser(user)) {
          leaveSplash('AdminTabs');
          return;
        }
        if (!user?.profileComplete) {
          leaveSplash(ROUTES.PROFILE_SETUP);
          return;
        }
        leaveSplash(ROUTES.MAIN_TABS);
        return;
      }
      leaveSplash(onboarded ? ROUTES.MAIN_TABS : ROUTES.ONBOARDING);
    }, 1400);

    return () => clearTimeout(timer);
  }, [ready, isLoggedIn, onboarded, user, navigation, route.key]);

  return (
    <LinearGradient
      colors={colors.gradientSplash || ['#050512', '#13103A', '#5B39C6']}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.container}
    >
      <ThemeStatusBar variant="header" />
      <Animated.Text style={[styles.spark, { top: '16%', left: '16%', opacity: spark }]}>✦</Animated.Text>
      <Animated.Text style={[styles.spark, { top: '20%', right: '14%', fontSize: 10, opacity: spark }]}>✦</Animated.Text>
      <Animated.Text style={[styles.spark, { top: '38%', left: '10%', fontSize: 8, opacity: spark }]}>○</Animated.Text>
      <Animated.Text style={[styles.spark, { top: '42%', right: '12%', fontSize: 8, opacity: spark }]}>○</Animated.Text>
      <Animated.Text style={[styles.spark, { bottom: '28%', left: '22%', fontSize: 12, opacity: spark }]}>✦</Animated.Text>
      <Animated.Text style={[styles.spark, { bottom: '22%', right: '18%', fontSize: 9, opacity: spark }]}>✦</Animated.Text>

      <Animated.View style={[styles.center, { opacity: fade, transform: [{ scale: logoScale }] }]}>
        <BrandLogo size={132} />
        <Text style={styles.logo}>KinBech</Text>
        <Text style={styles.tagline}>{BRAND_TAGLINE}</Text>
      </Animated.View>
    </LinearGradient>
  );
}

const createStyles = (colors) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
  },
  logo: {
    marginTop: 22,
    fontSize: 36,
    fontWeight: '800',
    color: colors.onGradient,
    textShadowColor: 'rgba(0,0,0,0.18)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  tagline: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '500',
    color: colors.onGradient,
    opacity: 0.95,
  },
  spark: {
    position: 'absolute',
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
  },
});
