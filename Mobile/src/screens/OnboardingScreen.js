import { useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUTES } from '../navigation/helpers';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    title: 'Buy Anything,\nAnywhere',
    body: 'Find great second-hand items near you. Save money, help others, and make smart choices.',
    icon: 'storefront-outline',
    accent: '#5B39C6',
  },
  {
    title: 'Sell With\nEase',
    body: 'Snap a photo, set your price, and post your listing in seconds. Reach buyers near you instantly.',
    icon: 'pricetags-outline',
    accent: '#16A34A',
  },
  {
    title: 'Chat &\nConnect Safely',
    body: "Message sellers directly, negotiate prices, and meet safely. We've got your back every step.",
    icon: 'shield-checkmark-outline',
    accent: '#0D9488',
  },
];

function usePulse(delay = 0) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 1400,
          delay,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value, delay]);
  return value;
}

function Illustration({ icon, accent, colors, styles, active }) {
  const pulse = usePulse(120);
  const scale = useRef(new Animated.Value(active ? 1 : 0.86)).current;
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] });
  const float = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  useEffect(() => {
    Animated.spring(scale, {
      toValue: active ? 1 : 0.9,
      tension: 140,
      friction: 12,
      useNativeDriver: true,
    }).start();
  }, [active, scale]);

  return (
    <View style={styles.illustrationWrap}>
      <Animated.View
        style={[
          styles.illustrationCircle,
          { backgroundColor: `${accent}22`, opacity: glow, transform: [{ scale }] },
        ]}
      />
      <Animated.View style={[styles.sparkleTopLeft, { opacity: pulse, transform: [{ translateY: float }] }]}>
        <Text style={[styles.sparkleGlyph, { color: accent }]}>✦</Text>
      </Animated.View>
      <Animated.View style={[styles.sparkleTopRight, { opacity: pulse }]}>
        <Text style={[styles.sparkleGlyph, { color: accent }]}>✦</Text>
      </Animated.View>
      <Animated.View style={styles.sparkleBottom}>
        <Text style={[styles.sparkleGlyph, { fontSize: 12, color: accent }]}>✦</Text>
      </Animated.View>
      <Animated.View style={{ transform: [{ scale }, { translateY: float }] }}>
        <LinearGradient
          colors={[accent, colors.gradientEnd || colors.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.illustrationBadge}
        >
          <Ionicons name={icon} size={62} color={colors.onGradient} />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

export default function OnboardingScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const { completeOnboarding } = useAuth();
  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;
  const intro = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [intro]);

  if (!colors) {
    return null;
  }

  const isLast = index === SLIDES.length - 1;

  const goToSlide = (i) => {
    scrollRef.current?.scrollTo({ x: i * SCREEN_WIDTH, animated: true });
    setIndex(i);
  };

  const goLogin = async () => {
    await completeOnboarding();
    navigation.replace(ROUTES.LOGIN);
  };

  const onNext = () => {
    if (isLast) {
      goLogin();
    } else {
      goToSlide(index + 1);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ThemeStatusBar />
      <LinearGradient
        colors={[`${colors.primary}18`, 'transparent']}
        style={styles.topGlow}
      />

      <Animated.View
        style={[
          styles.skipBtn,
          {
            opacity: intro,
            transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          },
        ]}
      >
        <Pressable onPress={goLogin} hitSlop={10}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          {
            useNativeDriver: false,
            listener: (e) => {
              const next = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
              if (next !== index) setIndex(next);
            },
          }
        )}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {SLIDES.map((slide, i) => (
          <View key={slide.title} style={styles.slide}>
            <Illustration
              icon={slide.icon}
              accent={slide.accent}
              colors={colors}
              styles={styles}
              active={i === index}
            />
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </Animated.ScrollView>

      <View style={styles.dotsRow}>
        {SLIDES.map((slide, i) => {
          const width = scrollX.interpolate({
            inputRange: [(i - 1) * SCREEN_WIDTH, i * SCREEN_WIDTH, (i + 1) * SCREEN_WIDTH],
            outputRange: [8, 22, 8],
            extrapolate: 'clamp',
          });
          return (
            <Animated.View
              key={slide.title}
              style={[
                styles.dot,
                {
                  width,
                  backgroundColor: i === index ? slide.accent : colors.border,
                },
              ]}
            />
          );
        })}
      </View>

      <Animated.View
        style={[
          styles.nextWrap,
          {
            marginBottom: Math.max(insets.bottom, 20),
            transform: [{ scale: ctaScale }],
          },
        ]}
      >
        <Pressable
          onPress={onNext}
          onPressIn={() =>
            Animated.spring(ctaScale, { toValue: 0.97, useNativeDriver: true, tension: 300, friction: 12 }).start()
          }
          onPressOut={() =>
            Animated.spring(ctaScale, { toValue: 1, useNativeDriver: true, tension: 280, friction: 11 }).start()
          }
        >
          <LinearGradient
            colors={colors.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.nextButton}
          >
            <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
            <Ionicons name={isLast ? 'sparkles' : 'arrow-forward'} size={20} color={colors.onGradient} />
          </LinearGradient>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  skipBtn: {
    position: 'absolute',
    top: 0,
    right: 20,
    zIndex: 10,
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  skipText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.primary,
  },
  pager: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 28,
    paddingTop: 72,
    alignItems: 'center',
  },
  illustrationWrap: {
    width: '100%',
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  illustrationCircle: {
    position: 'absolute',
    width: 250,
    height: 250,
    borderRadius: 125,
  },
  illustrationBadge: {
    width: 132,
    height: 132,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  sparkleTopLeft: {
    position: 'absolute',
    top: 10,
    left: 30,
  },
  sparkleTopRight: {
    position: 'absolute',
    top: 30,
    right: 20,
  },
  sparkleBottom: {
    position: 'absolute',
    bottom: 24,
    left: 50,
  },
  sparkleGlyph: {
    fontSize: 16,
    fontWeight: '700',
    opacity: 0.7,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 40,
  },
  body: {
    marginTop: 16,
    fontSize: 15,
    lineHeight: 23,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 18,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextWrap: {
    marginHorizontal: 24,
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
    paddingVertical: 18,
  },
  nextText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onGradient,
  },
});
