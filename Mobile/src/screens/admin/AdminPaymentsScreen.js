import { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import Icon from '../../components/Icon';
import {
  AdminActions,
  AdminCard,
  AdminChips,
  AdminHeader,
  AdminList,
  AdminSearch,
  CountUp,
  MetaChip,
  MetaRow,
  StatusPill,
  confirmAction,
  showAdminError,
  useAdminList,
  useDebouncedValue,
  usePrompt,
} from '../../components/admin/AdminKit';
import { Pulse, Reanimated, enterCard } from '../../components/Motion';
import { api } from '../../services/api';
import { useAdminStyles as useThemedStyles, useAdminTheme as useTheme } from '../../components/admin/adminTheme';
import { formatDateTime, formatNpr, timeAgo, waitingFor } from '../../utils/admin';

const STATUSES = [
  { value: 'pending', label: 'Pending', icon: 'time' },
  { value: 'approved', label: 'Approved', icon: 'checkmark-circle' },
  { value: 'rejected', label: 'Rejected', icon: 'close-circle' },
  { value: 'failed', label: 'Failed', icon: 'alert-circle' },
  { value: 'cancelled', label: 'Cancelled', icon: 'ban' },
];

export default function AdminPaymentsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [status, setStatus] = useState('pending');
  const [query, setQuery] = useState('');
  const q = useDebouncedValue(query.trim(), 350);
  const [prompt, ask] = usePrompt();

  const load = useCallback(async (page) => {
    const { data, error } = await api.adminPayments({ status, q, page });
    if (error) return { error };
    return {
      items: data?.requests || [],
      total: data?.total,
      totalPages: data?.totalPages,
      extra: { counts: data?.counts || {}, revenue: data?.revenue || {} },
    };
  }, [status, q]);

  const list = useAdminList(load, `${status}|${q}`);
  const counts = list.extra?.counts || {};
  const revenue = list.extra?.revenue || {};

  const approve = async (req) => {
    const ok = await confirmAction({
      title: 'Approve payment?',
      message: `Confirm you received ${formatNpr(req.price)} via ${req.methodLabel || req.method}${req.reference ? ` (ref ${req.reference})` : ''}. ${req.user?.name || 'The user'} gets ${req.planName} right away.`,
      confirmText: 'Approve',
    });
    if (!ok) return;
    const { error } = await api.adminApprovePayment(req.id);
    if (error) {
      showAdminError(error);
      return;
    }
    list.removeItem(req.id);
  };

  const reject = async (req) => {
    const reason = await ask({
      title: 'Reject payment',
      message: 'The user sees this reason.',
      placeholder: 'e.g. No payment found with this reference',
      required: true,
      destructive: true,
      confirmText: 'Reject',
      maxLength: 300,
    });
    if (reason === null) return;
    const { error } = await api.adminRejectPayment(req.id, reason);
    if (error) {
      showAdminError(error);
      return;
    }
    list.removeItem(req.id);
  };

  const renderItem = ({ item }) => (
    <AdminCard>
      <View style={styles.row}>
        <Pulse active={item.status === 'pending'} to={1.1} pause={2000} style={styles.icon}>
          <Icon name="wallet" size={16} color={colors.primary} />
        </Pulse>
        <View style={styles.flex1}>
          <Text style={styles.plan} numberOfLines={1}>{item.planName}</Text>
          <View style={styles.timeRow}>
            <Icon name="receipt-outline" size={11} color={colors.textMuted} />
            <Text style={styles.receipt}>
              {item.receiptNo} · {timeAgo(item.createdAt)}
              {item.status === 'pending' ? ` · waiting ${waitingFor(item.createdAt)}` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.price}>{formatNpr(item.price)}</Text>
          <StatusPill status={item.status} />
        </View>
      </View>

      <View style={styles.details}>
        <Detail styles={styles} colors={colors} icon="person" label="User" value={[item.user?.name, item.user?.phone].filter(Boolean).join(' · ') || 'Unknown'} />
        <Detail styles={styles} colors={colors} icon="card" label="Method" value={item.methodLabel || item.method} />
        {item.reference ? <Detail styles={styles} colors={colors} icon="pricetag" label="Reference" value={item.reference} /> : null}
        <Detail styles={styles} colors={colors} icon="calendar" label="Duration" value={`${item.durationDays || 0} days`} />
        {item.note ? <Detail styles={styles} colors={colors} icon="document-text" label="Note" value={item.note} /> : null}
        {item.rejectReason ? <Detail styles={styles} colors={colors} icon="close-circle" label="Reason" value={item.rejectReason} /> : null}
        {item.reviewedBy ? <Detail styles={styles} colors={colors} icon="shield-checkmark" label="Reviewed by" value={item.reviewedBy} /> : null}
      </View>

      <MetaRow>
        <MetaChip icon="calendar" label={formatDateTime(item.createdAt)} />
        {item.gatewayMode === 'sandbox' ? <MetaChip icon="flask" tone="warning" label="Test payment" /> : null}
      </MetaRow>

      {item.status === 'pending' ? (
        <AdminActions
          actions={[
            { label: 'Approve', icon: 'checkmark-circle', tone: 'success', solid: true, onPress: () => approve(item) },
            { label: 'Reject', icon: 'close-circle', tone: 'error', onPress: () => reject(item) },
          ]}
        />
      ) : null}
    </AdminCard>
  );

  return (
    <View style={styles.container}>
      <AdminList
        list={list}
        renderItem={renderItem}
        emptyIcon="wallet"
        emptyTitle={status === 'pending' ? 'No payments waiting' : 'Nothing here'}
        emptyBody="Plan purchase requests from users show up here."
        header={
          <>
            <AdminHeader icon="wallet" title="Payments" subtitle="Plan purchases and receipts" onBack={() => navigation.goBack()}>
              <View style={styles.revenueRow}>
                <Reanimated.View entering={enterCard(0, 60)} style={styles.revenueBox}>
                  <View style={styles.revenueIcon}>
                    <Icon name="trending-up" size={14} color={colors.primary} />
                  </View>
                  <CountUp value={revenue.amount30d || 0} format={formatNpr} style={styles.revenueValue} />
                  <Text style={styles.revenueLabel}>Last 30 days</Text>
                </Reanimated.View>
                <Reanimated.View entering={enterCard(1, 60)} style={styles.revenueBox}>
                  <View style={styles.revenueIcon}>
                    <Icon name="cash" size={14} color={colors.primary} />
                  </View>
                  <CountUp value={revenue.amount || 0} format={formatNpr} style={styles.revenueValue} />
                  <Text style={styles.revenueLabel}>All time · {revenue.count || 0} paid</Text>
                </Reanimated.View>
              </View>
            </AdminHeader>
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search name, phone or receipt" />
            <AdminChips
              options={STATUSES.map((s) => ({ ...s, count: counts[s.value] || 0 }))}
              value={status}
              onChange={setStatus}
            />
          </>
        }
      />
      {prompt}
    </View>
  );
}

