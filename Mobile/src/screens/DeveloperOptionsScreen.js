import { useCallback, useEffect, useState } from 'react';
import { AppState, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import KinBechSecurity from '../../modules/kinbech-security';

const AMBER = '#F59E0B';
const STEPS = [
  { icon: 'cog-outline', text: 'Tap "Open Developer Settings" below' },
  { icon: 'toggle-switch-off-outline', text: 'Turn off the "Developer options" switch at the top' },
  { icon: 'keyboard-return', text: 'Come back to KinBech, it opens by itself' },
];

const isDeveloperOptionsOn = () => {
  if (__DEV__) return false;
  try {
    return KinBechSecurity?.isDeveloperOptionsEnabled?.() === true;
  } catch {
    return false;
  }
};

/** Release builds only: true while Android Developer Options are on. Rechecks when the app comes back. */
export function useDeveloperOptionsBlocked() {
  const [blocked, setBlocked] = useState(isDeveloperOptionsOn);

  useEffect(() => {
    if (__DEV__ || !KinBechSecurity) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setBlocked(isDeveloperOptionsOn());
    });
    return () => sub.remove();
  }, []);

  const recheck = useCallback(() => {
    const on = isDeveloperOptionsOn();
    setBlocked(on);
    return on;
  }, []);

  return [blocked, recheck];
}

function Pulse({ index }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(index * 700, withRepeat(withTiming(1, { duration: 2100, easing: Easing.out(Easing.quad) }), -1, false));
  }, [t, index]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(t.value, [0, 0.15, 1], [0, 0.5, 0]),
    transform: [{ scale: interpolate(t.value, [0, 1], [0.9, 2.1]) }],
  }));

  return <Animated.View pointerEvents="none" style={[styles.pulse, style]} />;
}

function Badge() {
  const enter = useSharedValue(0);
  const wobble = useSharedValue(0);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 10, stiffness: 120 });
    wobble.value = withDelay(
      700,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 90 }),
          withTiming(-1, { duration: 90 }),
          withTiming(0.6, { duration: 90 }),
          withTiming(0, { duration: 90 }),
          withTiming(0, { duration: 2200 })
        ),
        -1,
        false
      )
    );
  }, [enter, wobble]);

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(enter.value, [0, 0.4], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(enter.value, [0, 1], [0.4, 1]) }, { rotate: `${wobble.value * 8}deg` }],
  }));

  return (
    <View style={styles.badgeStage}>
      {[0, 1, 2].map((i) => (
        <Pulse key={i} index={i} />
      ))}
      <Animated.View style={style}>
        <LinearGradient colors={['#FBBF24', '#D97706']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.badge}>
          <MaterialCommunityIcons name="shield-alert" size={52} color="#FFFFFF" />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

function Rise({ delay, children, style }) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 520, easing: Easing.out(Easing.cubic) }));
  }, [p, delay]);

  const animated = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 18 }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

export default function DeveloperOptionsScreen({ onRecheck }) {
  const insets = useSafeAreaInsets();
  const [stillOn, setStillOn] = useState(false);
  const shake = useSharedValue(0);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value * 10 }] }));

  const openSettings = () => {
    setStillOn(false);
    KinBechSecurity?.openDeveloperSettings?.();
  };

  const checkAgain = () => {
    if (!onRecheck?.()) return;
    setStillOn(true);
    shake.value = withSequence(
      withTiming(1, { duration: 60 }),
      withTiming(-1, { duration: 60 }),
      withTiming(0.7, { duration: 60 }),
      withTiming(-0.7, { duration: 60 }),
      withTiming(0, { duration: 60 })
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={['#0B0F17', '#151B26', '#2A1F0E']} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingTop: insets.top + 36, paddingBottom: insets.bottom + 24 }]}>
        <Badge />

        <Rise delay={200} style={styles.center}>
          <Text style={styles.kicker}>SECURITY CHECK</Text>
          <Text style={styles.title}>Turn off Developer Options</Text>
          <Text style={styles.body}>
            Developer Options are on in this phone. To keep your account, chats and payments safe, KinBech
            works only when they are off.
          </Text>
        </Rise>

        <Rise delay={380} style={styles.cardWrap}>
          <Animated.View style={[styles.card, shakeStyle]}>
            {STEPS.map((step, i) => (
              <View key={step.text} style={[styles.step, i > 0 && styles.stepGap]}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step.text}</Text>
                <MaterialCommunityIcons name={step.icon} size={20} color="rgba(255,255,255,0.45)" />
              </View>
            ))}
          </Animated.View>
          {stillOn ? (
            <Text style={styles.stillOn}>Developer Options are still on. Please switch them off.</Text>
          ) : null}
        </Rise>

        <View style={styles.flex} />

        <Rise delay={540} style={styles.actions}>
          <Pressable
            onPress={openSettings}
            style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <LinearGradient colors={['#10B981', '#047857']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryFill}>
              <MaterialCommunityIcons name="cog" size={20} color="#FFFFFF" />
              <Text style={styles.primaryText}>Open Developer Settings</Text>
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={checkAgain}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="refresh" size={18} color="#A7F3D0" />
            <Text style={styles.secondaryText}>I have turned it off</Text>
          </Pressable>
        </Rise>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
  },
  badgeStage: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulse: {
    position: 'absolute',
    top: 45,
    left: 45,
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 1.5,
    borderColor: AMBER,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 14,
    shadowColor: AMBER,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  kicker: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    color: AMBER,
  },
  title: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '800',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  body: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    maxWidth: 340,
  },
  cardWrap: {
    alignSelf: 'stretch',
    marginTop: 28,
  },
  card: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepGap: {
    marginTop: 16,
  },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,185,129,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.5)',
  },
  stepNumText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#6EE7B7',
  },
  stepText: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(255,255,255,0.88)',
  },
  stillOn: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#FCA5A5',
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
  },
  primary: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  primaryFill: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondary: {
    marginTop: 10,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#A7F3D0',
  },
  pressed: {
    opacity: 0.8,
  },
});
