import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  findNodeHandle,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';

let opener = null;

export function requestPhotoSource() {
  return new Promise((resolve) => {
    if (typeof opener !== 'function') {
      resolve(null);
      return;
    }
    opener(resolve);
  });
}

export function PhotoSourceSheetHost() {
  const resolverRef = useRef(null);
  const closingRef = useRef(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    opener = (resolve) => {
      if (resolverRef.current) resolverRef.current(null);
      closingRef.current = false;
      resolverRef.current = resolve;
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

  return <PhotoSourceSheet visible={visible} onSelect={finish} />;
}

function PhotoSourceSheet({ visible, onSelect }) {
  const { isDark } = useTheme();
  const styles = useThemedStyles(createStyles);
  const cardRef = useRef(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.88)).current;

  useEffect(() => {
    if (!visible) {
      opacity.setValue(0);
      scale.setValue(0.88);
      return undefined;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        damping: 16,
        stiffness: 220,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();

    const focusTimer = setTimeout(() => {
      const node = findNodeHandle(cardRef.current);
      if (node) AccessibilityInfo.setAccessibilityFocus(node);
    }, 80);

    return () => clearTimeout(focusTimer);
  }, [visible, opacity, scale]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => onSelect(null)}
    >
      <View style={styles.overlay}>
        <BlurView
          pointerEvents="none"
          intensity={48}
          tint={isDark ? 'dark' : 'light'}
          blurMethod="none"
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={styles.dim} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss photo source"
          style={StyleSheet.absoluteFill}
          onPress={() => onSelect(null)}
        />

        <View pointerEvents="box-none" style={styles.centerWrap}>
          <Animated.View
            ref={cardRef}
            accessible
            accessibilityViewIsModal
            accessibilityRole="dialog"
            accessibilityLabel="Add photo. Choose camera or gallery."
            style={[styles.card, { opacity, transform: [{ scale }] }]}
          >
            <Pressable
              style={styles.closeBtn}
              onPress={() => onSelect(null)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
            >
              <Ionicons name="close" size={18} color={styles.closeIcon.color} />
            </Pressable>

            <View style={styles.hero}>
              <View style={styles.heroGlow} />
              <View style={styles.heroInner}>
                <Ionicons name="images" size={28} color="#FFFFFF" />
              </View>
            </View>

            <Text style={styles.title}>Add photo</Text>
            <Text style={styles.subtitle}>Take a new photo or choose one from your gallery.</Text>

            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => onSelect('camera')}
              accessibilityRole="button"
              accessibilityLabel="Camera. Take a photo now."
            >
              <View style={styles.iconWrap}>
                <Ionicons name="camera" size={22} color={styles.icon.color} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>Camera</Text>
                <Text style={styles.optionHint}>Take a photo now</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={styles.chevron.color} />
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => onSelect('gallery')}
              accessibilityRole="button"
              accessibilityLabel="Gallery. Choose from your device."
            >
              <View style={styles.iconWrap}>
                <Ionicons name="images" size={22} color={styles.icon.color} />
              </View>
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>Gallery</Text>
                <Text style={styles.optionHint}>Choose from your device</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={styles.chevron.color} />
            </Pressable>

            <Pressable style={styles.cancel} onPress={() => onSelect(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    dim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay || 'rgba(11,15,23,0.55)',
    },
    centerWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow || '#000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.32,
      shadowRadius: 28,
      elevation: 18,
    },
    closeBtn: {
      position: 'absolute',
      top: 14,
      right: 14,
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.iconBackground || colors.surface,
      zIndex: 2,
    },
    closeIcon: {
      color: colors.textMuted,
    },
    hero: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
      alignSelf: 'center',
    },
    heroGlow: {
      position: 'absolute',
      width: 78,
      height: 78,
      borderRadius: 39,
      backgroundColor: colors.glow || 'rgba(4,120,87,0.22)',
    },
    heroInner: {
      width: 58,
      height: 58,
      borderRadius: 29,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    title: {
      fontSize: 21,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
    },
    subtitle: {
      marginTop: 6,
      marginBottom: 18,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      marginBottom: 10,
      borderRadius: 18,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionPressed: {
      backgroundColor: colors.glow || colors.surface,
      borderColor: colors.primary,
    },
    iconWrap: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glow || 'rgba(4,120,87,0.14)',
    },
    icon: {
      color: colors.primary,
    },
    chevron: {
      color: colors.textMuted,
    },
    optionCopy: {
      flex: 1,
      gap: 2,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    optionHint: {
      fontSize: 13,
      color: colors.textMuted,
    },
    cancel: {
      marginTop: 4,
      height: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary || colors.text,
    },
  });
}
