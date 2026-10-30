import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import { LinearGradient } from 'expo-linear-gradient';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Animated, {
  Easing,
  Extrapolation,
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ROUTES } from '../navigation/helpers';
import { useAuth } from '../context/AuthContext';
import { useTheme, useThemedStyles, ThemeStatusBar } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** Square art box; onboarding images are square transparent WebPs. */
const ART_SIZE = Math.round(Math.min(SCREEN_WIDTH - 56, SCREEN_HEIGHT * 0.37));

// `icon` is the fallback when a slide has no image. `accentDark` keeps text readable on dark bg.
const SLIDES = [
  {
    kicker: 'Buy nearby',
    title: 'Find Deals\nNear You',
    body: 'Phones, furniture, bikes and more from people in your area.',
    icon: 'location-outline',
    accent: '#047857',
    accentDark: '#34D399',
    chips: [
      ['navigate-outline', 'Near you'],
      ['flash-outline', 'New daily'],
      ['eye-outline', 'Browse free'],
    ],
    image: require('../../assets/images/onboarding/step1.webp'),
  },
  {
    kicker: 'Sell fast',
    title: 'Sell in\nSeconds',
    body: 'Snap a photo and AI writes the title, details and a fair price for you.',
    icon: 'camera-outline',
    accent: '#059669',
    accentDark: '#6EE7B7',
    chips: [
      ['camera-outline', '1 photo'],
      ['sparkles-outline', 'AI details'],
      ['pricetag-outline', 'Fair price'],
    ],
    image: require('../../assets/images/onboarding/step2.webp'),
  },
  {
    kicker: 'Safe deals',
    title: 'Chat & Meet\nSafely',
    body: 'Talk to sellers inside KinBech, then meet in a public place to check the item.',
    icon: 'chatbubbles-outline',
    accent: '#0D9488',
    accentDark: '#5EEAD4',
    chips: [
      ['chatbubble-ellipses-outline', 'In-app chat'],
      ['call-outline', 'Calls'],
      ['people-outline', 'Public meetups'],
    ],
    image: require('../../assets/images/onboarding/step3.webp'),
  },
  {
    kicker: 'Trusted',
    title: 'Trusted Sellers,\nPay Your Way',
    body: 'Buy from verified shops with real ratings and pay in person, your way.',
    icon: 'shield-checkmark-outline',
    accent: '#065F46',
    accentDark: '#86EFAC',
    chips: [
      ['shield-checkmark-outline', 'Verified'],
      ['star-outline', 'Ratings'],
      ['wallet-outline', 'Cash · eSewa · Khalti'],
    ],
    image: require('../../assets/images/onboarding/step4.webp'),
  },
];

const LAST = SLIDES.length - 1;
const CLAMP = Extrapolation.CLAMP;

/** Where page `i` sits against the scroll: -1 one page to the right, 0 centered, 1 one page to the left. */
const progressOf = (x, i) => {
  'worklet';
  return x / SCREEN_WIDTH - i;
};

function useLoop(duration, delay = 0) {
  const value = useSharedValue(0);
  useEffect(() => {
    value.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.quad) }), -1, true)
    );
    return () => cancelAnimation(value);
  }, [value, duration, delay]);
  return value;
}

