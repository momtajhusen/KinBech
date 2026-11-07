import { useEffect } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';
import { useTheme, useThemedStyles } from '../theme';

const STATUS = {
  reading: 'फोटो देख रहा हूँ…',
  thinking: 'सोच रहा हूँ…',
  speaking: 'AI सहायक',
  listening: 'सुन रहा हूँ…',
  retry: 'बोलने के लिए माइक दबाएँ',
  off: 'AI सहायक बंद है',
};

function Orb({ phase }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const pulse = useSharedValue(0);
  const moving = phase === 'speaking' || phase === 'listening';

  useEffect(() => {
    cancelAnimation(pulse);
    pulse.value = moving
      ? withRepeat(withTiming(1, { duration: phase === 'speaking' ? 480 : 900, easing: Easing.inOut(Easing.quad) }), -1, true)
      : withTiming(0, { duration: 200 });
    return () => cancelAnimation(pulse);
  }, [moving, phase, pulse]);

  const ring = useAnimatedStyle(() => ({
    opacity: 0.35 * pulse.value,
    transform: [{ scale: 1 + pulse.value * 0.45 }],
  }));

  const busy = phase === 'reading' || phase === 'thinking';
  return (
    <View style={styles.orbBox}>
      <Reanimated.View pointerEvents="none" style={[styles.orbRing, ring]} />
      <LinearGradient
        colors={phase === 'off' ? [colors.border, colors.border] : colors.gradient || [colors.primary, colors.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.orb}
      >
        {busy ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <Icon
            name={phase === 'listening' ? 'mic' : phase === 'off' ? 'mic-off-outline' : 'sparkles'}
            size={15}
            color={phase === 'off' ? colors.textMuted : colors.onPrimary}
          />
        )}
      </LinearGradient>
    </View>
  );
}

/**
 * The Hindi voice helper's status line: what it says or hears, a mic button and a close button.
 * `inline` sits inside a modal card; otherwise it floats (place it absolutely, it adds no layout).
 */
export default function SellVoiceBar({ voice, inline = false, style }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { phase, heard, reply, talk, mute } = voice;
  if (!phase || phase === 'idle') return null;

  let line = '';
  if (phase === 'listening') line = heard ? `“${heard}”` : '';
  else if (phase === 'speaking' || phase === 'retry') line = reply;
  else if (phase === 'off') line = 'बात करके फ़ॉर्म भरने के लिए दबाएँ';

  const canTalk = phase === 'retry' || phase === 'off' || phase === 'speaking';
  return (
    <View style={[styles.bar, inline ? styles.inline : styles.floating, style]}>
      <Pressable style={styles.main} onPress={canTalk ? talk : undefined} disabled={!canTalk}>
        <Orb phase={phase} />
        <View style={styles.texts}>
          <Text style={styles.status} numberOfLines={1}>{STATUS[phase] || ''}</Text>
          {line ? <Text style={styles.line} numberOfLines={2}>{line}</Text> : null}
        </View>
      </Pressable>
      {phase !== 'off' ? (
        <Pressable
          style={[styles.iconBtn, phase === 'listening' && styles.iconBtnLive]}
          onPress={talk}
          hitSlop={6}
          accessibilityLabel="Talk to AI"
        >
          <Icon name="mic" size={16} color={phase === 'listening' ? colors.onPrimary : colors.primary} />
        </Pressable>
      ) : null}
      {phase !== 'off' ? (
        <Pressable style={styles.close} onPress={mute} hitSlop={8} accessibilityLabel="Turn off AI voice">
          <Icon name="close" size={14} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Small on/off chip for the voice helper, sized like the sell screens' photo count chip. */
export function VoiceToggle({ value, onChange }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const tint = value ? colors.primary : colors.textMuted;
  return (
    <Pressable
      style={[styles.toggle, !value && styles.toggleOff]}
      onPress={() => onChange(!value)}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel="AI voice assistant"
    >
      <Icon name={value ? 'mic' : 'mic-off'} size={11} color={tint} />
      <View style={[styles.track, { backgroundColor: value ? colors.primary : colors.border }]}>
        <View style={[styles.knob, value && styles.knobOn]} />
      </View>
    </Pressable>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    toggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: 10,
      backgroundColor: colors.iconBackground,
    },
    toggleOff: {
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 7 - StyleSheet.hairlineWidth,
      paddingVertical: 3 - StyleSheet.hairlineWidth,
    },
    track: {
      width: 18,
      height: 10,
      borderRadius: 5,
      padding: 2,
      justifyContent: 'center',
    },
    knob: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: '#FFFFFF',
    },
    knobOn: {
      alignSelf: 'flex-end',
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      paddingLeft: 8,
      paddingRight: 10,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },
    floating: {
      backgroundColor: colors.surface,
      elevation: 8,
      shadowColor: '#000000',
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
    inline: {
      backgroundColor: colors.background,
    },
    main: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    orbBox: {
      width: 34,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    orbRing: {
      position: 'absolute',
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
    },
    orb: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    texts: {
      flex: 1,
    },
    status: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.primary,
    },
    line: {
      marginTop: 1,
      fontSize: 12.5,
      lineHeight: 17,
      fontWeight: '600',
      color: colors.text,
    },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}1A`,
    },
    iconBtnLive: {
      backgroundColor: colors.primary,
    },
    close: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
