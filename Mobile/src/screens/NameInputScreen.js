import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormScroll } from '../components/FormScroll';
import BrandLogo from '../components/BrandLogo';
import GradientButton from '../components/GradientButton';
import { AlertModal, showErrorAlert } from '../components/AlertModal';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
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
  },
  sheetInner: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
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
});

export default function NameInputScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { saveSession } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const phone = route?.params?.phone || '';

  const completeSignup = async () => {
    if (!name.trim()) {
      setAlertConfig(showErrorAlert({
        title: 'Name Required',
        message: 'Please enter your name to continue.',
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    setLoading(true);
    const { data, error } = await api.completeSignup({ phone, name: name.trim() });
    setLoading(false);
    if (error) {
      setAlertConfig(showErrorAlert({
        title: 'Signup Failed',
        message: error,
        onConfirm: () => setAlertConfig(null),
      }));
      return;
    }
    await saveSession(data.token, data.user);
    navigation.replace(ROUTES.SELLER_TYPE_SELECTION);
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
        <Text style={styles.welcome}>Welcome!</Text>
        <Text style={styles.subtitle}>Tell us your name to get started</Text>
      </LinearGradient>

      <FormScroll style={styles.sheet} contentContainerStyle={styles.sheetInner}>
        <Text style={styles.label}>Your Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Enter your name"
          placeholderTextColor={colors.textTertiary}
          style={styles.input}
          autoFocus
        />
        <GradientButton
          title={loading ? 'Please wait...' : 'Continue'}
          icon="arrow-forward"
          disabled={loading}
          onPress={completeSignup}
        />
      </FormScroll>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </View>
  );
}
