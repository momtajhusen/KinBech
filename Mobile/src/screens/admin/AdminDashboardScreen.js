import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { Ping, PressableScale, Pulse, Reanimated, Shimmer, enterCard, enterUp } from '../../components/Motion';
import { AdminHeader, CountUp, GrowBar, clayGreen, clayPressed, toneColors } from '../../components/admin/AdminKit';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { formatCount, ROLE_LABELS, timeAgo } from '../../utils/admin';
import { screenLabel } from '../../utils/liveScreens';

const QUEUES = [
  { key: 'pending-review', label: 'Review', icon: 'hourglass', tone: 'warning', go: ['AdminTabs', { screen: 'AdminListings' }] },
  { key: 'reports', label: 'Reports', icon: 'flag', tone: 'error', go: ['AdminTabs', { screen: 'AdminReports' }] },
  { key: 'scam-monitor', label: 'Scam flags', icon: 'warning', tone: 'error', go: ['AdminScam'] },
  { key: 'shop-verification', label: 'Shops', icon: 'storefront', tone: 'info', go: ['AdminShops', { initial: 'pending' }] },
  { key: 'subscriptions', label: 'Payments', icon: 'wallet', tone: 'success', go: ['AdminPayments'] },
  { key: 'support', label: 'Support', icon: 'headset', tone: 'info', go: ['AdminSupport'] },
];

const LISTING_STATES = [
  { key: 'active', label: 'Active', tone: 'success', icon: 'checkmark-circle' },
  { key: 'pending', label: 'Pending', tone: 'warning', icon: 'hourglass' },
  { key: 'sold', label: 'Sold', tone: 'info', icon: 'bag-check' },
  { key: 'removed', label: 'Removed', tone: 'error', icon: 'trash' },
  { key: 'hidden', label: 'Hidden', tone: 'muted', icon: 'eye-off' },
];

