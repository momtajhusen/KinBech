import { useCallback, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import ScreenLoader from '../components/ScreenLoader';
import { api } from '../services/api';
import { ROUTES, TABS, navigateToTab, openItemDetail } from '../navigation/helpers';
import { formatPrice, resolveMediaUrl } from '../utils/listing';
import { currencySymbol } from '../utils/currency';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIODS = [
  { key: '7', label: '7 days', days: 7 },
  { key: '30', label: '30 days', days: 30 },
  { key: '365', label: '1 year', days: 365 },
  { key: 'all', label: 'All time', days: null },
];

const ACTIVITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'sale', label: 'Sales' },
  { key: 'purchase', label: 'Purchases' },
];

const PROVIDERS = {
  esewa: { name: 'eSewa', icon: 'phone-portrait-outline', colors: ['#41A124', '#60BB46'] },
  khalti: { name: 'Khalti', icon: 'wallet-outline', colors: ['#4A1D7A', '#6A3BA8'] },
  ime: { name: 'IME Pay', icon: 'card-outline', colors: ['#B91C1C', '#E31E24'] },
  bank: { name: 'Bank', icon: 'business-outline', colors: ['#1E3A8A', '#2563EB'] },
  cash: { name: 'Cash', icon: 'cash-outline', colors: ['#065F46', '#059669'] },
};

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('en-NP', { day: 'numeric', month: 'short' });
  } catch (_) {
    return '';
  }
}

function monthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function monthLabel(date, short = false) {
  try {
    return date.toLocaleDateString('en-NP', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
  } catch (_) {
    return '';
  }
}

function maskId(value) {
  const text = String(value || '');
  if (text.length <= 4) return text;
  return `•••• ${text.slice(-4)}`;
}

export default function WalletScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [period, setPeriod] = useState('30');
  const [activity, setActivity] = useState('all');
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await api.getWallet();
    setLoading(false);
    setWallet(data?.wallet || null);
    setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
    setPaymentMethods(Array.isArray(data?.paymentMethods) ? data.paymentMethods : []);
  }, []);

  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const money = (value) => (hidden ? `${currencySymbol()}••••` : formatPrice(value || 0));

  const periodStats = useMemo(() => {
    const days = PERIODS.find((p) => p.key === period)?.days;
    const since = days ? Date.now() - days * DAY_MS : 0;
    const stats = { sales: 0, salesCount: 0, purchases: 0, purchaseCount: 0 };
    transactions.forEach((tx) => {
      if (since && new Date(tx.date).getTime() < since) return;
      if (tx.type === 'sale') {
        stats.sales += Number(tx.amount) || 0;
        stats.salesCount += 1;
      } else {
        stats.purchases += Number(tx.amount) || 0;
        stats.purchaseCount += 1;
      }
    });
    stats.net = stats.sales - stats.purchases;
    stats.avgSale = stats.salesCount ? Math.round(stats.sales / stats.salesCount) : 0;
    return stats;
  }, [transactions, period]);

  const monthly = useMemo(() => {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKey(date), label: monthLabel(date, true), sales: 0, purchases: 0 });
    }
    const byKey = new Map(months.map((m) => [m.key, m]));
    transactions.forEach((tx) => {
      const row = byKey.get(monthKey(new Date(tx.date)));
      if (!row) return;
      if (tx.type === 'sale') row.sales += Number(tx.amount) || 0;
      else row.purchases += Number(tx.amount) || 0;
    });
    const max = Math.max(1, ...months.map((m) => Math.max(m.sales, m.purchases)));
    return { months, max };
  }, [transactions]);

  const thisMonth = monthly.months[monthly.months.length - 1] || { sales: 0, purchases: 0 };

  const groupedActivity = useMemo(() => {
    const list = transactions.filter((tx) => activity === 'all' || tx.type === activity);
    const visible = showAll ? list : list.slice(0, 8);
    const groups = [];
    visible.forEach((tx) => {
      const date = new Date(tx.date);
      const key = monthKey(date);
      let group = groups[groups.length - 1];
      if (!group || group.key !== key) {
        group = { key, label: monthLabel(date), items: [] };
        groups.push(group);
      }
      group.items.push(tx);
    });
    return { groups, total: list.length };
  }, [transactions, activity, showAll]);

  const credits = Number(wallet?.featuredCredits) || 0;

  const QUICK_ACTIONS = [
    {
      label: 'Sell item',
      icon: 'add-circle-outline',
      tint: colors.primary,
      bg: colors.pastelGreen,
      onPress: () => navigateToTab(navigation, TABS.POST),
    },
    {
      label: 'My sales',
      icon: 'trending-up-outline',
      tint: colors.info,
      bg: colors.pastelIndigo,
      onPress: () => navigation.navigate(ROUTES.MY_LISTINGS, { initialTab: 'sold' }),
    },
    {
      label: 'Purchases',
      icon: 'bag-handle-outline',
      tint: colors.warning,
      bg: colors.pastelOrange,
      onPress: () => navigation.navigate(ROUTES.MY_PURCHASES),
    },
    {
      label: 'Pay IDs',
      icon: 'card-outline',
      tint: colors.favorite,
      bg: colors.pastelRed,
      onPress: () => navigation.navigate(ROUTES.PAYMENT_METHODS),
    },
  ];

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.navBtn}>
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.headerTitle}>Wallet</Text>
          <Text style={styles.headerSubtitle}>Your deals at a glance</Text>
        </View>
        <Pressable
          onPress={() => setHidden((v) => !v)}
          hitSlop={10}
          style={styles.navBtn}
          accessibilityLabel={hidden ? 'Show amounts' : 'Hide amounts'}
        >
          <Icon name={hidden ? 'eye-off-outline' : 'eye-outline'} size={19} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        {loading && !wallet ? null : (
          <>
            <LinearGradient
              colors={['#064E3B', colors.gradientStart, colors.gradientEnd]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroCircleLg} pointerEvents="none" />
              <View style={styles.heroCircleSm} pointerEvents="none" />

              <View style={styles.heroTop}>
                <View style={styles.heroBrand}>
                  <View style={styles.heroBrandIcon}>
                    <Icon name="wallet" size={14} color={colors.gradientStart} />
                  </View>
                  <Text style={styles.heroBrandText}>KinBech Wallet</Text>
                </View>
                <View style={styles.heroChip}>
                  <Icon name="calendar-outline" size={11} color={colors.white} />
                  <Text style={styles.heroChipText}>
                    This month {thisMonth.sales - thisMonth.purchases >= 0 ? '+' : '-'}
                    {money(Math.abs(thisMonth.sales - thisMonth.purchases))}
                  </Text>
                </View>
              </View>

              <Text style={styles.heroLabel}>Net from your deals</Text>
              <Text style={styles.heroValue}>{money(wallet?.net)}</Text>

              <View style={styles.heroSplit}>
                <View style={styles.heroSplitItem}>
                  <View style={[styles.heroSplitIcon, { backgroundColor: 'rgba(134,239,172,0.22)' }]}>
                    <Icon name="arrow-down" size={13} color="#86EFAC" />
                  </View>
                  <View>
                    <Text style={styles.heroSplitLabel}>Earned · {wallet?.soldCount || 0} sold</Text>
                    <Text style={styles.heroSplitValue}>{money(wallet?.salesTotal)}</Text>
                  </View>
                </View>
                <View style={styles.heroSplitDivider} />
                <View style={styles.heroSplitItem}>
                  <View style={[styles.heroSplitIcon, { backgroundColor: 'rgba(253,186,116,0.22)' }]}>
                    <Icon name="arrow-up" size={13} color="#FDBA74" />
                  </View>
                  <View>
                    <Text style={styles.heroSplitLabel}>Spent · {wallet?.purchaseCount || 0} bought</Text>
                    <Text style={styles.heroSplitValue}>{money(wallet?.purchaseTotal)}</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.quickRow}>
              {QUICK_ACTIONS.map((action) => (
                <Pressable
                  key={action.label}
                  onPress={action.onPress}
                  style={({ pressed }) => [styles.quickItem, pressed && styles.pressed]}
                >
                  <View style={[styles.quickIcon, { backgroundColor: action.bg }]}>
                    <Icon name={action.icon} size={20} color={action.tint} />
                  </View>
                  <Text style={styles.quickLabel} numberOfLines={1}>{action.label}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Insights</Text>
              </View>
              <View style={styles.segment}>
                {PERIODS.map((p) => {
                  const selected = period === p.key;
                  return (
                    <Pressable key={p.key} onPress={() => setPeriod(p.key)} style={[styles.segmentBtn, selected && styles.segmentBtnActive]}>
                      <Text style={[styles.segmentText, selected && styles.segmentTextActive]}>{p.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.insightGrid}>
                <View style={styles.insightTile}>
                  <Text style={styles.insightLabel}>Earned</Text>
                  <Text style={[styles.insightValue, { color: colors.statusActive }]}>{money(periodStats.sales)}</Text>
                  <Text style={styles.insightMeta}>{periodStats.salesCount} sales</Text>
                </View>
                <View style={styles.insightTile}>
                  <Text style={styles.insightLabel}>Spent</Text>
                  <Text style={[styles.insightValue, { color: colors.warning }]}>{money(periodStats.purchases)}</Text>
                  <Text style={styles.insightMeta}>{periodStats.purchaseCount} purchases</Text>
                </View>
                <View style={styles.insightTile}>
                  <Text style={styles.insightLabel}>Net</Text>
                  <Text style={styles.insightValue}>
                    {periodStats.net < 0 && !hidden ? '-' : ''}
                    {money(Math.abs(periodStats.net))}
                  </Text>
                  <Text style={styles.insightMeta}>this period</Text>
                </View>
                <View style={styles.insightTile}>
                  <Text style={styles.insightLabel}>Avg. sale</Text>
                  <Text style={styles.insightValue}>{money(periodStats.avgSale)}</Text>
                  <Text style={styles.insightMeta}>per item</Text>
                </View>
              </View>

              <View style={styles.chartHeader}>
                <Text style={styles.chartTitle}>Last 6 months</Text>
                <View style={styles.legend}>
                  <View style={[styles.legendDot, { backgroundColor: colors.statusActive }]} />
                  <Text style={styles.legendText}>Earned</Text>
                  <View style={[styles.legendDot, { backgroundColor: colors.warning }]} />
                  <Text style={styles.legendText}>Spent</Text>
                </View>
              </View>
              <View style={styles.chart}>
                {monthly.months.map((m, index) => {
                  const current = index === monthly.months.length - 1;
                  return (
                    <View key={m.key} style={styles.chartCol}>
                      <View style={styles.chartBars}>
                        <View
                          style={[
                            styles.chartBar,
                            { height: `${Math.max(3, (m.sales / monthly.max) * 100)}%`, backgroundColor: colors.statusActive },
                            !m.sales && styles.chartBarEmpty,
                          ]}
                        />
                        <View
                          style={[
                            styles.chartBar,
                            { height: `${Math.max(3, (m.purchases / monthly.max) * 100)}%`, backgroundColor: colors.warning },
                            !m.purchases && styles.chartBarEmpty,
                          ]}
                        />
                      </View>
                      <Text style={[styles.chartLabel, current && styles.chartLabelActive]}>{m.label}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <LinearGradient
              colors={['#7C2D12', '#C2410C', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.creditCard}
            >
              <View style={styles.creditIcon}>
                <Icon name="flash" size={20} color="#F59E0B" />
              </View>
              <View style={styles.creditCopy}>
                <Text style={styles.creditTitle}>
                  {credits} boost {credits === 1 ? 'credit' : 'credits'}
                </Text>
                <Text style={styles.creditText}>
                  {credits > 0
                    ? 'Each credit features one listing for 24 hours. Tap Boost on a live listing.'
                    : 'Each credit features one listing for 24 hours. Invite friends to earn one.'}
                </Text>
              </View>
              <Pressable
                style={styles.creditBtn}
                onPress={() => (credits > 0
                  ? navigation.navigate(ROUTES.MY_LISTINGS, { initialTab: 'active' })
                  : navigation.navigate(ROUTES.INVITE_FRIENDS))}
              >
                <Text style={styles.creditBtnText}>{credits > 0 ? 'Use' : 'Invite'}</Text>
              </Pressable>
            </LinearGradient>

            <View>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Payment IDs</Text>
                <Pressable onPress={() => navigation.navigate(ROUTES.PAYMENT_METHODS)} hitSlop={8}>
                  <Text style={styles.sectionLink}>Manage</Text>
                </Pressable>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.payRow}>
                {paymentMethods.map((method) => {
                  const provider = PROVIDERS[method.provider] || PROVIDERS.cash;
                  return (
                    <Pressable key={method.id} onPress={() => navigation.navigate(ROUTES.PAYMENT_METHODS)}>
                      <LinearGradient colors={provider.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.payCard}>
                        <View style={styles.payTop}>
                          <Icon name={provider.icon} size={18} color={colors.white} />
                          {method.isDefault ? (
                            <View style={styles.payDefault}>
                              <Text style={styles.payDefaultText}>Default</Text>
                            </View>
                          ) : null}
                        </View>
                        <View>
                          <Text style={styles.payName} numberOfLines={1}>{method.label || provider.name}</Text>
                          <Text style={styles.payId} numberOfLines={1}>
                            {method.provider === 'cash' ? 'Pay at meetup' : maskId(method.identifier) || provider.name}
                          </Text>
                        </View>
                      </LinearGradient>
                    </Pressable>
                  );
                })}
                <Pressable
                  style={({ pressed }) => [styles.payAdd, pressed && styles.pressed]}
                  onPress={() => navigation.navigate(ROUTES.PAYMENT_METHODS)}
                >
                  <Icon name="add" size={22} color={colors.gradientStart} />
                  <Text style={styles.payAddText}>Add ID</Text>
                </Pressable>
              </ScrollView>
            </View>

            <View>
              <View style={styles.sectionRow}>
                <Text style={styles.sectionTitle}>Activity</Text>
                <Text style={styles.sectionMeta}>{groupedActivity.total} deals</Text>
              </View>
              <View style={styles.chipRow}>
                {ACTIVITY_FILTERS.map((f) => {
                  const selected = activity === f.key;
                  return (
                    <Pressable key={f.key} onPress={() => setActivity(f.key)} style={[styles.chip, selected && styles.chipActive]}>
                      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{f.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              {groupedActivity.total === 0 ? (
                <View style={styles.emptyWrap}>
                  <View style={styles.emptyIcon}>
                    <Icon name="receipt-outline" size={26} color={colors.textMuted} />
                  </View>
                  <Text style={styles.emptyTitle}>No deals yet</Text>
                  <Text style={styles.emptyBody}>
                    Sold items and confirmed meetups will show here as your history.
                  </Text>
                </View>
              ) : (
                <View style={styles.activityCard}>
                  {groupedActivity.groups.map((group, groupIndex) => (
                    <View key={group.key}>
                      <Text style={[styles.groupLabel, groupIndex === 0 && styles.groupLabelFirst]}>{group.label}</Text>
                      {group.items.map((tx) => {
                        const isSale = tx.type === 'sale';
                        const photo = resolveMediaUrl(tx.photo || '');
                        return (
                          <Pressable
                            key={tx.id}
                            style={({ pressed }) => [styles.txRow, pressed && styles.txRowPressed]}
                            onPress={() => tx.listingId && openItemDetail(navigation, { listingId: tx.listingId })}
                          >
                            <View style={styles.txThumb}>
                              {photo ? (
                                <Image source={{ uri: photo }} style={styles.txImage} />
                              ) : (
                                <Icon name="cube-outline" size={18} color={colors.textMuted} />
                              )}
                              <View style={[styles.txBadge, { backgroundColor: isSale ? colors.statusActive : colors.warning }]}>
                                <Icon name={isSale ? 'arrow-down' : 'arrow-up'} size={9} color={colors.white} />
                              </View>
                            </View>
                            <View style={styles.txCopy}>
                              <Text style={styles.txTitle} numberOfLines={1}>{tx.title}</Text>
                              <Text style={styles.txMeta} numberOfLines={1}>
                                {isSale ? 'Sold' : 'Bought'} · {formatDate(tx.date)}
                                {tx.category ? ` · ${tx.category}` : ''}
                              </Text>
                            </View>
                            <Text style={[styles.txAmount, { color: isSale ? colors.statusActive : colors.text }]}>
                              {hidden ? '••••' : `${isSale ? '+' : '-'}${formatPrice(tx.amount)}`}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                  {groupedActivity.total > 8 ? (
                    <Pressable style={styles.showMore} onPress={() => setShowAll((v) => !v)}>
                      <Text style={styles.showMoreText}>
                        {showAll ? 'Show less' : `Show all ${groupedActivity.total}`}
                      </Text>
                      <Icon name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={colors.gradientStart} />
                    </Pressable>
                  ) : null}
                </View>
              )}
            </View>

            <View style={styles.note}>
              <Icon name="shield-checkmark-outline" size={16} color={colors.textMuted} />
              <Text style={styles.noteText}>
                KinBech does not hold money. This is a summary of your sales and purchases. Pay at meetup or with your saved payment IDs.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
      {loading && !wallet ? <ScreenLoader overlay label="Loading wallet" /> : null}
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
    backgroundColor: colors.background,
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
    shadowColor: '#064E3B',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
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
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroBrand: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroBrandIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  heroBrandText: { fontSize: 13, fontWeight: '800', color: colors.white, letterSpacing: 0.3 },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroChipText: { fontSize: 10.5, fontWeight: '700', color: colors.white },
  heroLabel: { marginTop: 18, fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  heroValue: { marginTop: 2, fontSize: 34, fontWeight: '900', color: colors.white, letterSpacing: 0.3 },
  heroSplit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  heroSplitItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroSplitIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  heroSplitLabel: { fontSize: 10.5, color: 'rgba(255,255,255,0.75)', fontWeight: '600' },
  heroSplitValue: { fontSize: 14.5, fontWeight: '800', color: colors.white },
  heroSplitDivider: { width: 1, height: 30, marginHorizontal: 8, backgroundColor: 'rgba(255,255,255,0.18)' },
  quickRow: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickItem: { flex: 1, alignItems: 'center', gap: 6 },
  quickIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 11.5, fontWeight: '600', color: colors.text },
  card: {
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    backgroundColor: colors.iconBackground,
  },
  segmentBtn: { flex: 1, paddingVertical: 7, borderRadius: 9, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: colors.gradientStart },
  segmentText: { fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  segmentTextActive: { color: colors.white },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  insightTile: {
    width: '47.5%',
    flexGrow: 1,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  insightLabel: { fontSize: 11.5, fontWeight: '600', color: colors.textMuted },
  insightValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  insightMeta: { fontSize: 11, color: colors.textMuted },
  chartHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 },
  chartTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  legendText: { fontSize: 11, color: colors.textMuted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 120, marginTop: 12, gap: 6 },
  chartCol: { flex: 1, alignItems: 'center', height: '100%' },
  chartBars: { flex: 1, width: '100%', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 },
  chartBar: { width: 9, borderRadius: 5 },
  chartBarEmpty: { opacity: 0.25 },
  chartLabel: { marginTop: 6, fontSize: 10.5, color: colors.textMuted, fontWeight: '600' },
  chartLabelActive: { color: colors.text, fontWeight: '800' },
  creditCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    overflow: 'hidden',
  },
  creditIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  creditCopy: { flex: 1, gap: 2 },
  creditTitle: { fontSize: 15, fontWeight: '800', color: colors.white },
  creditText: { fontSize: 11.5, lineHeight: 16, color: 'rgba(255,255,255,0.88)' },
  creditBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  creditBtnText: { fontSize: 12.5, fontWeight: '800', color: '#C2410C' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  sectionLink: { fontSize: 13, fontWeight: '700', color: colors.gradientStart },
  sectionMeta: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  payRow: { gap: 10, paddingRight: 4 },
  payCard: {
    width: 150,
    height: 92,
    padding: 12,
    borderRadius: 16,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  payTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  payDefault: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  payDefaultText: { fontSize: 9.5, fontWeight: '800', color: colors.white },
  payName: { fontSize: 13.5, fontWeight: '800', color: colors.white },
  payId: { marginTop: 1, fontSize: 11.5, color: 'rgba(255,255,255,0.85)', letterSpacing: 0.5 },
  payAdd: {
    width: 92,
    height: 92,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  payAddText: { fontSize: 12, fontWeight: '700', color: colors.gradientStart },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.gradientStart, borderColor: colors.gradientStart },
  chipText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: colors.white },
  activityCard: {
    paddingHorizontal: 12,
    paddingBottom: 4,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  groupLabel: {
    marginTop: 14,
    marginBottom: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  groupLabelFirst: { marginTop: 12 },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderRadius: 12 },
  txRowPressed: { backgroundColor: colors.iconBackground },
  txThumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
  },
  txImage: { width: '100%', height: '100%', borderRadius: 12 },
  txBadge: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.surface,
  },
  txCopy: { flex: 1, gap: 2 },
  txTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  txMeta: { fontSize: 11.5, color: colors.textMuted },
  txAmount: { fontSize: 14, fontWeight: '800' },
  showMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  showMoreText: { fontSize: 13, fontWeight: '700', color: colors.gradientStart },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    gap: 6,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.iconBackground,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  emptyBody: { fontSize: 12.5, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  note: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.iconBackground,
  },
  noteText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: colors.textMuted },
});
