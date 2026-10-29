import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../../components/Icon';
import { AdminHeader, toneColors } from '../../components/admin/AdminKit';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatCount, ROLE_LABELS } from '../../utils/admin';

const QUEUES = [
  { key: 'reports', label: 'Reports', icon: 'flag', tone: 'error', go: ['AdminTabs', { screen: 'AdminReports' }] },
  { key: 'pending-review', label: 'Listings to review', icon: 'hourglass', tone: 'warning', go: ['AdminTabs', { screen: 'AdminListings' }] },
  { key: 'scam-monitor', label: 'Scam flags in chats', icon: 'warning', tone: 'error', go: ['AdminScam'] },
  { key: 'shop-verification', label: 'Shop verification', icon: 'storefront', tone: 'info', go: ['AdminShops', { initial: 'pending' }] },
  { key: 'subscriptions', label: 'Payments', icon: 'wallet', tone: 'success', go: ['AdminPayments'] },
  { key: 'support', label: 'Support', icon: 'headset', tone: 'info', go: ['AdminSupport'] },
];

function changeLabel(pct) {
  if (pct == null || !Number.isFinite(Number(pct))) return '';
  const n = Math.round(Number(pct));
  return `${n > 0 ? '+' : ''}${n}% vs yesterday`;
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
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const stats = data?.stats || {};
  const weekly = data?.weeklyData || [];
  const maxWeek = Math.max(1, ...weekly.map((d) => d.listings || 0));
  const topCategories = (data?.topCategories || []).slice(0, 6);
  const maxCat = Math.max(1, ...topCategories.map((c) => c.count || 0));
  const firstName = String(user?.name || 'Admin').split(' ')[0];

  const statCards = [
    { label: 'Total users', value: stats.totalUsers, icon: 'people', tone: 'info' },
    { label: 'Active listings', value: stats.activeListings, icon: 'pricetags', tone: 'success' },
    { label: 'Active today', value: stats.dau, icon: 'pulse', tone: 'success' },
    { label: 'New listings today', value: stats.newListingsToday, icon: 'add-circle', tone: 'info' },
    { label: 'Sign-ups today', value: stats.signupsToday, icon: 'person-add', tone: 'success', sub: changeLabel(stats.signupsChangePct) },
    { label: 'Deals today', value: stats.transactionsToday, icon: 'bag-check', tone: 'warning', sub: changeLabel(stats.transactionsChangePct) },
    { label: 'Pending reports', value: stats.pendingReports, icon: 'flag', tone: 'error' },
    { label: 'Unverified shops', value: stats.pendingShops, icon: 'storefront', tone: 'warning' },
  ];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <AdminHeader
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
            <View style={styles.statGrid}>
              {statCards.map((card) => {
                const tone = toneColors(colors, card.tone);
                return (
                  <View key={card.label} style={styles.statCard}>
                    <View style={[styles.statIcon, { backgroundColor: tone.bg }]}>
                      <Icon name={card.icon} size={18} color={tone.fg} />
                    </View>
                    <Text style={styles.statValue}>{formatCount(card.value)}</Text>
                    <Text style={styles.statLabel} numberOfLines={1}>{card.label}</Text>
                    {card.sub ? <Text style={styles.statSub} numberOfLines={1}>{card.sub}</Text> : null}
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Needs your attention</Text>
            <View style={styles.panel}>
              {QUEUES.filter((q) => counts[q.key] != null).map((queue, i, arr) => {
                const tone = toneColors(colors, queue.tone);
                const n = counts[queue.key] || 0;
                return (
                  <Pressable
                    key={queue.key}
                    onPress={() => navigation.navigate(...queue.go)}
                    style={({ pressed }) => [styles.queueRow, i < arr.length - 1 && styles.rowDivider, pressed && styles.pressed]}
                  >
                    <View style={[styles.queueIcon, { backgroundColor: tone.bg }]}>
                      <Icon name={queue.icon} size={18} color={tone.fg} />
                    </View>
                    <Text style={styles.queueLabel}>{queue.label}</Text>
                    <View style={[styles.queueCount, n > 0 ? { backgroundColor: tone.fg } : styles.queueCountZero]}>
                      <Text style={[styles.queueCountText, n === 0 && styles.queueCountTextZero]}>{n}</Text>
                    </View>
                    <Icon name="chevron-forward" size={18} color={colors.textMuted} />
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>New listings this week</Text>
            <View style={[styles.panel, styles.chartPanel]}>
              <View style={styles.chart}>
                {weekly.map((d) => (
                  <View key={d.day} style={styles.barCol}>
                    <Text style={styles.barValue}>{d.listings || 0}</Text>
                    <View style={styles.barTrack}>
                      <View style={[styles.bar, { height: `${Math.max(4, ((d.listings || 0) / maxWeek) * 100)}%` }]} />
                    </View>
                    <Text style={styles.barDay}>{String(d.day).slice(0, 3)}</Text>
                  </View>
                ))}
              </View>
            </View>

            {topCategories.length ? (
              <>
                <Text style={styles.sectionTitle}>Top categories</Text>
                <View style={[styles.panel, styles.padded]}>
                  {topCategories.map((c) => (
                    <View key={c.category} style={styles.catRow}>
                      <View style={styles.catHead}>
                        <Text style={styles.catName} numberOfLines={1}>{c.category}</Text>
                        <Text style={styles.catCount}>{c.count}</Text>
                      </View>
                      <View style={styles.catTrack}>
                        <View style={[styles.catFill, { width: `${(c.count / maxCat) * 100}%` }]} />
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {(data.attentionItems || []).length ? (
              <>
                <Text style={styles.sectionTitle}>Alerts</Text>
                <View style={styles.panel}>
                  {data.attentionItems.slice(0, 8).map((item, i, arr) => {
                    const tone = toneColors(colors, item.priority === 'High' ? 'error' : 'warning');
                    return (
                      <View key={`${item.kind}-${item.id}`} style={[styles.alertRow, i < arr.length - 1 && styles.rowDivider]}>
                        <View style={[styles.alertDot, { backgroundColor: tone.fg }]} />
                        <View style={styles.flex1}>
                          <Text style={styles.alertTitle}>{item.title}</Text>
                          <Text style={styles.alertBody} numberOfLines={2}>{item.description}</Text>
                          {item.time ? <Text style={styles.alertTime}>{item.time}</Text> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {(data.recentActivity || []).length ? (
              <>
                <Text style={styles.sectionTitle}>Recent activity</Text>
                <View style={styles.panel}>
                  {data.recentActivity.slice(0, 10).map((item, i, arr) => (
                    <View key={item.id || i} style={[styles.alertRow, i < arr.length - 1 && styles.rowDivider]}>
                      <Icon
                        name={item.type === 'report' ? 'flag-outline' : item.type === 'verification' ? 'storefront-outline' : 'pulse'}
                        size={16}
                        color={colors.textTertiary}
                      />
                      <View style={styles.flex1}>
                        <Text style={styles.activityText} numberOfLines={2}>{item.message}</Text>
                        {item.time ? <Text style={styles.alertTime}>{item.time}</Text> : null}
                      </View>
                    </View>
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

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  loader: { marginTop: 60 },
  pressed: { opacity: 0.75 },
  errorBox: { alignItems: 'center', gap: 10, padding: 32 },
  errorText: { fontSize: 14, color: colors.error, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary },
  retryText: { color: colors.white, fontWeight: '800' },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 16, marginTop: 16 },
  statCard: {
    width: '48%',
    flexGrow: 1,
    padding: 14,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  statValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  statLabel: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: colors.textTertiary },
  statSub: { marginTop: 3, fontSize: 11, fontWeight: '700', color: colors.accentText },

  sectionTitle: { marginTop: 22, marginBottom: 10, marginHorizontal: 18, fontSize: 16, fontWeight: '800', color: colors.text },
  panel: {
    marginHorizontal: 16,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  padded: { padding: 14, gap: 12 },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },

  queueRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  queueIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  queueLabel: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.text },
  queueCount: { minWidth: 28, paddingHorizontal: 8, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  queueCountZero: { backgroundColor: colors.surfaceMuted },
  queueCountText: { fontSize: 12.5, fontWeight: '800', color: colors.white },
  queueCountTextZero: { color: colors.textMuted },

  chartPanel: { padding: 14 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 150 },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, marginBottom: 4 },
  barTrack: { flex: 1, width: '70%', justifyContent: 'flex-end', borderRadius: 8, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  bar: { width: '100%', borderRadius: 8, backgroundColor: colors.primary },
  barDay: { marginTop: 6, fontSize: 11, fontWeight: '700', color: colors.textMuted },

  catRow: { gap: 6 },
  catHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  catName: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.textSecondary },
  catCount: { fontSize: 13, fontWeight: '800', color: colors.text },
  catTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  catFill: { height: '100%', borderRadius: 4, backgroundColor: colors.primaryBright },

  alertRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  alertDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  alertTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  alertBody: { marginTop: 2, fontSize: 13, color: colors.textTertiary, lineHeight: 18 },
  alertTime: { marginTop: 4, fontSize: 11, color: colors.textMuted },
  activityText: { fontSize: 13.5, color: colors.textSecondary, lineHeight: 19 },
});
