import { useState } from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  Dimensions,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import BrandLogo from '../components/BrandLogo';
import { BRAND_TAGLINE } from '../content/brand';
import { AlertModal, showErrorAlert } from '../components/AlertModal';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { fullPhone } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CURVE_HEIGHT = 45;

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
    paddingBottom: CURVE_HEIGHT + 0,
    paddingHorizontal: 24,
  },
  curveSvg: {
    position: 'absolute',
    bottom: -1,
    left: 0,
  },
  logoCircle: {
    width: 112,
    height: 112,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: colors.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
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
    paddingTop: 32,
    paddingBottom: 32,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 10,
  },
  phoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  countryPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: colors.inputBackground,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  flag: {
    fontSize: 18,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  phoneInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 16,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  hintText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  continueButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    paddingVertical: 18,
    marginTop: 28,
  },
  continueText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onGradient,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 32,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    fontSize: 13,
    color: colors.textMuted,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    marginTop: 28,
  },
  socialItem: {
    alignItems: 'center',
    gap: 8,
  },
  socialCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  socialLabel: {
    fontSize: 13,
    color: colors.text,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 15,
    color: colors.text,
  },
  footerLink: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.primary,
  },
  legalText: {
    marginTop: 24,
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
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const sendOtp = async () => {
    const local = phone.replace(/\D/g, '');
    if (local.length !== 10) {
      setAlertConfig(showErrorAlert({
        title: 'Invalid Phone Number',
        message: 'Please enter a valid 10-digit Nepal phone number.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    setLoading(true);
    const { data, error } = await api.login({ phone: fullPhone(local) });
    setLoading(false);
    if (error) {
      setAlertConfig(showErrorAlert({
        title: 'Unable to Send Code',
        message: error,
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    if (data?.otp) {
      setAlertConfig({
        type: 'info',
        title: 'Verification Code',
        message: `Your code is ${data.otp}`,
        primaryButton: { text: 'OK', onPress: () => {
          setAlertConfig(null);
          navigation.navigate(ROUTES.OTP, {
            phone: fullPhone(local),
            mode: 'login',
          });
        }},
      });
    } else {
      navigation.navigate(ROUTES.OTP, {
        phone: fullPhone(local),
        mode: 'login',
      });
    }
  };

  // Guard against undefined colors
  if (!colors) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ThemeStatusBar variant="header" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Header with solid color */}
          <View style={styles.headerWrapper}>
            <View style={[styles.header, { backgroundColor: colors.primary }]}>
              <View style={styles.logoCircle}>
                <BrandLogo size={112} />
              </View>
              <Text style={styles.brand}>KinBech</Text>
              <Text style={styles.brandTagline}>{BRAND_TAGLINE}</Text>

              <Text style={styles.welcome}>Welcome Back</Text>
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

          {/* Form card */}
          <View style={styles.card}>
            <Text style={styles.label}>Phone Number</Text>

            <View style={styles.phoneRow}>
              <TouchableOpacity style={styles.countryPicker} activeOpacity={0.7}>
                <Text style={styles.flag}>🇳🇵</Text>
                <Text style={styles.countryCode}>+977</Text>
                <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
              </TouchableOpacity>

              <TextInput
                style={styles.phoneInput}
                placeholder="Enter your phone number"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
                value={phone}
                onChangeText={(value) => {
                  const digits = value.replace(/\D/g, '').slice(0, 10);
                  setPhone(digits);
                  if (digits.length === 10) {
                    Keyboard.dismiss();
                  }
                }}
                maxLength={10}
              />
            </View>

            <View style={styles.hintRow}>
              <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
              <Text style={styles.hintText}>We'll send you a verification code</Text>
            </View>

            <TouchableOpacity activeOpacity={0.85} disabled={loading} onPress={sendOtp}>
              <LinearGradient
                colors={colors.gradient || ['#5B39C6', '#7860ED']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.continueButton}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Text style={styles.continueText}>Continue</Text>
                    <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            <View style={styles.socialRow}>
              <View style={styles.socialItem}>
                <TouchableOpacity style={styles.socialCircle} activeOpacity={0.7}>
                  <Ionicons name="logo-google" size={26} color={colors.socialGoogle} />
                </TouchableOpacity>
                <Text style={styles.socialLabel}>Google</Text>
              </View>

              <View style={styles.socialItem}>
                <TouchableOpacity style={styles.socialCircle} activeOpacity={0.7}>
                  <Ionicons name="logo-apple" size={28} color={colors.socialApple} />
                </TouchableOpacity>
                <Text style={styles.socialLabel}>Apple</Text>
              </View>

              <View style={styles.socialItem}>
                <TouchableOpacity style={styles.socialCircle} activeOpacity={0.7}>
                  <Ionicons name="logo-facebook" size={26} color={colors.socialFacebook} />
                </TouchableOpacity>
                <Text style={styles.socialLabel}>Facebook</Text>
              </View>
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
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </View>
  );
}