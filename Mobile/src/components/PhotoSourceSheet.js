import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useThemedStyles } from '../theme';

let opener = null;

export function requestPhotoSource() {
  console.log('requestPhotoSource called, opener type:', typeof opener);
  return new Promise((resolve) => {
    try {
      if (typeof opener !== 'function') {
        console.warn('PhotoSourceSheet opener is not a function');
        resolve(null);
        return;
      }
      console.log('Calling opener...');
      opener(resolve);
      console.log('opener called successfully');
    } catch (error) {
      console.error('Error in requestPhotoSource:', error);
      resolve(null);
    }
  });
}

export function PhotoSourceSheetHost() {
  console.log('PhotoSourceSheetHost rendering');
  const resolverRef = useRef(null);
  const closingRef = useRef(false);
  const [visible, setVisible] = useState(false);

  const openerCallback = (resolve) => {
    console.log('opener callback called');
    if (resolverRef.current) resolverRef.current(null);
    closingRef.current = false;
    resolverRef.current = resolve;
    setVisible(true);
    console.log('Modal visibility set to true');
  };

  useEffect(() => {
    console.log('PhotoSourceSheetHost mounted, setting up opener');
    opener = openerCallback;
    return () => {
      console.log('PhotoSourceSheetHost unmounted');
      opener = null;
    };
  }, []);

  const finish = (value) => {
    console.log('finish called with value:', value);
    if (closingRef.current) {
      console.log('Already closing, ignoring');
      return;
    }
    closingRef.current = true;
    setVisible(false);
    console.log('Modal visibility set to false');
    // Wait until this sheet is gone. Opening the gallery while it is still on screen
    // makes Android drop the selected photo, and the listing box keeps spinning.
    setTimeout(() => {
      console.log('Resolving promise with:', value);
      const resolve = resolverRef.current;
      resolverRef.current = null;
      resolve?.(value);
    }, 320);
  };

  return <PhotoSourceSheet visible={visible} onSelect={finish} />;
}

function PhotoSourceSheet({ visible, onSelect }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const cardRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      slideAnim.setValue(50);
    }
  }, [visible, fadeAnim, slideAnim]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => onSelect(null)}
    >
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => onSelect(null)}
        />

        <View pointerEvents="box-none" style={styles.centerWrap}>
          <Animated.View
            ref={cardRef}
            style={[
              styles.card,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Add Photo</Text>
              <Pressable
                style={styles.closeBtn}
                onPress={() => onSelect(null)}
                hitSlop={12}
              >
                <Ionicons name="close" size={24} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={styles.divider} />

            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => onSelect('camera')}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="camera" size={28} color={colors.primary} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Camera</Text>
                <Text style={styles.optionSubtitle}>Take a new photo</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => onSelect('gallery')}
            >
              <View style={styles.optionIcon}>
                <Ionicons name="images" size={28} color={colors.primary} />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>Gallery</Text>
                <Text style={styles.optionSubtitle}>Choose from your device</Text>
              </View>
            </Pressable>

            <Pressable style={styles.cancel} onPress={() => onSelect(null)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.6)',
    },
    centerWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    card: {
      width: '100%',
      maxWidth: 400,
      backgroundColor: colors.surface,
      borderRadius: 20,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.3,
      shadowRadius: 30,
      elevation: 10,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 24,
      paddingVertical: 20,
    },
    headerTitle: {
      flex: 1,
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    divider: {
      height: 1,
      backgroundColor: colors.border,
      marginHorizontal: 24,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 20,
      gap: 16,
    },
    optionPressed: {
      backgroundColor: colors.background,
    },
    optionIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: colors.primary + '12',
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionContent: {
      flex: 1,
      gap: 4,
    },
    optionTitle: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
    },
    optionSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    cancel: {
      marginTop: 12,
      marginHorizontal: 24,
      marginBottom: 24,
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    cancelText: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
}
