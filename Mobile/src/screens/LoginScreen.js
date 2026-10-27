import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from '../components/Icon';
import BrandLogo from '../components/BrandLogo';
import GoogleButton from '../components/GoogleButton';
import { FormScroll } from '../components/FormScroll';
import { Reanimated, enterUp } from '../components/Motion';
import { BRAND_TAGLINE } from '../content/brand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearPendingLogin, finishLogin } from '../components/LoginPrompt';
import { useGoogleLogin } from '../hooks/useGoogleLogin';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const PERKS = [
  { icon: 'location', title: 'Deals near you', text: 'Buy and sell with people in your area' },
  { icon: 'chatbubbles', title: 'Chat and meet safely', text: 'Talk, call and plan a meetup in the app' },
];

const SPARKS = [
  { top: 18, left: 28, size: 14, delay: 0 },
  { top: 52, right: 34, size: 11, delay: 350 },
  { top: 132, left: 20, size: 9, delay: 700 },
  { top: 150, right: 26, size: 13, delay: 200 },
  { top: 214, left: 56, size: 8, delay: 500 },
  { top: 206, right: 62, size: 10, delay: 850 },
];

/** Native 0→1 loop on the UI thread. */
function useLoop(duration, delay = 0, easing = Easing.inOut(Easing.sin)) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.loop(Animated.timing(value, { toValue: 1, duration, easing, useNativeDriver: true })),
    ]);
    anim.start();
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, delay]);
  return value;
}

function Ripple({ delay, styles }) {
  const t = useLoop(2600, delay, Easing.out(Easing.quad));
  return (
    <Animated.View
      style={[
        styles.ripple,
        {
          opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.75, 2] }) }],
        },
      ]}
    />
  );
}

