import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Icon from './Icon';
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
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const { width } = useWindowDimensions();
  const sheetWidth = Math.min(width - 24, 520);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onSelect(null)}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelect(null)} />
        <View
          style={[
            styles.sheet,
            { width: sheetWidth },
          ]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Add photo</Text>
              <Text style={styles.headerSubtitle}>Camera or gallery</Text>
            </View>
            <Pressable
              style={styles.closeBtn}
              onPress={() => onSelect(null)}
              hitSlop={12}
            >
              <Icon name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          <View style={styles.options}>
            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => onSelect('camera')}
            >
              <View style={styles.optionIcon}>
                <Icon name="camera" size={26} color={colors.primary} />
              </View>
              <Text style={styles.optionTitle}>Camera</Text>
              <Text style={styles.optionSubtitle}>Take a new photo</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
              onPress={() => onSelect('gallery')}
            >
              <View style={[styles.optionIcon, styles.optionIconAlt]}>
                <Icon name="images" size={26} color={colors.primary} />
              </View>
              <Text style={styles.optionTitle}>Gallery</Text>
              <Text style={styles.optionSubtitle}>Choose a saved photo</Text>
            </Pressable>
          </View>

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
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      paddingHorizontal: 12,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      paddingTop: 10,
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    handle: {
      alignSelf: 'center',
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 14,
    },
    headerText: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    headerSubtitle: {
      marginTop: 2,
      fontSize: 13,
      color: colors.textSecondary,
    },
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    options: {
      flexDirection: 'row',
      gap: 10,
    },
    option: {
      flex: 1,
      minWidth: 0,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingVertical: 16,
      paddingHorizontal: 12,
      alignItems: 'flex-start',
    },
    optionPressed: {
      opacity: 0.82,
    },
    optionIcon: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '16',
      marginBottom: 12,
    },
    optionIconAlt: {
      backgroundColor: colors.primary + '16',
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    optionSubtitle: {
      marginTop: 3,
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
    },
    cancel: {
      marginTop: 12,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    cancelText: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.textSecondary,
    },
  });
}
