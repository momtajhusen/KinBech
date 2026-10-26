import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import ScreenLoader from '../components/ScreenLoader';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useKeyboardOverlap } from '../components/FormScroll';
import { useFocusEffect } from '@react-navigation/native';
import GradientButton from '../components/GradientButton';
import HeroHeader, { HeroAction, HeroStat } from '../components/HeroHeader';
import { EditField } from '../components/ProfileEditKit';
import { PressableScale, Reanimated, enterUp } from '../components/Motion';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const PROVIDERS = [
  { key: 'cash', title: 'Cash on meetup', subtitle: 'Pay in person after checking the item', icon: 'cash', tint: '#16A34A', dark: '#14532D' },
  { key: 'esewa', title: 'eSewa', subtitle: 'Share your eSewa ID', mark: 'e', tint: '#60BB46', dark: '#2F6B1F' },
  { key: 'khalti', title: 'Khalti', subtitle: 'Share your Khalti ID', mark: 'K', tint: '#5C2D91', dark: '#2E1450' },
  { key: 'ime', title: 'IME Pay', subtitle: 'Share your IME Pay number', mark: 'IME', tint: '#E11D48', dark: '#7F1D1D' },
  { key: 'bank', title: 'Bank transfer', subtitle: 'Account number for deposits', icon: 'business', tint: '#2563EB', dark: '#1E3A8A' },
];

const STEPS = [
  { icon: 'chatbubbles', text: 'Agree on the price in chat' },
  { icon: 'share-social', text: 'Share your saved method' },
  { icon: 'checkmark-done', text: 'Pay or get paid at meetup' },
];

function providerMeta(key) {
  return PROVIDERS.find((p) => p.key === key) || PROVIDERS[0];
}

function ProviderMark({ meta, size = 44, styles }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: meta.tint }]}>
      {meta.icon ? (
        <Icon name={meta.icon} size={size * 0.48} color="#FFFFFF" />
      ) : (
        <Text style={[styles.markText, { fontSize: meta.mark.length > 1 ? size * 0.28 : size * 0.46 }]}>{meta.mark}</Text>
      )}
    </View>
  );
}

