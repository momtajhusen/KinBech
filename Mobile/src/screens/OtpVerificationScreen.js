import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from '../components/GradientButton';
import { AlertModal, showErrorAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

function maskPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 10) return raw;
  const last10 = digits.slice(-10);
  const cc = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)}` : '+977';
  return `${cc} ${last10.slice(0, 5)} ${last10.slice(5, 6)}****`;
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    paddingBottom: 36,
    paddingHorizontal: 16,
  },
  back: {
    width: 36,
    height: 36,
    justifyContent: 'center',
  },
  sheet: {
    flex: 1,
    marginTop: -22,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  iconWrap: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  ringOuter: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  ringInner: {
    position: 'absolute',
    width: 138,
    height: 138,
    borderRadius: 69,
    borderWidth: 1,
    borderColor: colors.border,
  },
  spark: {
    position: 'absolute',
  },
  sparkGlyph: {
    fontSize: 14,
    color: colors.primary,
    opacity: 0.4,
  },
  sparkDotOrange: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.secondary,
  },
  sparkDotPurple: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  shield: {
    width: 92,
    height: 92,
    borderRadius: 46,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    color: colors.textMuted,
  },
  phone: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '800',
    color: colors.primary,
  },
  otpWrap: {
    marginTop: 28,
    alignSelf: 'stretch',
  },
  otpRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  otpBorder: {
    borderRadius: 16,
    padding: 2,
  },
  otpBox: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpChar: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  otpCaret: {
    width: 2,
    height: 22,
    backgroundColor: colors.primary,
  },
  hiddenInput: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.02,
    color: 'transparent',
  },
  resendMuted: {
    marginTop: 24,
    fontSize: 14,
    color: colors.textMuted,
  },
  resend: {
    marginTop: 6,
    fontSize: 15,
    color: colors.textMuted,
  },
  resendLink: {
    color: colors.primary,
    fontWeight: '700',
  },
  verify: {
    alignSelf: 'stretch',
    marginTop: 'auto',
    marginBottom: 8,
  },
  secure: {
    marginBottom: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  secureBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureText: {
    fontSize: 13,
    color: colors.textMuted,
  },
});

export default function OtpVerificationScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const inputRef = useRef(null);
  const [otp, setOtp] = useState('');
  const [seconds, setSeconds] = useState(45);
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const { saveSession } = useAuth();
  const rawPhone = route?.params?.phone || '';
  const mode = route?.params?.mode || 'login';
  const name = route?.params?.name || '';
  const phone = maskPhone(rawPhone);

  const requestOtp = async () => {
    const payload = { phone: rawPhone, name };
    const result =
      mode === 'signup' ? await api.signup(payload) : await api.login(payload);
    if (result.error) {
      setAlertConfig(showErrorAlert({
        title: 'Unable to Resend',
        message: result.error,
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    if (result.data?.otp) {
      setAlertConfig({
        type: 'info',
        title: 'Verification Code',
        message: `Your code is ${result.data.otp}`,
        primaryButton: { text: 'OK', onPress: () => setAlertConfig(null) },
      });
    }
    setSeconds(45);
  };

  const verify = async () => {
    if (otp.length !== 4) {
      setAlertConfig(showErrorAlert({
        title: 'Incomplete Code',
        message: 'Please enter the complete 4-digit verification code.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    setLoading(true);
    const { data, error } = await api.verifyOtp({ phone: rawPhone, otp, name });
    setLoading(false);
    if (error) {
      setAlertConfig(showErrorAlert({
        title: 'Verification Failed',
        message: error,
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    
    if (data.isNewUser || !data.user?.profileComplete) {
      await saveSession(data.token, data.user);
      navigation.replace(ROUTES.PROFILE_SETUP);
    } else {
      await saveSession(data.token, data.user);
      navigation.replace(ROUTES.MAIN_TABS);
    }
  };

  useEffect(() => {
    if (seconds <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 4 }]}
      >
        <Pressable onPress={() => navigation.goBack()} style={styles.back} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.onGradient} />
        </Pressable>
      </LinearGradient>

      <View style={styles.sheet}>
        <View style={styles.iconWrap}>
          <View style={styles.ringOuter} />
          <View style={styles.ringInner} />

          <View style={[styles.spark, { top: 10, left: 30 }]}>
            <Text style={styles.sparkGlyph}>✦</Text>
          </View>
          <View style={[styles.spark, { top: 62, right: 6 }]}>
            <View style={styles.sparkDotOrange} />
          </View>
          <View style={[styles.spark, { bottom: 40, left: 4 }]}>
            <View style={styles.sparkDotPurple} />
          </View>
          <View style={[styles.spark, { top: 96, right: 44 }]}>
            <Text style={[styles.sparkGlyph, { fontSize: 10, opacity: 0.5 }]}>✦</Text>
          </View>

          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.shield}
          >
            <Ionicons name="checkmark" size={30} color={colors.onGradient} />
          </LinearGradient>
        </View>

        <Text style={styles.title}>Verify Your Number</Text>
        <Text style={styles.body}>Enter the 4-digit code sent to</Text>
        <Text style={styles.phone}>{phone}</Text>

        <Pressable onPress={() => inputRef.current?.focus()} style={styles.otpWrap}>
          <View style={styles.otpRow} pointerEvents="none">
            {Array.from({ length: 4 }).map((_, index) => {
              const active = index === otp.length;
              const char = otp[index] || '';
              return (
                <LinearGradient
                  key={index}
                  colors={active ? colors.gradient : [colors.border, colors.border]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.otpBorder}
                >
                  <View style={styles.otpBox}>
                    {active && !char ? (
                      <View style={styles.otpCaret} />
                    ) : (
                      <Text style={styles.otpChar}>{char}</Text>
                    )}
                  </View>
                </LinearGradient>
              );
            })}
          </View>
          <TextInput
            ref={inputRef}
            value={otp}
            onChangeText={(value) => {
              const next = value.replace(/\D/g, '').slice(0, 4);
              setOtp(next);
              if (next.length === 4) {
                Keyboard.dismiss();
              }
            }}
            keyboardType="number-pad"
            maxLength={4}
            autoFocus
            caretHidden
            style={styles.hiddenInput}
          />
        </Pressable>

        <Text style={styles.resendMuted}>Didn't receive the code?</Text>
        {seconds > 0 ? (
          <Text style={styles.resend}>
            <Text style={styles.resendLink}>Resend Code</Text>
            <Text> in {mm}:{ss}</Text>
          </Text>
        ) : (
          <Pressable onPress={requestOtp}>
            <Text style={styles.resendLink}>Resend Code</Text>
          </Pressable>
        )}

        <GradientButton
          title={loading ? 'Verifying...' : 'Verify'}
          style={styles.verify}
          disabled={loading}
          onPress={verify}
        />

        <View style={styles.secure}>
          <View style={styles.secureBadge}>
            <Ionicons name="lock-closed" size={12} color={colors.primary} />
          </View>
          <Text style={styles.secureText}>Your information is secure with us</Text>
        </View>
      </View>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </View>
  );
}