function Detail({ styles, colors, icon, label, value }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailHead}>
        <Icon name={`${icon}-outline`} size={12} color={colors.textMuted} />
        <Text style={styles.detailLabel}>{label}</Text>
      </View>
      <Text style={styles.detailValue} selectable>{value}</Text>
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background, experimental_backgroundImage: colors.canvas },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen, boxShadow: colors.clayTint },
  plan: { fontSize: 14, fontWeight: '800', color: colors.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 },
  receipt: { flexShrink: 1, fontSize: 10.5, fontWeight: '700', color: colors.textMuted },
  priceCol: { alignItems: 'flex-end', gap: 4 },
  price: { fontSize: 15, fontWeight: '900', color: colors.primary },
  details: { marginTop: 10, gap: 5, padding: 10, borderRadius: 14, backgroundColor: colors.backgroundSecondary, boxShadow: colors.clayPressed },
  detailRow: { flexDirection: 'row', gap: 8 },
  detailHead: { width: 96, flexDirection: 'row', alignItems: 'center', gap: 4 },
  detailLabel: { fontSize: 11.5, fontWeight: '700', color: colors.textMuted },
  detailValue: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.textSecondary },
  revenueRow: { flexDirection: 'row', gap: 12, marginTop: 16, marginBottom: 6 },
  revenueBox: { flex: 1, padding: 12, borderRadius: 20, backgroundColor: colors.card, boxShadow: colors.clay },
  revenueIcon: {
    width: 26,
    height: 26,
    marginBottom: 6,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.pastelGreen,
    boxShadow: colors.clayTint,
  },
  revenueValue: { fontSize: 17, fontWeight: '900', color: colors.text },
  revenueLabel: { marginTop: 2, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textMuted },
});