export default function PaymentMethodsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const keyboardOverlap = useKeyboardOverlap();
  const [methods, setMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [provider, setProvider] = useState('cash');
  const [identifier, setIdentifier] = useState('');
  const [makePreferred, setMakePreferred] = useState(false);
  const [copiedId, setCopiedId] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);
  const copyTimer = useRef(null);

  useEffect(() => () => clearTimeout(copyTimer.current), []);

  const closeAlert = () => setAlertConfig(null);
  const fail = (title, message) => setAlertConfig(showErrorAlert({ title, message, onConfirm: closeAlert }));

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

  const openNew = () => {
    setEditing(null);
    setProvider(methods.some((m) => m.provider === 'cash') ? 'esewa' : 'cash');
    setIdentifier('');
    setMakePreferred(methods.length === 0);
    setSheetOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setProvider(item.provider);
    setIdentifier(item.identifier || '');
    setMakePreferred(Boolean(item.isDefault));
    setSheetOpen(true);
  };

  const save = async () => {
    const id = identifier.trim();
    if (provider !== 'cash' && !id) {
      fail('ID required', 'Enter your wallet ID or account number so the other person knows how to pay you.');
      return;
    }
    if (!editing && methods.some((m) => m.provider === provider && (m.identifier || '') === id)) {
      fail('Already saved', `This ${providerMeta(provider).title} method is already on your list.`);
      return;
    }
    setSaving(true);
    const { data, error } = editing
      ? await api.updatePaymentMethod(editing.id, { identifier: id, isDefault: makePreferred || undefined })
      : await api.createPaymentMethod({
        provider,
        label: providerMeta(provider).title,
        identifier: id,
        isDefault: makePreferred,
      });
    setSaving(false);
    if (error) {
      fail('Could not save', error);
      return;
    }
    setMethods(data?.paymentMethods || []);
    setSheetOpen(false);
    setAlertConfig(
      showSuccessAlert({
        title: editing ? 'Method updated' : 'Method added',
        message: 'Share it with the other person in chat or at the meetup. KinBech does not process the payment.',
        onConfirm: closeAlert,
      })
    );
  };

  const setPreferred = async (item) => {
    const { data, error } = await api.updatePaymentMethod(item.id, { isDefault: true });
    if (error) {
      fail('Could not update', error);
      return;
    }
    setMethods(data?.paymentMethods || []);
  };

  const copy = async (item) => {
    if (!item.identifier) return;
    await Clipboard.setStringAsync(item.identifier);
    setCopiedId(item.id);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopiedId(null), 1600);
  };

  const remove = (item) => {
    setAlertConfig({
      type: 'warning',
      title: 'Remove method?',
      message: `${providerMeta(item.provider).title} will be removed from your profile.`,
      primaryButton: {
        text: 'Remove',
        onPress: async () => {
          closeAlert();
          const { data, error } = await api.deletePaymentMethod(item.id);
          if (error) {
            fail('Could not delete', error);
            return;
          }
          setMethods(data?.paymentMethods || []);
        },
      },
      secondaryButton: { text: 'Cancel', onPress: closeAlert },
    });
  };

  const preferred = methods.find((m) => m.isDefault) || null;
  const others = methods.filter((m) => m !== preferred);

  const renderPreferred = () => {
    const meta = providerMeta(preferred.provider);
    return (
      <Reanimated.View entering={enterUp(0)}>
        <LinearGradient colors={[meta.tint, meta.dark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.heroCard}>
          <View style={styles.heroGlow} pointerEvents="none" />
          <View style={styles.heroTop}>
            <View style={styles.heroChip}>
              <Icon name="checkmark-circle" size={12} color="#FFFFFF" />
              <Text style={styles.heroChipText}>Preferred</Text>
            </View>
            <View style={styles.heroMarkWrap}>
              {meta.icon ? (
                <Icon name={meta.icon} size={22} color="#FFFFFF" />
              ) : (
                <Text style={styles.heroMark}>{meta.mark}</Text>
              )}
            </View>
          </View>
          <Text style={styles.heroName}>{preferred.label || meta.title}</Text>
          <Text style={styles.heroId} numberOfLines={1}>
            {preferred.identifier || meta.subtitle}
          </Text>
          <View style={styles.heroActions}>
            {preferred.identifier ? (
              <Pressable style={styles.heroBtn} onPress={() => copy(preferred)}>
                <Icon name={copiedId === preferred.id ? 'checkmark' : 'copy-outline'} size={14} color="#FFFFFF" />
                <Text style={styles.heroBtnText}>{copiedId === preferred.id ? 'Copied' : 'Copy'}</Text>
              </Pressable>
            ) : null}
            {preferred.provider !== 'cash' ? (
              <Pressable style={styles.heroBtn} onPress={() => openEdit(preferred)}>
                <Icon name="create-outline" size={14} color="#FFFFFF" />
                <Text style={styles.heroBtnText}>Edit</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.heroBtn} onPress={() => remove(preferred)} accessibilityLabel="Remove method">
              <Icon name="trash-outline" size={14} color="#FFFFFF" />
            </Pressable>
          </View>
        </LinearGradient>
      </Reanimated.View>
    );
  };

  const renderRow = (item, index) => {
    const meta = providerMeta(item.provider);
    return (
      <Reanimated.View key={item.id} entering={enterUp(index + 1)} style={styles.card}>
        <ProviderMark meta={meta} styles={styles} />
        <View style={styles.flex1}>
          <Text style={styles.title}>{item.label || meta.title}</Text>
          <Text style={styles.subtitle} numberOfLines={1}>{item.identifier || meta.subtitle}</Text>
          <View style={styles.rowActions}>
            <Pressable style={styles.chipBtn} onPress={() => setPreferred(item)}>
              <Icon name="star-outline" size={12} color={colors.warning} />
              <Text style={styles.chipBtnText}>Make preferred</Text>
            </Pressable>
            {item.identifier ? (
              <Pressable style={styles.chipBtn} onPress={() => copy(item)}>
                <Icon name={copiedId === item.id ? 'checkmark' : 'copy-outline'} size={12} color={colors.info} />
                <Text style={styles.chipBtnText}>{copiedId === item.id ? 'Copied' : 'Copy'}</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        <View style={styles.sideActions}>
          {item.provider !== 'cash' ? (
            <Pressable onPress={() => openEdit(item)} style={styles.iconBtn} hitSlop={6} accessibilityLabel="Edit method">
              <Icon name="create-outline" size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable onPress={() => remove(item)} style={[styles.iconBtn, styles.iconBtnDanger]} hitSlop={6} accessibilityLabel="Remove method">
            <Icon name="trash-outline" size={16} color={colors.danger} />
          </Pressable>
        </View>
      </Reanimated.View>
    );
  };

  const activeMeta = providerMeta(provider);

  return (
    <SafeAreaView style={styles.root} edges={['left', 'right']}>
      <ThemeStatusBar variant="header" />
      <HeroHeader
        icon="wallet"
        title="Payment Methods"
        subtitle="How you like to pay or get paid at meetups"
        onBack={() => navigation.goBack()}
        right={<HeroAction icon="add" label="Add payment method" onPress={openNew} />}
      >
        <View style={styles.statRow}>
          <HeroStat icon="layers-outline" value={methods.length} label="Saved" />
          <HeroStat icon="star-outline" value={preferred ? providerMeta(preferred.provider).title.split(' ')[0] : '—'} label="Preferred" />
          <HeroStat icon="pricetag-outline" value="0%" label="KinBech fee" />
        </View>
      </HeroHeader>

      <ScrollView
        style={styles.flex1}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 56 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {loading && methods.length === 0 ? null : methods.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyMarks}>
              {PROVIDERS.slice(0, 4).map((meta, i) => (
                <View key={meta.key} style={[styles.emptyMarkSlot, { marginLeft: i ? -12 : 0, zIndex: 4 - i }]}>
                  <ProviderMark meta={meta} size={48} styles={styles} />
                </View>
              ))}
            </View>
            <Text style={styles.emptyTitle}>No payment methods yet</Text>
            <Text style={styles.emptyBody}>
              Add cash, eSewa, Khalti, IME Pay or a bank account so deals move faster after you agree in chat.
            </Text>
            <PressableScale style={styles.emptyCtaWrap} onPress={openNew}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.emptyCta}>
                <View style={styles.emptyCtaIcon}>
                  <Icon name="add" size={18} color={colors.onPrimary} />
                </View>
                <Text style={styles.emptyCtaText}>Add payment method</Text>
              </LinearGradient>
            </PressableScale>
          </View>
        ) : (
          <>
            {preferred ? renderPreferred() : null}
            {others.length ? <Text style={styles.sectionLabel}>Other methods</Text> : null}
            {others.map(renderRow)}
            <PressableScale contentStyle={styles.addRow} onPress={openNew}>
              <View style={styles.addRowIcon}>
                <Icon name="add" size={18} color={colors.primary} />
              </View>
              <Text style={styles.addRowText}>Add another method</Text>
              <Icon name="chevron-forward" size={16} color={colors.textMuted} />
            </PressableScale>
          </>
        )}

        <View style={styles.howCard}>
          <Text style={styles.howTitle}>How payment works on KinBech</Text>
          <View style={styles.steps}>
            {STEPS.map((step, i) => (
              <View key={step.icon} style={styles.step}>
                <View style={styles.stepIcon}>
                  <Icon name={step.icon} size={18} color={colors.primary} />
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
              </View>
            ))}
          </View>
          <View style={styles.noteRow}>
            <Icon name="shield-checkmark" size={15} color={colors.success} />
            <Text style={styles.noteText}>
              KinBech never holds your money or charges a fee. Never send money before you see the item.
            </Text>
          </View>
        </View>
      </ScrollView>

      <Modal visible={sheetOpen} transparent animationType="slide" onRequestClose={() => setSheetOpen(false)}>
        <View style={styles.modalBackdrop}>
          <Pressable style={styles.flex1} onPress={() => setSheetOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 + keyboardOverlap }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHead}>
              <ProviderMark meta={activeMeta} size={42} styles={styles} />
              <View style={styles.flex1}>
                <Text style={styles.sheetTitle}>{editing ? `Edit ${activeMeta.title}` : 'Add payment method'}</Text>
                <Text style={styles.sheetSub}>{activeMeta.subtitle}</Text>
              </View>
              <Pressable onPress={() => setSheetOpen(false)} hitSlop={10} style={styles.sheetClose}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {!editing ? (
              <View style={styles.providerGrid}>
                {PROVIDERS.map((item) => {
                  const active = provider === item.key;
                  return (
                    <Pressable
                      key={item.key}
                      style={[styles.providerOption, active && { borderColor: item.tint, backgroundColor: `${item.tint}14` }]}
                      onPress={() => setProvider(item.key)}
                    >
                      <ProviderMark meta={item} size={34} styles={styles} />
                      <Text style={[styles.providerText, active && { color: colors.text }]} numberOfLines={1}>
                        {item.key === 'cash' ? 'Cash' : item.key === 'bank' ? 'Bank' : item.title}
                      </Text>
                      {active ? (
                        <View style={[styles.providerCheck, { backgroundColor: item.tint }]}>
                          <Icon name="checkmark" size={10} color="#FFFFFF" />
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {provider !== 'cash' ? (
              <EditField
                label={provider === 'bank' ? 'Account number' : 'Wallet ID / mobile number'}
                icon={provider === 'bank' ? 'card-outline' : 'phone-portrait-outline'}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder={provider === 'bank' ? 'Bank name and account number' : '98XXXXXXXX'}
                keyboardType={provider === 'bank' ? 'default' : 'phone-pad'}
                autoCapitalize="none"
                hint="Only people you share it with in chat will see this."
              />
            ) : (
              <View style={styles.cashNote}>
                <Icon name="information-circle-outline" size={16} color={colors.success} />
                <Text style={styles.cashNoteText}>Nothing to fill in. Buyers will know you accept cash at the meetup.</Text>
              </View>
            )}

            {!(editing && editing.isDefault) ? (
              <View style={styles.defaultRow}>
                <View style={styles.defaultIcon}>
                  <Icon name="star" size={15} color={colors.warning} />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.defaultLabel}>Make this preferred</Text>
                  <Text style={styles.defaultHint}>Shown first when you share how to pay</Text>
                </View>
                <Switch
                  value={makePreferred}
                  onValueChange={setMakePreferred}
                  trackColor={{ false: colors.border, true: colors.primary }}
                  thumbColor={colors.white}
                />
              </View>
            ) : null}

            <GradientButton
              title={saving ? 'Saving…' : editing ? 'Save changes' : 'Save method'}
              icon="checkmark"
              disabled={saving}
              onPress={save}
            />
          </View>
        </View>
      </Modal>

      <AlertModal visible={!!alertConfig} onClose={closeAlert} {...(alertConfig || {})} />
      {loading && methods.length === 0 ? <ScreenLoader overlay label="Loading payments" /> : null}
    </SafeAreaView>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  statRow: { flexDirection: 'row', gap: 8 },
  content: { padding: 16, gap: 12 },
  sectionLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  mark: { alignItems: 'center', justifyContent: 'center' },
  markText: { color: '#FFFFFF', fontWeight: '900', letterSpacing: -0.5 },
  heroCard: {
    borderRadius: 22,
    padding: 18,
    minHeight: 168,
    overflow: 'hidden',
  },
  heroGlow: {
    position: 'absolute',
    top: -70,
    right: -50,
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroChipText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  heroMarkWrap: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroMark: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
  heroName: { marginTop: 18, fontSize: 20, fontWeight: '900', color: '#FFFFFF' },
  heroId: { marginTop: 4, fontSize: 15, fontWeight: '700', letterSpacing: 1, color: 'rgba(255,255,255,0.88)' },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  heroBtnText: { fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { fontSize: 15, fontWeight: '800', color: colors.text },
  subtitle: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  rowActions: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  chipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9,
    backgroundColor: colors.iconBackground,
  },
  chipBtnText: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
  sideActions: { gap: 8 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  iconBtnDanger: { backgroundColor: colors.deleteBg },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
  addRowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
  },
  addRowText: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.text },
  emptyWrap: { alignItems: 'center', paddingTop: 24, paddingBottom: 6, gap: 10 },
  emptyMarks: { flexDirection: 'row', marginBottom: 6 },
  emptyMarkSlot: { borderRadius: 18, borderWidth: 3, borderColor: colors.background },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  emptyBody: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
  emptyCtaWrap: { alignSelf: 'stretch', marginTop: 6, marginHorizontal: 24 },
  emptyCta: {
    height: 52,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  emptyCtaIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  emptyCtaText: { color: colors.onPrimary, fontSize: 16, fontWeight: '800' },
  howCard: {
    marginTop: 4,
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 14,
  },
  howTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  steps: { flexDirection: 'row', gap: 8 },
  step: { flex: 1, alignItems: 'center', gap: 8 },
  stepIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
  },
  stepNum: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  stepNumText: { fontSize: 9.5, fontWeight: '900', color: colors.white },
  stepText: { fontSize: 11.5, lineHeight: 15, fontWeight: '600', color: colors.textSecondary, textAlign: 'center' },
  noteRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.pastelLime,
  },
  noteText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  modalBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 14,
  },
  sheetHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sheetSub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  sheetClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  providerGrid: { flexDirection: 'row', gap: 7 },
  providerOption: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  providerText: { fontSize: 11, fontWeight: '800', color: colors.textSecondary },
  providerCheck: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cashNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.pastelLime,
  },
  cashNoteText: { flex: 1, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  defaultIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelOrange,
  },
  defaultLabel: { fontSize: 14, fontWeight: '800', color: colors.text },
  defaultHint: { fontSize: 11.5, color: colors.textMuted, marginTop: 1 },
});
