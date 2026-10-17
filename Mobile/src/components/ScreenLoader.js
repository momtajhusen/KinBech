import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, Text, View } from 'react-native';

const APP_LOGO = require('../../assets/icons/app-icon.png');

export default function ScreenLoader({ label = 'Loading', overlay = false, compact = false }) {
  const fade = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const ring = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.92,
          duration: 700,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    ring.start();
    breathe.start();
    return () => {
      ring.stop();
      breathe.stop();
    };
  }, [fade, pulse, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        compact ? styles.compact : styles.screen,
        overlay && styles.overlay,
        { opacity: fade },
      ]}
      pointerEvents="auto"
    >
      <Animated.View style={[styles.mark, compact && styles.markCompact, { transform: [{ scale: pulse }] }]}>
        <Animated.View style={[styles.ring, compact && styles.ringCompact, { transform: [{ rotate }] }]} />
        <View style={[styles.iconWrap, compact && styles.iconWrapCompact]}>
          <Image source={APP_LOGO} style={styles.icon} resizeMode="cover" accessibilityLabel="KinBech" />
        </View>
      </Animated.View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 15, 23, 0.94)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
  },
  compact: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  markCompact: {
    width: 96,
    height: 96,
  },
  ringCompact: {
    width: 96,
    height: 96,
    borderRadius: 48,
  },
  iconWrapCompact: {
    width: 62,
    height: 62,
    borderRadius: 18,
  },
  mark: {
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 3,
    borderColor: 'rgba(4, 120, 87, 0.22)',
    borderTopColor: '#34D399',
    borderRightColor: '#047857',
  },
  iconWrap: {
    width: 84,
    height: 84,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  label: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#E5E7EB',
  },
});
