import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  Easing,
  FadeInDown,
  FadeInRight,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const PRESS_SPRING = { damping: 15, stiffness: 320, mass: 0.6 };
const MAX_STAGGER = 8;

export function enterUp(index = 0, step = 55) {
  return FadeInDown.delay(Math.min(index, MAX_STAGGER) * step).duration(420).easing(Easing.out(Easing.cubic));
}

export function enterRight(index = 0, step = 60) {
  return FadeInRight.delay(Math.min(index, MAX_STAGGER) * step).duration(380).easing(Easing.out(Easing.cubic));
}

/** Pressable that springs down on touch and back on release, on the UI thread. */
export function PressableScale({
  children,
  style,
  contentStyle,
  scaleTo = 0.95,
  onPress,
  disabled,
  hitSlop,
  entering,
}) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Reanimated.View style={style} entering={entering}>
      <Reanimated.View style={animated}>
        <Pressable
          style={contentStyle}
          onPress={onPress}
          disabled={disabled}
          hitSlop={hitSlop}
          onPressIn={() => {
            scale.value = withSpring(scaleTo, PRESS_SPRING);
          }}
          onPressOut={() => {
            scale.value = withSpring(1, PRESS_SPRING);
          }}
        >
          {children}
        </Pressable>
      </Reanimated.View>
    </Reanimated.View>
  );
}

/** One-time scale on an already sized view. Transform only, so it does not change layout or delay taps. */
export function SoftPop({ index = 0, children, style }) {
  const scale = useSharedValue(0.86);
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    const delay = Math.min(index, 6) * 35;
    scale.value = withDelay(delay, withSpring(1, { damping: 12, stiffness: 240, mass: 0.45 }));
    opacity.value = withDelay(delay, withTiming(1, { duration: 160 }));
  }, [index, opacity, scale]);
  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return <Reanimated.View style={[style, animated]}>{children}</Reanimated.View>;
}

/** Repeating soft heartbeat while `active` is true. */
export function Pulse({ active = true, children, style, to = 1.18, duration = 520, pause = 1400 }) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!active) {
      cancelAnimation(scale);
      scale.value = withTiming(1, { duration: 150 });
      return undefined;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(to, { duration: duration / 2, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: duration / 2, easing: Easing.in(Easing.quad) }),
        withDelay(pause, withTiming(1, { duration: 0 }))
      ),
      -1
    );
    return () => cancelAnimation(scale);
  }, [active, to, duration, pause, scale]);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return <Reanimated.View style={[style, animated]}>{children}</Reanimated.View>;
}

/** Gentle up-and-down bob, for icons that should feel alive. */
export function Float({ children, style, distance = 3, duration = 1600 }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(
      withSequence(
        withTiming(-distance, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) })
      ),
      -1
    );
    return () => cancelAnimation(y);
  }, [distance, duration, y]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Reanimated.View style={[style, animated]}>{children}</Reanimated.View>;
}

/** Light sweep that glides across its parent. Parent needs overflow: 'hidden'. */
export function Shimmer({ duration = 2200, pause = 1800, color = 'rgba(255,255,255,0.22)' }) {
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  useEffect(() => {
    if (!width) return undefined;
    progress.value = 0;
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }),
        withDelay(pause, withTiming(0, { duration: 0 }))
      ),
      -1
    );
    return () => cancelAnimation(progress);
  }, [width, duration, pause, progress]);
  const band = Math.max(60, width * 0.35);
  const animated = useAnimatedStyle(() => ({
    transform: [{ translateX: -band + progress.value * (width + band * 2) }, { skewX: '-18deg' }],
  }));
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <Reanimated.View style={[{ position: 'absolute', top: 0, bottom: 0, width: band }, animated]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', color, 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Reanimated.View>
      ) : null}
    </View>
  );
}

export { Reanimated };
