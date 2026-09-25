import { useState, useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import LogoutConfirmModal from '../components/LogoutConfirmModal';

const ACCOUNT_ROWS = [
  { label: 'Edit Profile', subtitle: 'Update your personal information', icon: 'person-outline', screen: ROUTES.EDIT_PROFILE },
  { label: 'Privacy & Security', subtitle: 'Manage your privacy settings', icon: 'lock-open-outline', screen: ROUTES.PRIVACY },
  { label: 'Saved Addresses', subtitle: 'Manage your saved locations', icon: 'location-outline', screen: ROUTES.ADDRESSES },
  { label: 'Payment Methods', subtitle: 'Manage your payment options', icon: 'card-outline', screen: ROUTES.PAYMENT_METHODS },
  { label: 'Wallet', subtitle: 'Sales, purchases, and deal history', icon: 'wallet-outline', screen: ROUTES.WALLET },
  { label: 'My Listings', subtitle: 'View and manage your posted items', icon: 'list-outline', screen: ROUTES.MY_LISTINGS },
  { label: 'Seller Preference', subtitle: 'Choose how you want to sell', icon: 'storefront-outline', screen: ROUTES.SELLER_TYPE_SELECTION, params: { fromSettings: true } },
  { label: 'Invite Friends', subtitle: 'Earn 1 day featured listing per friend', icon: 'gift-outline', screen: ROUTES.INVITE_FRIENDS },
  { label: 'Business Verification', subtitle: 'PAN/VAT & documents for verified badge', icon: 'shield-checkmark-outline', screen: ROUTES.SHOP_VERIFICATION },
];

const SUPPORT_ROWS = [
  { label: 'Help Center', subtitle: 'Find answers to common questions', icon: 'help-circle-outline', screen: ROUTES.HELP },
  { label: 'Contact Us', subtitle: 'Get in touch with our support team', icon: 'chatbubble-ellipses-outline', screen: ROUTES.CONTACT_US },
];

const LEGAL_ROWS = [
  { label: 'Legal & Policies', subtitle: 'All Play Store required documents', icon: 'library-outline', screen: ROUTES.LEGAL_HUB },
  { label: 'Privacy Policy', subtitle: 'Data collection & your rights', icon: 'document-text-outline', screen: ROUTES.PRIVACY_POLICY },
  { label: 'Terms & Conditions', subtitle: 'Marketplace rules & liability', icon: 'shield-checkmark-outline', screen: ROUTES.TERMS },
  { label: 'App Permissions', subtitle: 'What we access on your device', icon: 'phone-portrait-outline', screen: ROUTES.LEGAL_DOCUMENT, params: { doc: 'permissions' } },
  { label: 'Account Deletion', subtitle: 'How to delete your data', icon: 'trash-outline', screen: ROUTES.LEGAL_DOCUMENT, params: { doc: 'accountDeletion' } },
];

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 20,
  },
  back: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.onGradient,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: 10,
    marginTop: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.iconBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: colors.textMuted,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  valueText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  logoutIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.dangerBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.danger,
  },
  versionText: {
    marginTop: 20,
    textAlign: 'center',
    fontSize: 13,
    color: colors.textMuted,
  },
});

function Row({ icon, label, subtitle, showBorder, right, onPress }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable style={[styles.row, showBorder && styles.rowBorder]} onPress={onPress}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {right ?? <Ionicons name="chevron-forward" size={20} color={colors.primary} />}
    </Pressable>
  );
}

