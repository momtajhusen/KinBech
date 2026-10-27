import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Icon from './Icon';

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

/** Blurred caller photo (or brand green) with a slow drifting glow behind the call UI. */
export function CallBackdrop({ image }) {
  const reduced = useReducedMotion();
  const drift = useSharedValue(0);
  const zoom = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    drift.value = withRepeat(withTiming(1, { duration: 7000, easing: Easing.inOut(Easing.sin) }), -1, true);
    zoom.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => {
      cancelAnimation(drift);
      cancelAnimation(zoom);
    };
  }, [drift, reduced, zoom]);
  const orb = useAnimatedStyle(() => ({
    transform: [{ translateX: -40 + drift.value * 80 }, { translateY: -20 + drift.value * 50 }, { scale: 1 + drift.value * 0.15 }],
  }));
  const photo = useAnimatedStyle(() => ({ transform: [{ scale: 1.15 + zoom.value * 0.12 }] }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: CALL_PALETTE.base }]}>
      {image ? (
        <Reanimated.View style={[StyleSheet.absoluteFill, photo]}>
          <Image source={{ uri: image }} blurRadius={40} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} />
        </Reanimated.View>
      ) : null}
      <Reanimated.View style={[styles.orb, orb]}>
        <LinearGradient
          colors={['rgba(52,211,153,0.42)', 'rgba(16,185,129,0.12)', 'rgba(16,185,129,0)']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.orbFill}
        />
      </Reanimated.View>
      <LinearGradient
        colors={['rgba(6,78,59,0.55)', 'rgba(3,19,14,0.82)', 'rgba(2,8,6,0.97)']}
        locations={[0, 0.55, 1]}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function Ripple({ size, delay, active, color }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!active) {
      cancelAnimation(progress);
      progress.value = withTiming(0, { duration: 200 });
      return undefined;
    }
    progress.value = 0;
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 2400, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(progress);
  }, [active, delay, progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: active ? 0.5 * (1 - progress.value) : 0,
    transform: [{ scale: 1 + progress.value * 0.8 }],
  }));
  return (
    <Reanimated.View
      style={[
        styles.ripple,
        { width: size, height: size, borderRadius: size / 2, borderColor: color },
        animated,
      ]}
    />
  );
}

/**
 * Caller photo inside a spinning gradient ring. Ripples spread while the call rings;
 * once connected the ring slows and the photo breathes softly.
 */
export function CallAvatar({ image, name, ringing, connected, size = 136 }) {
  const reduced = useReducedMotion();
  const spin = useSharedValue(0);
  const breathe = useSharedValue(0);
  const enter = useSharedValue(0.6);

  useEffect(() => {
    enter.value = withSpring(1, { damping: 11, stiffness: 140, mass: 0.8 });
  }, [enter]);

  useEffect(() => {
    if (reduced) return undefined;
    cancelAnimation(spin);
    spin.value = 0;
    spin.value = withRepeat(withTiming(1, { duration: ringing ? 2600 : 9000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [reduced, ringing, spin]);

  useEffect(() => {
    if (!connected || reduced) {
      cancelAnimation(breathe);
      breathe.value = withTiming(0, { duration: 250 });
      return undefined;
    }
    breathe.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(breathe);
  }, [breathe, connected, reduced]);

  const ringStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ scale: enter.value * (1 + breathe.value * 0.035) }] }));
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.25 + breathe.value * 0.35,
    transform: [{ scale: 1.05 + breathe.value * 0.12 }],
  }));

  const ring = size + 14;
  const box = size * 1.9;
  const initials = String(name || 'U').trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('') || 'U';

  return (
    <View style={[styles.avatarBox, { width: box, height: box }]}>
      {[0, 800, 1600].map((delay) => (
        <Ripple key={delay} size={ring} delay={delay} active={ringing && !reduced} color="rgba(110,231,183,0.9)" />
      ))}
      <Reanimated.View style={[styles.glow, { width: ring + 26, height: ring + 26, borderRadius: (ring + 26) / 2 }, glowStyle]} />
      <Reanimated.View style={[styles.center, bodyStyle]}>
        <Reanimated.View style={[{ width: ring, height: ring, borderRadius: ring / 2, overflow: 'hidden' }, ringStyle]}>
          <LinearGradient
            colors={['#A7F3D0', '#10B981', '#064E3B', '#34D399']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Reanimated.View>
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
          {image ? (
            <Image source={{ uri: image }} style={styles.avatarImage} />
          ) : (
            <LinearGradient colors={['#10B981', '#065F46']} style={[StyleSheet.absoluteFill, styles.center]}>
              <Text style={[styles.initials, { fontSize: size * 0.36 }]}>{initials}</Text>
            </LinearGradient>
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
    const timer = setInterval(() => setCount((value) => (value + 1) % 4), 420);
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

function HintChevron({ index }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      index * 160,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 380 }),
          withTiming(0, { duration: 520 }),
          withDelay(500, withTiming(0, { duration: 0 }))
        ),
        -1
      )
    );
    return () => cancelAnimation(progress);
  }, [index, progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: 0.2 + progress.value * 0.8,
    transform: [{ translateY: -progress.value * 3 }],
  }));
  return (
    <Reanimated.View style={animated}>
      <Icon name="chevron-up" size={18} color={CALL_PALETTE.mint} />
    </Reanimated.View>
  );
}

