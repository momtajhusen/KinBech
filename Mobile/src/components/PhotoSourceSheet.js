import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useThemedStyles } from '../theme';

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
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => onSelect(null)}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={() => onSelect(null)} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Add photo</Text>
          <Text style={styles.subtitle}>Take a new photo or choose one from your gallery.</Text>

          <Pressable
            style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
            onPress={() => onSelect('camera')}
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
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: colors.overlay || 'rgba(0,0,0,0.55)',
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      paddingHorizontal: 20,
      paddingTop: 10,
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 16,
    },
    title: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
    },
    subtitle: {
      marginTop: 6,
      marginBottom: 18,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textMuted,
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 14,
      marginBottom: 10,
      borderRadius: 18,
      backgroundColor: colors.surface,
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
      height: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    cancelText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary || colors.text,
    },
  });
}
