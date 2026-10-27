import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';

// Same look as the native lock-screen ringing screen (IncomingCallActivity.kt), so a call
// looks identical whether it rings over the lock screen or inside the app.
export const CALL_PALETTE = {
  base: '#03130E',
  text: '#FFFFFF',
  muted: 'rgba(255,255,255,0.68)',
  faint: 'rgba(255,255,255,0.45)',
  glass: 'rgba(255,255,255,0.10)',
  glassBorder: 'rgba(255,255,255,0.16)',
  mint: '#6EE7B7',
  answer: '#22C55E',
  decline: '#EF4444',
  danger: '#FCA5A5',
};

const PRESS_SPRING = { damping: 14, stiffness: 300, mass: 0.6 };
const DECELERATE = Easing.out(Easing.quad);
const GLOW_SIZE = 440;

/** Deep green gradient with a soft radial glow drifting behind the caller. */
export function CallBackdrop() {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    drift.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(drift);
  }, [drift, reduced]);
  const glow = useAnimatedStyle(() => ({
    opacity: 1 - drift.value * 0.35,
    transform: [{ translateY: drift.value * 36 }],
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={['#0B3B2C', CALL_PALETTE.base, '#010805']} style={StyleSheet.absoluteFill} />
      <Reanimated.View style={[styles.glow, glow]}>
        <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
          <Defs>
            <RadialGradient id="callGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor="#34D399" stopOpacity={0.33} />
              <Stop offset="1" stopColor="#10B981" stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#callGlow)" />
        </Svg>
      </Reanimated.View>
    </View>
  );
}

function Wave({ size, delay, active }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = withTiming(1, { duration: 300 });
      return undefined;
    }
    progress.value = 0;
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: DECELERATE }), -1, false));
    return () => cancelAnimation(progress);
  }, [active, delay, progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.7 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 0.65 }],
  }));
  return <Reanimated.View style={[styles.wave, { width: size, height: size, borderRadius: size / 2 }, animated]} />;
}

/** Caller photo in a glass frame with three soft waves spreading out while the call is live. */
export function CallAvatar({ image, name, waving = true, size = 150 }) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0);
  const enter = useSharedValue(0.85);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 9, stiffness: 160, mass: 0.8 });
  }, [enter]);

  useEffect(() => {
    if (reduced || !waving) {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 250 });
      return undefined;
    }
    pulse.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduced, waving]);

  const frameStyle = useAnimatedStyle(() => ({ transform: [{ scale: enter.value * (1 + pulse.value * 0.035) }] }));

  const frame = size + 8;
  const box = Math.round(size * 1.67);
  const initials = String(name || 'K').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'K';

  return (
    <View style={[styles.center, { width: box, height: box }]}>
      {[0, 800, 1600].map((delay) => (
        <Wave key={delay} size={size} delay={delay} active={waving && !reduced} />
      ))}
      <Reanimated.View
        style={[styles.frame, styles.center, { width: frame, height: frame, borderRadius: frame / 2 }, frameStyle]}
      >
        <View style={[styles.avatar, styles.center, { width: size, height: size, borderRadius: size / 2 }]}>
          {image ? (
            <Image source={{ uri: image }} style={styles.avatarImage} />
          ) : (
            <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
          )}
        </View>
      </Reanimated.View>
    </View>
  );
}

/** "Calling..." with dots that keep counting, padded so the text never shifts. */
export function AnimatedDots({ text, style, active = true }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setCount((value) => (value + 1) % 4), 450);
    return () => clearInterval(timer);
  }, [active]);
  if (!active) return <Text style={style}>{text}</Text>;
  return (
    <Text style={style}>
      {text}
      {'.'.repeat(count)}
      <Text style={styles.invisible}>{'.'.repeat(3 - count)}</Text>
    </Text>
  );
}

/**
 * Round call button with a spring press. `tone` is glass (toggle), answer or decline.
 * The answer tone hops and wiggles inside a pulsing halo, like the lock-screen Answer button.
 */
