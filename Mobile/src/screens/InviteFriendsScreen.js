import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { Linking, Pressable, Share, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenLoader from '../components/ScreenLoader';
import { FormScroll } from '../components/FormScroll';
import { AlertModal, showErrorAlert, showSuccessAlert } from '../components/AlertModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const STEPS = [
  {
    icon: 'share-social',
    title: 'Share your code',
    body: 'Send it to friends on WhatsApp, Viber, Messenger or SMS.',
  },
  {
    icon: 'person-add',
    title: 'Friend enters it',
    body: 'After signing up, they open Profile → Invite and type your code once.',
  },
  {
    icon: 'flash',
    title: 'You get 1 free boost',
    body: 'Each friend who joins gives you 1 boost credit. There is no limit.',
  },
];

const FAQ = [
  {
    q: 'What does a boost do?',
    a: 'A boosted listing is marked Featured and shown higher to nearby buyers for 24 hours.',
  },
  {
    q: 'How do I use my credit?',
    a: 'Open My Listings and tap Boost on any live listing, or tap Boost on the "Listing is live!" screen right after posting. Each boost uses one credit.',
  },
  {
    q: 'Can my friend use more than one code?',
    a: 'No. Each person can enter only one invite code, and you cannot use your own code.',
  },
  {
    q: 'Do credits expire?',
    a: 'No. Your credits stay in your account until you use them.',
  },
];

