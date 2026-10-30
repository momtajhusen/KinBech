import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { StackActions } from '@react-navigation/native';
import Icon from './Icon';
import GoogleButton from './GoogleButton';
import { navigationRef } from '../navigation/navigationRef';
import { useAuth } from '../context/AuthContext';
import { useGoogleLogin } from '../hooks/useGoogleLogin';
import { useTheme, useThemedStyles } from '../theme';

const REASONS = {
  chat: {
    icon: 'chatbubble-ellipses',
    title: 'Log in to chat',
    message: 'Message the seller, ask questions and plan a safe meetup.',
  },
  call: {
    icon: 'call',
    title: 'Log in to call',
    message: 'Calls go through KinBech, so your number stays private.',
  },
  sell: {
    icon: 'add-circle',
    title: 'Log in to sell',
    message: 'Post your item in a minute and reach buyers near you.',
  },
  save: {
    icon: 'heart',
    title: 'Log in to save items',
    message: 'Keep the items you like and find them again anytime.',
  },
  chats: {
    icon: 'chatbubbles',
    title: 'Log in to see your chats',
    message: 'All your conversations with buyers and sellers live here.',
  },
  notifications: {
    icon: 'notifications',
    title: 'Log in for notifications',
    message: 'Get updates on messages, offers and your listings.',
  },
  report: {
    icon: 'flag',
    title: 'Log in to report',
    message: 'Reports are linked to an account so our team can follow up.',
  },
  review: {
    icon: 'star',
    title: 'Log in to leave a review',
    message: 'Reviews from real buyers help everyone trade safely.',
  },
  pin: {
    icon: 'bookmark',
    title: 'Log in to pin stores',
    message: 'Pinned stores show first on your home screen.',
  },
  map: {
    icon: 'map',
    title: 'Log in to view location',
    message: 'See where the item is and plan a safe meetup nearby.',
  },
  voice: {
    icon: 'mic',
    title: 'Log in to talk to KinBech',
    message: 'Say what you want and see matching items near you.',
  },
  support: {
    icon: 'help-buoy',
    title: 'Log in to contact support',
    message: 'We reply inside the app, so you can follow your request.',
  },
  default: {
    icon: 'person-circle',
    title: 'Log in to continue',
    message: 'Pick your Google account. It takes just a tap.',
  },
};

let opener = null;
let pendingAction = null;

/** Opens the login sheet. `onLoggedIn` runs after login, back on the screen that asked. */
export function requestLogin(reason = 'default', onLoggedIn = null) {
  if (typeof opener === 'function') {
    opener(reason, onLoggedIn);
    return;
  }
  pendingAction = onLoggedIn;
  if (navigationRef.isReady()) navigationRef.navigate('Login');
}

/** Returns `(reason, action)`: runs `action` when signed in, otherwise asks the guest to log in first. */
export function useRequireLogin() {
  const { isLoggedIn } = useAuth();
  return useCallback(
    (reason, action) => {
      if (isLoggedIn) return action?.();
      requestLogin(reason, action);
      return undefined;
    },
    [isLoggedIn]
  );
}

export function clearPendingLogin() {
  pendingAction = null;
}

function runAfterSettle(action, delay) {
  if (!action) return;
  // Let the stack or sheet settle first; actions usually navigate.
  setTimeout(() => {
    Promise.resolve()
      .then(action)
      .catch(() => {});
  }, delay);
}

/** After login or profile setup: return to the screen that asked for login, then finish the tapped action. */
export function finishLogin(navigation) {
  const action = pendingAction;
  pendingAction = null;
  const state = navigationRef.isReady() ? navigationRef.getRootState() : null;
  const loginIndex = state
    ? state.routes.findIndex((route) => route.name === 'Login' || route.name === 'ProfileSetup')
    : -1;
  if (loginIndex > 0) {
    navigationRef.dispatch(StackActions.pop(state.index - loginIndex + 1));
    runAfterSettle(action, 450);
    return;
  }
  navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
}

export function LoginPromptHost() {
  const actionRef = useRef(null);
  const [copy, setCopy] = useState(null);
  const [visible, setVisible] = useState(false);
  const { signIn, loading, error, setError } = useGoogleLogin();

  useEffect(() => {
    opener = (reason, action) => {
      actionRef.current = action || null;
      setError('');
      setCopy(REASONS[reason] || REASONS.default);
      setVisible(true);
    };
    return () => {
      opener = null;
    };
  }, [setError]);

  const close = () => {
    if (loading) return;
    actionRef.current = null;
    setError('');
    setVisible(false);
  };

  const continueWithGoogle = async () => {
    const result = await signIn({ beforeChoice: () => setVisible(false) });
    if (result.status !== 'ok') return;
    const action = actionRef.current;
    actionRef.current = null;
    setVisible(false);
    if (result.admin) return;
    if (result.needsProfile) {
      // ProfileSetup calls finishLogin, which pops back here and runs the action.
      pendingAction = action;
      setTimeout(() => {
        if (navigationRef.isReady()) navigationRef.navigate('ProfileSetup');
      }, 220);
      return;
    }
    runAfterSettle(action, 300);
  };

  if (!copy) return null;
  return (
    <LoginPromptSheet
      visible={visible}
      copy={copy}
      loading={loading}
      error={error}
      onClose={close}
      onGoogle={continueWithGoogle}
    />
  );
}

