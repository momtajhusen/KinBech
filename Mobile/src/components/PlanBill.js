import { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';

export const npr = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

export const billDate = (value, withTime = false) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString('en-NP', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
    });
  } catch (_) {
    return '';
  }
};

export function billStatus(status, colors) {
  switch (status) {
    case 'approved':
      return { label: 'Paid', icon: 'checkmark-circle', color: colors.success };
    case 'pending':
      return { label: 'Under review', icon: 'time', color: colors.warning };
    case 'rejected':
      return { label: 'Not approved', icon: 'close-circle', color: colors.error };
    case 'failed':
      return { label: 'Failed', icon: 'alert-circle', color: colors.error };
    default:
      return { label: 'Cancelled', icon: 'remove-circle', color: colors.textMuted };
  }
}

const paidWith = (bill) =>
  bill.gateway ? `${bill.methodLabel} online${bill.gatewayMode === 'sandbox' ? ' (test)' : ''}` : bill.methodLabel;

function receiptText(bill) {
  const lines = [
    'KinBech plan receipt',
    `Bill no: ${bill.receiptNo}`,
    `Date: ${billDate(bill.createdAt, true)}`,
    `Plan: ${bill.planName} (${bill.durationDays} days)`,
    bill.startsAt && bill.endsAt ? `Valid: ${billDate(bill.startsAt)} to ${billDate(bill.endsAt)}` : null,
    `Amount: ${npr(bill.price)}`,
    `Paid with: ${paidWith(bill)}`,
    bill.gatewayRef ? `eSewa ref: ${bill.gatewayRef}` : `Transaction ID: ${bill.reference}`,
    `Status: ${billStatus(bill.status, {}).label}`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** One bill in a list. */
export function BillRow({ bill, onPress, last }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const meta = billStatus(bill.status, colors);
  return (
    <Pressable onPress={() => onPress(bill)} style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { opacity: 0.7 }]}>
      <View style={[styles.rowIcon, { backgroundColor: `${meta.color}1A` }]}>
        <Icon name={meta.icon} size={20} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{bill.planName}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {billDate(bill.createdAt)} · {paidWith(bill)}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowAmount, bill.status !== 'approved' && styles.rowAmountMuted]}>{npr(bill.price)}</Text>
        <Text style={[styles.rowStatus, { color: meta.color }]}>{meta.label}</Text>
      </View>
    </Pressable>
  );
}

function Line({ label, value, styles, mono }) {
  if (!value) return null;
  return (
    <View style={styles.line}>
      <Text style={styles.lineLabel}>{label}</Text>
      <Text style={[styles.lineValue, mono && styles.mono]} selectable>{value}</Text>
    </View>
  );
}