const TRENDS = [
  { key: 'listings', label: 'Listings', icon: 'pricetags' },
  { key: 'signups', label: 'Sign-ups', icon: 'person-add' },
  { key: 'sold', label: 'Sold', icon: 'bag-check' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function changeLabel(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return null;
  const n = Math.round(Number(pct));
  return { text: `${n > 0 ? '+' : ''}${n}%`, tone: n > 0 ? 'success' : n < 0 ? 'error' : 'muted' };
}

function percent(part, whole) {
  if (!whole) return 0;
  return Math.round((Number(part || 0) / whole) * 100);
}

/** Server weekday buckets (Sun..Sat) rotated so the last bar is today. */
function weekdaySeries(weekly) {
  const today = new Date().getUTCDay();
  return WEEKDAYS.map((_, i) => {
    const day = WEEKDAYS[(today + 1 + i) % 7];
    return { label: day, value: weekly.find((d) => d.day === day)?.listings || 0 };
  });
}

function dateSeries(series) {
  return (series || []).map((d) => ({
    label: WEEKDAYS[new Date(`${d.date}T00:00:00Z`).getUTCDay()] || '',
    value: d.count || 0,
  }));
}

export default function AdminDashboardScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [trend, setTrend] = useState('listings');
  const [, setTick] = useState(0);
  const [liveNow, setLiveNow] = useState(null);

  const loadLive = useCallback(async () => {
    const res = await api.adminLiveUsers();
    if (res.data?.summary) setLiveNow(res.data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadLive();
      const timer = setInterval(loadLive, 15000);
      return () => clearInterval(timer);
    }, [loadLive])
  );

  const load = useCallback(async () => {
    const [dash, nav] = await Promise.all([api.adminDashboard(), api.adminNavCounts()]);
    if (dash.data?.stats) {
      setData(dash.data);
      setError('');
    } else if (dash.error) {
      setError(dash.error);
    }
    if (nav.data?.counts) setCounts(nav.data.counts);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    const timer = setInterval(() => {
      load();
      setTick((n) => n + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const stats = data?.stats || {};
  const live = data?.live || {};
  const breakdown = data?.breakdown || {};
  const listingsBy = breakdown.listings || {};
  const usersBy = breakdown.users || {};
  const shopsBy = breakdown.shops || {};
  const firstName = String(user?.name || 'Admin').split(' ')[0];

  const queues = QUEUES.filter((q) => counts[q.key] != null);
  const waiting = queues.reduce((sum, q) => sum + (Number(counts[q.key]) || 0), 0);
  const activeShare = percent(stats.dau, stats.totalUsers);

  const series =
    trend === 'signups'
      ? dateSeries(live.signupsSeries)
      : trend === 'sold'
        ? dateSeries(live.transactionsSeries)
        : weekdaySeries(data?.weeklyData || []);
  const seriesTotal = series.reduce((sum, d) => sum + d.value, 0);
  const seriesMax = Math.max(1, ...series.map((d) => d.value));
  const best = series.reduce((top, d) => (d.value > (top?.value ?? -1) ? d : top), null);
  const baseline = trend === 'signups' ? live.baselines?.signups : trend === 'sold' ? live.baselines?.transactions : null;

  const topCategories = (data?.topCategories || []).slice(0, 6);
  const categoryTotal = topCategories.reduce((sum, c) => sum + (c.count || 0), 0);
  const maxCat = Math.max(1, ...topCategories.map((c) => c.count || 0));

  const signups = changeLabel(stats.signupsChangePct);
  const deals = changeLabel(stats.transactionsChangePct);

  const kpis = [
    { label: 'Users', value: stats.totalUsers, icon: 'people', tone: 'info', sub: usersBy.newThisWeek != null ? `+${usersBy.newThisWeek} this week` : '', go: ['AdminTabs', { screen: 'AdminUsers' }] },
    { label: 'Live ads', value: stats.activeListings, icon: 'pricetags', tone: 'success', sub: listingsBy.total ? `${percent(stats.activeListings, listingsBy.total)}% of ${formatCount(listingsBy.total)}` : '', go: ['AdminTabs', { screen: 'AdminListings' }] },
    { label: 'Active 7d', value: usersBy.activeThisWeek, icon: 'pulse', tone: 'success', sub: stats.totalUsers ? `${percent(usersBy.activeThisWeek, stats.totalUsers)}% of users` : '' },
    { label: 'Sold total', value: listingsBy.sold, icon: 'bag-check', tone: 'info', sub: stats.transactionsToday ? `${stats.transactionsToday} today` : 'none today' },
    { label: 'Shops', value: shopsBy.total, icon: 'storefront', tone: 'info', sub: shopsBy.total != null ? `${shopsBy.verified || 0} verified` : '', go: ['AdminShops'] },
    { label: 'Messages', value: breakdown.messagesToday, icon: 'chatbubbles', tone: 'success', sub: 'today' },
    { label: 'Pending', value: listingsBy.pending, icon: 'hourglass', tone: 'warning', sub: 'to review', go: ['AdminTabs', { screen: 'AdminListings' }] },
    { label: 'Suspended', value: usersBy.suspended, icon: 'ban', tone: 'error', sub: 'accounts' },
    { label: 'Testers', value: usersBy.testers, icon: 'flask', tone: 'warning', sub: 'sandbox', go: ['AdminTesters'] },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <AdminHeader
          icon="grid"
          title={`Namaste, ${firstName}`}
          subtitle={`${ROLE_LABELS[user?.role] || 'Admin'} · ${user?.email || 'KinBech platform'}`}
        />

        {!data && !error ? <ActivityIndicator style={styles.loader} color={colors.primary} /> : null}
        {error && !data ? (
          <View style={styles.errorBox}>
            <Icon name="cloud-offline" size={28} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={load} style={styles.retryBtn}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}

        {data ? (
          <>
            <Reanimated.View entering={enterCard(0)} style={styles.hero}>
              <View style={styles.heroClip} pointerEvents="none">
                <Shimmer duration={2600} pause={3200} color="rgba(255,255,255,0.18)" />
              </View>
              <View style={styles.heroTop}>
                <Ping size={7} color="#B9F6CA" />
                <Text style={styles.heroEyebrow}>PLATFORM PULSE</Text>
                <Icon name="time-outline" size={11} color="rgba(255,255,255,0.75)" />
                <Text style={styles.heroUpdated}>{timeAgo(data.refreshedAt) || 'now'}</Text>
              </View>
              <View style={styles.heroMain}>
                <View style={styles.flex1}>
                  <CountUp value={stats.dau} format={formatCount} style={styles.heroValue} />
                  <Text style={styles.heroLabel}>active today · {activeShare}% of {formatCount(stats.totalUsers)} users</Text>
                  <View style={styles.heroTrack}>
                    <GrowBar
                      key={`hero-${activeShare}`}
                      axis="x"
                      delay={200}
                      style={[styles.heroFill, { width: `${Math.min(100, Math.max(3, activeShare))}%` }]}
                    />
                  </View>
                </View>
                <PressableScale onPress={() => navigation.navigate('AdminTabs', { screen: 'AdminListings' })} scaleTo={0.9}>
                  <Pulse active={waiting > 0} to={1.06} pause={2400} style={styles.heroBadge}>
                    <Icon name="notifications" size={14} color="rgba(255,255,255,0.9)" />
                    <CountUp value={waiting} style={styles.heroBadgeValue} />
                    <Text style={styles.heroBadgeLabel}>need you</Text>
                  </Pulse>
                </PressableScale>
              </View>
              <View style={styles.heroStats}>
                <HeroStat styles={styles} icon="person-add" label="Sign-ups" value={stats.signupsToday} change={signups} />
                <HeroStat styles={styles} icon="add-circle" label="New ads" value={stats.newListingsToday} />
                <HeroStat styles={styles} icon="bag-check" label="Deals" value={stats.transactionsToday} change={deals} />
                <HeroStat styles={styles} icon="flag" label="Reports" value={stats.pendingReports} />
              </View>
            </Reanimated.View>

            <PressableScale
              onPress={() => navigation.navigate('AdminLive')}
              entering={enterCard(1)}
              scaleTo={0.97}
              style={styles.liveSlot}
              contentStyle={styles.liveCard}
            >
              <View style={styles.liveIcon}>
                <Ping size={10} color={colors.success} />
              </View>
              <View style={styles.flex1}>
                <View style={styles.liveHead}>
                  <CountUp value={liveNow?.summary?.live || 0} style={styles.liveValue} />
                  <Text style={styles.liveLabel}>in the app right now</Text>
                </View>
                <Text style={styles.liveSub} numberOfLines={1}>
                  {liveNow
                    ? `${liveNow.summary.signedIn} signed in · ${liveNow.summary.guests} guests${liveNow.byScreen?.[0] ? ` · most on ${screenLabel(liveNow.byScreen[0].name)}` : ''}`
                    : 'Checking who is online…'}
                </Text>
              </View>
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>LIVE</Text>
                <Icon name="chevron-forward" size={13} color={colors.white} />
              </View>
            </PressableScale>

            <View style={styles.kpiGrid}>
              {kpis.map((kpi, index) => {
                const tone = toneColors(colors, kpi.tone);
                return (
                  <PressableScale
                    key={kpi.label}
                    entering={enterCard(index + 1, 40)}
                    disabled={!kpi.go}
                    scaleTo={0.94}
                    onPress={() => kpi.go && navigation.navigate(...kpi.go)}
                    style={styles.kpiSlot}
                    contentStyle={styles.kpi}
                  >
                    <View style={styles.kpiHead}>
                      <View style={[styles.kpiIcon, { backgroundColor: tone.bg }]}>
                        <Icon name={kpi.icon} size={13} color={tone.fg} />
                      </View>
                      <Text style={styles.kpiLabel} numberOfLines={1}>{kpi.label}</Text>
                      {kpi.go ? <Icon name="chevron-forward" size={11} color={colors.textMuted} /> : null}
                    </View>
                    <CountUp value={kpi.value} format={formatCount} style={styles.kpiValue} />
                    {kpi.sub ? <Text style={styles.kpiSub} numberOfLines={1}>{kpi.sub}</Text> : null}
                  </PressableScale>
                );
              })}
            </View>

            {queues.length ? (
              <>
                <SectionTitle styles={styles} icon="flash" title="Needs your attention" note={waiting ? `${waiting} open` : 'All clear'} />
                <View style={styles.queueGrid}>
                  {queues.map((queue, index) => {
                    const tone = toneColors(colors, queue.tone);
                    const n = Number(counts[queue.key]) || 0;
                    return (
                      <PressableScale
                        key={queue.key}
                        entering={enterCard(index, 45)}
                        scaleTo={0.92}
                        onPress={() => navigation.navigate(...queue.go)}
                        style={styles.kpiSlot}
                        contentStyle={styles.queueTile}
                      >
                        <Pulse active={n > 0} to={1.12} pause={2600}>
                          <View style={[styles.queueIcon, { backgroundColor: n ? tone.bg : colors.surfaceMuted }]}>
                            <Icon name={queue.icon} size={15} color={n ? tone.fg : colors.textMuted} />
                          </View>
                        </Pulse>
                        <CountUp value={n} style={[styles.queueCount, { color: n ? tone.fg : colors.textMuted }]} />
                        <Text style={styles.queueLabel} numberOfLines={1}>{queue.label}</Text>
                        {n === 0 ? <Icon name="checkmark-circle" size={11} color={colors.success} style={styles.queueDone} /> : null}
                      </PressableScale>
                    );
                  })}
                </View>
              </>
            ) : null}

            <SectionTitle styles={styles} icon="analytics" title="Last 7 days" />
            <Reanimated.View entering={enterUp(1)} style={[styles.panel, styles.padded]}>
              <View style={styles.segment}>
                {TRENDS.map((t) => (
                  <PressableScale
                    key={t.key}
                    onPress={() => setTrend(t.key)}
                    scaleTo={0.94}
                    style={styles.flex1}
                    contentStyle={[styles.segmentBtn, trend === t.key && styles.segmentActive]}
                  >
                    <Icon name={t.icon} size={13} color={trend === t.key ? colors.white : colors.textTertiary} />
                    <Text style={[styles.segmentText, trend === t.key && styles.segmentTextActive]}>{t.label}</Text>
                  </PressableScale>
                ))}
              </View>
              <View style={styles.trendStats}>
                <TrendStat styles={styles} label="Total" value={seriesTotal} />
                <TrendStat styles={styles} label="Per day" value={(seriesTotal / Math.max(1, series.length)).toFixed(1)} />
                <TrendStat styles={styles} label="Best day" value={best?.value ? `${best.label} · ${best.value}` : '–'} />
                {baseline != null ? <TrendStat styles={styles} label="Usual" value={`${baseline}/day`} /> : null}
              </View>
              <View style={styles.chart}>
                {series.map((d, i) => {
                  const last = i === series.length - 1;
                  return (
                    <View key={`${d.label}-${i}`} style={styles.barCol}>
                      <Text style={[styles.barValue, last && styles.barValueToday]}>{d.value}</Text>
                      <View style={styles.barTrack}>
                        <GrowBar
                          key={`${trend}-${d.value}`}
                          delay={i * 45}
                          style={[styles.bar, !last && styles.barPast, { height: `${Math.max(4, (d.value / seriesMax) * 100)}%` }]}
                        />
                      </View>
                      <Text style={[styles.barDay, last && styles.barValueToday]}>{last ? 'Today' : d.label}</Text>
                    </View>
                  );
                })}
              </View>
            </Reanimated.View>

            {listingsBy.total ? (
              <>
                <SectionTitle styles={styles} icon="pie-chart" title="Listing health" note={`${formatCount(listingsBy.total)} total`} />
                <Reanimated.View entering={enterUp(2)} style={[styles.panel, styles.padded]}>
                  <View style={styles.stackBar}>
                    {LISTING_STATES.filter((s) => listingsBy[s.key]).map((s, i) => (
                      <GrowBar
                        key={s.key}
                        axis="x"
                        delay={i * 80}
                        style={{ flex: listingsBy[s.key], backgroundColor: toneColors(colors, s.tone).fg }}
                      />
                    ))}
                  </View>
                  <View style={styles.legend}>
                    {LISTING_STATES.map((s) => {
                      const tone = toneColors(colors, s.tone);
                      return (
                        <View key={s.key} style={styles.legendItem}>
                          <Icon name={s.icon} size={12} color={tone.fg} />
                          <Text style={styles.legendLabel}>{s.label}</Text>
                          <Text style={styles.legendValue}>{formatCount(listingsBy[s.key] || 0)}</Text>
                          <Text style={styles.legendPct}>{percent(listingsBy[s.key], listingsBy.total)}%</Text>
                        </View>
                      );
                    })}
                  </View>
                </Reanimated.View>
              </>
            ) : null}

            {topCategories.length ? (
              <>
                <SectionTitle styles={styles} icon="trophy" title="Top categories" note="new ads, 7 days" />
                <Reanimated.View entering={enterUp(3)} style={[styles.panel, styles.padded, styles.catPanel]}>
                  {topCategories.map((c, i) => (
                    <View key={c.category} style={styles.catRow}>
                      <View style={[styles.catRank, i === 0 && styles.catRankTop]}>
                        {i === 0 ? <Icon name="trophy" size={11} color={colors.white} /> : <Text style={styles.catRankText}>{i + 1}</Text>}
                      </View>
                      <View style={styles.flex1}>
                        <View style={styles.catHead}>
                          <Text style={styles.catName} numberOfLines={1}>{c.category}</Text>
                          <Text style={styles.catCount}>{c.count}</Text>
                          <Text style={styles.catPct}>{percent(c.count, categoryTotal)}%</Text>
                        </View>
                        <View style={styles.catTrack}>
                          <GrowBar key={`${c.category}-${c.count}`} axis="x" delay={i * 70} style={[styles.catFill, { width: `${(c.count / maxCat) * 100}%` }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                </Reanimated.View>
              </>
            ) : null}

            {(data.attentionItems || []).length ? (
              <>
                <SectionTitle styles={styles} icon="alert-circle" title="Alerts" note={`${data.attentionItems.length}`} />
                <View style={styles.panel}>
                  {data.attentionItems.slice(0, 6).map((item, i, arr) => {
                    const tone = toneColors(colors, item.priority === 'High' ? 'error' : 'warning');
                    return (
                      <Reanimated.View
                        key={`${item.kind}-${item.id}`}
                        entering={enterUp(i, 60)}
                        style={[styles.feedRow, i < arr.length - 1 && styles.rowDivider]}
                      >
                        <Pulse active={item.priority === 'High'} to={1.15} pause={1800} style={[styles.feedIcon, { backgroundColor: tone.bg }]}>
                          <Icon name={item.kind === 'shop' ? 'storefront' : item.kind === 'report' ? 'flag' : 'alert-circle'} size={13} color={tone.fg} />
                        </Pulse>
                        <View style={styles.flex1}>
                          <View style={styles.feedHead}>
                            <Text style={styles.feedTitle} numberOfLines={1}>{item.title}</Text>
                            <Text style={[styles.priority, { color: tone.fg, backgroundColor: tone.bg }]}>{item.priority}</Text>
                          </View>
                          <Text style={styles.feedBody} numberOfLines={2}>{item.description}</Text>
                          {item.time ? (
                            <View style={styles.timeRow}>
                              <Icon name="time-outline" size={10} color={colors.textMuted} />
                              <Text style={styles.feedTime}>{item.time}</Text>
                            </View>
                          ) : null}
                        </View>
                      </Reanimated.View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {(data.recentActivity || []).length ? (
              <>
                <SectionTitle styles={styles} icon="pulse" title="Recent activity" />
                <View style={styles.panel}>
                  {data.recentActivity.slice(0, 8).map((item, i, arr) => (
                    <Reanimated.View key={item.id || i} entering={enterUp(i, 50)} style={styles.feedRow}>
                      <View style={styles.timeline}>
                        {i === 0 ? <Ping size={8} color={colors.primary} style={styles.timelinePing} /> : <View style={styles.timelineDot} />}
                        {i < arr.length - 1 ? <View style={styles.timelineLine} /> : null}
                      </View>
                      <View style={styles.flex1}>
                        <Text style={styles.activityText} numberOfLines={2}>{item.message}</Text>
                        {item.time ? (
                          <View style={styles.timeRow}>
                            <Icon name="time-outline" size={10} color={colors.textMuted} />
                            <Text style={styles.feedTime}>{item.time}</Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.activityIcon}>
                        <Icon
                          name={item.type === 'report' ? 'flag' : item.type === 'verification' ? 'storefront' : 'pulse'}
                          size={12}
                          color={item.type === 'report' ? colors.error : colors.primary}
                        />
                      </View>
                    </Reanimated.View>
                  ))}
                </View>
              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ styles, title, note, icon }) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionRow}>
      {icon ? (
        <View style={styles.sectionIcon}>
          <Icon name={icon} size={13} color={colors.primary} />
        </View>
      ) : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {note ? <Text style={styles.sectionNote}>{note}</Text> : null}
    </View>
  );
}

function HeroStat({ styles, icon, label, value, change }) {
  return (
    <View style={styles.heroStat}>
      <Icon name={icon} size={13} color="rgba(255,255,255,0.8)" />
      <CountUp value={value} format={formatCount} style={styles.heroStatValue} />
      <Text style={styles.heroStatLabel} numberOfLines={1}>{label}</Text>
      {change ? (
        <View style={styles.heroChangeRow}>
          <Icon name={change.tone === 'error' ? 'trending-down' : 'trending-up'} size={10} color="#D7FFE3" />
          <Text style={styles.heroStatChange}>{change.text}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TrendStat({ styles, label, value }) {
  return (
    <View style={styles.trendStat}>
      <Text style={styles.trendValue} numberOfLines={1}>{value}</Text>
      <Text style={styles.trendLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  loader: { marginTop: 60 },
  errorBox: { alignItems: 'center', gap: 12, padding: 32 },
  errorText: { fontSize: 14, fontWeight: '700', color: colors.error, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 16, ...clayGreen(colors) },
  retryText: { color: colors.white, fontWeight: '800' },

  hero: { marginHorizontal: 16, marginTop: 14, padding: 15, borderRadius: 24, ...clayGreen(colors) },
  heroClip: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 24, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  heroEyebrow: { flex: 1, fontSize: 10, fontWeight: '900', letterSpacing: 1.2, color: 'rgba(255,255,255,0.85)' },
  heroUpdated: { fontSize: 10.5, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  heroMain: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  heroValue: { fontSize: 34, fontWeight: '900', letterSpacing: -0.8, color: colors.white },
  heroLabel: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  heroTrack: { height: 6, marginTop: 8, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  heroFill: { height: '100%', borderRadius: 3, backgroundColor: colors.white },
  heroBadge: {
    width: 76,
    height: 76,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    boxShadow: 'inset 2px 2px 5px rgba(255,255,255,0.25), inset -3px -3px 6px rgba(0,0,0,0.12)',
  },
  heroBadgeValue: { fontSize: 22, fontWeight: '900', color: colors.white },
  heroBadgeLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' },
  heroStats: {
    flexDirection: 'row',
    marginTop: 14,
    paddingVertical: 9,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  heroStat: { flex: 1, alignItems: 'center' },
  heroStatValue: { marginTop: 2, fontSize: 16, fontWeight: '900', color: colors.white },
  heroStatLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase', color: 'rgba(255,255,255,0.78)' },
  heroChangeRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  heroStatChange: { fontSize: 9.5, fontWeight: '900', color: '#D7FFE3' },

  liveSlot: { marginHorizontal: 16, marginTop: 12 },
  liveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  liveIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
    boxShadow: colors.clayTint,
  },
  liveHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  liveValue: { fontSize: 20, fontWeight: '900', color: colors.text },
  liveLabel: { fontSize: 12, fontWeight: '800', color: colors.textSecondary },
  liveSub: { marginTop: 1, fontSize: 11, fontWeight: '600', color: colors.textMuted },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 9, paddingRight: 6, paddingVertical: 5, borderRadius: 999, ...clayGreen(colors) },
  liveBadgeText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, color: colors.white },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginTop: 16 },
  kpiSlot: { flexBasis: '30%', flexGrow: 1 },
  kpi: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 18,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  kpiHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kpiIcon: { width: 22, height: 22, borderRadius: 8, alignItems: 'center', justifyContent: 'center', boxShadow: colors.clayTint },
  kpiLabel: { flex: 1, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted },
  kpiValue: { marginTop: 7, fontSize: 19, fontWeight: '900', letterSpacing: -0.3, color: colors.text },
  kpiSub: { marginTop: 1, fontSize: 10, fontWeight: '700', color: colors.textTertiary },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 10, marginHorizontal: 18 },
  sectionIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
    boxShadow: colors.clayTint,
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '900', color: colors.text },
  sectionNote: { fontSize: 11, fontWeight: '800', color: colors.textMuted },
  panel: { marginHorizontal: 16, borderRadius: 20, backgroundColor: colors.card, boxShadow: colors.clay },
  padded: { padding: 13 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },

  queueGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16 },
  queueTile: {
    alignItems: 'center',
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: colors.card,
    boxShadow: colors.clay,
  },
  queueIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', boxShadow: colors.clayTint },
  queueCount: { marginTop: 6, fontSize: 18, fontWeight: '900' },
  queueLabel: { fontSize: 10.5, fontWeight: '800', color: colors.textSecondary },
  queueDone: { position: 'absolute', top: 8, right: 9 },

  segment: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, ...clayPressed(colors) },
  segmentBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 11 },
  segmentActive: clayGreen(colors),
  segmentText: { fontSize: 12, fontWeight: '800', color: colors.textTertiary },
  segmentTextActive: { color: colors.white },
  trendStats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  trendStat: { flex: 1 },
  trendValue: { fontSize: 14, fontWeight: '900', color: colors.text },
  trendLabel: { marginTop: 1, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: 120, marginTop: 14 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: { fontSize: 10, fontWeight: '800', color: colors.textTertiary, marginBottom: 4 },
  barValueToday: { color: colors.primary, fontWeight: '900' },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', borderRadius: 8, ...clayPressed(colors) },
  bar: { width: '100%', borderRadius: 8, ...clayGreen(colors) },
  barPast: { opacity: 0.7 },
  barDay: { marginTop: 6, fontSize: 9.5, fontWeight: '800', color: colors.textMuted },

  stackBar: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2, ...clayPressed(colors) },
  legend: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 12, rowGap: 8 },
  legendItem: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 8 },
  legendLabel: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  legendValue: { fontSize: 12, fontWeight: '900', color: colors.text },
  legendPct: { width: 34, textAlign: 'right', fontSize: 10.5, fontWeight: '800', color: colors.textMuted },

  catPanel: { gap: 11 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catRank: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
  },
  catRankTop: clayGreen(colors),
  catRankText: { fontSize: 11, fontWeight: '900', color: colors.primary },
  catHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  catName: { flex: 1, fontSize: 12.5, fontWeight: '800', color: colors.textSecondary },
  catCount: { fontSize: 12.5, fontWeight: '900', color: colors.text },
  catPct: { width: 34, textAlign: 'right', fontSize: 10.5, fontWeight: '800', color: colors.textMuted },
  catTrack: { height: 7, marginTop: 5, borderRadius: 4, ...clayPressed(colors) },
  catFill: { height: '100%', borderRadius: 4, ...clayGreen(colors) },

  feedRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 13, paddingVertical: 10 },
  feedIcon: { width: 26, height: 26, borderRadius: 9, alignItems: 'center', justifyContent: 'center', boxShadow: colors.clayTint },
  feedHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedTitle: { flex: 1, fontSize: 13, fontWeight: '800', color: colors.text },
  priority: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999, overflow: 'hidden', fontSize: 9.5, fontWeight: '900' },
  feedBody: { marginTop: 2, fontSize: 12, fontWeight: '600', lineHeight: 16, color: colors.textTertiary },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  feedTime: { fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  timeline: { width: 12, alignItems: 'center', alignSelf: 'stretch' },
  timelineDot: { width: 8, height: 8, marginTop: 5, borderRadius: 4, ...clayGreen(colors) },
  timelinePing: { marginTop: 5 },
  activityIcon: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    ...clayPressed(colors),
  },
  timelineLine: { flex: 1, width: 2, marginTop: 3, marginBottom: -15, backgroundColor: colors.border },
  activityText: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary, lineHeight: 17 },
});
