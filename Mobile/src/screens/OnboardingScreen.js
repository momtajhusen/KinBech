import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
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
const pageRange = (i, spread = 1) => [
  (i - spread) * SCREEN_WIDTH,
  i * SCREEN_WIDTH,
  (i + spread) * SCREEN_WIDTH,
];

function usePulse(delay = 0, duration = 1400) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration,
          delay,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [value, delay, duration]);
  return value;
}

/** Scroll and intro values are JS-driven; pulse/spring values are native, so they live on separate nodes. */
function Illustration({ slide, tone, index, active, scrollX, intro, colors, styles }) {
  const pulse = usePulse(120);
  const breathe = usePulse(0, 2200);
  const activeScale = useRef(new Animated.Value(active ? 1 : 0.9)).current;
  const float = pulse.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });

  useEffect(() => {
    Animated.spring(activeScale, {
      toValue: active ? 1 : 0.9,
      tension: 120,
      friction: 10,
      useNativeDriver: true,
    }).start();
  }, [active, activeScale]);

  const range = pageRange(index);
  const parallax = scrollX.interpolate({
    inputRange: range,
    outputRange: [-SCREEN_WIDTH * 0.35, 0, SCREEN_WIDTH * 0.35],
    extrapolate: 'clamp',
  });
  const rotate = scrollX.interpolate({
    inputRange: range,
    outputRange: ['10deg', '0deg', '-10deg'],
    extrapolate: 'clamp',
  });
  const scrollScale = scrollX.interpolate({ inputRange: range, outputRange: [0.6, 1, 0.6], extrapolate: 'clamp' });
  const scrollFade = scrollX.interpolate({ inputRange: range, outputRange: [0, 1, 0], extrapolate: 'clamp' });
  const introScale = intro.interpolate({ inputRange: [0, 0.55], outputRange: [0.8, 1], extrapolate: 'clamp' });
  const introFade = intro.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' });

  const haloScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.06] });
  const haloFade = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <Animated.View
      style={[
        styles.illustrationWrap,
        {
          opacity: Animated.multiply(scrollFade, introFade),
          transform: [
            { translateX: parallax },
            { rotate },
            { scale: Animated.multiply(scrollScale, introScale) },
          ],
        },
      ]}
    >
      <Animated.View
        style={[
          styles.haloOuter,
          { backgroundColor: `${tone}12`, opacity: haloFade, transform: [{ scale: haloScale }] },
        ]}
      />
      <Animated.View style={[styles.haloInner, { backgroundColor: `${tone}1C`, transform: [{ scale: haloScale }] }]} />

      {slide.image ? (
        <Animated.Image
          source={slide.image}
          resizeMode="contain"
          style={[styles.illustrationImage, { transform: [{ scale: activeScale }, { translateY: float }] }]}
        />
      ) : (
        <Animated.View style={{ transform: [{ scale: activeScale }, { translateY: float }] }}>
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

function SlideText({ slide, tone, index, scrollX, intro, styles }) {
  const fade = scrollX.interpolate({ inputRange: pageRange(index, 0.7), outputRange: [0, 1, 0], extrapolate: 'clamp' });
  const [lead, highlight] = slide.title.split('\n');

  /** Each layer slides a bit further than the last, so content cascades during swipe and on first load. */
  const layer = (offset, from) => {
    const enter = intro.interpolate({ inputRange: [from, from + 0.45], outputRange: [0, 1], extrapolate: 'clamp' });
    return {
      opacity: Animated.multiply(fade, enter),
      transform: [
        {
          translateX: scrollX.interpolate({
            inputRange: pageRange(index),
            outputRange: [offset, 0, -offset],
            extrapolate: 'clamp',
          }),
        },
        { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
      ],
    };
  };

  return (
    <View style={styles.textBlock}>
      <Animated.View
        style={[styles.kicker, { backgroundColor: `${tone}1A`, borderColor: `${tone}3D` }, layer(40, 0.2)]}
      >
        <Icon name={slide.icon.replace('-outline', '')} size={13} color={tone} />
        <Text style={[styles.kickerText, { color: tone }]}>{slide.kicker}</Text>
      </Animated.View>

      <Animated.Text style={[styles.title, layer(90, 0.28)]}>
        {lead}
        {highlight ? <Text style={{ color: tone }}>{`\n${highlight}`}</Text> : null}
      </Animated.Text>

      <Animated.Text style={[styles.body, layer(140, 0.36)]}>{slide.body}</Animated.Text>

      <View style={styles.chipsRow}>
        {slide.chips.map(([icon, label], j) => (
          <Animated.View
            key={label}
            style={[
              styles.chip,
              { backgroundColor: `${tone}12`, borderColor: `${tone}2E` },
              layer(180 + j * 45, 0.44 + j * 0.06),
            ]}
          >
            <Icon name={icon} size={13} color={tone} />
            <Text style={styles.chipText}>{label}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

export default function OnboardingScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const { completeOnboarding } = useAuth();
  const scrollRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const ctaScale = useRef(new Animated.Value(1)).current;
  const intro = useRef(new Animated.Value(0)).current;
  const label = useRef(new Animated.Value(1)).current;
  const nudge = usePulse(0, 700);
  const indexRef = useRef(0);
  /** Page a Next/dot tap is scrolling to; scroll events are ignored until it lands so the index can't snap back. */
  const targetRef = useRef(null);
  const targetTimerRef = useRef(null);
  const finishingRef = useRef(false);

  const syncIndex = (x) => {
    const next = Math.max(0, Math.min(LAST, Math.round(x / SCREEN_WIDTH)));
    if (next !== indexRef.current) {
      indexRef.current = next;
      setIndex(next);
    }
  };
  const clearTarget = () => {
    targetRef.current = null;
    clearTimeout(targetTimerRef.current);
  };

  const onScroll = useRef(
    Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
      useNativeDriver: false,
      listener: (e) => {
        const x = e.nativeEvent.contentOffset.x;
        const target = targetRef.current;
        if (target != null) {
          if (Math.abs(x - target * SCREEN_WIDTH) < 2) clearTarget();
          return;
        }
        syncIndex(x);
      },
    })
  ).current;

  useEffect(() => () => clearTimeout(targetTimerRef.current), []);

  useEffect(() => {
    Animated.timing(intro, {
      toValue: 1,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [intro]);

  const isLast = index === LAST;

  useEffect(() => {
    label.setValue(0);
    Animated.spring(label, { toValue: 1, tension: 160, friction: 9, useNativeDriver: true }).start();
  }, [isLast, label]);

  if (!colors) {
    return null;
  }

  const toneOf = (slide) => (isDark ? slide.accentDark : slide.accent);

  const goToSlide = (i) => {
    const next = Math.max(0, Math.min(LAST, i));
    clearTarget();
    targetRef.current = next;
    targetTimerRef.current = setTimeout(clearTarget, 800);
    indexRef.current = next;
    setIndex(next);
    scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
  };

  const finishOnboarding = async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    await completeOnboarding().catch(() => {});
    navigation.replace(ROUTES.MAIN_TABS);
  };

  const onNext = () => {
    if (indexRef.current >= LAST) {
      finishOnboarding();
    } else {
      goToSlide(indexRef.current + 1);
    }
  };

  const skipFade = scrollX.interpolate({
    inputRange: [(LAST - 1) * SCREEN_WIDTH, (LAST - 0.4) * SCREEN_WIDTH],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });
  const ctaEnter = intro.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ThemeStatusBar />
      {SLIDES.map((slide, i) => (
        <Animated.View
          key={slide.title}
          pointerEvents="none"
          style={[
            styles.bgGlow,
            { opacity: scrollX.interpolate({ inputRange: pageRange(i), outputRange: [0, 1, 0], extrapolate: 'clamp' }) },
          ]}
        >
          <LinearGradient
            colors={[`${toneOf(slide)}2E`, `${toneOf(slide)}0D`, 'transparent']}
            style={styles.fill}
          />
        </Animated.View>
      ))}

      <Animated.View
        pointerEvents={isLast ? 'none' : 'auto'}
        style={[
          styles.skipBtn,
          {
            opacity: Animated.multiply(intro, skipFade),
            transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          },
        ]}
      >
        <Pressable onPress={finishOnboarding} hitSlop={10}>
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
        onScrollBeginDrag={clearTarget}
        onMomentumScrollEnd={(e) => {
          clearTarget();
          syncIndex(e.nativeEvent.contentOffset.x);
        }}
        scrollEventThrottle={16}
        style={styles.pager}
      >
        {SLIDES.map((slide, i) => (
          <View key={slide.title} style={styles.slide}>
            <Illustration
              slide={slide}
              tone={toneOf(slide)}
              index={i}
              active={i === index}
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

      <Animated.View
        style={[
          styles.footer,
          {
            marginBottom: Math.max(insets.bottom, 20),
            opacity: ctaEnter,
            transform: [{ translateY: ctaEnter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
          },
        ]}
      >
        <View style={styles.dotsRow}>
          {SLIDES.map((slide, i) => (
            <Pressable key={slide.title} onPress={() => goToSlide(i)} hitSlop={8}>
              <Animated.View
                style={[
                  styles.dot,
                  {
                    width: scrollX.interpolate({
                      inputRange: pageRange(i),
                      outputRange: [8, 26, 8],
                      extrapolate: 'clamp',
                    }),
                    backgroundColor: scrollX.interpolate({
                      inputRange: pageRange(i),
                      outputRange: [colors.border, toneOf(slide), colors.border],
                      extrapolate: 'clamp',
                    }),
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>

        <Animated.View style={{ transform: [{ scale: ctaScale }] }}>
          <Pressable
            onPress={onNext}
            onPressIn={() =>
              Animated.spring(ctaScale, { toValue: 0.96, useNativeDriver: true, tension: 300, friction: 12 }).start()
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
              <Animated.View
                style={[
                  styles.nextInner,
                  {
                    opacity: label,
                    transform: [{ scale: label.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
                  },
                ]}
              >
                <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
                <Animated.View
                  key={isLast ? 'sparkles' : 'arrow'}
                  style={{
                    transform: isLast
                      ? [{ rotate: nudge.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '12deg'] }) }]
                      : [{ translateX: nudge.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }) }],
                  }}
                >
                  <Icon name={isLast ? 'sparkles' : 'arrow-forward'} size={20} color={colors.onGradient} />
                </Animated.View>
              </Animated.View>
            </LinearGradient>
          </Pressable>
        </Animated.View>
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
  body: {
    marginTop: 12,
    maxWidth: 330,
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
