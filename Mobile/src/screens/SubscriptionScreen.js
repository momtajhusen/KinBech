import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import ScreenLoader from '../components/ScreenLoader';
import EsewaCheckoutModal from '../components/EsewaCheckoutModal';
import { BillRow, ReceiptSheet } from '../components/PlanBill';
import { AlertModal, showErrorAlert } from '../components/AlertModal';
import { api } from '../services/api';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';
import { timeUntil } from '../hooks/usePostQuota';

const STEPS = [
  { icon: 'pricetags-outline', title: 'Choose a plan', sub: 'Pick how many posts a day you need.' },
  { icon: 'wallet-outline', title: 'Pay with eSewa', sub: 'The eSewa app opens. Confirm the amount with your MPIN.' },
  { icon: 'rocket-outline', title: 'Start posting', sub: 'Your plan turns on right after the payment. You get a receipt in Plan bills.' },
];

const npr = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const dateLabel = (value) => {
  try {
    return new Date(value).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return '';
  }
};

function limitText(value, kind) {
  if (value == null) return null;
  if (value === 0) return `Unlimited ${kind} posts`;
  return `${value} ${kind} post${value === 1 ? '' : 's'} / day`;
}

function quotaLine(quota) {
  if (!quota) return null;
  if (quota.unlimited) return 'Unlimited';
  if (quota.remaining <= 0) return `0 left · next in ${timeUntil(quota.resetsAt) || '24h'}`;
  return `${quota.remaining} of ${quota.limit} left today`;
}

