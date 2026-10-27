import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Icon from './Icon';
import { useAuth } from '../context/AuthContext';
import { resolveMediaUrl } from '../utils/listing';
import { useTheme, useThemedStyles } from '../theme';

export default function LogoutConfirmModal({ visible, onCancel, onConfirm, userName }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const slide = useRef(new Animated.Value(0)).current;

  const name = userName || user?.name || 'Your account';
  const subtitle = user?.email || user?.phone || '';
  const initial = String(name).trim().charAt(0).toUpperCase() || 'K';

  useEffect(() => {
    if (!visible) return;
    setBusy(false);
    slide.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  const close = () => {
    if (!busy) onCancel?.();
  };

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm?.();
    } finally {
      setBusy(false);
    }
  };

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [380, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={close}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
        <Animated.View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 16, transform: [{ translateY }] }]}
        >
          <LinearGradient
            colors={[colors.danger + '1F', colors.danger + '08', 'transparent']}
            style={styles.glow}
            pointerEvents="none"
          />
          <View style={styles.handle} />
          <Pressable style={styles.closeBtn} onPress={close} hitSlop={12} accessibilityLabel="Close">
            <Icon name="close" size={20} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              {user?.avatarUrl ? (
                <Image source={{ uri: resolveMediaUrl(user.avatarUrl) }} style={styles.avatar} />
              ) : (
                <LinearGradient colors={colors.gradient} style={styles.avatar}>
                  <Text style={styles.initial}>{initial}</Text>
                </LinearGradient>
              )}
            </View>
            <View style={styles.badge}>
              <Icon name="log-out-outline" size={15} color="#FFFFFF" />
            </View>
          </View>

          <Text style={styles.title}>Log out?</Text>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
          <Text style={styles.message}>You can sign back in anytime with your Google account.</Text>

          <Pressable
            onPress={confirm}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Log out"
            style={({ pressed }) => [styles.logoutBtn, pressed && !busy && styles.pressed]}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Icon name="log-out-outline" size={19} color="#FFFFFF" />
                <Text style={styles.logoutText}>Log out</Text>
              </>
            )}
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      alignItems: 'center',
      backgroundColor: 'rgba(15, 23, 42, 0.6)',
    },
    sheet: {
      width: '100%',
      maxWidth: 520,
      alignItems: 'center',
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      paddingTop: 10,
      paddingHorizontal: 22,
    },
    glow: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 180,
    },
    handle: {
      width: 42,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
    },
    closeBtn: {
      position: 'absolute',
      top: 14,
      right: 14,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    avatarWrap: {
      marginTop: 26,
      marginBottom: 16,
    },
    avatarRing: {
      width: 92,
      height: 92,
      borderRadius: 46,
      padding: 4,
      backgroundColor: colors.surface,
      borderWidth: 2,
      borderColor: colors.danger + '40',
    },
    avatar: {
      flex: 1,
      borderRadius: 42,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    initial: {
      fontSize: 32,
      fontWeight: '800',
      color: colors.onGradient,
    },
    badge: {
      position: 'absolute',
      right: -2,
      bottom: 2,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.danger,
      borderWidth: 3,
      borderColor: colors.surface,
    },
    title: {
      fontSize: 23,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 0.2,
    },
    name: {
      marginTop: 6,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
      maxWidth: '85%',
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      color: colors.textMuted,
      maxWidth: '85%',
    },
    message: {
      marginTop: 12,
      marginBottom: 22,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 16,
    },
    logoutBtn: {
      alignSelf: 'stretch',
      height: 54,
      borderRadius: 27,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: colors.danger,
      shadowColor: colors.danger,
      shadowOpacity: 0.3,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    pressed: {
      opacity: 0.88,
      transform: [{ scale: 0.98 }],
    },
    logoutText: {
      fontSize: 16,
      fontWeight: '800',
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
  });
}
