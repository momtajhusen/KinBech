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

const LABELS = ['Home', 'Work', 'Meetup', 'Other'];

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
  card: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.pastelIndigo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  cardBody: { fontSize: 13, color: colors.textMuted, lineHeight: 18, flex: 1 },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: colors.pastelLime,
  },
  defaultBadgeText: { fontSize: 11, fontWeight: '700', color: colors.statusActive },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  actionDanger: { backgroundColor: colors.pastelRed, borderColor: 'transparent' },
  actionText: { fontSize: 13, fontWeight: '700', color: colors.text },
  emptyWrap: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
  tip: { fontSize: 12, color: colors.textMuted, lineHeight: 18, paddingHorizontal: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 4 },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.iconBackground,
  },
  chipActive: { backgroundColor: colors.pastelIndigo, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: colors.text },
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
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  defaultLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
});

export default function SavedAddressesScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [label, setLabel] = useState('Home');
  const [line1, setLine1] = useState('');
  const [city, setCity] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await api.getAddresses();
    setLoading(false);
    if (error) {
      setAddresses([]);
      return;
    }
    setAddresses(Array.isArray(data?.addresses) ? data.addresses : []);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openNew = () => {
    setEditingId(null);
    setLabel('Home');
    setLine1('');
    setCity('');
    setIsDefault(addresses.length === 0);
    setSheetOpen(true);
  };

  const openEdit = (item) => {
    setEditingId(item.id);
    setLabel(item.label || 'Home');
    setLine1(item.line1 || '');
    setCity(item.city || '');
    setIsDefault(Boolean(item.isDefault));
    setSheetOpen(true);
  };

  const save = async () => {
    if (!line1.trim()) {
      setAlertConfig(
        showErrorAlert({
          title: 'Address required',
          message: 'Add a street, landmark, or area name.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    setSaving(true);
    const payload = { label, line1: line1.trim(), city: city.trim(), isDefault };
    const { data, error } = editingId
      ? await api.updateAddress(editingId, payload)
      : await api.createAddress(payload);
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
    setAddresses(data?.addresses || []);
    setSheetOpen(false);
    setAlertConfig(
      showSuccessAlert({
        title: editingId ? 'Address updated' : 'Address saved',
        message: 'This location is ready for meetups and listings.',
        onConfirm: () => setAlertConfig(null),
      })
    );
  };

  const remove = (item) => {
    setAlertConfig({
      type: 'warning',
      title: 'Remove address?',
      message: `${item.label} will be deleted from your saved locations.`,
      primaryButton: {
        text: 'Remove',
        onPress: async () => {
          setAlertConfig(null);
          const { data, error } = await api.deleteAddress(item.id);
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
          setAddresses(data?.addresses || []);
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
        <Text style={styles.headerTitle}>Saved Addresses</Text>
        <Pressable onPress={openNew} style={styles.addBtn} hitSlop={8}>
          <Ionicons name="add" size={22} color={colors.white} />
        </Pressable>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : addresses.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="location-outline" size={42} color={colors.textTertiary} />
            <Text style={styles.emptyTitle}>No saved addresses</Text>
            <Text style={styles.emptyBody}>
              Save home, work, or a public meetup spot so you can reuse it when posting or confirming a deal.
            </Text>
            <GradientButton title="Add address" icon="add" onPress={openNew} />
          </View>
        ) : (
          addresses.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.iconCircle}>
                  <Ionicons name="location" size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{item.label}</Text>
                  <Text style={styles.cardBody}>
                    {[item.line1, item.city].filter(Boolean).join(', ')}
                  </Text>
                </View>
                {item.isDefault ? (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.actions}>
                <Pressable style={styles.actionBtn} onPress={() => openEdit(item)}>
                  <Text style={styles.actionText}>Edit</Text>
                </Pressable>
                {!item.isDefault ? (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => api.updateAddress(item.id, { isDefault: true }).then(({ data }) => {
                      if (data?.addresses) setAddresses(data.addresses);
                    })}
                  >
                    <Text style={styles.actionText}>Set default</Text>
                  </Pressable>
                ) : null}
                <Pressable style={[styles.actionBtn, styles.actionDanger]} onPress={() => remove(item)}>
                  <Text style={[styles.actionText, { color: colors.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
        <Text style={styles.tip}>
          KinBech is a meetup marketplace. Use public places for exchanges and keep exact home details private until you trust the other person.
        </Text>
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={{ flex: 1 }} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
            <Text style={styles.sheetTitle}>{editingId ? 'Edit address' : 'New address'}</Text>
            <Text style={styles.label}>Label</Text>
            <View style={styles.chips}>
              {LABELS.map((item) => (
                <Pressable
                  key={item}
                  style={[styles.chip, label === item && styles.chipActive]}
                  onPress={() => setLabel(item)}
                >
                  <Text style={styles.chipText}>{item}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Address</Text>
            <TextInput
              value={line1}
              onChangeText={setLine1}
              placeholder="Street, landmark, or area"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />
            <Text style={styles.label}>City</Text>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="Kathmandu, Pokhara…"
              placeholderTextColor={colors.textTertiary}
              style={styles.input}
            />
            <Pressable style={styles.defaultRow} onPress={() => setIsDefault((v) => !v)}>
              <Text style={styles.defaultLabel}>Use as default location</Text>
              <Ionicons
                name={isDefault ? 'checkbox' : 'square-outline'}
                size={22}
                color={isDefault ? colors.primary : colors.textMuted}
              />
            </Pressable>
            <GradientButton
              title={saving ? 'Saving…' : 'Save address'}
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