/** Bill detail, styled as a receipt, with copy and share. */
export function ReceiptSheet({ bill, onClose }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  if (!bill) return null;
  const meta = billStatus(bill.status, colors);
  const paid = bill.status === 'approved';

  const copy = async () => {
    await Clipboard.setStringAsync(bill.receiptNo);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const share = async () => {
    try {
      await Share.share({ message: receiptText(bill) });
    } catch {
      /* ignore cancel */
    }
  };

  const explain = {
    pending: 'We are checking this payment. You get a notification when the plan is on.',
    rejected: bill.rejectReason ? `Reason: ${bill.rejectReason}` : 'This payment was not approved.',
    failed: 'The payment did not go through. No money was taken.',
    cancelled: 'You cancelled this request.',
  }[bill.status];

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.handle} />
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
          <View style={styles.ticket}>
            <LinearGradient
              colors={paid ? ['#064E3B', colors.gradientStart] : [`${meta.color}`, `${meta.color}CC`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.ticketHead}
            >
              <View style={styles.ticketBadge}>
                <Icon name={meta.icon} size={26} color={meta.color} />
              </View>
              <Text style={styles.ticketStatus}>{paid ? 'Payment successful' : meta.label}</Text>
              <Text style={styles.ticketAmount}>{npr(bill.price)}</Text>
              <Text style={styles.ticketBrand}>KinBech · {bill.planName}</Text>
            </LinearGradient>

            <View style={styles.notchRow}>
              <View style={[styles.notch, styles.notchLeft]} />
              <View style={styles.dash} />
              <View style={[styles.notch, styles.notchRight]} />
            </View>

            <View style={styles.ticketBody}>
              <Line label="Bill no" value={bill.receiptNo} styles={styles} mono />
              <Line label="Date" value={billDate(bill.createdAt, true)} styles={styles} />
              <Line label="Plan" value={`${bill.planName} · ${bill.durationDays} days`} styles={styles} />
              {paid && bill.startsAt ? (
                <Line label="Valid" value={`${billDate(bill.startsAt)} – ${billDate(bill.endsAt)}`} styles={styles} />
              ) : null}
              <Line label="Paid with" value={paidWith(bill)} styles={styles} />
              <Line label={bill.gateway ? 'eSewa ref' : 'Transaction ID'} value={bill.gatewayRef || bill.reference} styles={styles} mono />
              {bill.reviewedAt && !bill.gateway ? <Line label="Checked" value={billDate(bill.reviewedAt, true)} styles={styles} /> : null}
              {explain ? (
                <View style={[styles.explain, { backgroundColor: `${meta.color}12`, borderColor: `${meta.color}40` }]}>
                  <Icon name="information-circle-outline" size={16} color={meta.color} />
                  <Text style={styles.explainText}>{explain}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={copy} style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.8 }]}>
              <Icon name={copied ? 'checkmark' : 'copy-outline'} size={16} color={colors.primary} />
              <Text style={styles.actionText}>{copied ? 'Copied' : 'Copy bill no'}</Text>
            </Pressable>
            <Pressable onPress={share} style={({ pressed }) => [styles.actionBtn, styles.actionPrimary, pressed && { opacity: 0.85 }]}>
              <Icon name="share-social-outline" size={16} color="#FFFFFF" />
              <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Share receipt</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} hitSlop={8} style={styles.close}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  rowSub: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  rowAmount: { fontSize: 15, fontWeight: '900', color: colors.text },
  rowAmountMuted: { color: colors.textMuted, textDecorationLine: 'line-through' },
  rowStatus: { marginTop: 2, fontSize: 11.5, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    maxHeight: '90%',
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.background,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12, backgroundColor: colors.border },
  ticket: { borderRadius: 22, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ticketHead: { alignItems: 'center', paddingTop: 22, paddingBottom: 20, paddingHorizontal: 16 },
  ticketBadge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  ticketStatus: { marginTop: 10, fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.3 },
  ticketAmount: { marginTop: 2, fontSize: 32, fontWeight: '900', color: '#FFFFFF' },
  ticketBrand: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
  notchRow: { flexDirection: 'row', alignItems: 'center', height: 20 },
  notch: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.background },
  notchLeft: { marginLeft: -10 },
  notchRight: { marginRight: -10 },
  dash: { flex: 1, height: 1, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.border, marginHorizontal: 6 },
  ticketBody: { paddingHorizontal: 16, paddingBottom: 16, gap: 11 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  lineLabel: { width: 96, fontSize: 12.5, fontWeight: '600', color: colors.textMuted },
  lineValue: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.text, textAlign: 'right' },
  mono: { fontFamily: 'monospace', fontSize: 12.5 },
  explain: { flexDirection: 'row', gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, marginTop: 2 },
  explainText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.text },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  actionPrimary: { backgroundColor: colors.primary },
  actionText: { fontSize: 14, fontWeight: '800', color: colors.primary },
  close: { alignSelf: 'center', paddingVertical: 4 },
  closeText: { fontSize: 13.5, fontWeight: '700', color: colors.textMuted },
});