function LoginPromptSheet({ visible, copy, loading, error, onClose, onGoogle }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return undefined;
    slide.setValue(0);
    pulse.setValue(0);
    Animated.timing(slide, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [visible, slide, pulse]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [460, 0] });
  const badgeScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.15] });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 14, transform: [{ translateY }] }]}
        >
          <LinearGradient
            colors={[colors.primary + '2E', colors.primary + '0A', 'transparent']}
            style={styles.glow}
            pointerEvents="none"
          />
          <View style={styles.handle} />
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12} accessibilityLabel="Close">
            <Icon name="close" size={20} color={colors.textSecondary} />
          </Pressable>

          <View style={styles.hero}>
            <View style={styles.ringOuter} />
            <View style={styles.ringInner} />
            <Animated.View style={[styles.halo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
            <Text style={[styles.spark, { top: 8, left: 26 }]}>✦</Text>
            <Text style={[styles.spark, styles.sparkSmall, { bottom: 14, right: 22 }]}>✦</Text>
            <View style={[styles.dot, styles.dotAccent, { top: 34, right: 8 }]} />
            <View style={[styles.dot, { bottom: 30, left: 6 }]} />
            <Animated.View style={[styles.badgeShadow, { transform: [{ scale: badgeScale }] }]}>
              <LinearGradient
                colors={colors.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.iconBadge}
              >
                <Icon name={copy.icon} size={36} color={colors.onGradient} />
              </LinearGradient>
            </Animated.View>
          </View>

          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.message}>{copy.message}</Text>

          <GoogleButton onPress={onGoogle} loading={loading} style={styles.cta} />
          {error ? (
            <View style={styles.errorRow}>
              <Icon name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          <Pressable
            style={({ pressed }) => [styles.later, pressed && styles.pressed, loading && styles.disabled]}
            onPress={onClose}
            disabled={loading}
          >
            <Text style={styles.laterText}>Not now</Text>
          </Pressable>

          <View style={styles.note}>
            <Icon name="shield-checkmark" size={12} color={colors.textMuted} />
            <Text style={styles.noteText}>We never post to your Google account.</Text>
          </View>
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
      height: 230,
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
    hero: {
      width: 168,
      height: 168,
      marginTop: 10,
      marginBottom: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringOuter: {
      position: 'absolute',
      width: 168,
      height: 168,
      borderRadius: 84,
      borderWidth: 1,
      borderColor: colors.primary + '1F',
    },
    ringInner: {
      position: 'absolute',
      width: 128,
      height: 128,
      borderRadius: 64,
      borderWidth: 1,
      borderColor: colors.primary + '33',
      backgroundColor: colors.primary + '0D',
    },
    halo: {
      position: 'absolute',
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: colors.primary + '40',
    },
    spark: {
      position: 'absolute',
      fontSize: 15,
      color: colors.primary,
      opacity: 0.55,
    },
    sparkSmall: {
      fontSize: 10,
      opacity: 0.45,
    },
    dot: {
      position: 'absolute',
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      opacity: 0.6,
    },
    dotAccent: {
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.secondary || colors.warning,
      opacity: 0.85,
    },
    badgeShadow: {
      borderRadius: 30,
      shadowColor: colors.primary,
      shadowOpacity: 0.45,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 10,
    },
    iconBadge: {
      width: 82,
      height: 82,
      borderRadius: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      fontSize: 23,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: 0.2,
    },
    message: {
      marginTop: 8,
      marginBottom: 24,
      fontSize: 14.5,
      lineHeight: 21,
      color: colors.textSecondary,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    cta: {
      alignSelf: 'stretch',
    },
    later: {
      alignSelf: 'stretch',
      height: 48,
      marginTop: 6,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: {
      opacity: 0.7,
    },
    disabled: {
      opacity: 0.4,
    },
    errorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'stretch',
      justifyContent: 'center',
      gap: 6,
      marginTop: 10,
      paddingHorizontal: 8,
    },
    errorText: {
      flexShrink: 1,
      fontSize: 13,
      fontWeight: '600',
      color: colors.error,
      textAlign: 'center',
    },
    laterText: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    note: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    noteText: {
      fontSize: 12,
      color: colors.textMuted,
    },
  });
}
