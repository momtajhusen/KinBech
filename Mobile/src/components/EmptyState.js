import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Ellipse } from 'react-native-svg';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';

const createStyles = (colors) => ({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  illustrationWrap: {
    width: 280,
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  sparkleLeft: {
    position: 'absolute',
    top: 130,
    left: 4,
  },
  sparkleRight: {
    position: 'absolute',
    top: 90,
    right: 10,
  },
  dot: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
    width: 12,
    height: 12,
  },
  dotTopLeft: {
    top: 80,
    left: 32,
    borderColor: colors.gradientStart,
  },
  dotRight: {
    top: 105,
    right: 0,
    borderColor: colors.photoBorder,
  },
  dotBottomRight: {
    top: 165,
    right: 20,
    borderColor: colors.gradientEnd,
  },
  dotBottomLeft: {
    top: 190,
    left: 12,
    borderColor: colors.gradientStart,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  compactTitle: {
    fontSize: 20,
    marginBottom: 8,
  },
  body: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  compactBody: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 20,
  },
  compactWrap: {
    flexGrow: 1,
    minHeight: 280,
    paddingVertical: 36,
    paddingHorizontal: 20,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  compactButton: {
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
    alignSelf: 'stretch',
  },
  buttonWrap: {
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onPrimary,
  },
});

function BoxIllustration() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.illustrationWrap}>
      <Icon name="sparkles" size={20} color={colors.badge} style={styles.sparkleLeft} />
      <Icon name="sparkles" size={16} color={colors.gradientStart} style={styles.sparkleRight} />
      <View style={[styles.dot, styles.dotTopLeft]} />
      <View style={[styles.dot, styles.dotRight]} />
      <View style={[styles.dot, styles.dotBottomRight]} />
      <View style={[styles.dot, styles.dotBottomLeft]} />

      <Svg width={280} height={300} viewBox="0 0 280 300">
        <Defs>
          <SvgLinearGradient id="boxGradient" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors.gradientStart} />
            <Stop offset="1" stopColor={colors.gradientEnd} />
          </SvgLinearGradient>
        </Defs>

        <Ellipse cx="140" cy="270" rx="105" ry="14" fill={colors.gradientStart} opacity={0.08} />

        <Path
          d="M140 30c-38 0-68 24-68 54 0 22 16 40 39 49l-6 22 27-19c2 0 5 0 8 0 38 0 68-24 68-52s-30-54-68-54z"
          fill="none"
          stroke="url(#boxGradient)"
          strokeWidth={3}
        />
        <Circle cx="118" cy="82" r="4" fill="url(#boxGradient)" />
        <Circle cx="140" cy="82" r="4" fill="url(#boxGradient)" />
        <Circle cx="162" cy="82" r="4" fill="url(#boxGradient)" />

        <Path d="M70 190 L140 220 L140 158 L70 128 Z" fill="none" stroke={colors.gradientStart} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M210 190 L140 220 L140 158 L210 128 Z" fill="none" stroke={colors.gradientEnd} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M70 128 L140 98 L140 158 L70 190 Z" fill="none" stroke={colors.gradientStart} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M210 128 L140 98 L140 158 L210 190 Z" fill="none" stroke={colors.gradientEnd} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M70 190 L140 220 L140 270 L70 240 Z" fill="none" stroke={colors.gradientStart} strokeWidth={3} strokeLinejoin="round" />
        <Path d="M210 190 L140 220 L140 270 L210 240 Z" fill="none" stroke={colors.gradientEnd} strokeWidth={3} strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

export default function EmptyState({
  title,
  body,
  buttonLabel,
  onButtonPress,
  showIllustration = true,
  compact = false,
  icon = 'cube-outline',
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  return (
    <View style={[styles.container, compact && styles.compactWrap]}>
      {compact ? (
        <LinearGradient
          colors={colors.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.iconCircle}
        >
          <Icon name={icon} size={40} color={colors.onPrimary} />
        </LinearGradient>
      ) : (
        showIllustration && <BoxIllustration />
      )}

      <Text style={[styles.title, compact && styles.compactTitle]}>{title}</Text>
      <Text style={[styles.body, compact && styles.compactBody]}>{body}</Text>

      {buttonLabel ? (
        <Pressable onPress={onButtonPress} style={styles.buttonWrap}>
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.button, compact && styles.compactButton]}
          >
            <Text style={styles.buttonLabel}>{buttonLabel}</Text>
            <Icon name="arrow-forward" size={20} color={colors.onPrimary} />
          </LinearGradient>
        </Pressable>
      ) : null}
    </View>
  );
}
