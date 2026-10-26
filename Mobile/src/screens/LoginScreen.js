import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Text,
  View,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Icon from '../components/Icon';
import Svg, { Path } from 'react-native-svg';
import BrandLogo from '../components/BrandLogo';
import { FormScroll } from '../components/FormScroll';
import { BRAND_TAGLINE } from '../content/brand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearPendingLogin, finishLogin } from '../components/LoginPrompt';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { signInWithGoogle } from '../services/googleAuth';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CURVE_HEIGHT = 45;

const PERKS = [
  { icon: 'location', text: 'Buy and sell with people near you' },
  { icon: 'chatbubbles', text: 'Chat and plan a safe meetup' },
  { icon: 'shield-checkmark', text: 'No password, no OTP to remember' },
];

const createStyles = (colors) => ({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollContent: {
    flexGrow: 1,
  },
  headerWrapper: {
    position: 'relative',
  },
  header: {
    alignItems: 'center',
    paddingTop: 50,
    paddingBottom: CURVE_HEIGHT,
    paddingHorizontal: 24,
  },
  curveSvg: {
    position: 'absolute',
    bottom: -1,
    left: 0,
  },
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
  logoCircle: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.onGradient,
  },
  brandTagline: {
    fontSize: 15,
    color: colors.onGradient,
    opacity: 0.9,
    marginTop: 2,
    marginBottom: 28,
  },
  welcome: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.onGradient,
    textAlign: 'center',
  },
  welcomeSub: {
    fontSize: 16,
    color: colors.onGradient,
    opacity: 0.9,
    marginTop: 6,
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    marginTop: -1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
  },
  perks: {
    gap: 14,
    marginBottom: 32,
  },
  perkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  perkIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  perkText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderRadius: 16,
    paddingVertical: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  googleButtonBusy: {
    opacity: 0.7,
  },
  googleBadge: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  googleText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  errorText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: colors.error,
    textAlign: 'center',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  hintText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  legalText: {
    marginTop: 28,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '700',
  },
});

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { saveSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);
  const insets = useSafeAreaInsets();
  const canClose = navigation.canGoBack();

  // Leaving login without signing in drops the action that asked for it.
  useEffect(() => () => clearPendingLogin(), []);

  const continueWithGoogle = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError('');
    setLoading(true);
    try {
      const account = await signInWithGoogle();
      if (account.cancelled) return;

      const { data, error: apiError } = await api.googleLogin({ idToken: account.idToken });
      if (apiError || !data?.token) {
        setError(apiError || 'Could not sign in. Please try again.');
        return;
      }

      await saveSession(data.token, data.user);
      if (data.isNewUser || !data.user?.profileComplete) {
        navigation.replace(ROUTES.PROFILE_SETUP);
        return;
      }
      finishLogin(navigation);
      if (data.deletionCancelled) {
        Alert.alert('Welcome back', 'Your account deletion was cancelled. Your listings and shop are visible again.');
      }
    } catch (signInError) {
      setError(signInError?.message || 'Could not sign in with Google. Please try again.');
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  };

  if (!colors) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <FormScroll contentContainerStyle={styles.scrollContent} bounces={false}>
        <View style={styles.headerWrapper}>
          {canClose ? (
            <TouchableOpacity
              style={[styles.closeBtn, { top: insets.top + 8 }]}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
              hitSlop={10}
              accessibilityLabel="Close"
            >
              <Icon name="close" size={22} color={colors.onGradient} />
            </TouchableOpacity>
          ) : null}
          <View style={[styles.header, { backgroundColor: colors.primary }]}>
            <View style={styles.logoCircle}>
              <BrandLogo size={112} />
            </View>
            <Text style={styles.brand}>KinBech</Text>
            <Text style={styles.brandTagline}>{BRAND_TAGLINE}</Text>

            <Text style={styles.welcome}>Welcome</Text>
            <Text style={styles.welcomeSub}>Sign in to continue</Text>
          </View>

          {/* Smooth curve cut into the bottom of the header */}
          <Svg
            height={CURVE_HEIGHT}
            width={SCREEN_WIDTH}
            viewBox={`0 0 ${SCREEN_WIDTH} ${CURVE_HEIGHT}`}
            style={styles.curveSvg}
          >
            <Path
              fill={colors.surface}
              d={`M0,0 
                  Q${SCREEN_WIDTH / 2},${CURVE_HEIGHT * 1.6} ${SCREEN_WIDTH},0 
                  L${SCREEN_WIDTH},${CURVE_HEIGHT} 
                  L0,${CURVE_HEIGHT} 
                  Z`}
            />
          </Svg>
        </View>

        <View style={styles.card}>
          <View style={styles.perks}>
            {PERKS.map((perk) => (
              <View key={perk.icon} style={styles.perkRow}>
                <View style={styles.perkIcon}>
                  <Icon name={perk.icon} size={18} color={colors.primary} />
                </View>
                <Text style={styles.perkText}>{perk.text}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.googleButton, loading && styles.googleButtonBusy]}
            activeOpacity={0.8}
            disabled={loading}
            onPress={continueWithGoogle}
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <View style={styles.googleBadge}>
                <Icon name="logo-google" size={22} color={colors.socialGoogle || '#EA4335'} />
              </View>
            )}
            <Text style={styles.googleText}>{loading ? 'Signing in…' : 'Continue with Google'}</Text>
          </TouchableOpacity>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
