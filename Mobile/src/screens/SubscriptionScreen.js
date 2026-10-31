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

const STEP_ICONS = ['hand-left-outline', 'wallet-outline', 'rocket-outline'];
const SCREEN_DEFAULTS = {
  headerSubtitle: 'Post more items every day',
  freePlanName: 'Free plan',
  sectionTitle: 'Choose a plan',
  sectionNote: 'Pay one time. No auto cut from your eSewa.',
  stepsTitle: 'How it works',
  steps: [
    { title: 'Pick a plan', sub: 'More posts every day.' },
    { title: 'Pay in eSewa', sub: 'Type your eSewa MPIN.' },
    { title: 'Post more', sub: 'Starts right away.' },
  ],
  helpText: 'Need help? Talk to us',
};

const npr = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const dateLabel = (value) => {
  try {
    return new Date(value).toLocaleDateString('en-NP', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_) {
    return '';
  }
};

function planTiles(plan) {
  const both = plan.shopDailyListings != null;
  const tile = (key, icon, value, label) => ({ key, icon, value: value === 0 ? 'No limit' : String(value), label });
  return [
    both ? tile('shop', 'storefront-outline', plan.shopDailyListings, 'Shop posts / day') : null,
    plan.individualDailyListings != null
      ? tile('own', 'person-outline', plan.individualDailyListings, both ? 'Own posts / day' : 'Posts / day')
      : null,
    tile('days', 'calendar-outline', plan.durationDays, plan.durationDays === 1 ? 'Day' : 'Days'),
  ].filter(Boolean);
}

function planSummary(plan) {
  const days = `${plan.durationDays} day${plan.durationDays === 1 ? '' : 's'}`;
  const count = (value, what) => (value === 0 ? `unlimited ${what}` : `up to ${value} ${what}`);
  if (plan.shopDailyListings != null) {
    const own = plan.individualDailyListings != null ? ` and ${count(plan.individualDailyListings, 'own items')}` : '';
    return `Post ${count(plan.shopDailyListings, 'shop items')}${own} every day, for ${days}.`;
  }
  const n = plan.individualDailyListings;
  return `Post ${count(n, n === 1 ? 'item' : 'items')} every day, for ${days}.`;
}

function planIcon(plan) {
  if (plan.icon) return plan.icon;
  if (plan.shopDailyListings != null) return 'storefront';
  return plan.highlight ? 'rocket' : 'flash';
}

function PlanCard({ plan, current, disabled, onChoose, styles, colors }) {
  const tiles = planTiles(plan);
  const perDay = plan.durationDays > 1 ? Math.max(1, Math.round(plan.price / plan.durationDays)) : null;
  return (
    <View style={[styles.planCard, plan.highlight && styles.planCardHighlight]}>
      {plan.highlight ? (
        <LinearGradient colors={['#F59E0B', '#EA580C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ribbon}>
          <Icon name="star" size={11} color="#FFFFFF" />
          <Text style={styles.ribbonText}>{plan.badge || 'Most popular'}</Text>
        </LinearGradient>
      ) : null}

      <View style={styles.planHead}>
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.planIcon}>
          <Icon name={planIcon(plan)} size={20} color="#FFFFFF" />
        </LinearGradient>
        <View style={styles.planHeadCopy}>
          <View style={styles.planNameRow}>
            <Text style={styles.planName} numberOfLines={1}>{plan.name}</Text>
            {current ? (
              <View style={styles.currentPill}>
                <Icon name="checkmark-circle" size={12} color={colors.primary} />
                <Text style={styles.currentPillText}>Your plan</Text>
              </View>
            ) : null}
          </View>
          {plan.tagline ? <Text style={styles.planTagline} numberOfLines={2}>{plan.tagline}</Text> : null}
        </View>
      </View>

      <View style={styles.priceRow}>
        <Text style={styles.price}>{npr(plan.price)}</Text>
        <Text style={styles.priceFor}>/ {plan.durationDays} day{plan.durationDays === 1 ? '' : 's'}</Text>
        {perDay ? (
          <View style={styles.perDayPill}>
            <Text style={styles.perDayText}>≈ {npr(perDay)}/day</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.statStrip}>
        {tiles.map((t, index) => (
          <View key={t.key} style={[styles.stat, index > 0 && styles.statDivider]}>
            <Icon name={t.icon} size={15} color={colors.primary} />
            <Text style={[styles.statValue, t.value.length > 4 && styles.statValueSmall]} numberOfLines={1}>
              {t.value}
            </Text>
            <Text style={styles.statLabel} numberOfLines={1}>{t.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.summaryList}>
        {[plan.description || planSummary(plan), ...(plan.features || [])].map((line, index) => (
          <View key={`${index}-${line}`} style={styles.summaryRow}>
            <Icon name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.summaryText, index > 0 && styles.featureText]}>{line}</Text>
          </View>
        ))}
      </View>

      <Pressable
        disabled={disabled}
        onPress={() => onChoose(plan)}
        style={({ pressed }) => [styles.chooseWrap, pressed && { opacity: 0.85 }, disabled && { opacity: 0.45 }]}
      >
        <LinearGradient colors={['#60BB46', '#3F8F2F']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.choose}>
          <View style={styles.esewaMark}>
            <Text style={styles.esewaMarkText}>e</Text>
          </View>
          <Text style={styles.chooseText}>
            {current ? 'Renew' : 'Pay'} {npr(plan.price)} with eSewa
          </Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
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
  const [screen, setScreen] = useState(SCREEN_DEFAULTS);
  const [checkout, setCheckout] = useState(null);
  const intentRef = useRef(null);
  const [confirming, setConfirming] = useState(false);
  const [bill, setBill] = useState(null);
  const fromLimit = route?.params?.reason === 'limit';

  const load = useCallback(async () => {
    const [plansRes, mineRes] = await Promise.all([api.getSubscriptionPlans(), api.getMySubscription()]);
    if (plansRes.data) {
      setPlans(plansRes.data.plans || []);
      setGateways(plansRes.data.gateways || {});
      if (plansRes.data.screen) setScreen({ ...SCREEN_DEFAULTS, ...plansRes.data.screen });
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
  const freeLimit = !sub && !mine?.quota?.individual?.unlimited ? mine?.quota?.individual?.limit : null;
  const meters = useMemo(() => {
    const rows = [{ key: 'individual', icon: 'person', label: 'Your posts today', quota: mine?.quota?.individual }];
    if (mine?.hasShop) rows.push({ key: 'shop', icon: 'storefront', label: 'Shop posts today', quota: mine?.quota?.shop });
    return rows.filter((row) => row.quota);
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
          <Text style={styles.headerSubtitle} numberOfLines={1}>{screen.headerSubtitle}</Text>
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
            <View style={styles.heroLabel}>
              <Icon name="ribbon" size={12} color="#FFFFFF" />
              <Text style={styles.heroLabelText}>CURRENT PLAN</Text>
            </View>
            <View style={styles.heroStatus}>
              <View style={[styles.heroStatusDot, { backgroundColor: sub ? '#4ADE80' : '#FCD34D' }]} />
              <Text style={styles.heroStatusText}>{sub ? 'Active' : 'Free'}</Text>
            </View>
          </View>

          <View style={styles.heroNameRow}>
            <View style={styles.heroIcon}>
              <Icon name={sub ? 'rocket' : 'leaf'} size={22} color={colors.gradientStart} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.heroTitle} numberOfLines={1}>{sub ? sub.name : screen.freePlanName}</Text>
              <Text style={styles.heroSub} numberOfLines={1}>
                {sub
                  ? `${sub.daysLeft} day${sub.daysLeft === 1 ? '' : 's'} left · ends ${dateLabel(sub.endsAt)}`
                  : `${freeLimit || 'A few'} free posts every day`}
              </Text>
            </View>
          </View>

          {meters.map(({ key, icon, label, quota }) => {
            const limit = Number(quota.limit) || 0;
            const left = Math.max(0, Number(quota.remaining) || 0);
            const used = Math.max(0, limit - left);
            const full = !quota.unlimited && left <= 0;
            return (
              <View key={key} style={styles.meter}>
                <View style={styles.meterHead}>
                  <View style={styles.meterLabelRow}>
                    <Icon name={icon} size={13} color="rgba(255,255,255,0.85)" />
                    <Text style={styles.meterLabel}>{label}</Text>
                  </View>
                  <Text style={styles.meterValue}>{quota.unlimited ? 'No limit' : `${left} left`}</Text>
                </View>
                {!quota.unlimited ? (
                  <View style={styles.meterTrack}>
                    <View
                      style={[
                        styles.meterFill,
                        { width: `${limit ? Math.min(100, (used / limit) * 100) : 0}%`, backgroundColor: full ? '#FCD34D' : '#FFFFFF' },
                      ]}
                    />
                  </View>
                ) : null}
                <Text style={styles.meterHint}>
                  {quota.unlimited
                    ? 'Post as much as you want'
                    : full
                      ? `Limit reached · more in ${timeUntil(quota.resetsAt) || '24h'}`
                      : `${used} of ${limit} used`}
                </Text>
              </View>
            );
          })}
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
          <Text style={styles.sectionTitle}>{screen.sectionTitle}</Text>
          <View style={styles.planFor}>
            <Icon name="information-circle-outline" size={14} color={colors.textMuted} />
            <Text style={styles.planForText}>{screen.sectionNote}</Text>
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
          <Text style={styles.howTitle}>{screen.stepsTitle}</Text>
          {(screen.steps || SCREEN_DEFAULTS.steps).map((step, index) => (
            <View key={index} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{index + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepSub}>{step.sub}</Text>
              </View>
              <Icon name={STEP_ICONS[index] || 'checkmark-circle-outline'} size={18} color={colors.primary} />
            </View>
          ))}
          <Pressable onPress={() => navigation.navigate(ROUTES.CONTACT_US)} style={styles.helpRow}>
            <Icon name="chatbubbles-outline" size={16} color={colors.primary} />
            <Text style={styles.helpText}>{screen.helpText}</Text>
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
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.18)' },
  heroLabelText: { fontSize: 11, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.8 },
  heroStatus: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(0,0,0,0.2)' },
  heroStatusDot: { width: 8, height: 8, borderRadius: 4 },
  heroStatusText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  heroNameRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 },
  heroIcon: { width: 46, height: 46, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  heroTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF' },
  heroSub: { marginTop: 1, fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  meter: { marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.2)', gap: 8 },
  meterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meterLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meterLabel: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  meterValue: { fontSize: 18, fontWeight: '900', color: '#FFFFFF' },
  meterTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 4 },
  meterHint: { fontSize: 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
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
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  planCardHighlight: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.surface, paddingTop: 24 },
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
  currentPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: colors.glow },
  currentPillText: { fontSize: 10.5, fontWeight: '800', color: colors.primary },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  planHeadCopy: { flex: 1, minWidth: 0, gap: 2 },
  planNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { flexShrink: 1, fontSize: 18, fontWeight: '900', color: colors.text },
  planTagline: { fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  price: { fontSize: 32, fontWeight: '900', color: colors.text, letterSpacing: -0.6 },
  priceFor: { fontSize: 15, fontWeight: '700', color: colors.textMuted },
  perDayPill: { marginLeft: 'auto', alignSelf: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: `${colors.primary}2E`, borderWidth: 1, borderColor: `${colors.primary}66` },
  perDayText: { fontSize: 12, fontWeight: '800', color: colors.text },
  statStrip: { flexDirection: 'row', paddingVertical: 12, borderRadius: 16, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  stat: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  statValue: { fontSize: 22, fontWeight: '900', color: colors.text },
  statValueSmall: { fontSize: 15, paddingVertical: 3 },
  statLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  summaryList: { gap: 8 },
  summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  summaryText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '600', color: colors.textSecondary },
  featureText: { fontWeight: '500', color: colors.textMuted },
  esewaMark: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  esewaMarkText: { fontSize: 16, fontWeight: '900', color: '#60BB46', marginTop: -3 },
  chooseWrap: { borderRadius: 14, overflow: 'hidden' },
  choose: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 15, borderRadius: 14 },
  chooseText: { fontSize: 16, fontWeight: '900', color: '#FFFFFF' },
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
});
