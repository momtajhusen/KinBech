import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';

/** Gradient page header with an icon badge, title, subtitle, optional right action and a slot below (stats, tips). */
export default function HeroHeader({ title, subtitle, icon, onBack, right, children }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fill}
        pointerEvents="none"
      />
      <View style={styles.glowLarge} pointerEvents="none" />
      <View style={styles.glowSmall} pointerEvents="none" />

      <View style={styles.topRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={10} style={styles.navBtn} accessibilityLabel="Go back">
            <Icon name="chevron-back" size={22} color={colors.white} />
          </Pressable>
        ) : null}
        <View style={styles.flex1} />
        {right}
      </View>

      <View style={styles.titleRow}>
        {icon ? (
          <View style={styles.iconBadge}>
            <Icon name={icon} size={24} color={colors.white} />
          </View>
        ) : null}
        <View style={styles.flex1}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        </View>
      </View>

      {children ? <View style={styles.slot}>{children}</View> : null}
    </View>
  );
}

/** Small translucent stat used inside HeroHeader. */
export function HeroStat({ icon, value, label }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.stat}>
      <View style={styles.statTop}>
        <Icon name={icon} size={13} color="rgba(255,255,255,0.9)" />
        <Text style={styles.statValue} numberOfLines={1}>{value}</Text>
      </View>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Translucent round button for the HeroHeader `right` slot. */
export function HeroAction({ icon, onPress, label }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.navBtn} accessibilityLabel={label}>
      <Icon name={icon} size={21} color={colors.white} />
    </Pressable>
  );
}

const createStyles = (colors) => ({
  flex1: { flex: 1 },
  header: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
    overflow: 'hidden',
    backgroundColor: colors.gradientStart,
  },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  glowLarge: {
    position: 'absolute',
    top: -110,
    right: -80,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  glowSmall: {
    position: 'absolute',
    bottom: -60,
    left: -40,
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  topRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36 },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '900', color: colors.white, letterSpacing: -0.3 },
  subtitle: { marginTop: 3, fontSize: 12.5, lineHeight: 17, color: 'rgba(255,255,255,0.84)' },
  slot: { marginTop: 16 },
  stat: {
    flex: 1,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
  },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statValue: { fontSize: 16, fontWeight: '900', color: colors.white },
  statLabel: { marginTop: 2, fontSize: 10.5, fontWeight: '600', color: 'rgba(255,255,255,0.82)' },
});
