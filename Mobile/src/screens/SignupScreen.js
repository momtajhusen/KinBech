import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BrandLogo from '../components/BrandLogo';
import { BRAND_TAGLINE } from '../content/brand';
import GradientButton from '../components/GradientButton';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { fullPhone } from '../utils/listing';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    alignItems: 'center',
    paddingBottom: 36,
  },
  brand: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: '800',
    color: colors.onGradient,
  },
  welcome: {
    marginTop: 16,
    fontSize: 26,
    fontWeight: '800',
    color: colors.onGradient,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: 'rgba(255,255,255,0.88)',
  },
  sheet: {
    flex: 1,
    marginTop: -20,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 28,
    gap: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginTop: 6,
  },
  input: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
  legalText: {
    marginTop: 16,
    fontSize: 12,
    lineHeight: 18,
    color: colors.textMuted,
    textAlign: 'center',
  },
  legalLink: {
    color: colors.primary,
    fontWeight: '700',
  },
});

export default function SignupScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const sendOtp = async () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Enter your full name.');
      return;
    }
    const local = phone.replace(/\D/g, '');
    if (local.length !== 10) {
      Alert.alert('Phone required', 'Enter a valid 10-digit Nepal number.');
      return;
    }
    setLoading(true);
    const { data, error } = await api.signup({ name: name.trim(), phone: fullPhone(local) });
    setLoading(false);
    if (error) {
      Alert.alert('Signup failed', error);
      return;
    }
    if (data?.otp) {
      Alert.alert('Verification code', `Your OTP is ${data.otp}`);
    }
    navigation.navigate(ROUTES.OTP, {
      phone: fullPhone(local),
      name: name.trim(),
      mode: 'signup',
    });
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 16 }]}
      >
        <BrandLogo size={78} />
        <Text style={styles.brand}>KinBech</Text>
        <Text style={styles.welcome}>Create Account</Text>
        <Text style={styles.subtitle}>{BRAND_TAGLINE}</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={styles.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Text style={styles.label}>Full Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
        />
        <Text style={styles.label}>Phone Number</Text>
        <TextInput
          value={phone}
          onChangeText={(value) => {
            const digits = value.replace(/\D/g, '').slice(0, 10);
            setPhone(digits);
            if (digits.length === 10) {
              Keyboard.dismiss();
            }
          }}
          keyboardType="phone-pad"
          maxLength={10}
          placeholder="Enter your phone number"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
        />
        <GradientButton
          title={loading ? 'Please wait...' : 'Continue'}
          icon="arrow-forward"
          disabled={loading}
          onPress={sendOtp}
        />
        <Text style={styles.legalText}>
          By signing up you confirm you are 16+ and agree to our{' '}
          <Text style={styles.legalLink} onPress={() => navigation.navigate(ROUTES.TERMS)}>Terms</Text>
          {' '}and{' '}
          <Text style={styles.legalLink} onPress={() => navigation.navigate(ROUTES.PRIVACY_POLICY)}>Privacy Policy</Text>.
          {' '}
          <Text style={styles.legalLink} onPress={() => navigation.navigate(ROUTES.LEGAL_HUB)}>All policies</Text>
        </Text>
      </KeyboardAvoidingView>
    </View>
  );
}