function Illustration({ slide, tone, index, scrollX, intro, colors, styles }) {
  const float = useLoop(1600, 120);
  const breathe = useLoop(2200);

  // Everything follows the scroll position only, so the art never jumps when the page index flips.
  const wrapStyle = useAnimatedStyle(() => {
    const p = progressOf(scrollX.value, index);
    const away = Math.min(Math.abs(p), 1);
    const settle = 1 - (1 - away) * (1 - away);
    const enter = interpolate(intro.value, [0, 0.55], [0, 1], CLAMP);
    return {
      opacity: interpolate(away, [0, 0.85], [1, 0], CLAMP) * interpolate(intro.value, [0, 0.4], [0, 1], CLAMP),
      transform: [
        { translateX: p * SCREEN_WIDTH * 0.3 },
        { translateY: settle * 26 },
        { scale: (1 - settle * 0.22) * (0.82 + enter * 0.18) },
      ],
    };
  });

  // Off-screen slides hold still, so the loops don't cost a frame update for art nobody sees.
  const haloStyle = useAnimatedStyle(() => {
    const away = Math.min(Math.abs(progressOf(scrollX.value, index)), 1);
    const b = away < 1 ? breathe.value : 0;
    return {
      opacity: (0.55 + b * 0.45) * (1 - away),
      transform: [{ scale: (0.92 + b * 0.14) * (1 + away * 0.35) }],
    };
  });
  const haloInnerStyle = useAnimatedStyle(() => {
    const visible = Math.abs(progressOf(scrollX.value, index)) < 1;
    return { transform: [{ scale: 0.92 + (visible ? breathe.value : 0) * 0.14 }] };
  });

  const artStyle = useAnimatedStyle(() => {
    const visible = Math.abs(progressOf(scrollX.value, index)) < 1;
    return { transform: [{ translateY: visible ? -7 * float.value : 0 }] };
  });

  return (
    <Animated.View style={[styles.illustrationWrap, wrapStyle]}>
      <Animated.View style={[styles.haloOuter, { backgroundColor: `${tone}12` }, haloStyle]} />
      <Animated.View style={[styles.haloInner, { backgroundColor: `${tone}1C` }, haloInnerStyle]} />

      {slide.image ? (
        <Animated.Image source={slide.image} resizeMode="contain" style={[styles.illustrationImage, artStyle]} />
      ) : (
        <Animated.View style={artStyle}>
          <LinearGradient
            colors={[slide.accent, colors.gradientEnd || colors.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.illustrationBadge}
          >
            <Icon name={slide.icon} size={62} color={colors.onGradient} />
          </LinearGradient>
        </Animated.View>
      )}
    </Animated.View>
  );
}

/** First-load cascade: each piece rises in a little after the last. It only moves during the intro. */
function Rise({ intro, from, style, children }) {
  const riseStyle = useAnimatedStyle(() => {
    const enter = interpolate(intro.value, [from, from + 0.45], [0, 1], CLAMP);
    return { opacity: enter, transform: [{ translateY: (1 - enter) * 18 }] };
  });
  return <Animated.View style={[style, riseStyle]}>{children}</Animated.View>;
}

/** Swipe cascade: the heading and the details slide by different amounts. Two groups keep frames cheap. */
function Drift({ index, scrollX, offset, style, children }) {
  const driftStyle = useAnimatedStyle(() => {
    const p = progressOf(scrollX.value, index);
    return {
      opacity: interpolate(Math.abs(p), [0, 0.7], [1, 0], CLAMP),
      transform: [{ translateX: -p * offset }],
    };
  });
  return <Animated.View style={[style, driftStyle]}>{children}</Animated.View>;
}

function SlideText({ slide, tone, index, scrollX, intro, styles }) {
  const [lead, highlight] = slide.title.split('\n');

  return (
    <View style={styles.textBlock}>
      <Drift index={index} scrollX={scrollX} offset={60} style={styles.textGroup}>
        <Rise
          intro={intro}
          from={0.2}
          style={[styles.kicker, { backgroundColor: `${tone}1A`, borderColor: `${tone}3D` }]}
        >
          <Icon name={slide.icon.replace('-outline', '')} size={13} color={tone} />
          <Text style={[styles.kickerText, { color: tone }]}>{slide.kicker}</Text>
        </Rise>

        <Rise intro={intro} from={0.28}>
          <Text style={styles.title}>
            {lead}
            {highlight ? <Text style={{ color: tone }}>{`\n${highlight}`}</Text> : null}
          </Text>
        </Rise>
      </Drift>

      <Drift index={index} scrollX={scrollX} offset={140} style={styles.textGroup}>
        <Rise intro={intro} from={0.36} style={styles.bodyWrap}>
          <Text style={styles.body}>{slide.body}</Text>
        </Rise>

        <Rise intro={intro} from={0.44} style={styles.chipsRow}>
          {slide.chips.map(([icon, label]) => (
            <View key={label} style={[styles.chip, { backgroundColor: `${tone}12`, borderColor: `${tone}2E` }]}>
              <Icon name={icon} size={13} color={tone} />
              <Text style={styles.chipText}>{label}</Text>
            </View>
          ))}
        </Rise>
      </Drift>
    </View>
  );
}

function Glow({ index, scrollX, tone, styles }) {
  const glowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(Math.abs(progressOf(scrollX.value, index)), [0, 1], [1, 0], CLAMP),
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.bgGlow, glowStyle]}>
      <LinearGradient colors={[`${tone}2E`, `${tone}0D`, 'transparent']} style={styles.fill} />
    </Animated.View>
  );
}

