import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import HeroHeader from '../components/HeroHeader';
import { PressableScale, Reanimated, enterUp } from '../components/Motion';
import { AlertModal, showErrorAlert, showWarningAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { ROUTES } from '../navigation/helpers';
import { api } from '../services/api';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const OPTIONS = [
  {
    key: 'individual',
    icon: 'person',
    tint: '#10B981',
    title: 'Individual',
    tagline: 'Sell your own new or used items',
    perks: [
      { icon: 'flash-outline', text: 'Post an item in about 30 seconds' },
      { icon: 'chatbubbles-outline', text: 'Chat and meet buyers nearby' },
      { icon: 'shield-checkmark-outline', text: 'No business details needed' },
    ],
  },
  {
    key: 'shop',
    icon: 'storefront',
    tint: '#3B82F6',
    title: 'Shop',
    tagline: 'Sell products from your business',
    perks: [
      { icon: 'storefront-outline', text: 'Your own store page and QR code' },
      { icon: 'analytics-outline', text: 'Visitor and sales stats' },
      { icon: 'ribbon-outline', text: 'Verified badge with PAN/VAT' },
    ],
  },
];

const MODE_TITLE = { individual: 'Individual', shop: 'Shop' };
const kindsFor = (mode) => [mode === 'shop' ? 'store' : 'personal'];
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isAre = (n) => (n === 1 ? 'is' : 'are');
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
const formatTime = (value) =>
  value ? new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';

/** Mirrors the backend switch rules so the screen can explain a change before it is saved. */
function switchPlan(status, from, to) {
  const leaving = kindsFor(from).filter((kind) => !kindsFor(to).includes(kind));
  const entering = kindsFor(to).filter((kind) => !kindsFor(from).includes(kind));
  const effects = [];
  let blocker = null;
  let needsStore = false;

  for (const kind of leaving) {
    const counts = status.listings?.[kind] || {};
    const label = kind === 'store' ? 'store' : 'personal';
    if (!blocker && counts.scheduledDeals) {
      blocker = `You have ${plural(counts.scheduledDeals, 'meetup')} scheduled for ${label} items. Finish or cancel ${counts.scheduledDeals === 1 ? 'it' : 'them'} first, so no buyer is left waiting.`;
    } else if (!blocker && counts.pending) {
      blocker = `${plural(counts.pending, `${label} listing`)} ${isAre(counts.pending)} still under review. Try again once the review is done.`;
    }
    if (kind === 'store') {
      effects.push(`Your store page is hidden from buyers${counts.active ? ` and ${plural(counts.active, 'store listing')} ${isAre(counts.active)} paused` : ''}.`);
    } else if (counts.active) {
      effects.push(`${plural(counts.active, 'personal listing')} ${isAre(counts.active)} paused and hidden from buyers.`);
    }
  }

  for (const kind of entering) {
    const counts = status.listings?.[kind] || {};
    if (kind === 'store') {
      if (status.store?.unavailable) {
        blocker = blocker || 'Your store is not active right now. Contact KinBech support to reopen it.';
      } else if (!status.store?.exists) {
        needsStore = true;
      } else if (status.store?.paused) {
        effects.push(`Your store page comes back${counts.paused ? ` with ${plural(counts.paused, 'paused listing')}` : ''}.`);
      }
    } else if (counts.paused) {
      effects.push(`${plural(counts.paused, 'paused personal listing')} come${counts.paused === 1 ? 's' : ''} back live.`);
    }
  }

  if (leaving.length) effects.push('Nothing is deleted. Paused items come back when you switch again.');
  return { blocker, needsStore, effects };
}

export default function SellerTypeSelectionScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession } = useAuth();
  const fromSettings = Boolean(route?.params?.fromSettings);
  const current = ['shop', 'both'].includes(user?.sellerTypePreference) ? 'shop' : 'individual';
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);
  const [status, setStatus] = useState(null);
  const [statusFailed, setStatusFailed] = useState(false);

  const closeAlert = () => setAlertConfig(null);

  const loadStatus = useCallback(async () => {
    setStatusFailed(false);
    const { data, error } = await api.getSellerMode();
    if (error || !data) {
      setStatusFailed(true);
      return;
    }
    setStatus(data);
  }, []);

  useEffect(() => {
    if (fromSettings) loadStatus();
  }, [fromSettings, loadStatus]);

  const unchanged = fromSettings && selected === current;
  const isUndo = Boolean(status?.undoTarget) && status.undoTarget === selected;
  const cooldownBlocked = fromSettings && !unchanged && Boolean(status) && !status.canChange && !isUndo;
  const plan = fromSettings && status && !unchanged ? switchPlan(status, current, selected) : null;
  const ctaLocked = fromSettings && !unchanged && (!status || cooldownBlocked || Boolean(plan?.blocker));

  const openStoreSetup = () =>
    navigation.navigate(ROUTES.STORE_CATEGORY_SELECTION, { fromSettings, preference: selected });

  const savePreference = async (preference) => {
    const { data, error } = await api.updateMe({ sellerTypePreference: preference });
    if (error) {
      if (data?.code === 'store_required') {
        openStoreSetup();
        return false;
      }
      setAlertConfig(showErrorAlert({ title: 'Could not switch', message: data?.message || error, onConfirm: closeAlert }));
      if (fromSettings) loadStatus();
      return false;
    }
    if (data?.token) await saveSession(data.token, data.user);
    return true;
  };

  const applySwitch = async () => {
    closeAlert();
    setSaving(true);
    try {
      if (await savePreference(selected)) navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  const confirmSwitch = () => {
    const rule = isUndo
      ? `Switching back is free this once. Your next change opens on ${formatDate(status.nextChangeAt)}.`
      : `After this you can change again in ${status.cooldownDays} days. Changed your mind? You can switch back once within ${status.undoHours} hours.`;
    const alert = showWarningAlert({
      title: `Switch to ${MODE_TITLE[selected]}?`,
      message: [...plan.effects, rule].join('\n\n'),
      onConfirm: applySwitch,
      onCancel: closeAlert,
    });
    setAlertConfig({ ...alert, primaryButton: { ...alert.primaryButton, text: 'Switch' } });
  };

  const handleContinue = async () => {
    if (saving) return;
    if (fromSettings && selected === current) {
      navigation.goBack();
      return;
    }
    if (fromSettings) {
      if (ctaLocked) return;
      if (plan.needsStore) openStoreSetup();
      else confirmSwitch();
      return;
    }
    setSaving(true);
    try {
      if (selected === 'individual') {
        if (!(await savePreference('individual'))) return;
        if (fromSettings) navigation.goBack();
        else navigation.replace(ROUTES.PROFILE_SETUP);
        return;
      }
      const { data } = await api.getMyShop();
      if (data?.shop) {
        if (await savePreference(selected)) navigation.goBack();
        return;
      }
      navigation.navigate(ROUTES.STORE_CATEGORY_SELECTION, { fromSettings, preference: selected });
    } finally {
      setSaving(false);
    }
  };

  const selectedMeta = OPTIONS.find((o) => o.key === selected) || OPTIONS[0];
  const ctaLabel = unchanged
    ? 'Done'
    : cooldownBlocked
      ? `Locked until ${formatDate(status.nextChangeAt)}`
      : fromSettings
        ? `${isUndo ? 'Switch back to' : 'Save as'} ${selectedMeta.title}`
        : `Continue as ${selectedMeta.title}`;
  const ctaIcon = unchanged ? 'checkmark' : ctaLocked && status ? 'lock-closed' : 'arrow-forward';

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <HeroHeader
        icon="storefront"
        title={fromSettings ? 'Seller Preference' : 'How do you want to sell?'}
        subtitle={fromSettings ? 'Choose how you sell on KinBech. You can change it once a month.' : 'Pick the option that fits you. You can change it later.'}
        onBack={() => navigation.goBack()}
      />

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        {OPTIONS.map((option, index) => {
          const active = selected === option.key;
          const isCurrent = fromSettings && current === option.key;
          return (
            <PressableScale
              key={option.key}
              entering={enterUp(index)}
              scaleTo={0.98}
              contentStyle={[styles.option, active && { borderColor: option.tint, backgroundColor: `${option.tint}10` }]}
              onPress={() => setSelected(option.key)}
            >
              <View style={styles.optionTop}>
                <View style={[styles.optionIcon, { backgroundColor: active ? option.tint : `${option.tint}1F` }]}>
                  <Icon name={option.icon} size={24} color={active ? '#FFFFFF' : option.tint} />
                </View>
                <View style={styles.flex1}>
                  <View style={styles.optionTitleRow}>
                    <Text style={styles.optionTitle}>{option.title}</Text>
                    {isCurrent ? (
                      <View style={styles.currentBadge}>
                        <Text style={styles.currentBadgeText}>Current</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.optionTagline}>{option.tagline}</Text>
                </View>
                <View style={[styles.radio, active && { borderColor: option.tint }]}>
                  {active ? <View style={[styles.radioDot, { backgroundColor: option.tint }]} /> : null}
                </View>
              </View>
              {active ? (
                <View style={styles.perks}>
                  {option.perks.map((perk) => (
                    <View key={perk.text} style={styles.perk}>
                      <View style={[styles.perkIcon, { backgroundColor: `${option.tint}1F` }]}>
                        <Icon name={perk.icon} size={14} color={option.tint} />
                      </View>
                      <Text style={styles.perkText}>{perk.text}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </PressableScale>
          );
        })}

        {fromSettings ? (
          !status ? (
            statusFailed ? (
              <Pressable style={[styles.note, styles.noteWarn]} onPress={loadStatus}>
                <Icon name="refresh" size={16} color={colors.danger} />
                <Text style={styles.noteText}>Could not check your listings. Tap to try again.</Text>
              </Pressable>
            ) : (
              <View style={styles.note}>
                <ActivityIndicator size="small" color={colors.info} />
                <Text style={styles.noteText}>Checking your store and listings…</Text>
              </View>
            )
          ) : (
            <>
              <View style={[styles.note, !status.canChange && styles.noteLock]}>
                <Icon
                  name={status.canChange ? 'time-outline' : 'lock-closed-outline'}
                  size={16}
                  color={status.canChange ? colors.info : colors.warning}
                />
                <Text style={styles.noteText}>
                  {status.canChange
                    ? `You can change how you sell once every ${status.cooldownDays} days, with one free switch back within ${status.undoHours} hours.`
                    : `You changed this recently. Next change on ${formatDate(status.nextChangeAt)}.${
                      status.undoTarget
                        ? ` You can still switch back to ${MODE_TITLE[status.undoTarget]} until ${formatTime(status.undoUntil)}.`
                        : ''
                    }`}
                </Text>
              </View>
              {plan && !cooldownBlocked ? (
                plan.blocker ? (
                  <View style={[styles.note, styles.noteWarn]}>
                    <Icon name="alert-circle-outline" size={16} color={colors.danger} />
                    <Text style={styles.noteText}>{plan.blocker}</Text>
                  </View>
                ) : plan.needsStore ? (
                  <View style={styles.note}>
                    <Icon name="storefront-outline" size={16} color={colors.info} />
                    <Text style={styles.noteText}>No store yet? We will help you set one up next. Your mode switches once the store is saved.</Text>
                  </View>
                ) : plan.effects.length ? (
                  <View style={styles.effects}>
                    <Text style={styles.effectsTitle}>What changes</Text>
                    {plan.effects.map((line) => (
                      <View key={line} style={styles.effectRow}>
                        <View style={styles.effectDot} />
                        <Text style={styles.noteText}>{line}</Text>
                      </View>
                    ))}
                  </View>
                ) : null
              ) : null}
            </>
          )
        ) : selected !== 'individual' ? (
          <View style={styles.note}>
            <Icon name="information-circle-outline" size={16} color={colors.info} />
            <Text style={styles.noteText}>No store yet? We will help you set one up next. It takes about a minute.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable
          onPress={handleContinue}
          disabled={saving || ctaLocked}
          style={({ pressed }) => [styles.cta, ctaLocked && styles.ctaLocked, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[selectedMeta.tint, colors.gradientEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.ctaFill}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.ctaText}>{ctaLabel}</Text>
                <Icon name={ctaIcon} size={18} color="#FFFFFF" />
              </>
            )}
          </LinearGradient>
        </Pressable>
      </View>

      <AlertModal visible={!!alertConfig} onClose={closeAlert} {...(alertConfig || {})} />
    </View>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  pressed: { opacity: 0.85 },
  content: { padding: 16, gap: 12 },
  option: {
    padding: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 12,
  },
  optionTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  optionIcon: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  optionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionTitle: { fontSize: 17, fontWeight: '900', color: colors.text },
  optionTagline: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  currentBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 7,
    backgroundColor: colors.iconBackground,
  },
  currentBadgeText: { fontSize: 10.5, fontWeight: '800', color: colors.textSecondary },
  radio: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 12, height: 12, borderRadius: 6 },
  perks: {
    gap: 9,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  perkIcon: { width: 28, height: 28, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  perkText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  note: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.pastelBlue,
  },
  noteText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  noteLock: { backgroundColor: colors.pastelOrange },
  noteWarn: { backgroundColor: colors.pastelRed },
  effects: {
    gap: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  effectsTitle: { fontSize: 13, fontWeight: '800', color: colors.text },
  effectRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  effectDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6, backgroundColor: colors.warning },
  ctaLocked: { opacity: 0.55 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cta: { borderRadius: 16, overflow: 'hidden' },
  ctaFill: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  ctaText: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
});
