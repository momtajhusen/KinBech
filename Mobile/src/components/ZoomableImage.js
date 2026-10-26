import { useEffect, useMemo } from 'react';
import { Image, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

function clamp(value, min, max) {
  'worklet';
  return Math.min(Math.max(value, min), max);
}

/**
 * Full-screen photo with pinch zoom, drag while zoomed, and double-tap zoom.
 * Panning is only enabled while `zoomed`, so an unzoomed photo still swipes in a pager.
 */
export default function ZoomableImage({ uri, style, active = true, zoomed = false, onZoomChange, onTap }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);

  useEffect(() => {
    if (active) return;
    scale.value = 1;
    x.value = 0;
    y.value = 0;
  }, [active]);

  const gesture = useMemo(() => {
    const limit = (zoom, value, size) => {
      'worklet';
      const max = (size * (zoom - 1)) / 2;
      return clamp(value, -max, max);
    };
    const reportZoom = (value) => {
      'worklet';
      if (onZoomChange) scheduleOnRN(onZoomChange, value);
    };
    const reset = () => {
      'worklet';
      scale.value = withTiming(1);
      x.value = withTiming(0);
      y.value = withTiming(0);
      reportZoom(false);
    };

    const pinch = Gesture.Pinch()
      .onStart(() => {
        savedScale.value = scale.value;
        savedX.value = x.value;
        savedY.value = y.value;
      })
      .onUpdate((event) => {
        const next = clamp(savedScale.value * event.scale, 1, MAX_SCALE);
        const ratio = next / savedScale.value;
        const focusX = event.focalX - width.value / 2;
        const focusY = event.focalY - height.value / 2;
        scale.value = next;
        x.value = limit(next, focusX - (focusX - savedX.value) * ratio, width.value);
        y.value = limit(next, focusY - (focusY - savedY.value) * ratio, height.value);
      })
      .onEnd(() => {
        if (scale.value < 1.05) reset();
        else reportZoom(true);
      });

    const pan = Gesture.Pan()
      .enabled(zoomed)
      .averageTouches(true)
      .onStart(() => {
        savedX.value = x.value;
        savedY.value = y.value;
      })
      .onUpdate((event) => {
        x.value = limit(scale.value, savedX.value + event.translationX, width.value);
        y.value = limit(scale.value, savedY.value + event.translationY, height.value);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .onEnd((event) => {
        if (scale.value > 1.05) {
          reset();
          return;
        }
        const focusX = event.x - width.value / 2;
        const focusY = event.y - height.value / 2;
        scale.value = withTiming(DOUBLE_TAP_SCALE);
        x.value = withTiming(limit(DOUBLE_TAP_SCALE, -focusX * (DOUBLE_TAP_SCALE - 1), width.value));
        y.value = withTiming(limit(DOUBLE_TAP_SCALE, -focusY * (DOUBLE_TAP_SCALE - 1), height.value));
        reportZoom(true);
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .onEnd(() => {
        if (onTap) scheduleOnRN(onTap);
      });

    return Gesture.Simultaneous(
      Gesture.Simultaneous(pinch, pan),
      Gesture.Exclusive(doubleTap, singleTap),
    );
  }, [zoomed, onTap, onZoomChange]);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View
        style={style}
        collapsable={false}
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width;
          height.value = event.nativeEvent.layout.height;
        }}
      >
        <Animated.View style={[{ flex: 1 }, imageStyle]}>
          <Image source={{ uri }} style={{ flex: 1 }} resizeMode="contain" />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