function Dot({ index, scrollX, tone, border, onPress, styles }) {
  const dotStyle = useAnimatedStyle(() => {
    const away = Math.min(Math.abs(progressOf(scrollX.value, index)), 1);
    return {
      width: 8 + (1 - away) * 18,
      backgroundColor: interpolateColor(away, [0, 1], [tone, border]),
    };
  });
  return (
    <Pressable onPress={onPress} hitSlop={8}>
      <Animated.View style={[styles.dot, dotStyle]} />
    </Pressable>
  );
}

/**
 * Holds the only page-dependent state (Next vs Get Started). Re-rendering it alone matters: a re-render
 * of the whole screen snaps settled animated styles (text, footer, dots) back to their first-render values.
 */
function NextButton({ lastRef, onPress, colors, styles }) {
  const [isLast, setIsLast] = useState(false);
  const ctaScale = useSharedValue(1);
  const label = useSharedValue(1);
  const nudge = useLoop(700);
  lastRef.current = setIsLast;

  useEffect(() => {
    label.value = 0;
    label.value = withSpring(1, { damping: 12, stiffness: 160 });
  }, [isLast, label]);

  const ctaStyle = useAnimatedStyle(() => ({ transform: [{ scale: ctaScale.value }] }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: Math.min(label.value, 1),
    transform: [{ scale: 0.85 + label.value * 0.15 }],
  }));
  const arrowStyle = useAnimatedStyle(() => ({
    transform: isLast
      ? [{ rotate: `${-12 + nudge.value * 24}deg` }]
      : [{ translateX: nudge.value * 5 }],
  }));

  return (
    <Animated.View style={ctaStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          ctaScale.value = withSpring(0.96, { damping: 14, stiffness: 300 });
        }}
        onPressOut={() => {
          ctaScale.value = withSpring(1, { damping: 13, stiffness: 280 });
        }}
      >
        <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.nextButton}>
          <Animated.View style={[styles.nextInner, labelStyle]}>
            <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
            <Animated.View key={isLast ? 'sparkles' : 'arrow'} style={arrowStyle}>
              <Icon name={isLast ? 'sparkles' : 'arrow-forward'} size={20} color={colors.onGradient} />
            </Animated.View>
          </Animated.View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