/** Three chevrons lighting up bottom to top, pointing at the answer button. */
export function AnswerHint() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <View style={styles.hint}>
      {[2, 1, 0].map((index) => (
        <HintChevron key={index} index={index} />
      ))}
    </View>
  );
}

/**
 * Round call button with a spring press. `tone` is glass (toggle), answer or decline.
 * The answer tone bounces with a halo so it is the obvious next step.
 */
export function CallButton({ icon, label, onPress, tone = 'glass', active = false, size = 64, iconRotate = 0, disabled }) {
  const reduced = useReducedMotion();
  const press = useSharedValue(1);
  const bounce = useSharedValue(0);
  const halo = useSharedValue(0);
  const fill = useSharedValue(active ? 1 : 0);
  const isAnswer = tone === 'answer';

  useEffect(() => {
    fill.value = withSpring(active ? 1 : 0, PRESS_SPRING);
  }, [active, fill]);

  useEffect(() => {
    if (!isAnswer || reduced) return undefined;
    bounce.value = withRepeat(
      withSequence(
        withTiming(-8, { duration: 260, easing: Easing.out(Easing.quad) }),
        withSpring(0, { damping: 6, stiffness: 260, mass: 0.5 }),
        withDelay(900, withTiming(0, { duration: 0 }))
      ),
      -1
    );
    halo.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.out(Easing.quad) }), -1, false);
    return () => {
      cancelAnimation(bounce);
      cancelAnimation(halo);
    };
  }, [bounce, halo, isAnswer, reduced]);

  const body = useAnimatedStyle(() => ({ transform: [{ translateY: bounce.value }, { scale: press.value }] }));
  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - halo.value),
    transform: [{ scale: 1 + halo.value * 0.7 }],
  }));
  const glassFill = useAnimatedStyle(() => ({ opacity: fill.value, transform: [{ scale: 0.6 + fill.value * 0.4 }] }));

  const background = tone === 'answer' ? CALL_PALETTE.answer : tone === 'decline' ? CALL_PALETTE.decline : CALL_PALETTE.glass;
  const iconColor = tone === 'glass' && active ? '#064E3B' : CALL_PALETTE.text;
  const round = { width: size, height: size, borderRadius: size / 2 };

  return (
    <View style={styles.buttonWrap}>
      <Reanimated.View style={body}>
        {isAnswer ? <Reanimated.View style={[styles.halo, round, haloStyle]} /> : null}
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
          <View style={{ transform: [{ rotate: `${iconRotate}deg` }] }}>
            <Icon name={icon} size={size * 0.42} color={iconColor} />
          </View>
        </Pressable>
      </Reanimated.View>
      {label ? <Text style={styles.buttonLabel}>{label}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    width: 380,
    height: 380,
    borderRadius: 190,
    overflow: 'hidden',
  },
  orbFill: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    borderWidth: 2,
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(52,211,153,0.35)',
  },
  avatar: {
    position: 'absolute',
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: CALL_PALETTE.base,
    backgroundColor: '#064E3B',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  initials: {
    color: CALL_PALETTE.text,
    fontWeight: '800',
    letterSpacing: 1,
  },
  invisible: {
    color: 'transparent',
  },
  hint: {
    alignItems: 'center',
    marginBottom: 6,
    marginTop: -4,
  },
  buttonWrap: {
    alignItems: 'center',
    gap: 10,
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
    elevation: 10,
  },
  glassFill: {
    backgroundColor: '#FFFFFF',
  },
  halo: {
    position: 'absolute',
    backgroundColor: CALL_PALETTE.answer,
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: CALL_PALETTE.muted,
    letterSpacing: 0.2,
  },
});