function PlanCard({ plan, current, disabled, onChoose, styles, colors }) {
  const limits = [limitText(plan.individualDailyListings, 'individual'), limitText(plan.shopDailyListings, 'store')].filter(Boolean);
  const perDay = plan.durationDays > 1 ? Math.round(plan.price / plan.durationDays) : null;
  const body = (
    <View style={[styles.planCard, plan.highlight && styles.planCardHighlight]}>
      {plan.highlight ? (
        <LinearGradient colors={['#F59E0B', '#EA580C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ribbon}>
          <Icon name="star" size={11} color="#FFFFFF" />
          <Text style={styles.ribbonText}>Most popular</Text>
        </LinearGradient>
      ) : null}
      <View style={styles.planTop}>
        <View style={{ flex: 1 }}>
          <View style={styles.planNameRow}>
            <Text style={styles.planName}>{plan.name}</Text>
            {current ? (
              <View style={styles.currentPill}>
                <Icon name="checkmark-circle" size={12} color={colors.primary} />
                <Text style={styles.currentPillText}>Current</Text>
              </View>
            ) : null}
          </View>
          {plan.tagline ? <Text style={styles.planTagline}>{plan.tagline}</Text> : null}
        </View>
        <View style={styles.priceBox}>
          <Text style={styles.price}>{npr(plan.price)}</Text>
          <Text style={styles.priceSub}>
            {plan.durationDays} day{plan.durationDays === 1 ? '' : 's'}
            {perDay ? ` · ${npr(perDay)}/day` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.limitRow}>
        {limits.map((text) => (
          <View key={text} style={styles.limitChip}>
            <Icon name="flash" size={13} color={colors.primary} />
            <Text style={styles.limitChipText}>{text}</Text>
          </View>
        ))}
      </View>

      {plan.features?.length ? (
        <View style={styles.features}>
          {plan.features.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <View style={styles.featureCheck}>
                <Icon name="checkmark" size={12} color="#FFFFFF" />
              </View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Pressable
        disabled={disabled}
        onPress={() => onChoose(plan)}
        style={({ pressed }) => [styles.chooseWrap, pressed && { opacity: 0.85 }, disabled && { opacity: 0.45 }]}
      >
        {plan.highlight ? (
          <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.choose}>
            <Text style={styles.chooseText}>{current ? 'Renew plan' : `Choose ${plan.name}`}</Text>
            <Icon name="arrow-forward" size={16} color="#FFFFFF" />
          </LinearGradient>
        ) : (
          <View style={[styles.choose, styles.chooseOutline]}>
            <Text style={[styles.chooseText, { color: colors.primary }]}>{current ? 'Renew plan' : `Choose ${plan.name}`}</Text>
            <Icon name="arrow-forward" size={16} color={colors.primary} />
          </View>
        )}
      </Pressable>
      <View style={styles.payVia}>
        <View style={styles.payViaLogo}>
          <Text style={styles.payViaLogoText}>e</Text>
        </View>
        <Text style={styles.payViaText}>Pay {npr(plan.price)} securely with eSewa</Text>
      </View>
    </View>
  );
  return body;
}

export default function SubscriptionScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [plans, setPlans] = useState([]);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alertConfig, setAlertConfig] = useState(null);
  const [gateways, setGateways] = useState({});
  const [checkout, setCheckout] = useState(null);
  const intentRef = useRef(null);
  const [confirming, setConfirming] = useState(false);
  const [bill, setBill] = useState(null);
  const [accountType, setAccountType] = useState('individual');
  const fromLimit = route?.params?.reason === 'limit';

  const load = useCallback(async () => {
    const [plansRes, mineRes] = await Promise.all([api.getSubscriptionPlans(), api.getMySubscription()]);
    if (plansRes.data) {
      setPlans(plansRes.data.plans || []);
      setGateways(plansRes.data.gateways || {});
      setAccountType(plansRes.data.accountType || 'individual');
    }
    if (mineRes.data) setMine(mineRes.data);
    setLoading(false);
  }, []);
  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const sub = mine?.subscription;
  const pending = mine?.pending;
  const lastRejected = !pending && mine?.history?.[0]?.status === 'rejected' ? mine.history[0] : null;
  const recentBills = (mine?.history || []).slice(0, 3);
  const quotaRows = useMemo(() => {
    const rows = [{ key: 'individual', icon: 'person-outline', label: 'Individual', text: quotaLine(mine?.quota?.individual) }];
    if (mine?.hasShop) rows.push({ key: 'shop', icon: 'storefront-outline', label: 'Store', text: quotaLine(mine?.quota?.shop) });
    return rows.filter((row) => row.text);
  }, [mine]);

  const payWithEsewa = async (plan) => {
    if (!gateways.esewa?.enabled) {
      setAlertConfig({
        type: 'info',
        title: 'Payment is not open yet',
        message:
          gateways.esewa?.reason === 'testers_only'
            ? 'eSewa is in test mode right now and open only to test accounts. Please try again later or message support.'
            : 'eSewa payment for plans is not available right now. Please try again later or message support.',
        primaryButton: { text: 'Contact support', onPress: () => navigation.navigate(ROUTES.CONTACT_US) },
        secondaryButton: { text: 'OK' },
      });
      return;
    }
    setConfirming(true);
    const { data, error } = await api.startEsewaPayment(plan.id);
    setConfirming(false);
    if (error) {
      setAlertConfig(showErrorAlert({ title: 'Could not open eSewa', message: data?.message || error }));
      return;
    }
    if (data.flow === 'intent' && data.deeplink) {
      intentRef.current = { paymentId: data.paymentId, plan, planName: data.planName, deeplink: data.deeplink, away: false };
      openEsewaApp();
      return;
    }
    setCheckout(data);
  };

  /** The deeplink opens the eSewa app, or the Play Store when it is not installed. */
  const openEsewaApp = async () => {
    const pay = intentRef.current;
    if (!pay) return;
    try {
      await Linking.openURL(pay.deeplink);
    } catch (_) {
      intentRef.current = null;
      api.verifyEsewaPayment(pay.paymentId, { outcome: 'failure' });
      setAlertConfig(showErrorAlert({ title: 'Could not open eSewa', message: 'Install the eSewa app and try again.' }));
    }
  };

  /** eSewa links open only once, so trying again cancels the old booking and books a new one. */
  const payAgain = async () => {
    const pay = intentRef.current;
    if (!pay) return;
    intentRef.current = null;
    setConfirming(true);
    const { data: result } = await api.verifyEsewaPayment(pay.paymentId, { outcome: 'failure' });
    setConfirming(false);
    if (result?.state === 'approved' || result?.state === 'pending') {
      load();
      showPaymentResult(result, pay.planName, 'returned');
      return;
    }
    payWithEsewa(pay.plan);
  };

  /** Back from the eSewa app: the server asks eSewa whether the booking was paid. */
  const settleIntent = async (outcome) => {
    const pay = intentRef.current;
    if (!pay) return;
    setConfirming(true);
    const { data: result, error } = await api.verifyEsewaPayment(pay.paymentId, outcome ? { outcome } : {});
    setConfirming(false);
    if (error) {
      setAlertConfig(showErrorAlert({ title: 'Could not check the payment', message: `${result?.message || error}. Pull down on this screen in a minute to refresh.` }));
      return;
    }
    if (result.state === 'unpaid') {
      setAlertConfig({
        type: 'info',
        title: 'Payment not finished',
        message: `You have not paid for ${pay.planName} in eSewa yet.`,
        primaryButton: { text: 'Open eSewa again', onPress: payAgain },
        secondaryButton: { text: 'Cancel payment', onPress: () => settleIntent('failure') },
      });
      return;
    }
    intentRef.current = null;
    load();
    showPaymentResult(result, pay.planName, outcome || 'returned');
  };
  const settleIntentRef = useRef(settleIntent);
  settleIntentRef.current = settleIntent;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const pay = intentRef.current;
      if (!pay) return;
      if (state === 'background') pay.away = true;
      if (state === 'active' && pay.away) {
        pay.away = false;
        settleIntentRef.current();
      }
    });
    return () => subscription.remove();
  }, []);

  /** eSewa sent the buyer back (or they closed the page): the server confirms with eSewa either way. */
  const finishEsewa = async ({ outcome, data } = {}) => {
    const paymentId = checkout?.paymentId;
    const planName = checkout?.planName;
    setCheckout(null);
    if (!paymentId) return;
    setConfirming(true);
    const { data: result, error } = await api.verifyEsewaPayment(paymentId, { outcome, data });
    setConfirming(false);
    load();
    if (error) {
      setAlertConfig(showErrorAlert({ title: 'Could not check the payment', message: `${result?.message || error}. Pull down on this screen in a minute to refresh.` }));
      return;
    }
    showPaymentResult(result, planName, outcome);
  };

  const showPaymentResult = (result, planName, outcome) => {
    if (result.state === 'approved') {
      const until = result.subscription?.endsAt ? ` until ${dateLabel(result.subscription.endsAt)}` : '';
      setAlertConfig({
        type: 'success',
        title: `${planName} is active`,
        message: `Payment received. Your new daily post limit works right away${until}.`,
        primaryButton: { text: 'Start posting', onPress: () => navigation.goBack() },
        secondaryButton: { text: 'Stay here' },
      });
      return;
    }
    if (result.state === 'pending') {
      setAlertConfig({ type: 'info', title: 'Checking your payment', message: result.message, primaryButton: { text: 'OK' } });
      return;
    }
    if (outcome) {
      setAlertConfig({
        type: 'warning',
        title: 'Payment not completed',
        message: `${result.message}. No money was taken. You can try again.`,
        primaryButton: { text: 'OK' },
      });
    }
  };

  const cancelPending = () => {
    setAlertConfig({
      type: 'warning',
      title: 'Cancel this request?',
      message: 'Only cancel if you have not paid yet. If you already paid, wait for our check.',
      primaryButton: {
        text: 'Cancel request',
        onPress: async () => {
          const { error } = await api.cancelSubscriptionRequest(pending.id);
          if (error) {
            setAlertConfig(showErrorAlert({ title: 'Could not cancel', message: error, onConfirm: () => setAlertConfig(null) }));
            return;
          }
          load();
        },
      },
      secondaryButton: { text: 'Keep it' },
    });
  };

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.navBtn}>
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Plans & limits</Text>
          <Text style={styles.headerSubtitle}>Post more items every day</Text>
        </View>
        <Pressable onPress={() => navigation.navigate(ROUTES.PAYMENT_HISTORY)} hitSlop={10} style={styles.navBtn}>
          <Icon name="receipt-outline" size={19} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {fromLimit && !sub ? (
          <View style={styles.limitStrip}>
            <Icon name="hourglass-outline" size={16} color={colors.warning} />
            <Text style={styles.limitStripText}>You used today's free posts. Pick a plan to keep posting today.</Text>
          </View>
        ) : null}

        <LinearGradient colors={['#064E3B', colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <View style={styles.heroCircleLg} pointerEvents="none" />
          <View style={styles.heroCircleSm} pointerEvents="none" />
          <View style={styles.heroTop}>
            <View style={styles.heroBadge}>
              <Icon name={sub ? 'rocket' : 'leaf-outline'} size={14} color={colors.gradientStart} />
            </View>
            <Text style={styles.heroBrand}>{sub ? 'Your plan' : 'Free plan'}</Text>
          </View>
          <Text style={styles.heroTitle}>{sub ? sub.name : 'Free seller'}</Text>
          <Text style={styles.heroSub}>
            {sub
              ? `${sub.daysLeft} day${sub.daysLeft === 1 ? '' : 's'} left · until ${dateLabel(sub.endsAt)}`
              : 'Upgrade to post more every day'}
          </Text>
          {quotaRows.length ? (
            <View style={styles.heroQuota}>
              {quotaRows.map((row, index) => (
                <View key={row.key} style={[styles.heroQuotaItem, index > 0 && styles.heroQuotaDivider]}>
                  <Icon name={row.icon} size={14} color="rgba(255,255,255,0.85)" />
                  <View>
                    <Text style={styles.heroQuotaLabel}>{row.label} posts</Text>
                    <Text style={styles.heroQuotaValue}>{row.text}</Text>
                  </View>
                </View>
              ))}
            </View>
          ) : null}
        </LinearGradient>

        {pending ? (
          <View style={[styles.statusCard, { borderColor: `${colors.warning}66`, backgroundColor: `${colors.warning}12` }]}>
            <View style={[styles.statusIcon, { backgroundColor: `${colors.warning}22` }]}>
              <Icon name="time-outline" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Payment under review</Text>
              <Text style={styles.statusSub}>
                {pending.planName} · {npr(pending.price)} · {pending.methodLabel} {pending.reference}
              </Text>
              <Text style={styles.statusSub}>Sent {dateLabel(pending.createdAt)}. We will notify you when it is on.</Text>
              <Pressable onPress={cancelPending} hitSlop={6}>
                <Text style={styles.statusLink}>Cancel request</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {lastRejected ? (
          <View style={[styles.statusCard, { borderColor: `${colors.error}55`, backgroundColor: `${colors.error}0D` }]}>
            <View style={[styles.statusIcon, { backgroundColor: `${colors.error}1F` }]}>
              <Icon name="alert-circle-outline" size={20} color={colors.error} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.statusTitle}>Last request was not approved</Text>
              <Text style={styles.statusSub}>{lastRejected.planName}: {lastRejected.rejectReason}</Text>
              <Text style={styles.statusSub}>Check the transaction ID and send it again, or message support.</Text>
            </View>
          </View>
        ) : null}

        <View>
          <Text style={styles.sectionTitle}>Choose a plan</Text>
          <View style={styles.planFor}>
            <Icon name={accountType === 'shop' ? 'storefront-outline' : 'person-outline'} size={13} color={colors.textMuted} />
            <Text style={styles.planForText}>
              {accountType === 'shop'
                ? 'Plans for your store and personal posts'
                : 'Plans for individual sellers. Store plans show once you open a store.'}
            </Text>
          </View>
        </View>
        {!loading && !plans.length ? (
          <View style={styles.empty}>
            <Icon name="pricetags-outline" size={28} color={colors.textMuted} />
            <Text style={styles.emptyTitle}>Plans are coming soon</Text>
            <Text style={styles.emptySub}>Your free posts reset 24 hours after each post.</Text>
          </View>
        ) : null}
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={sub?.planId === plan.id}
            disabled={Boolean(pending) || confirming}
            onChoose={payWithEsewa}
            styles={styles}
            colors={colors}
          />
        ))}
        {pending && plans.length ? <Text style={styles.hint}>You can choose another plan once the current request is reviewed.</Text> : null}

        {recentBills.length ? (
          <View style={styles.billsCard}>
            <View style={styles.billsHead}>
              <Text style={styles.howTitle}>Recent bills</Text>
              <Pressable onPress={() => navigation.navigate(ROUTES.PAYMENT_HISTORY)} hitSlop={8} style={styles.billsAll}>
                <Text style={styles.billsAllText}>See all</Text>
                <Icon name="chevron-forward" size={14} color={colors.primary} />
              </Pressable>
            </View>
            {recentBills.map((item, index) => (
              <BillRow key={item.id} bill={item} onPress={setBill} last={index === recentBills.length - 1} />
            ))}
          </View>
        ) : null}

        <View style={styles.howCard}>
          <Text style={styles.howTitle}>How it works</Text>
          {STEPS.map((step, index) => (
            <View key={step.title} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepSub}>{step.sub}</Text>
              </View>
              <Icon name={step.icon} size={18} color={colors.primary} />
            </View>
          ))}
          <Pressable onPress={() => navigation.navigate(ROUTES.CONTACT_US)} style={styles.helpRow}>
            <Icon name="chatbubbles-outline" size={16} color={colors.primary} />
            <Text style={styles.helpText}>Questions about plans? Contact support</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ReceiptSheet bill={bill} onClose={() => setBill(null)} />
      <EsewaCheckoutModal checkout={checkout} onReturn={finishEsewa} onClose={() => finishEsewa()} />
      <AlertModal visible={!!alertConfig} onClose={() => setAlertConfig(null)} {...(alertConfig || {})} />
      {loading ? <ScreenLoader overlay label="Loading plans" /> : null}
      {confirming ? <ScreenLoader overlay label="Talking to eSewa" /> : null}
    </View>
  );
}