function Spark({ spec, styles }) {
  const t = useLoop(1900, spec.delay);
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

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  scrollContent: { flexGrow: 1 },
  hero: {
    alignItems: 'center',
    paddingBottom: 56,
    paddingHorizontal: 24,
    overflow: 'hidden',
  },
  glowA: {
    position: 'absolute',
    top: -80,
    right: -70,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  glowB: {
    position: 'absolute',
    bottom: -40,
    left: -90,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  spark: { position: 'absolute', color: 'rgba(255,255,255,0.85)' },
  closeBtn: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    zIndex: 2,
  },
  logoStage: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  ripple: {
    position: 'absolute',
    width: 116,
    height: 116,
    borderRadius: 58,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  logoWrap: {
    width: 116,
    height: 116,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  brand: {
    marginTop: 10,
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 0.5,
    color: colors.onGradient,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  brandAccent: { color: '#A7F3D0' },
  brandTagline: {
    marginTop: 4,
    fontSize: 14.5,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: 'rgba(255,255,255,0.9)',
  },
  trustRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  trustPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  trustText: { fontSize: 11.5, fontWeight: '700', color: colors.onGradient },
  sheet: {
    flex: 1,
    marginTop: -32,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: colors.background,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 18,
  },
  welcome: { fontSize: 28, fontWeight: '800', color: colors.text, textAlign: 'center' },
  welcomeSub: { marginTop: 4, fontSize: 15, color: colors.textMuted, textAlign: 'center' },
  perks: { gap: 10, marginTop: 22, marginBottom: 24 },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 18,
    backgroundColor: `${colors.primary}0D`,
    borderWidth: 1,
    borderColor: `${colors.primary}22`,
  },
  perkIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  perkCopy: { flex: 1 },
  perkTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  perkText: { marginTop: 1, fontSize: 12.5, color: colors.textMuted },
  googleShadow: {
    borderRadius: 28,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.pastelRed,
  },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.error },
  hintRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14 },
  hintText: { fontSize: 13, color: colors.textMuted },
  legalText: {
    marginTop: 22,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  legalLink: { color: colors.primary, fontWeight: '700' },
});

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { signIn, loading, error } = useGoogleLogin();
  const insets = useSafeAreaInsets();
  const canClose = navigation.canGoBack();
  const float = useLoop(3200);

  // Leaving login without signing in drops the action that asked for it.
  useEffect(() => () => clearPendingLogin(), []);

  const continueWithGoogle = async () => {
    const result = await signIn();
    if (result.status !== 'ok') return;
    if (result.needsProfile) {
      navigation.replace(ROUTES.PROFILE_SETUP);
      return;
    }
    finishLogin(navigation);
  };

  if (!colors) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <FormScroll contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]} bounces={false}>
        <LinearGradient
          colors={colors.gradientSplash || colors.gradient}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 36 }]}
        >
          <View style={styles.glowA} />
          <View style={styles.glowB} />
          {SPARKS.map((spec, i) => (
            <Spark key={i} spec={spec} styles={styles} />
          ))}
          {canClose ? (
            <Pressable
              style={[styles.closeBtn, { top: insets.top + 8 }]}
              onPress={() => navigation.goBack()}
              hitSlop={10}
              accessibilityLabel="Close"
            >
              <Icon name="close" size={22} color={colors.onGradient} />
            </Pressable>
          ) : null}

          <View style={styles.logoStage}>
            <Ripple delay={0} styles={styles} />
            <Ripple delay={1300} styles={styles} />
            <Animated.View
              style={[
                styles.logoWrap,
                { transform: [{ translateY: float.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -8, 0] }) }] },
              ]}
            >
              <BrandLogo size={92} />
            </Animated.View>
          </View>
          <Reanimated.Text entering={enterUp(0)} style={styles.brand}>
            Kin<Text style={styles.brandAccent}>Bech</Text>
          </Reanimated.Text>
          <Reanimated.Text entering={enterUp(1)} style={styles.brandTagline}>{BRAND_TAGLINE}</Reanimated.Text>
          <Reanimated.View entering={enterUp(2)} style={styles.trustRow}>
            {[
              { icon: 'flash', label: 'One-tap sign in' },
              { icon: 'pricetag', label: 'Free to sell' },
            ].map((pill) => (
              <View key={pill.label} style={styles.trustPill}>
                <Icon name={pill.icon} size={12} color={colors.onGradient} />
                <Text style={styles.trustText}>{pill.label}</Text>
              </View>
            ))}
          </Reanimated.View>
        </LinearGradient>

        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Reanimated.Text entering={enterUp(2)} style={styles.welcome}>Welcome back</Reanimated.Text>
          <Reanimated.Text entering={enterUp(3)} style={styles.welcomeSub}>Sign in to continue</Reanimated.Text>

          <View style={styles.perks}>
            {PERKS.map((perk, index) => (
              <Reanimated.View key={perk.icon} entering={enterUp(4 + index)} style={styles.perkRow}>
                <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.perkIcon}>
                  <Icon name={perk.icon} size={19} color={colors.onGradient} />
                </LinearGradient>
                <View style={styles.perkCopy}>
                  <Text style={styles.perkTitle}>{perk.title}</Text>
                  <Text style={styles.perkText}>{perk.text}</Text>
                </View>
                <Icon name="checkmark-circle" size={18} color={colors.primary} />
              </Reanimated.View>
            ))}
          </View>

          <Reanimated.View entering={enterUp(6)} style={styles.googleShadow}>
            <GoogleButton onPress={continueWithGoogle} loading={loading} />
          </Reanimated.View>

          {error ? (
            <View style={styles.errorBox}>
              <Icon name="alert-circle" size={16} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.hintRow}>
            <Icon name="lock-closed" size={14} color={colors.textMuted} />
            <Text style={styles.hintText}>Pick your Google account to sign in or sign up</Text>
          </View>

          <Text style={styles.legalText}>
            By continuing you agree to our{' '}
            <Text style={styles.legalLink} onPress={() => navigation.navigate(ROUTES.TERMS)}>
              Terms & Conditions
            </Text>
            ,{' '}
            <Text style={styles.legalLink} onPress={() => navigation.navigate(ROUTES.PRIVACY_POLICY)}>
              Privacy Policy
            </Text>
            , and{' '}
            <Text style={styles.legalLink} onPress={() => navigation.navigate(ROUTES.LEGAL_DOCUMENT, { doc: 'permissions' })}>
              App Permissions
            </Text>
            .
          </Text>
        </View>
      </FormScroll>
    </View>
  );
}
