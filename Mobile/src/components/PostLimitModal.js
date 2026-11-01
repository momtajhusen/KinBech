import { useEffect } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  FadeIn,
  FadeInDown,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Pulse, Reanimated, Shimmer, Wiggle } from './Motion';
import { callHaptic } from '../services/callHaptics';
import { useTheme, useThemedStyles } from '../theme';
import { timeUntil } from '../hooks/usePostQuota';

function cardIn() {
  'worklet';
  const spring = { damping: 16, stiffness: 170, mass: 0.8 };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 60 }, { scale: 0.92 }] },
    animations: {
      opacity: withTiming(1, { duration: 200 }),
      transform: [{ translateY: withSpring(0, spring) }, { scale: withSpring(1, spring) }],
    },
  };
}

/** Shown when the daily post limit is used up: what happened, when it frees up, and how to get more. */
export default function PostLimitModal({ visible, quota, onClose, ...rest }) {
  if (!quota) return null;
  return (
    <Modal visible={!!visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {visible ? <LimitContent quota={quota} onClose={onClose} {...rest} /> : null}
    </Modal>
  );
}

function LimitContent({ quota, onClose, onSeePlans, onContact }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const fill = useSharedValue(0);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  useEffect(() => {
    callHaptic('remoteEnd');
    fill.value = withDelay(260, withTiming(1, { duration: 700 }));
  }, [fill]);

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
    <Reanimated.View entering={FadeIn.duration(200)} style={styles.overlay}>
      <Pressable style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} onPress={onClose} />
      <Reanimated.View entering={cardIn} style={styles.sheet}>
          <LinearGradient colors={['#064E3B', colors.gradientStart, colors.gradientEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <View style={styles.heroCircleLg} pointerEvents="none" />
            <View style={styles.heroCircleSm} pointerEvents="none" />
            <Pressable onPress={onClose} hitSlop={10} style={styles.close} accessibilityLabel="Close">
              <Icon name="close" size={18} color="#FFFFFF" />
            </Pressable>
            <Reanimated.View entering={ZoomIn.delay(100).duration(320)}>
              <Pulse to={1.08} pause={1500} style={styles.badgeGlow}>
                <View style={styles.badge}>
                  <Wiggle angle={16} every={2600} delay={500}>
                    <Icon name="hourglass-outline" size={30} color={colors.gradientStart} />
                  </Wiggle>
                </View>
              </Pulse>
            </Reanimated.View>
            <Text style={styles.heroTitle}>Today's posts are used up</Text>
            <View style={styles.meter}>
              <View style={styles.meterTrack}>
                <Reanimated.View style={[styles.meterFill, fillStyle]} />
              </View>
              <Text style={styles.meterText}>{quota.used ?? limit} / {limit} used</Text>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            <Text style={styles.lead}>{lead}</Text>
            {rows.map((row, index) => (
              <Reanimated.View key={row.title} entering={FadeInDown.delay(160 + index * 70).duration(300)} style={styles.infoRow}>
                <View style={[styles.infoIcon, { backgroundColor: `${row.tint}1A` }]}>
                  <Icon name={row.icon} size={18} color={row.tint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoTitle}>{row.title}</Text>
                  <Text style={styles.infoSub}>{row.sub}</Text>
                </View>
              </Reanimated.View>
            ))}

            <Reanimated.View entering={FadeInDown.delay(160 + rows.length * 70).duration(300)}>
              <PressableScale style={styles.primaryWrap} scaleTo={0.97} onPress={custom ? onContact : onSeePlans}>
                <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primary}>
                  <Shimmer />
                  <Icon name={custom ? 'chatbubbles' : 'rocket'} size={18} color="#FFFFFF" />
                  <Text style={styles.primaryText}>{custom ? 'Contact support' : 'See plans'}</Text>
                </LinearGradient>
              </PressableScale>
              <Pressable onPress={onClose} style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.7 }]}>
                <Text style={styles.secondaryText}>Maybe later</Text>
              </Pressable>
            </Reanimated.View>
          </View>
      </Reanimated.View>
    </Reanimated.View>
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
  meterFill: { height: 8, borderRadius: 4, backgroundColor: '#FBBF24' },
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
    overflow: 'hidden',
  },
  primaryText: { fontSize: 16, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.3 },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { fontSize: 14.5, fontWeight: '700', color: colors.textMuted },
});