const createStyles = (colors) => ({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.background },
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
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  headerSubtitle: { fontSize: 11.5, color: colors.textMuted },
  content: { paddingHorizontal: 16, paddingTop: 6, gap: 14 },
  limitStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: `${colors.warning}14`,
    borderWidth: 1,
    borderColor: `${colors.warning}55`,
  },
  limitStripText: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text },
  hero: { borderRadius: 24, padding: 18, overflow: 'hidden', elevation: 6 },
  heroCircleLg: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -90, right: -60, backgroundColor: 'rgba(255,255,255,0.08)' },
  heroCircleSm: { position: 'absolute', width: 120, height: 120, borderRadius: 60, bottom: -50, left: -30, backgroundColor: 'rgba(255,255,255,0.06)' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroBadge: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  heroBrand: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  heroTitle: { marginTop: 14, fontSize: 28, fontWeight: '900', color: '#FFFFFF' },
  heroSub: { marginTop: 2, fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.82)' },
  heroQuota: { flexDirection: 'row', marginTop: 16, padding: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.18)' },
  heroQuotaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroQuotaDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.18)', paddingLeft: 12 },
  heroQuotaLabel: { fontSize: 10.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
  heroQuotaValue: { fontSize: 13.5, fontWeight: '800', color: '#FFFFFF' },
  statusCard: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 18, borderWidth: 1 },
  statusIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  statusSub: { marginTop: 3, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  statusLink: { marginTop: 8, fontSize: 13, fontWeight: '800', color: colors.error },
  sectionTitle: { marginTop: 4, fontSize: 17, fontWeight: '800', color: colors.text },
  planFor: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  planForText: { flex: 1, fontSize: 12, color: colors.textMuted },
  planCard: {
    padding: 16,
    gap: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  planCardHighlight: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface, paddingTop: 22 },
  ribbon: {
    position: 'absolute',
    top: -1,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
  },
  ribbonText: { fontSize: 10.5, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.4, textTransform: 'uppercase' },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontSize: 20, fontWeight: '900', color: colors.text },
  planTagline: { marginTop: 3, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },
  currentPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.glow },
  currentPillText: { fontSize: 10.5, fontWeight: '800', color: colors.primary },
  priceBox: { alignItems: 'flex-end' },
  price: { fontSize: 22, fontWeight: '900', color: colors.price },
  priceSub: { marginTop: 1, fontSize: 11, fontWeight: '600', color: colors.textMuted },
  limitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  limitChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: colors.glow },
  limitChipText: { fontSize: 12.5, fontWeight: '800', color: colors.text },
  features: { gap: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  featureCheck: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  featureText: { flex: 1, fontSize: 13.5, color: colors.textSecondary },
  chooseWrap: { borderRadius: 14, overflow: 'hidden' },
  choose: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14 },
  chooseOutline: { borderWidth: 1.5, borderColor: colors.primary, backgroundColor: 'transparent' },
  chooseText: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 6, padding: 24, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptySub: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center' },
  howCard: { padding: 16, gap: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  howTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  billsCard: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  billsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  billsAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  billsAllText: { fontSize: 13, fontWeight: '800', color: colors.primary },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glow },
  stepNumText: { fontSize: 13, fontWeight: '900', color: colors.primary },
  stepTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  stepSub: { marginTop: 1, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  helpText: { fontSize: 13, fontWeight: '700', color: colors.primary },
  payVia: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: -6 },
  payViaLogo: { width: 16, height: 16, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: '#60BB46' },
  payViaLogoText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF', marginTop: -2 },
  payViaText: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
});
