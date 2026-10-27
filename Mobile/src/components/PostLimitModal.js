import { Modal, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';
import { timeUntil } from '../hooks/usePostQuota';

/** Shown when the daily post limit is used up: what happened, when it frees up, and how to get more. */
export default function PostLimitModal({ visible, quota, onClose, onSeePlans, onContact }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (!quota) return null;

  const limit = quota.limit || 0;
  const wait = timeUntil(quota.resetsAt) || '24h';
  const custom = quota.source === 'custom';
  const onPlan = quota.source === 'plan' && quota.plan;
  const lead = custom
    ? `KinBech set your account to ${limit} post${limit === 1 ? '' : 's'} a day.`
    : onPlan
      ? `Your ${quota.plan.name} plan includes ${limit} post${limit === 1 ? '' : 's'} a day, and you have used them all.`
      : `You have posted ${limit} item${limit === 1 ? '' : 's'} in the last 24 hours, the most allowed for free.`;

  const rows = [
    { icon: 'time-outline', tint: colors.info, title: `Next free post in ${wait}`, sub: 'Each post frees up 24 hours after you posted it.' },
    custom
      ? { icon: 'chatbubbles-outline', tint: colors.primary, title: 'Need more?', sub: 'Message KinBech support to change your limit.' }
      : { icon: 'rocket-outline', tint: colors.primary, title: onPlan ? 'Need more posts?' : 'Post more with a plan', sub: onPlan ? 'Pick a bigger plan for more posts every day.' : 'Plans give you more posts every day. Pay with eSewa, Khalti, IME Pay or bank.' },
  ];
  if (quota.hints?.length) {
    rows.push({ icon: 'shield-checkmark-outline', tint: colors.warning, title: 'Or raise your free limit', sub: `${quota.hints[0][0].toUpperCase()}${quota.hints.slice(0, 2).join(' or ').slice(1)}.` });
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <LinearGradient colors={['#064E3B', colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroCircleLg} pointerEvents="none" />
            <View style={styles.heroCircleSm} pointerEvents="none" />
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Close">
              <Icon name="close" size={18} color="#FFFFFF" />
            </Pressable>
            <View style={styles.badgeGlow}>
              <View style={styles.badge}>
                <Icon name="hourglass-outline" size={30} color={colors.gradientStart} />
              </View>
            </View>
            <Text style={styles.heroTitle}>Today's posts are used up</Text>
            <View style={styles.meter}>
              <View style={styles.meterTrack}>
                <View style={styles.meterFill} />
              </View>
              <Text style={styles.meterText}>{quota.used ?? limit} / {limit} used</Text>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            <Text style={styles.lead}>{lead}</Text>
            {rows.map((row) => (
              <View key={row.title} style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: `${row.tint}1A` }]}>
                  <Icon name={row.icon} size={18} color={row.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>{row.title}</Text>
                  <Text style={styles.infoSub}>{row.sub}</Text>
                </View>
              </View>
            ))}

            <Pressable
              onPress={custom ? onContact : onSeePlans}
              style={({ pressed }) => [styles.primaryWrap, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
                <Icon name={custom ? 'chatbubbles' : 'rocket'} size={18} color="#FFFFFF" />
                <Text style={styles.primaryText}>{custom ? 'Contact support' : 'See plans'}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable onPress={onClose} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
              <Text style={styles.secondaryText}>Maybe later</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 22,
  },
  sheet: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 14,
  },
  hero: { alignItems: 'center', paddingTop: 26, paddingBottom: 20, paddingHorizontal: 20, overflow: 'hidden' },
  heroCircleLg: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    top: -110,
    right: -70,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  heroCircleSm: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -60,
    left: -40,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  close: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  badgeGlow: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  badge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  heroTitle: { marginTop: 14, fontSize: 20, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  meter: { marginTop: 14, width: '100%', alignItems: 'center', gap: 6 },
  meterTrack: { width: '70%', height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden' },
  meterFill: { width: '100%', height: 8, borderRadius: 4, backgroundColor: '#FBBF24' },
  meterText: { fontSize: 12, fontWeight: '800', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.3 },
  body: { padding: 20, gap: 12 },
  lead: { fontSize: 14.5, lineHeight: 21, color: colors.textSecondary, textAlign: 'center', marginBottom: 2 },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  infoIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  infoTitle: { fontSize: 14, fontWeight: '800', color: colors.text },
  infoSub: { marginTop: 2, fontSize: 12, lineHeight: 17, color: colors.textMuted },
  primaryWrap: { marginTop: 4, borderRadius: 16, overflow: 'hidden' },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
  },
  primaryText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { fontSize: 14.5, fontWeight: '700', color: colors.textMuted },
});
