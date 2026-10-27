import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import ScreenLoader from '../components/ScreenLoader';
import { BillRow, ReceiptSheet, billDate, npr } from '../components/PlanBill';
import { api } from '../services/api';
import { ROUTES } from '../navigation/helpers';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';
import { usePullRefresh, refreshControl } from '../hooks/usePullRefresh';

export default function PaymentHistoryScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [payments, setPayments] = useState([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    const { data: res, error: err } = await api.getPaymentHistory(1);
    if (res) {
      setData(res);
      setPayments(res.payments || []);
      setPage(1);
      setError('');
    } else {
      setError(err || 'Could not load your bills');
    }
    setLoading(false);
  }, []);
  const { refreshing, onRefresh } = usePullRefresh(load);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const loadMore = async () => {
    if (loadingMore || page >= (data?.totalPages || 1)) return;
    setLoadingMore(true);
    const { data: res } = await api.getPaymentHistory(page + 1);
    if (res?.payments) {
      setPayments((current) => [...current, ...res.payments]);
      setPage(page + 1);
    }
    setLoadingMore(false);
  };

  const sub = data?.subscription;
  const totals = data?.totals || { paid: 0, plans: 0 };
  const hasMore = page < (data?.totalPages || 1);

  return (
    <View style={styles.root}>
      <ThemeStatusBar variant="header" />
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.navBtn}>
          <Icon name="chevron-back" size={22} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Payment history</Text>
          <Text style={styles.headerSubtitle}>Your plan bills and receipts</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl(colors, refreshing, onRefresh)}
      >
        <LinearGradient colors={['#064E3B', colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.summary}>
          <View style={styles.summaryCircle} pointerEvents="none" />
          <Text style={styles.summaryLabel}>Total paid for plans</Text>
          <Text style={styles.summaryAmount}>{npr(totals.paid)}</Text>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <Icon name="receipt-outline" size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.summaryText}>{totals.plans} plan{totals.plans === 1 ? '' : 's'} bought</Text>
            </View>
            <View style={[styles.summaryItem, styles.summaryDivider]}>
              <Icon name={sub ? 'rocket-outline' : 'leaf-outline'} size={14} color="rgba(255,255,255,0.85)" />
              <Text style={styles.summaryText} numberOfLines={1}>
                {sub ? `${sub.name} till ${billDate(sub.endsAt)}` : 'On the free plan'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {error ? (
          <View style={styles.errorBox}>
            <Icon name="cloud-offline-outline" size={18} color={colors.error} />
            <Text style={styles.errorText}>{error}. Pull down to try again.</Text>
          </View>
        ) : null}

        {!loading && !error && !payments.length ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Icon name="receipt-outline" size={28} color={colors.primary} />
            </View>
            <Text style={styles.emptyTitle}>No bills yet</Text>
            <Text style={styles.emptySub}>When you buy a plan, the bill and receipt show up here.</Text>
            <Pressable onPress={() => navigation.navigate(ROUTES.SUBSCRIPTION)} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>See plans</Text>
            </Pressable>
          </View>
        ) : null}

        {payments.length ? (
          <View style={styles.card}>
            {payments.map((bill, index) => (
              <BillRow key={bill.id} bill={bill} onPress={setOpen} last={index === payments.length - 1} />
            ))}
          </View>
        ) : null}

        {hasMore ? (
          <Pressable onPress={loadMore} disabled={loadingMore} style={styles.more}>
            {loadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : <Text style={styles.moreText}>Show older bills</Text>}
          </Pressable>
        ) : null}

        {payments.length ? (
          <Text style={styles.foot}>Tap a bill to see the receipt. Questions about a payment? Share the bill number with support.</Text>
        ) : null}
      </ScrollView>

      <ReceiptSheet bill={open} onClose={() => setOpen(null)} />
      {loading ? <ScreenLoader overlay label="Loading bills" /> : null}
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
  summary: { borderRadius: 22, padding: 18, overflow: 'hidden' },
  summaryCircle: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: -90, right: -60, backgroundColor: 'rgba(255,255,255,0.08)' },
  summaryLabel: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.8)' },
  summaryAmount: { marginTop: 4, fontSize: 30, fontWeight: '900', color: '#FFFFFF' },
  summaryRow: { flexDirection: 'row', marginTop: 14, padding: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.18)' },
  summaryItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.18)', paddingLeft: 10 },
  summaryText: { flex: 1, fontSize: 12.5, fontWeight: '700', color: '#FFFFFF' },
  card: { paddingHorizontal: 14, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 14, backgroundColor: `${colors.error}10` },
  errorText: { flex: 1, fontSize: 13, color: colors.text },
  empty: { alignItems: 'center', gap: 6, padding: 28, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glow, marginBottom: 4 },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: colors.text },
  emptySub: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  emptyBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.primary },
  emptyBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
  more: { alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  moreText: { fontSize: 13.5, fontWeight: '800', color: colors.primary },
  foot: { fontSize: 12, lineHeight: 17, color: colors.textMuted, textAlign: 'center' },
});