export function CallButton({ icon, label, onPress, tone = 'glass', active = false, size = 64, iconRotate = 0, disabled }) {
  const reduced = useReducedMotion();
  const press = useSharedValue(1);
  const hop = useSharedValue(0);
  const halo = useSharedValue(0);
  const fill = useSharedValue(active ? 1 : 0);
  const isAnswer = tone === 'answer';

  useEffect(() => {
    fill.value = withSpring(active ? 1 : 0, PRESS_SPRING);
  }, [active, fill]);

  useEffect(() => {
    if (!isAnswer || reduced) return undefined;
    hop.value = withRepeat(withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }), -1, false);
    halo.value = withRepeat(withTiming(1, { duration: 1600, easing: DECELERATE }), -1, false);
    return () => {
      cancelAnimation(hop);
      cancelAnimation(halo);
    };
  }, [halo, hop, isAnswer, reduced]);

  const body = useAnimatedStyle(() => {
    const t = hop.value;
    const lift = t < 0.4 ? -8 * Math.sin((t / 0.4) * Math.PI) : 0;
    return { transform: [{ translateY: lift }, { scale: press.value }] };
  });
  const wiggle = useAnimatedStyle(() => {
    const t = hop.value;
    const turn = t < 0.4 ? 14 * Math.sin((t / 0.4) * 4 * Math.PI) : 0;
    return { transform: [{ rotate: `${iconRotate + turn}deg` }] };
  });
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - halo.value),
    transform: [{ scale: 1 + halo.value * 0.5 }],
  }));
  const glassFill = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.6 + fill.value * 0.4 }] }));

  const background = tone === 'answer' ? CALL_PALETTE.answer : tone === 'decline' ? CALL_PALETTE.decline : CALL_PALETTE.glass;
  const iconColor = tone === 'glass' && active ? '#064E3B' : CALL_PALETTE.text;
  const round = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={styles.buttonWrap}>
      <View style={[styles.center, { width: size * 1.55, height: size * 1.55 }]}>
        {isAnswer ? <Reanimated.View style={[styles.halo, round, haloStyle]} /> : null}
        <Reanimated.View style={body}>
          <Pressable
            onPress={onPress}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active, disabled }}
            onPressIn={() => {
              press.value = withSpring(0.9, PRESS_SPRING);
            }}
            onPressOut={() => {
              press.value = withSpring(1, PRESS_SPRING);
            }}
            style={[
              styles.button,
              round,
              { backgroundColor: background },
              tone === 'glass' ? styles.buttonGlass : { shadowColor: background },
              tone !== 'glass' && styles.buttonSolid,
            ]}
          >
            {tone === 'glass' ? <Reanimated.View style={[StyleSheet.absoluteFill, styles.glassFill, round, glassFill]} /> : null}
            <Reanimated.View style={wiggle}>
              <Icon name={icon} size={size * 0.44} color={iconColor} />
            </Reanimated.View>
          </Pressable>
        </Reanimated.View>
      </View>
      {label ? <Text style={styles.buttonLabel}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    width: GLOW_SIZE,
    height: GLOW_SIZE,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    backgroundColor: 'rgba(110,231,183,0.2)',
  },
  frame: {
    backgroundColor: CALL_PALETTE.glassBorder,
  },
  avatar: {
    overflow: 'hidden',
    backgroundColor: '#16A34A',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  initials: {
    color: CALL_PALETTE.text,
    fontWeight: '800',
  },
  invisible: {
    color: 'transparent',
  },
  buttonWrap: {
    alignItems: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  buttonGlass: {
    borderWidth: 1,
    borderColor: CALL_PALETTE.glassBorder,
  },
  buttonSolid: {
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  glassFill: {
    backgroundColor: '#FFFFFF',
  },
  halo: {
    position: 'absolute',
    backgroundColor: CALL_PALETTE.answer,
  },
  buttonLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: CALL_PALETTE.muted,
  },
});
