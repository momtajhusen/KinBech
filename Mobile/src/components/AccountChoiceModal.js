import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Animated, Dimensions, Easing, Image, Modal, Pressable, Text, View } from 'react-native';
import Icon from './Icon';
import { resolveMediaUrl } from '../utils/listing';
import { ROLE_LABELS } from '../utils/admin';
import { useTheme, useThemedStyles } from '../theme';

const CARD_WIDTH = Math.min(Dimensions.get('window').width - 36, 390);
/** Lets the login sheet finish closing before this one opens. */
const SHOW_DELAY_MS = 350;

let opener = null;

/**
 * Same Google email has an admin seat and a marketplace account.
 * Resolves 'admin', 'user', or null when the person backs out.
 */
export function chooseAccount(accounts) {
  if (typeof opener !== 'function') return Promise.resolve(null);
  return new Promise((resolve) => {
    setTimeout(() => opener(accounts, resolve), SHOW_DELAY_MS);
  });
}

export default function AccountChoiceModal() {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const [choice, setChoice] = useState(null);
  const enter = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    opener = (accounts, resolve) => setChoice({ accounts, resolve });
    return () => {
      opener = null;
    };
  }, []);

  useEffect(() => {
    if (!choice) return;
    enter.setValue(0);
    Animated.spring(enter, { toValue: 1, friction: 7, tension: 70, useNativeDriver: true }).start();
  }, [choice, enter]);

  const finish = (type) => {
    const resolve = choice?.resolve;
    Animated.timing(enter, { toValue: 0, duration: 180, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => {
      setChoice(null);
      resolve?.(type);
    });
  };

  if (!choice || !colors) return null;

  const admin = choice.accounts.find((account) => account.type === 'admin') || {};
  const user = choice.accounts.find((account) => account.type === 'user') || {};
  const avatar = resolveMediaUrl(user.avatarUrl || '');
  const options = [
    {
      type: 'admin',
      icon: 'shield-checkmark',
      title: 'Admin panel',
      text: `${ROLE_LABELS[admin.role] || 'Admin'}${admin.name ? ` · ${admin.name}` : ''}`,
    },
    {
      type: 'user',
      icon: 'person',
      title: 'My KinBech account',
      text: user.name ? `Buy and sell as ${user.name}` : 'Buy, sell and chat',
      avatar,
    },
  ];

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent hardwareAccelerated onRequestClose={() => finish(null)}>
      <Animated.View style={[styles.backdrop, { opacity: enter }]} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.card,
            {
              opacity: enter,
              transform: [
                { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) },
                { scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
              ],
            },
          ]}
        >
          <Text style={styles.title}>Which account?</Text>
          <Text style={styles.subtitle}>This Google account opens two KinBech accounts. Pick one to continue.</Text>

          {options.map((option) => (
            <Pressable
              key={option.type}
              onPress={() => finish(option.type)}
              style={({ pressed }) => [styles.option, pressed && styles.pressed]}
              accessibilityRole="button"
              accessibilityLabel={option.title}
            >
              {option.avatar ? (
                <Image source={{ uri: option.avatar }} style={styles.optionIcon} />
              ) : (
                <LinearGradient colors={colors.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.optionIcon}>
                  <Icon name={option.icon} size={20} color={colors.onGradient} />
                </LinearGradient>
              )}
              <View style={styles.optionCopy}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionText} numberOfLines={1}>{option.text}</Text>
              </View>
              <Icon name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}

          <Pressable onPress={() => finish(null)} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) => ({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay || 'rgba(0,0,0,0.55)',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: {
    width: CARD_WIDTH,
    borderRadius: 28,
    paddingTop: 22,
    paddingHorizontal: 18,
    paddingBottom: 10,
    backgroundColor: colors.card || colors.surface,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 16,
  },
  title: { fontSize: 21, fontWeight: '800', color: colors.text, textAlign: 'center' },
  subtitle: {
    marginTop: 6,
    marginBottom: 16,
    fontSize: 13.5,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 10,
    borderRadius: 18,
    backgroundColor: `${colors.primary}0D`,
    borderWidth: 1,
    borderColor: `${colors.primary}22`,
  },
  optionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  optionText: { marginTop: 2, fontSize: 12.5, color: colors.textMuted },
  cancel: { height: 46, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
