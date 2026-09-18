import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import GradientButton from '../components/GradientButton';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const PROVIDERS = [
  { key: 'cash', title: 'Cash on meetup', subtitle: 'Pay in person after you inspect the item', icon: 'cash-outline' },
  { key: 'esewa', title: 'eSewa', subtitle: 'Share your eSewa ID with the seller', icon: 'phone-portrait-outline' },
  { key: 'khalti', title: 'Khalti', subtitle: 'Share your Khalti ID with the seller', icon: 'wallet-outline' },
  { key: 'ime', title: 'IME Pay', subtitle: 'Share your IME Pay number', icon: 'card-outline' },
  { key: 'bank', title: 'Bank transfer', subtitle: 'Account number for bank deposits', icon: 'business-outline' },
];

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: colors.white },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: 20, paddingBottom: 40, gap: 14 },
  infoCard: {
    backgroundColor: colors.pastelCyan,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: colors.text, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.pastelIndigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.pastelLime,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  defaultBadgeText: { fontSize: 11, fontWeight: '700', color: colors.statusActive },
  deleteBtn: { padding: 8 },
  emptyWrap: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 10,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 6 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionActive: { borderColor: colors.primary, backgroundColor: colors.pastelIndigo },
  optionTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  optionSub: { fontSize: 12, color: colors.textMuted },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.inputBackground,
  },
});

export default function PaymentMethodsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [provider, setProvider] = useState('cash');
  const [identifier, setIdentifier] = useState('');
  const [alertConfig, setAlertConfig] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.getPaymentMethods();
    setLoading(false);
    setMethods(Array.isArray(data?.paymentMethods) ? data.paymentMethods : []);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const meta = (key) => PROVIDERS.find((p) => p.key === key) || PROVIDERS[0];

  const save = async () => {
    if (provider !== 'cash' && !identifier.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'ID required',
          message: 'Enter your wallet ID or account number so buyers know how to pay you.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    setSaving(true);
    const selected = meta(provider);
    const { data, error } = await api.createPaymentMethod({
      provider,
      label: selected.title,
      identifier: identifier.trim(),
      isDefault: methods.length === 0,
    });
    setSaving(false);
    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not save',
          message: error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    setMethods(data?.paymentMethods || []);
    setSheetOpen(false);
    setIdentifier('');
    setAlertConfig(
      showSuccessAlert({
        title: 'Method added',
        message: 'Share this with the other person during chat or meetup. KinBech does not process the payment.',
        onConfirm: () => setAlertConfig(null),
      })
    );
  };

  const remove = (item) => {
    setAlertConfig({
      type: 'warning',
      title: 'Remove method?',
      message: `${meta(item.provider).title} will be removed from your profile.`,
      primaryButton: {
        text: 'Remove',
        onPress: async () => {
          setAlertConfig(null);
          const { data, error } = await api.deletePaymentMethod(item.id);
          if (error) {
            setAlertConfig(
              showErrorAlert({
                title: 'Could not delete',
                message: error,
                onConfirm: () => setAlertConfig(null),
              })
            );
            return;
          }
          setMethods(data?.paymentMethods || []);
        },
      },
      secondaryButton: { text: 'Cancel', onPress: () => setAlertConfig(null) },
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <ThemeStatusBar variant="header" />
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </Pressable>
        <Text style={styles.headerTitle}>Payment Methods</Text>
        <Pressable
          onPress={() => {
            setProvider('cash');
            setIdentifier('');
            setSheetOpen(true);
          }}
          style={styles.addBtn}
        >
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={20} color={colors.info} />
          <Text style={styles.infoText}>
            KinBech does not hold wallet balance or charge cards. Save how you prefer to pay or get paid, then settle in person or via eSewa / Khalti / bank.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : methods.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="card-outline" size={42} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No methods saved</Text>
            <Text style={styles.emptyBody}>
              Add cash on meetup, eSewa, Khalti, IME Pay, or a bank account so deals move faster.
            </Text>
            <GradientButton title="Add payment method" icon="add" onPress={() => setSheetOpen(true)} />
          </View>
        ) : (
          methods.map((item) => {
            const info = meta(item.provider);
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.iconCircle}>
                  <Ionicons name={info.icon} size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{item.label || info.title}</Text>
                  <Text style={styles.subtitle}>
                    {item.identifier ? item.identifier : info.subtitle}
                  </Text>
                  {item.isDefault ? (
                    <View style={styles.defaultBadge}>
                      <Text style={styles.defaultBadgeText}>Preferred</Text>
                    </View>
                  ) : null}
                </View>
                <Pressable onPress={() => remove(item)} style={styles.deleteBtn} hitSlop={8}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </Pressable>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.sheetTitle}>Add payment method</Text>
            {PROVIDERS.map((item) => (
              <Pressable
                key={item.key}
                style={[styles.option, provider === item.key && styles.optionActive]}
                onPress={() => setProvider(item.key)}
              >
                <Ionicons name={item.icon} size={20} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.optionTitle}>{item.title}</Text>
                  <Text style={styles.optionSub}>{item.subtitle}</Text>
                </View>
                <Ionicons
                  name={provider === item.key ? 'radio-button-on' : 'radio-button-off'}
                  size={20}
                  color={colors.primary}
                />
              </Pressable>
            ))}
            {provider !== 'cash' ? (
              <TextInput
                value={identifier}
                onChangeText={setIdentifier}
                placeholder={provider === 'bank' ? 'Account number' : 'Wallet ID / mobile number'}
                placeholderTextColor={colors.textTertiary}
                style={styles.input}
                keyboardType="default"
              />
            ) : null}
            <GradientButton
              title={saving ? 'Saving…' : 'Save method'}
              icon="checkmark"
              disabled={saving}
              onPress={save}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <AlertModal
        visible={!!alertConfig}
        onClose={() => setAlertConfig(null)}
        {...(alertConfig || {})}
      />
    </SafeAreaView>
  );
}
