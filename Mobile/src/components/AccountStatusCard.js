import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';
import { timeUntil } from '../hooks/usePostQuota';

const shortDate = (value) => {
  try {
    return new Date(value).toLocaleDateString('en-NP', { day: 'numeric', month: 'short' });
  } catch (_) {
    return '';
  }
};

function quotaRows(status) {
  const rows = [];
  if (status?.quota?.individual) rows.push({ key: 'individual', label: 'Individual', icon: 'person-outline', quota: status.quota.individual });
  if (status?.hasShop && status?.quota?.shop) rows.push({ key: 'shop', label: 'Store', icon: 'storefront-outline', quota: status.quota.shop });
  return rows;
}

const isOut = (quota) => Boolean(quota && !quota.unlimited && quota.remaining <= 0);

function quotaShort(quota) {
  if (quota.unlimited) return 'Unlimited';
  return `${quota.remaining}/${quota.limit} left`;
}

/** Things that limit the account right now, worst first. */
function accountIssues(user, rows) {
  const issues = [];
  const chatUntil = user?.chatRestrictedUntil ? new Date(user.chatRestrictedUntil) : null;
  if (chatUntil && chatUntil.getTime() > Date.now()) {
    issues.push({ tone: 'error', icon: 'chatbubble-ellipses-outline', text: `Chat is paused until ${shortDate(chatUntil)}${user.restrictionReason ? `: ${user.restrictionReason}` : ''}` });
  }
  if (user?.strikeCount) {
    issues.push({
      tone: 'error',
      icon: 'warning-outline',
      text: `${user.strikeCount === 1 ? '1 warning' : `${user.strikeCount} warnings`} on your account. Another one can pause it.`,
    });
  }
  if (rows.some((row) => row.quota.source === 'watch')) {
    issues.push({ tone: 'warning', icon: 'eye-outline', text: 'Posting is limited while we review your account.' });
  }
  const fresh = rows.find((row) => row.quota.source === 'new_account');
  if (fresh) {
    const hints = fresh.quota.hints?.length ? fresh.quota.hints.join(', ') : 'build some history';
    issues.push({ tone: 'warning', icon: 'leaf-outline', text: `New account limit. To post more: ${hints}.` });
  }
  return issues;
}

function standing(issues) {
  if (issues.some((issue) => issue.tone === 'error')) return { label: 'Needs attention', tone: 'error', icon: 'alert-circle' };
  if (issues.length) return { label: 'Limited', tone: 'warning', icon: 'time' };
  return { label: 'Good standing', tone: 'success', icon: 'shield-checkmark' };
}

/** Tiny "Free · 2/3" pill for gradient headers. Shows the tightest daily limit. */
export function PlanPill({ status, onPress, style }) {
  const styles = useThemedStyles(createStyles);
  if (!status) return null;
  const sub = status.subscription;
  const rows = quotaRows(status);
  if (!rows.length || rows.some((row) => row.quota.source === 'staff')) return null;
  const tight = rows.reduce((worst, row) => {
    if (row.quota.unlimited) return worst;
    if (!worst || row.quota.remaining < worst.quota.remaining) return row;
    return worst;
  }, null);
  const out = Boolean(tight && isOut(tight.quota));
  const left = tight ? `${tight.quota.remaining}/${tight.quota.limit}` : '∞';
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, out && styles.pillOut, style, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={`${sub ? sub.name : 'Free'} plan, ${left} posts left today`}
    >
      <Icon name={out ? 'lock-closed' : sub ? 'rocket' : 'flash'} size={11} color="#FFFFFF" />
      <Text style={styles.pillText} numberOfLines={1}>
        {sub ? sub.name : 'Free'} · {left}
      </Text>
      <Icon name="chevron-forward" size={10} color="rgba(255,255,255,0.85)" />
    </Pressable>
  );
}

/**
 * Plan + posts left today + account standing.
 * `compact` is the one-line strip for Home; the full card sits on Profile.
 */
