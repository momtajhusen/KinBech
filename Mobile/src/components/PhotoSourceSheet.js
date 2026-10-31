import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeIn, FadeInDown, withSpring, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Pulse, Reanimated, Shimmer } from './Motion';
import { useTheme, useThemedStyles } from '../theme';

const TIPS = [
  { icon: 'sunny-outline', label: 'Good light' },
  { icon: 'square-outline', label: 'Plain background' },
  { icon: 'scan-outline', label: 'Whole item' },
];

let opener = null;

/** Resolves to 'camera', 'gallery' or null. `slot: 'main'` is the cover photo the AI reads. */
export function requestPhotoSource({ slot = 'extra' } = {}) {
  return new Promise((resolve) => {
    if (typeof opener !== 'function') {
      resolve(null);
      return;
    }
    opener(resolve, slot);
  });
}

export function PhotoSourceSheetHost() {
  const resolverRef = useRef(null);
  const closingRef = useRef(false);
  const [visible, setVisible] = useState(false);
  const [slot, setSlot] = useState('extra');

  useEffect(() => {
    opener = (resolve, nextSlot) => {
      if (resolverRef.current) resolverRef.current(null);
      closingRef.current = false;
      resolverRef.current = resolve;
      setSlot(nextSlot);
      setVisible(true);
    };
    return () => {
      opener = null;
    };
  }, []);

  const finish = (value) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setVisible(false);
    // Wait until this sheet is gone. Opening the gallery while it is still on screen
    // makes Android drop the selected photo, and the listing box keeps spinning.
    setTimeout(() => {
      const resolve = resolverRef.current;
      resolverRef.current = null;
      resolve?.(value);
    }, 320);
  };

  return <PhotoSourceSheet visible={visible} slot={slot} onSelect={finish} />;
}

function cardIn() {
  'worklet';
  const spring = { damping: 16, stiffness: 170, mass: 0.8 };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 50 }, { scale: 0.94 }] },
    animations: {
      opacity: withTiming(1, { duration: 200 }),
      transform: [{ translateY: withSpring(0, spring) }, { scale: withSpring(1, spring) }],
    },
  };
}

function PhotoSourceSheet({ visible, slot, onSelect }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const sheetWidth = Math.min(width - 24, 520);
  const cover = slot === 'main';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onSelect(null)}
    >
      {visible ? (
        <Reanimated.View entering={FadeIn.duration(180)} style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} />
          <Reanimated.View entering={cardIn} style={[styles.sheet, { width: sheetWidth }]}>
            <View style={styles.header}>
              <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.headerIcon}>
                <Icon name={cover ? 'image' : 'images'} size={20} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>{cover ? 'Add cover photo' : 'Add a photo'}</Text>
                <Text style={styles.headerSubtitle}>Clear photos sell faster</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => onSelect(null)} hitSlop={12}>
                <Icon name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {cover ? (
              <Reanimated.View entering={FadeInDown.delay(80).duration(260)} style={styles.aiNote}>
                <Icon name="sparkles" size={14} color={colors.primary} />
                <Text style={styles.aiNoteText}>AI reads this photo and fills the title, category and price for you.</Text>
              </Reanimated.View>
            ) : null}

            <View style={styles.options}>
              <PressableScale style={styles.optionWrap} scaleTo={0.96} onPress={() => onSelect('camera')}>
                <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.optionHero}>
                  <Shimmer />
                  <View style={styles.badge}>
                    <Icon name="star" size={9} color={colors.gradientStart} />
                    <Text style={styles.badgeText}>Best</Text>
                  </View>
                  <Pulse to={1.1} pause={1600} style={styles.heroIcon}>
                    <Icon name="camera" size={26} color="#FFFFFF" />
                  </Pulse>
                  <Text style={styles.heroTitle}>Camera</Text>
                  <Text style={styles.heroSubtitle}>Take a new photo</Text>
                </LinearGradient>
              </PressableScale>

              <PressableScale style={styles.optionWrapPlain} scaleTo={0.96} onPress={() => onSelect('gallery')}>
                <View style={styles.option}>
                  <View style={styles.optionIcon}>
                    <Icon name="images" size={26} color={colors.primary} />
                  </View>
                  <Text style={styles.optionTitle}>Gallery</Text>
                  <Text style={styles.optionSubtitle}>Choose a saved photo</Text>
                </View>
              </PressableScale>
            </View>

            <View style={styles.tips}>
              {TIPS.map((tip, index) => (
                <Reanimated.View key={tip.label} entering={FadeInDown.delay(140 + index * 60).duration(260)} style={styles.tip}>
                  <Icon name={tip.icon} size={13} color={colors.primary} />
                  <Text style={styles.tipText} numberOfLines={1}>{tip.label}</Text>
                </Reanimated.View>
              ))}
            </View>

            <Pressable style={({ pressed }) => [styles.cancel, pressed && styles.pressed]} onPress={() => onSelect(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Reanimated.View>
        </Reanimated.View>
      ) : null}
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(2, 6, 23, 0.68)',
      paddingHorizontal: 12,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      elevation: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    headerIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '900',
      color: colors.text,
      letterSpacing: -0.2,
    },
    headerSubtitle: {
      marginTop: 2,
      fontSize: 12.5,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    closeBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    aiNote: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: `${colors.primary}14`,
      borderWidth: 1,
      borderColor: `${colors.primary}33`,
    },
    aiNoteText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      color: colors.text,
    },
    options: {
      flexDirection: 'row',
      gap: 10,
    },
    optionWrap: {
      flex: 1,
      minWidth: 0,
      borderRadius: 18,
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    optionWrapPlain: {
      flex: 1,
      minWidth: 0,
    },
    optionHero: {
      borderRadius: 18,
      overflow: 'hidden',
      paddingVertical: 16,
      paddingHorizontal: 14,
      minHeight: 150,
    },
    badge: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 999,
      backgroundColor: '#FFFFFF',
    },
    badgeText: {
      fontSize: 10,
      fontWeight: '900',
      color: colors.gradientStart,
    },
    heroIcon: {
      width: 50,
      height: 50,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.2)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
      marginBottom: 14,
    },
    heroTitle: {
      fontSize: 16.5,
      fontWeight: '900',
      color: '#FFFFFF',
    },
    heroSubtitle: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '600',
      color: 'rgba(255,255,255,0.88)',
    },
    option: {
      borderRadius: 18,
      borderWidth: 1.5,
      borderColor: `${colors.primary}40`,
      backgroundColor: colors.background,
      paddingVertical: 16,
      paddingHorizontal: 14,
      minHeight: 150,
    },
    optionIcon: {
      width: 50,
      height: 50,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}1A`,
      marginBottom: 14,
    },
    optionTitle: {
      fontSize: 16.5,
      fontWeight: '900',
      color: colors.text,
    },
    optionSubtitle: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    },
    tips: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 12,
    },
    tip: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 7,
      paddingHorizontal: 6,
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    tipText: {
      flexShrink: 1,
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    cancel: {
      marginTop: 12,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    pressed: {
      opacity: 0.75,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '800',
      color: colors.textSecondary,
    },
  });
}
