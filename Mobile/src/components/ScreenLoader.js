import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Modal, StyleSheet, Text, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

const APP_LOGO = require('../../assets/icons/app-icon.png');

const SIZES = {
  full: { ring: 112, icon: 76, radius: 22, stroke: 3 },
  compact: { ring: 88, icon: 58, radius: 17, stroke: 2.5 },
};

function useScreenFocused() {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => (navigation ? navigation.isFocused() : true));

  useEffect(() => {
    if (!navigation) return undefined;
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  return { focused, navigation };
}

function LoaderMark({ label, compact }) {
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0.94)).current;
  const size = compact ? SIZES.compact : SIZES.full;

  useEffect(() => {
    const ring = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.94, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    ring.start();
    breathe.start();
    return () => {
      ring.stop();
      breathe.stop();
    };
  }, [pulse, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const ringBox = { width: size.ring, height: size.ring, borderRadius: size.ring / 2, borderWidth: size.stroke };

  return (
    <View style={{ width: size.ring, height: size.ring, alignItems: 'center', justifyContent: 'center' }}>
      <View style={[styles.track, ringBox]} />
      <Animated.View style={[styles.arc, ringBox, { transform: [{ rotate }] }]} />
      <Animated.View
        style={[
          styles.iconWrap,
          { width: size.icon, height: size.icon, borderRadius: size.radius, transform: [{ scale: pulse }] },
        ]}
      >
        <Image source={APP_LOGO} style={styles.icon} resizeMode="cover" accessibilityLabel="KinBech" />
      </Animated.View>
      {label ? (
        <View style={[styles.labelWrap, { top: size.ring + 18 }]} pointerEvents="none">
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

/**
 * Full mode covers the whole phone screen (status bar and tab bar included)
 * with the mark in the exact centre. `compact` stays inline inside its parent.
 */
export default function ScreenLoader({ label = 'Loading', overlay = false, compact = false }) {
  const fade = useRef(new Animated.Value(0)).current;
  const { focused, navigation } = useScreenFocused();

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fade]);

  if (compact) {
    return (
      <Animated.View style={[styles.compact, { opacity: fade }]}>
        <LoaderMark label={label} compact />
      </Animated.View>
    );
  }

  return (
    <>
      {overlay ? null : <View style={styles.placeholder} />}
      <Modal
        visible={focused}
        transparent
        animationType="none"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          if (navigation?.canGoBack?.()) navigation.goBack();
        }}
      >
        <Animated.View style={[styles.screen, { opacity: fade }]}>
          <LoaderMark label={label} />
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    flex: 1,
    backgroundColor: '#0B0F17',
  },
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(11, 15, 23, 0.97)',
  },
  compact: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  track: {
    position: 'absolute',
    borderColor: 'rgba(52, 211, 153, 0.16)',
  },
  arc: {
    position: 'absolute',
    borderColor: 'transparent',
    borderTopColor: '#34D399',
    borderRightColor: '#10B981',
  },
  iconWrap: {
    overflow: 'hidden',
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  icon: {
    width: '100%',
    height: '100%',
  },
  labelWrap: {
    position: 'absolute',
    width: 260,
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.4,
    color: '#E5E7EB',
    textAlign: 'center',
  },
});
