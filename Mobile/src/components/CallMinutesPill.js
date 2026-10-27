import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Icon from './Icon';
import { PressableScale } from './Motion';
import { AlertModal } from './AlertModal';
import { useTheme, useThemedStyles } from '../theme';

const RING = 28;
const STROKE = 3;
const RADIUS = (RING - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function formatLeft(seconds) {
  const total = Math.max(0, Math.round(seconds || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Today's free call time, from `callAllowance` on GET /chats. Hidden for unlimited accounts. */
export default function CallMinutesPill({ allowance }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [infoOpen, setInfoOpen] = useState(false);

  if (!allowance || allowance.unlimited || allowance.remainingSeconds == null) return null;

  const limitSeconds = Math.max(1, (allowance.limitMinutes || 0) * 60);
  const left = Math.max(0, allowance.remainingSeconds);
  const share = Math.min(1, left / limitSeconds);
  const usedUp = left === 0;
  const low = !usedUp && left <= 120;
  const tone = usedUp ? colors.error : low ? colors.warning : colors.primary;

  return (
    <>
      <PressableScale
        scaleTo={0.96}
        onPress={() => setInfoOpen(true)}
        contentStyle={styles.pill}
        accessibilityRole="button"
        accessibilityLabel={`${formatLeft(left)} call minutes left today`}
      >
        <View style={styles.ring}>
          <Svg width={RING} height={RING}>
            <Circle cx={RING / 2} cy={RING / 2} r={RADIUS} stroke={colors.border} strokeWidth={STROKE} fill="none" />
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={RADIUS}
              stroke={tone}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
              strokeDashoffset={CIRCUMFERENCE * (1 - share)}
              transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
            />
          </Svg>
          <View style={styles.ringIcon}>
            <Icon name={usedUp ? 'call-outline' : 'call'} size={11} color={tone} />
          </View>
        </View>
        <View>
          <Text style={[styles.value, { color: usedUp ? colors.error : colors.text }]}>
            {usedUp ? 'Used up' : formatLeft(left)}
          </Text>
          <Text style={styles.caption}>
            {usedUp ? 'Back at midnight' : `of ${allowance.limitMinutes} min today`}
          </Text>
        </View>
      </PressableScale>

      <AlertModal
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        type={usedUp ? 'warning' : 'info'}
        title="Daily call time"
        message={
          usedUp
            ? `You have used all ${allowance.limitMinutes} free call minutes for today. Calls open again at midnight. You can still send messages.`
            : `You get ${allowance.limitMinutes} free call minutes every day. ${formatLeft(left)} left today. Only answered calls count, and the time resets at midnight.`
        }
        primaryButton={{ text: 'Got it', onPress: () => setInfoOpen(false) }}
      />
    </>
  );
}

const createStyles = (colors) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ring: {
    width: RING,
    height: RING,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringIcon: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    marginTop: -2,
    fontSize: 9.5,
    fontWeight: '600',
    color: colors.textMuted,
  },
});