export default function AccountStatusCard({ status, user, compact, onOpenPlans }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (!status) return null;

  const sub = status.subscription;
  const pending = status.pending;
  const rows = quotaRows(status);
  const issues = accountIssues(user, rows);
  const stand = standing(issues);
  const standColor = colors[stand.tone];
  const outRow = rows.find((row) => isOut(row.quota));
  const allOut = rows.length > 0 && rows.every((row) => isOut(row.quota));
  const staff = rows.some((row) => row.quota.source === 'staff');
  const planTitle = sub ? `${sub.name} plan` : 'Free plan';
  if (compact) {
    const tone = allOut ? colors.error : outRow ? colors.warning : colors.primary;
    const line = pending
      ? `Payment for ${pending.planName} is under review`
      : allOut
        ? `Daily limit reached · next post in ${timeUntil(outRow.quota.resetsAt) || '24h'}`
        : rows.map((row) => `${row.label} ${quotaShort(row.quota)}`).join(' · ');
    return (
      <Pressable onPress={onOpenPlans} style={({ pressed }) => [styles.strip, allOut && styles.stripOut, pressed && { opacity: 0.85 }]}>
        <View style={[styles.stripIcon, { backgroundColor: `${tone}1A` }]}>
          <Icon name={allOut ? 'lock-closed' : sub ? 'rocket' : 'flash'} size={17} color={tone} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.stripTitleRow}>
            <Text style={styles.stripTitle} numberOfLines={1}>{sub ? sub.name : 'Free plan'}</Text>
            <View style={[styles.dotPill, { backgroundColor: `${standColor}1A` }]}>
              <Icon name={stand.icon} size={10} color={standColor} />
              <Text style={[styles.dotPillText, { color: standColor }]}>{stand.label}</Text>
            </View>
          </View>
          <Text style={styles.stripSub} numberOfLines={1}>{line}</Text>
        </View>
        {staff ? null : (
          <LinearGradient
            colors={allOut ? ['#F59E0B', '#EA580C'] : colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.stripCta}
          >
            <Text style={styles.stripCtaText}>{sub ? 'Plans' : 'Upgrade'}</Text>
            <Icon name="chevron-forward" size={12} color="#FFFFFF" />
          </LinearGradient>
        )}
      </Pressable>
    );
  }

  const daysText = sub ? `${sub.daysLeft} day${sub.daysLeft === 1 ? '' : 's'} left` : null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <LinearGradient
          colors={sub ? ['#064E3B', colors.gradientStart] : [colors.glow, colors.glow]}
          style={styles.planIcon}
        >
          <Icon name={sub ? 'rocket' : 'leaf-outline'} size={16} color={sub ? '#FFFFFF' : colors.primary} />
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.planTitle} numberOfLines={1}>{planTitle}</Text>
          <View style={styles.standRow}>
            <Icon name={stand.icon} size={11} color={standColor} />
            <Text style={[styles.standText, { color: standColor }]} numberOfLines={1}>
              {stand.label}
              {daysText ? <Text style={styles.planSub}>{`  ·  ${daysText}`}</Text> : null}
            </Text>
          </View>
        </View>
        {staff ? null : (
          <Pressable onPress={onOpenPlans} hitSlop={6} style={({ pressed }) => pressed && { opacity: 0.85 }}>
            <LinearGradient
              colors={allOut ? ['#F59E0B', '#EA580C'] : colors.gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.headCta}
            >
              <Text style={styles.headCtaText}>{sub ? 'Plans' : 'Upgrade'}</Text>
              <Icon name="chevron-forward" size={12} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        )}
      </View>

      {rows.length ? (
        <View style={styles.quotaBox}>
          {rows.map((row) => {
            const { quota } = row;
            const out = isOut(quota);
            const low = !out && !quota.unlimited && quota.remaining <= Math.max(1, Math.floor(quota.limit * 0.2));
            const tone = out ? colors.error : low ? colors.warning : colors.primary;
            const used = quota.unlimited ? 0 : Math.max(0, quota.limit - quota.remaining);
            const pct = quota.unlimited ? 0 : Math.min(100, (used / Math.max(1, quota.limit)) * 100);
            const value = quota.unlimited
              ? 'Unlimited'
              : out
                ? `Next in ${timeUntil(quota.resetsAt) || '24h'}`
                : `${quota.remaining}/${quota.limit} left`;
            return (
              <View key={row.key} style={styles.quotaRow}>
                <Icon name={row.icon} size={13} color={colors.textMuted} />
                <Text style={styles.quotaLabel} numberOfLines={1}>{row.label}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tone }]} />
                </View>
                <Text style={[styles.quotaValue, { color: tone }]} numberOfLines={1}>{value}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      {pending ? (
        <View style={[styles.issue, { backgroundColor: `${colors.warning}12` }]}>
          <Icon name="hourglass-outline" size={13} color={colors.warning} />
          <Text style={styles.issueText} numberOfLines={1}>{pending.planName} payment under review</Text>
        </View>
      ) : null}

      {issues.map((issue) => (
        <View key={issue.text} style={[styles.issue, { backgroundColor: `${colors[issue.tone]}10` }]}>
          <Icon name={issue.icon} size={13} color={colors[issue.tone]} />
          <Text style={styles.issueText} numberOfLines={2}>{issue.text}</Text>
        </View>
      ))}
    </View>
  );
}

const createStyles = (colors) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: 150,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  pillOut: { backgroundColor: '#EA580C', borderColor: 'rgba(255,255,255,0.45)' },
  pillText: { flexShrink: 1, fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stripOut: { borderColor: `${colors.error}55`, backgroundColor: `${colors.error}0D` },
  stripIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stripTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stripTitle: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  stripSub: { marginTop: 2, fontSize: 12, color: colors.textMuted },
  dotPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  dotPillText: { fontSize: 10, fontWeight: '800' },
  stripCta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 11, paddingRight: 8, paddingVertical: 7, borderRadius: 999 },
  stripCtaText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  card: { padding: 12, gap: 10, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  planIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  planTitle: { fontSize: 14.5, fontWeight: '900', color: colors.text },
  planSub: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  standRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 1 },
  standText: { flexShrink: 1, fontSize: 11, fontWeight: '800' },
  headCta: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 11, paddingRight: 8, paddingVertical: 6, borderRadius: 999 },
  headCtaText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  quotaBox: { gap: 8, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surfaceMuted },
  quotaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  quotaLabel: { width: 72, fontSize: 12, fontWeight: '700', color: colors.text },
  quotaValue: { minWidth: 58, textAlign: 'right', fontSize: 12, fontWeight: '900' },
  track: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  issue: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  issueText: { flex: 1, fontSize: 11.5, lineHeight: 16, color: colors.text },
});
