import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';
import { timeUntil } from '../hooks/usePostQuota';

const MAX_DOTS = 10;

/** "3 of 5 posts left today" strip at the top of the Sell screens. Hidden when there is no limit. */
export default function PostQuotaBanner({ quota, onUpgrade }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  if (!quota) return null;

  if (quota.unlimited) {
    if (!quota.plan) return null;
    return (
      <View style={[styles.card, styles.planCard]}>
        <View style={[styles.icon, { backgroundColor: colors.glow }]}>
          <Icon name="rocket" size={16} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{quota.plan.name} plan</Text>
          <Text style={styles.sub}>Unlimited posts until {new Date(quota.plan.endsAt).toDateString()}</Text>
        </View>
      </View>
    );
  }

  const { limit, used, remaining } = quota;
  const out = remaining <= 0;
  const low = !out && remaining <= Math.max(1, Math.floor(limit * 0.2));
  const tone = out ? colors.error : low ? colors.warning : colors.primary;
  const wait = timeUntil(quota.resetsAt);
  const canUpgrade = quota.source !== 'custom';
  const showDots = limit <= MAX_DOTS;

  return (
    <View style={[styles.card, out && styles.cardOut]}>
      <View style={styles.row}>
        <View style={[styles.icon, { backgroundColor: `${tone}1F` }]}>
          <Icon name={out ? 'lock-closed' : 'flash'} size={16} color={tone} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {out ? 'Daily post limit reached' : (
              <>
                <Text style={{ color: tone }}>{remaining}</Text>
                {` of ${limit} post${limit === 1 ? '' : 's'} left today`}
              </>
            )}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {out
              ? `Next free post in ${wait || '24h'}`
              : quota.source === 'plan' && quota.plan
                ? `${quota.plan.name} plan · resets 24h after each post`
                : 'Each post frees up again 24h after you post it'}
          </Text>
        </View>
        {canUpgrade ? (
          <Pressable onPress={onUpgrade} hitSlop={6} style={({ pressed }) => [pressed && { opacity: 0.8 }]}>
            <LinearGradient colors={out ? ['#F59E0B', '#EA580C'] : colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.cta}>
              <Icon name="rocket-outline" size={13} color="#FFFFFF" />
              <Text style={styles.ctaText}>{out ? 'Upgrade' : 'Get more'}</Text>
            </LinearGradient>
          </Pressable>
        ) : null}
      </View>

      {showDots ? (
        <View style={styles.dots}>
          {Array.from({ length: limit }).map((_, index) => (
            <View key={index} style={[styles.dot, { backgroundColor: index < used ? tone : colors.border }]} />
          ))}
        </View>
      ) : (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.min(100, (used / limit) * 100)}%`, backgroundColor: tone }]} />
        </View>
      )}
    </View>
  );
}

const createStyles = (colors) => ({
  card: {
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 11,
    paddingHorizontal: 11,
    gap: 10,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardOut: {
    borderColor: `${colors.error}55`,
    backgroundColor: `${colors.error}0D`,
  },
  planCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  sub: { marginTop: 1, fontSize: 11.5, color: colors.textMuted },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  ctaText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 6, borderRadius: 3 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