export default function SettingsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { colors, isDark, setTheme, THEME_OPTIONS } = useTheme();
  const { logout, user } = useAuth();
  const styles = useThemedStyles(createStyles);
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState('English');
  const [currency, setCurrency] = useState('NPR (₨)');
  const [loading, setLoading] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    if (user?.preferences) {
      setNotifications(user.preferences.notifications ?? true);
      setLanguage(user.preferences.language || 'English');
      setCurrency(user.preferences.currency || 'NPR (₨)');
    }
  }, [user]);

  const updatePreferences = async (updates) => {
    setLoading(true);
    try {
      const { error } = await api.updatePreferences(updates);
      if (error) {
        console.error('Failed to update preferences:', error);
      }
    } catch (err) {
      console.error('Error updating preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNotificationChange = (value) => {
    setNotifications(value);
    updatePreferences({ notifications: value });
  };

  const handleLanguageChange = (newLanguage) => {
    setLanguage(newLanguage);
    updatePreferences({ language: newLanguage });
  };

  const handleCurrencyChange = (newCurrency) => {
    setCurrency(newCurrency);
    updatePreferences({ currency: newCurrency });
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={colors.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.onGradient} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.back} />
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          {(ACCOUNT_ROWS || []).map((item, index) => (
            <Row
              key={item.label}
              icon={item.icon}
              label={item.label}
              subtitle={item.subtitle}
              showBorder={index < ACCOUNT_ROWS.length - 1}
              onPress={() => navigation.navigate(item.screen, item.params)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Preferences</Text>
        <View style={styles.card}>
          <Row
            icon="notifications-outline"
            label="Notifications"
            subtitle="Manage your notification preferences"
            showBorder
            right={
              <Switch
                value={notifications}
                onValueChange={handleNotificationChange}
                disabled={loading}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
              />
            }
          />
          <Row
            icon="globe-outline"
            label="Language"
            subtitle="Choose your preferred language"
            showBorder
            right={
              <View style={styles.valueRow}>
                <Text style={styles.valueText}>{language}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </View>
            }
            onPress={() => navigation.navigate(ROUTES.LANGUAGE_SELECT)}
          />
          <Row
            icon="moon-outline"
            label="Dark Mode"
            subtitle="Switch between light and dark theme"
            showBorder
            right={
              <Switch
                value={isDark}
                onValueChange={(value) => setTheme(value ? THEME_OPTIONS.DARK : THEME_OPTIONS.LIGHT)}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
              />
            }
          />
          <Row
            icon="cash-outline"
            label="Currency"
            subtitle="Select your preferred currency"
            right={
              <View style={styles.valueRow}>
                <Text style={styles.valueText}>{currency}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.primary} />
              </View>
            }
            onPress={() => navigation.navigate(ROUTES.CURRENCY_SELECT)}
          />
        </View>

        <Text style={styles.sectionTitle}>Support</Text>
        <View style={styles.card}>
          {(SUPPORT_ROWS || []).map((item, index) => (
            <Row
              key={item.label}
              icon={item.icon}
              label={item.label}
              subtitle={item.subtitle}
              showBorder={index < SUPPORT_ROWS.length - 1}
              onPress={() => navigation.navigate(item.screen, item.params)}
            />
          ))}
        </View>

        <Text style={styles.sectionTitle}>Legal & compliance</Text>
        <View style={styles.card}>
          {(LEGAL_ROWS || []).map((item, index) => (
            <Row
              key={item.label}
              icon={item.icon}
              label={item.label}
              subtitle={item.subtitle}
              showBorder={index < LEGAL_ROWS.length - 1}
              onPress={() => navigation.navigate(item.screen, item.params)}
            />
          ))}
        </View>

        <Pressable
          style={styles.logoutCard}
          onPress={() => setShowLogoutModal(true)}
        >
          <View style={styles.logoutIconCircle}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          </View>
          <View style={styles.rowText}>
            <Text style={styles.logoutLabel}>Log Out</Text>
            <Text style={styles.rowSubtitle}>Sign out from your account</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.danger} />
        </Pressable>

        <Text style={styles.versionText}>Version 1.0.0</Text>
      </ScrollView>

      <LogoutConfirmModal
        visible={showLogoutModal}
        userName={user?.name}
        onCancel={() => setShowLogoutModal(false)}
        onConfirm={async () => {
          setShowLogoutModal(false);
          await logout();
          navigation.reset({ index: 0, routes: [{ name: ROUTES.LOGIN }] });
        }}
      />
    </View>
  );
}
