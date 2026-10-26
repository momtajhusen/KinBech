import { useState } from 'react';
import Icon from '../components/Icon';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import HeroHeader from '../components/HeroHeader';
import { PressableScale, Reanimated, enterUp } from '../components/Motion';
import { AlertModal, showErrorAlert } from '../components/AlertModal';
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
  {
    key: 'both',
    icon: 'layers',
    tint: '#8B5CF6',
    title: 'Both',
    tagline: 'Personal items and shop products',
    perks: [
      { icon: 'swap-horizontal-outline', text: 'Choose each time you post' },
      { icon: 'person-outline', text: 'Personal items stay apart from your store' },
      { icon: 'storefront-outline', text: 'All store tools included' },
    ],
  },
];

const POST_CHOICES = [
  {
    key: 'individual',
    icon: 'person',
    tint: '#10B981',
    title: 'Personal item',
    body: 'Something you own: phone, furniture, bike…',
    route: ROUTES.INDIVIDUAL_POST_LISTING,
  },
  {
    key: 'shop',
    icon: 'storefront',
    tint: '#3B82F6',
    title: 'Shop product',
    body: 'Stock from your store, shown on your store page',
    route: ROUTES.SHOP_POST_LISTING,
  },
];

export default function SellerTypeSelectionScreen({ navigation, route, postMode = false }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, saveSession } = useAuth();
  const fromSettings = Boolean(route?.params?.fromSettings);
  const current = user?.sellerTypePreference || 'individual';
  const [selected, setSelected] = useState(current);
  const [saving, setSaving] = useState(false);
  const [alertConfig, setAlertConfig] = useState(null);

  const closeAlert = () => setAlertConfig(null);

  const savePreference = async (preference) => {
    const { data, error } = await api.updateMe({ sellerTypePreference: preference });
    if (error) {
      setAlertConfig(showErrorAlert({ title: 'Could not save', message: error, onConfirm: closeAlert }));
      return false;
    }
    if (data?.token) await saveSession(data.token, data.user);
    return true;
  };

  const handleContinue = async () => {
    if (saving) return;
    if (fromSettings && selected === current) {
      navigation.goBack();
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

  if (postMode) {
    return (
      <View style={styles.root}>
        <ThemeStatusBar variant="header" />
        <HeroHeader
          icon="add-circle"
          title="What are you posting?"
          subtitle="You sell as an individual and as a shop. Pick one for this listing."
          onBack={navigation.canGoBack() ? () => navigation.goBack() : null}
        />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]} showsVerticalScrollIndicator={false}>
          {POST_CHOICES.map((choice, index) => (
            <PressableScale
              key={choice.key}
              entering={enterUp(index)}
              scaleTo={0.97}
              contentStyle={styles.postCard}
              onPress={() => navigation.navigate(choice.route)}
            >
              <LinearGradient
                colors={[`${choice.tint}26`, `${choice.tint}08`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.postFill}
                pointerEvents="none"
              />
              <View style={[styles.postIcon, { backgroundColor: choice.tint }]}>
                <Icon name={choice.icon} size={28} color="#FFFFFF" />
              </View>
              <View style={styles.flex1}>
                <Text style={styles.postTitle}>{choice.title}</Text>
                <Text style={styles.postBody}>{choice.body}</Text>
              </View>
              <View style={[styles.postArrow, { backgroundColor: `${choice.tint}22` }]}>
                <Icon name="arrow-forward" size={18} color={choice.tint} />
              </View>
            </PressableScale>
          ))}
          <Pressable
            style={styles.changeLink}
            onPress={() => navigation.navigate(ROUTES.SELLER_TYPE_SELECTION, { fromSettings: true })}
          >
            <Icon name="settings-outline" size={15} color={colors.textSecondary} />
            <Text style={styles.changeLinkText}>Change seller preference</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  const selectedMeta = OPTIONS.find((o) => o.key === selected) || OPTIONS[0];
  const unchanged = fromSettings && selected === current;
  const leavingShop = fromSettings && current !== 'individual' && selected === 'individual';

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <HeroHeader
        icon="storefront"
        title={fromSettings ? 'Seller Preference' : 'How do you want to sell?'}
        subtitle={fromSettings ? 'Choose how you sell on KinBech. You can change it anytime.' : 'Pick the option that fits you. You can change it later.'}
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

        {leavingShop ? (
          <View style={styles.note}>
            <Icon name="information-circle-outline" size={16} color={colors.info} />
            <Text style={styles.noteText}>Your store and its listings stay saved. Switch back anytime to manage them.</Text>
          </View>
        ) : selected !== 'individual' && !unchanged ? (
          <View style={styles.note}>
            <Icon name="information-circle-outline" size={16} color={colors.info} />
            <Text style={styles.noteText}>No store yet? We will help you set one up next. It takes about a minute.</Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Pressable onPress={handleContinue} disabled={saving} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
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
                <Text style={styles.ctaText}>
                  {unchanged ? 'Done' : fromSettings ? `Save as ${selectedMeta.title}` : `Continue as ${selectedMeta.title}`}
                </Text>
                <Icon name={unchanged ? 'checkmark' : 'arrow-forward'} size={18} color="#FFFFFF" />
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
  postCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  postFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  postIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  postTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  postBody: { marginTop: 3, fontSize: 12.5, lineHeight: 17, color: colors.textSecondary },
  postArrow: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  changeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  changeLinkText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
});