export default function InviteFriendsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user, refreshUser } = useAuth();

  const [loading, setLoading] = useState(true);
  const [referralCode, setReferralCode] = useState(user?.referralCode || '');
  const [featuredCredits, setFeaturedCredits] = useState(user?.featuredCredits || 0);
  const [invitedCount, setInvitedCount] = useState(0);
  const [shareMessage, setShareMessage] = useState('');
  const [applyCode, setApplyCode] = useState('');
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [alertConfig, setAlertConfig] = useState(null);
  const copiedTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await api.getReferral();
    setLoading(false);
    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not load invite',
          message: error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    setReferralCode(data.referralCode || '');
    setFeaturedCredits(data.featuredCredits || 0);
    setInvitedCount(data.invitedCount || 0);
    setShareMessage(data.shareMessage || '');
  }, []);

  useEffect(() => {
    load();
    return () => clearTimeout(copiedTimer.current);
  }, [load]);

  const message = shareMessage || `Join KinBech with my code ${referralCode} and start buying & selling nearby.`;

  const copyCode = async () => {
    if (!referralCode) return;
    await Clipboard.setStringAsync(referralCode);
    setCopied(true);
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(false), 2000);
  };

  const shareInvite = async () => {
    try {
      await Share.share({ message });
    } catch {
      /* ignore cancel */
    }
  };

  const shareWhatsApp = async () => {
    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`);
    } catch {
      shareInvite();
    }
  };

  const shareSms = async () => {
    try {
      await Linking.openURL(`sms:?body=${encodeURIComponent(message)}`);
    } catch {
      shareInvite();
    }
  };

  const handleApply = async () => {
    const code = applyCode.trim();
    if (!code) {
      setAlertConfig(
        showErrorAlert({
          title: 'Enter a code',
          message: 'Ask your friend for their KinBech invite code.',
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    setApplying(true);
    const { data, error } = await api.applyReferral(code);
    setApplying(false);
    if (error) {
      setAlertConfig(
        showErrorAlert({
          title: 'Could not apply code',
          message: error,
          onConfirm: () => setAlertConfig(null),
        })
      );
      return;
    }
    if (data?.user) await refreshUser();
    setApplyCode('');
    setAlertConfig(
      showSuccessAlert({
        title: 'Code applied',
        message: 'Thanks for joining with a friend. Your friend just earned a free boost.',
        onConfirm: () => setAlertConfig(null),
      })
    );
    load();
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.navBtn}>
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Invite & earn</Text>
          <Text style={styles.headerSubtitle}>Free boosts for every friend</Text>
        </View>
      </View>

      <FormScroll contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <LinearGradient
          colors={['#064E3B', colors.gradientStart, colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroCircleLg} pointerEvents="none" />
          <View style={styles.heroCircleSm} pointerEvents="none" />
          <View style={styles.heroTop}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroTitle}>Invite friends,{'\n'}get free boosts</Text>
              <Text style={styles.heroText}>1 friend joins = 1 day Featured for your listing.</Text>
            </View>
            <View style={styles.giftWrap}>
              <Icon name="gift" size={34} color="#F59E0B" />
            </View>
          </View>
          <View style={styles.heroStats}>
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{invitedCount}</Text>
              <Text style={styles.heroStatLabel}>Friends joined</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{featuredCredits}</Text>
              <Text style={styles.heroStatLabel}>Boost credits</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStat}>
              <Text style={styles.heroStatValue}>{featuredCredits * 24}h</Text>
              <Text style={styles.heroStatLabel}>Featured time</Text>
            </View>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Your invite code</Text>
          <View style={styles.ticket}>
            <View style={[styles.ticketNotch, styles.ticketNotchLeft]} />
            <View style={[styles.ticketNotch, styles.ticketNotchRight]} />
            <Text style={styles.codeText} selectable>
              {referralCode || '——'}
            </Text>
            <Pressable
              onPress={copyCode}
              style={({ pressed }) => [styles.copyBtn, copied && styles.copyBtnDone, pressed && styles.pressed]}
            >
              <Icon name={copied ? 'checkmark' : 'copy-outline'} size={15} color={copied ? colors.white : colors.gradientStart} />
              <Text style={[styles.copyText, copied && styles.copyTextDone]}>{copied ? 'Copied' : 'Copy'}</Text>
            </Pressable>
          </View>

          <Pressable style={({ pressed }) => [styles.shareMain, pressed && styles.pressed]} onPress={shareInvite}>
            <Icon name="share-social" size={18} color={colors.white} />
            <Text style={styles.shareMainText}>Share invite</Text>
          </Pressable>

          <View style={styles.shareRow}>
            <Pressable style={({ pressed }) => [styles.shareOption, pressed && styles.pressed]} onPress={shareWhatsApp}>
              <View style={[styles.shareIcon, { backgroundColor: '#25D36622' }]}>
                <Icon name="logo-whatsapp" size={18} color="#25D366" />
              </View>
              <Text style={styles.shareOptionText}>WhatsApp</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.shareOption, pressed && styles.pressed]} onPress={shareSms}>
              <View style={[styles.shareIcon, { backgroundColor: `${colors.info}22` }]}>
                <Icon name="chatbubble-ellipses" size={17} color={colors.info} />
              </View>
              <Text style={styles.shareOptionText}>SMS</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.shareOption, pressed && styles.pressed]} onPress={copyCode}>
              <View style={[styles.shareIcon, { backgroundColor: `${colors.warning}22` }]}>
                <Icon name="link" size={18} color={colors.warning} />
              </View>
              <Text style={styles.shareOptionText}>Copy code</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.shareOption, pressed && styles.pressed]} onPress={shareInvite}>
              <View style={[styles.shareIcon, { backgroundColor: colors.iconBackground }]}>
                <Icon name="ellipsis-horizontal" size={18} color={colors.textSecondary} />
              </View>
              <Text style={styles.shareOptionText}>More</Text>
            </Pressable>
          </View>
        </View>

        <View>
          <Text style={styles.sectionTitle}>How it works</Text>
          <View style={styles.card}>
            {STEPS.map((step, index) => (
              <View key={step.title} style={styles.step}>
                <View style={styles.stepRail}>
                  <View style={styles.stepIcon}>
                    <Icon name={step.icon} size={16} color={colors.white} />
                  </View>
                  {index < STEPS.length - 1 ? <View style={styles.stepLine} /> : null}
                </View>
                <View style={styles.stepCopy}>
                  <Text style={styles.stepNumber}>Step {index + 1}</Text>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepBody}>{step.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.boostCard}>
          <View style={styles.boostIcon}>
            <Icon name="flash" size={18} color="#F59E0B" />
          </View>
          <View style={styles.boostCopy}>
            <Text style={styles.boostTitle}>
              {featuredCredits > 0
                ? `You have ${featuredCredits} boost ${featuredCredits === 1 ? 'credit' : 'credits'} ready`
                : 'No boost credits yet'}
            </Text>
            <Text style={styles.boostText}>
              {featuredCredits > 0
                ? 'Open My Listings and tap Boost on a live listing.'
                : 'Share your code above. You get a credit as soon as a friend joins.'}
            </Text>
          </View>
          {featuredCredits > 0 ? (
            <Pressable
              style={styles.boostBtn}
              onPress={() => navigation.navigate(ROUTES.MY_LISTINGS, { initialTab: 'active' })}
            >
              <Text style={styles.boostBtnText}>Use</Text>
            </Pressable>
          ) : null}
        </View>

        {!user?.referredBy ? (
          <View>
            <Text style={styles.sectionTitle}>Got a friend’s code?</Text>
            <View style={styles.card}>
              <Text style={styles.applyHint}>
                Enter it once to support the friend who invited you. They get a free boost.
              </Text>
              <View style={styles.applyRow}>
                <View style={styles.applyInputWrap}>
                  <Icon name="ticket-outline" size={17} color={colors.textMuted} />
                  <TextInput
                    value={applyCode}
                    onChangeText={(text) => setApplyCode(text.toUpperCase())}
                    placeholder="e.g. KB12AB34"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    style={styles.applyInput}
                    returnKeyType="done"
                    onSubmitEditing={handleApply}
                  />
                </View>
                <Pressable
                  style={[styles.applyBtn, (!applyCode.trim() || applying) && styles.applyBtnDisabled]}
                  onPress={handleApply}
                  disabled={!applyCode.trim() || applying}
                >
                  <Text style={styles.applyBtnText}>{applying ? 'Applying…' : 'Apply'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.joinedCard}>
            <Icon name="checkmark-circle" size={18} color={colors.statusActive} />
            <Text style={styles.joinedText}>You joined with a friend’s invite code.</Text>
          </View>
        )}

        <View>
          <Text style={styles.sectionTitle}>Questions</Text>
          <View style={styles.card}>
            {FAQ.map((item, index) => {
              const open = openFaq === index;
              return (
                <Pressable
                  key={item.q}
                  onPress={() => setOpenFaq(open ? null : index)}
                  style={[styles.faqRow, index < FAQ.length - 1 && styles.faqRowBorder]}
                >
                  <View style={styles.faqHead}>
                    <Text style={styles.faqQ}>{item.q}</Text>
                    <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                  </View>
                  {open ? <Text style={styles.faqA}>{item.a}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      </FormScroll>

      <AlertModal visible={!!alertConfig} onClose={() => setAlertConfig(null)} {...(alertConfig || {})} />
      {loading && !shareMessage ? <ScreenLoader overlay label="Loading invite" /> : null}
    </View>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  pressed: { opacity: 0.7 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 11.5, color: colors.textMuted },
  content: { paddingHorizontal: 16, paddingTop: 6, gap: 18 },
  hero: {
    borderRadius: 24,
    padding: 18,
    overflow: 'hidden',
  },
  heroCircleLg: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -90,
    right: -60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroCircleSm: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -50,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroCopy: { flex: 1 },
  heroTitle: { fontSize: 22, lineHeight: 28, fontWeight: '900', color: colors.white },
  heroText: { marginTop: 6, fontSize: 12.5, lineHeight: 18, color: 'rgba(255,255,255,0.88)' },
  giftWrap: {
    width: 68,
    height: 68,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    transform: [{ rotate: '-8deg' }],
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  heroStat: { flex: 1, alignItems: 'center', gap: 2 },
  heroStatValue: { fontSize: 18, fontWeight: '900', color: colors.white },
  heroStatLabel: { fontSize: 10.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  heroStatDivider: { width: 1, height: 28, backgroundColor: 'rgba(255,255,255,0.18)' },
  card: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  ticket: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: `${colors.gradientStart}88`,
    backgroundColor: `${colors.gradientStart}12`,
    overflow: 'hidden',
  },
  ticketNotch: {
    position: 'absolute',
    top: '50%',
    width: 16,
    height: 16,
    marginTop: -8,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
  ticketNotchLeft: { left: -9 },
  ticketNotchRight: { right: -9 },
  codeText: { fontSize: 24, fontWeight: '900', letterSpacing: 3, color: colors.price },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  copyBtnDone: { backgroundColor: colors.statusActive, borderColor: colors.statusActive },
  copyText: { fontSize: 12.5, fontWeight: '800', color: colors.gradientStart },
  copyTextDone: { color: colors.white },
  shareMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    marginTop: 14,
    borderRadius: 14,
    backgroundColor: colors.gradientStart,
  },
  shareMainText: { fontSize: 15, fontWeight: '800', color: colors.white },
  shareRow: { flexDirection: 'row', marginTop: 14 },
  shareOption: { flex: 1, alignItems: 'center', gap: 6 },
  shareIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  shareOptionText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text, marginBottom: 10 },
  step: { flexDirection: 'row', gap: 12 },
  stepRail: { alignItems: 'center', width: 34 },
  stepIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gradientStart,
  },
  stepLine: { flex: 1, width: 2, marginVertical: 4, borderRadius: 1, backgroundColor: `${colors.gradientStart}55` },
  stepCopy: { flex: 1, paddingBottom: 16 },
  stepNumber: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.price },
  stepTitle: { marginTop: 1, fontSize: 14.5, fontWeight: '800', color: colors.text },
  stepBody: { marginTop: 2, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  boostCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${colors.warning}55`,
    backgroundColor: `${colors.warning}14`,
  },
  boostIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.warning}26`,
  },
  boostCopy: { flex: 1, gap: 2 },
  boostTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  boostText: { fontSize: 12, lineHeight: 17, color: colors.textSecondary },
  boostBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.warning,
  },
  boostBtnText: { fontSize: 12.5, fontWeight: '800', color: colors.white },
  applyHint: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  applyRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  applyInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  applyInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: colors.text,
    paddingVertical: 0,
  },
  applyBtn: {
    height: 44,
    paddingHorizontal: 18,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gradientStart,
  },
  applyBtnDisabled: { opacity: 0.45 },
  applyBtnText: { fontSize: 14, fontWeight: '800', color: colors.white },
  joinedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.statusSuccessBg,
  },
  joinedText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  faqRow: { paddingVertical: 12 },
  faqRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  faqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  faqQ: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text },
  faqA: { marginTop: 6, fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
});