export default function OnboardingScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { completeOnboarding } = useAuth();
  // The pager is a native paging ScrollView (smooth on its own); the art and text follow it on the UI thread.
  const scrollRef = useRef(null);
  const scrollX = useSharedValue(0);
  const shownIndex = useSharedValue(0);
  /** Page the pager rests on or a Next/dot tap is heading to, so a second tap mid-scroll continues from there. */
  const targetRef = useRef(0);
  const lastRef = useRef(null);
  const intro = useSharedValue(0);
  const finishingRef = useRef(false);

  const showIndex = useCallback((next) => {
    targetRef.current = next;
    lastRef.current?.(next === LAST);
  }, []);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      const x = e.contentOffset.x;
      scrollX.value = x;
      const page = Math.round(x / SCREEN_WIDTH);
      if (Math.abs(x - page * SCREEN_WIDTH) > 1 || page === shownIndex.value) return;
      shownIndex.value = page;
      scheduleOnRN(showIndex, Math.max(0, Math.min(LAST, page)));
    },
  });

  useEffect(() => {
    intro.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
  }, [intro]);

  const skipStyle = useAnimatedStyle(() => ({
    opacity:
      intro.value *
      interpolate(scrollX.value, [(LAST - 1) * SCREEN_WIDTH, (LAST - 0.4) * SCREEN_WIDTH], [1, 0], CLAMP),
    transform: [{ translateY: (1 - intro.value) * -8 }],
  }));
  const footerStyle = useAnimatedStyle(() => {
    const enter = interpolate(intro.value, [0.5, 1], [0, 1], CLAMP);
    return { opacity: enter, transform: [{ translateY: (1 - enter) * 24 }] };
  });

  if (!colors) {
    return null;
  }

  const toneOf = (slide) => (isDark ? slide.accentDark : slide.accent);

  const goToSlide = (i) => {
    const next = Math.max(0, Math.min(LAST, i));
    targetRef.current = next;
    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
  };

  const finishOnboarding = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await completeOnboarding().catch(() => {});
    navigation.replace(ROUTES.MAIN_TABS);
  };

  const onNext = () => {
    if (targetRef.current >= LAST) {
      finishOnboarding();
    } else {
      goToSlide(targetRef.current + 1);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ThemeStatusBar />
      {SLIDES.map((slide, i) => (
        <Glow key={slide.title} index={i} scrollX={scrollX} tone={toneOf(slide)} styles={styles} />
      ))}

      <Animated.View style={[styles.skipBtn, { top: insets.top }, skipStyle]}>
        <Pressable onPress={() => targetRef.current < LAST && finishOnboarding()} hitSlop={10}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {SLIDES.map((slide, i) => (
          <View key={slide.title} style={styles.slide}>
            <Illustration
              slide={slide}
              tone={toneOf(slide)}
              index={i}
              scrollX={scrollX}
              intro={intro}
              colors={colors}
              styles={styles}
            />
            <SlideText
              slide={slide}
              tone={toneOf(slide)}
              index={i}
              scrollX={scrollX}
              intro={intro}
              styles={styles}
            />
          </View>
        ))}
      </Animated.ScrollView>

      <Animated.View style={[styles.footer, { marginBottom: Math.max(insets.bottom, 20) }, footerStyle]}>
        <View style={styles.dotsRow}>
          {SLIDES.map((slide, i) => (
            <Dot
              key={slide.title}
              index={i}
              scrollX={scrollX}
              tone={toneOf(slide)}
              border={colors.border}
              onPress={() => goToSlide(i)}
              styles={styles}
            />
          ))}
        </View>

        <NextButton lastRef={lastRef} onPress={onNext} colors={colors} styles={styles} />
      </Animated.View>
    </View>
  );
}

const createStyles = (colors) => ({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  bgGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCREEN_HEIGHT * 0.6,
  },
  fill: {
    flex: 1,
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
    color: colors.accentText || colors.primary,
  },
  pager: {
    flex: 1,
  },
  slide: {
    width: SCREEN_WIDTH,
    paddingHorizontal: 24,
    paddingTop: 44,
    alignItems: 'center',
  },
  illustrationWrap: {
    width: ART_SIZE,
    height: ART_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  haloOuter: {
    position: 'absolute',
    width: ART_SIZE * 0.92,
    height: ART_SIZE * 0.92,
    borderRadius: ART_SIZE,
  },
  haloInner: {
    position: 'absolute',
    width: ART_SIZE * 0.64,
    height: ART_SIZE * 0.64,
    borderRadius: ART_SIZE,
  },
  illustrationImage: {
    width: ART_SIZE,
    height: ART_SIZE,
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
  textBlock: {
    width: '100%',
    alignItems: 'center',
  },
  textGroup: {
    width: '100%',
    alignItems: 'center',
  },
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 12,
  },
  kickerText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    lineHeight: 37,
    letterSpacing: -0.5,
  },
  bodyWrap: {
    marginTop: 12,
    maxWidth: 330,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
  },
  footer: {
    marginHorizontal: 24,
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
  nextButton: {
    borderRadius: 18,
    paddingVertical: 18,
  },
  nextInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  nextText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.onGradient,
  },
});
