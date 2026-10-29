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
  StatusPill,
  confirmAction,
  showAdminError,
  useAdminList,
  useDebouncedValue,
  usePrompt,
} from '../../components/admin/AdminKit';
import { api } from '../../services/api';
import { useTheme, useThemedStyles } from '../../theme';
import { formatDateTime, formatNpr } from '../../utils/admin';

const STATUSES = ['pending', 'approved', 'rejected', 'failed', 'cancelled'];

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
        <View style={styles.icon}>
          <Icon name="wallet" size={18} color={colors.primary} />
        </View>
        <View style={styles.flex1}>
          <Text style={styles.plan} numberOfLines={1}>{item.planName}</Text>
          <Text style={styles.receipt}>{item.receiptNo} · {formatDateTime(item.createdAt)}</Text>
        </View>
        <Text style={styles.price}>{formatNpr(item.price)}</Text>
      </View>

      <View style={styles.details}>
        <Detail styles={styles} label="User" value={[item.user?.name, item.user?.phone].filter(Boolean).join(' · ') || 'Unknown'} />
        <Detail styles={styles} label="Method" value={item.methodLabel || item.method} />
        {item.reference ? <Detail styles={styles} label="Reference" value={item.reference} /> : null}
        <Detail styles={styles} label="Duration" value={`${item.durationDays || 0} days`} />
        {item.note ? <Detail styles={styles} label="Note" value={item.note} /> : null}
        {item.rejectReason ? <Detail styles={styles} label="Reason" value={item.rejectReason} /> : null}
        {item.reviewedBy ? <Detail styles={styles} label="Reviewed by" value={item.reviewedBy} /> : null}
      </View>

      <View style={styles.footer}>
        <StatusPill status={item.status} />
        {item.gatewayMode === 'sandbox' ? <StatusPill status="none" label="Test payment" /> : null}
      </View>

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
            <AdminHeader title="Payments" subtitle="Plan purchases and receipts" onBack={() => navigation.goBack()}>
              <View style={styles.revenueRow}>
                <View style={styles.revenueBox}>
                  <Text style={styles.revenueValue}>{formatNpr(revenue.amount30d)}</Text>
                  <Text style={styles.revenueLabel}>Last 30 days</Text>
                </View>
                <View style={styles.revenueBox}>
                  <Text style={styles.revenueValue}>{formatNpr(revenue.amount)}</Text>
                  <Text style={styles.revenueLabel}>All time · {revenue.count || 0} paid</Text>
                </View>
              </View>
            </AdminHeader>
            <AdminSearch value={query} onChangeText={setQuery} placeholder="Search name, phone or receipt" />
            <AdminChips
              options={STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1), count: counts[s] || 0 }))}
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

function Detail({ styles, label, value }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>{value}</Text>
    </View>
  );
}

const createStyles = (colors) => ({
  container: { flex: 1, backgroundColor: colors.background },
  flex1: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pastelGreen },
  plan: { fontSize: 15, fontWeight: '800', color: colors.text },
  receipt: { marginTop: 1, fontSize: 11.5, color: colors.textMuted },
  price: { fontSize: 16, fontWeight: '800', color: colors.primary },
  details: { marginTop: 10, gap: 5, padding: 10, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  detailRow: { flexDirection: 'row', gap: 10 },
  detailLabel: { width: 82, fontSize: 12, fontWeight: '600', color: colors.textMuted },
  detailValue: { flex: 1, fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },
  footer: { flexDirection: 'row', gap: 8, marginTop: 10 },
  revenueRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  revenueBox: { flex: 1, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  revenueValue: { fontSize: 17, fontWeight: '800', color: colors.white },
  revenueLabel: { marginTop: 2, fontSize: 11.5, fontWeight: '600', color: 'rgba(255,255,255,0.75)' },
});
