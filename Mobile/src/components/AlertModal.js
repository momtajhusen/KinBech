import { useEffect } from 'react';
import { ActivityIndicator, Modal, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { FadeIn, FadeInDown, ZoomIn, withSpring, withTiming } from 'react-native-reanimated';
import Icon from './Icon';
import { PressableScale, Pulse, Reanimated } from './Motion';
import { callHaptic } from '../services/callHaptics';
import { useTheme, useThemedStyles } from '../theme';

const TONES = {
  success: { icon: 'checkmark', gradient: ['#34D399', '#047857'], haptic: 'answer' },
  error: { icon: 'close', gradient: ['#F87171', '#DC2626'], haptic: 'failed' },
  warning: { icon: 'alert', gradient: ['#FBBF24', '#D97706'], haptic: 'remoteEnd' },
};

function cardIn() {
  'worklet';
  const spring = { damping: 15, stiffness: 180, mass: 0.8 };
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 40 }, { scale: 0.9 }] },
    animations: {
      opacity: withTiming(1, { duration: 180 }),
      transform: [{ translateY: withSpring(0, spring) }, { scale: withSpring(1, spring) }],
    },
  };
}

const createStyles = (colors) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 16,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 130,
  },
  body: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 22,
    alignItems: 'center',
  },
  iconRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  iconCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  title: {
    fontSize: 21,
    fontWeight: '900',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  message: {
    marginTop: 8,
    fontSize: 14.5,
    lineHeight: 22,
    color: colors.textMuted,
    textAlign: 'center',
  },
  buttons: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: 24,
  },
  primary: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  secondary: {
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  secondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
});

function AlertContent({ onClose, title, message, type, primaryButton, secondaryButton, loading }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);
  const tone = TONES[type] || { icon: 'information', gradient: colors.gradient, haptic: 'toggleOn' };
  const tint = tone.gradient[tone.gradient.length - 1];

  useEffect(() => {
    callHaptic(tone.haptic);
  }, [tone.haptic]);

  return (
    <Reanimated.View entering={FadeIn.duration(180)} style={styles.overlay}>
      <Reanimated.View entering={cardIn} style={styles.container}>
        <LinearGradient colors={[`${tint}33`, `${tint}00`]} style={styles.glow} pointerEvents="none" />
        <View style={styles.body}>
          <Reanimated.View entering={ZoomIn.delay(90).duration(320)}>
            <Pulse active={!loading} to={1.08} pause={1600} style={[styles.iconRing, { backgroundColor: `${tint}1F` }]}>
              <LinearGradient colors={tone.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconCircle}>
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="large" />
                ) : (
                  <Icon name={tone.icon} size={34} color="#FFFFFF" />
                )}
              </LinearGradient>
            </Pulse>
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.delay(120).duration(280)} style={{ alignSelf: 'stretch' }}>
            {title ? <Text style={styles.title}>{title}</Text> : null}
            {message ? <Text style={styles.message}>{message}</Text> : null}
          </Reanimated.View>

          <Reanimated.View entering={FadeInDown.delay(180).duration(280)} style={styles.buttons}>
            {primaryButton ? (
              <PressableScale
                scaleTo={0.97}
                disabled={loading}
                onPress={() => {
                  primaryButton.onPress?.();
                  onClose?.();
                }}
              >
                <LinearGradient
                  colors={colors.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.primary, loading && { opacity: 0.7 }]}
                >
                  <Text style={styles.primaryText}>{loading ? 'Please wait...' : primaryButton.text}</Text>
                </LinearGradient>
              </PressableScale>
            ) : null}
            {secondaryButton ? (
              <PressableScale
                scaleTo={0.97}
                disabled={loading}
                contentStyle={styles.secondary}
                onPress={() => {
                  secondaryButton.onPress?.();
                  onClose?.();
                }}
              >
                <Text style={styles.secondaryText}>{secondaryButton.text}</Text>
              </PressableScale>
            ) : null}
          </Reanimated.View>
        </View>
      </Reanimated.View>
    </Reanimated.View>
  );
}

export function AlertModal({ visible, onClose, type = 'info', loading = false, ...rest }) {
  return (
    <Modal visible={!!visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      {visible ? <AlertContent {...rest} type={type} loading={loading} onClose={onClose} /> : null}
    </Modal>
  );
}

export function showSuccessAlert({ title, message, onConfirm }) {
  return { 
    type: 'success', 
    title, 
    message, 
    primaryButton: { 
      text: 'OK', 
      onPress: () => {
        if (onConfirm) onConfirm();
      } 
    } 
  };
}

export function showErrorAlert({ title, message, onConfirm }) {
  return { 
    type: 'error', 
    title, 
    message, 
    primaryButton: { 
      text: 'OK', 
      onPress: () => {
        if (onConfirm) onConfirm();
      } 
    } 
  };
}

export function showWarningAlert({ title, message, onConfirm, onCancel }) {
  return {
    type: 'warning',
    title,
    message,
    primaryButton: { 
      text: 'Continue', 
      onPress: () => {
        if (onConfirm) onConfirm();
      } 
    },
    secondaryButton: onCancel ? { 
      text: 'Cancel', 
      onPress: () => {
        if (onCancel) onCancel();
      } 
    } : null,
  };
}

/** Clear modal copy for NSFW / weapons / stock / fraud image blocks */
export function getImageSafetyCopy(code, fallbackMessage = '', issues = []) {
  const extras = Array.isArray(issues)
    ? issues
        .slice(1)
        .map((i) => i?.message)
        .filter(Boolean)
    : [];

  const map = {
    NSFW_BLOCKED: {
      type: 'error',
      title: 'Inappropriate photo blocked',
      message:
        'This image looks sexual or NSFW and cannot be uploaded.\n\nPlease choose a clear product or profile photo with no adult content.',
      button: 'Choose another photo',
    },
    ADULT_IMAGE_TEXT: {
      type: 'error',
      title: 'Adult content not allowed',
      message:
        'Adult or sexual content is not allowed on KinBech.\n\nUpload a normal product or profile photo instead.',
      button: 'Choose another photo',
    },
    WEAPON_IMAGE: {
      type: 'error',
      title: 'Weapons cannot be listed',
      message:
        'Guns, firearms, and weapons are not allowed on KinBech.\n\nThis photo was blocked. Do not list weapons or ammunition.',
      button: 'Got it',
    },
    VIOLENT_IMAGE: {
      type: 'error',
      title: 'Violent photo not accepted',
      message:
        'This image shows violence or gore and cannot be used on KinBech.\n\nPlease upload a clear photo of the item only.',
      button: 'Choose another photo',
    },
    DRUG_IMAGE: {
      type: 'error',
      title: 'Drug content not accepted',
      message:
        'Drugs and drug items are not allowed on KinBech.\n\nThis photo cannot be used for a listing.',
      button: 'Got it',
    },
    STOCK_OR_WATERMARK: {
      type: 'warning',
      title: 'Stock / watermark photo blocked',
      message:
        'This looks like a stock or watermarked image (Shutterstock, Getty, etc.).\n\nScammers often use these. Please upload a real photo of your own item.',
      button: 'Upload real photo',
    },
    SUSPECT_WATERMARK: {
      type: 'warning',
      title: 'Photo looks fake or watermarked',
      message:
        'This photo may be watermarked or misleading.\n\nPlease take a clear original photo of the actual item in your hand / shop.',
      button: 'Upload real photo',
    },
    FRAUD_IMAGE_TEXT: {
      type: 'error',
      title: 'Misleading photo blocked',
      message:
        'This image has text that looks fraudulent or misleading.\n\nUpload an honest photo of the real product.',
      button: 'Choose another photo',
    },
    IMAGE_BLOCKED: {
      type: 'error',
      title: 'Photo blocked',
      message:
        fallbackMessage ||
        'This image was blocked by our safety checks.\n\nUse a clear, original photo of your item.',
      button: 'Choose another photo',
    },
    IMAGE_SAFETY_UNAVAILABLE: {
      type: 'warning',
      title: 'Could not verify photo',
      message: 'Photo safety check is temporarily unavailable. Please try again in a moment.',
      button: 'Try again',
    },
  };

  const base = map[code] || {
    type: 'error',
    title: 'Photo upload failed',
    message:
      fallbackMessage ||
      'We could not upload this photo. Please try a different clear image.',
    button: 'OK',
  };

  let message = base.message;
  if (fallbackMessage && code && map[code] && !message.includes(fallbackMessage.slice(0, 40))) {
    // Prefer server message when it is specific, keep tip structure
    message = `${fallbackMessage}\n\n${base.message.split('\n\n').slice(1).join('\n\n') || 'Please choose another photo.'}`.trim();
  } else if (!code && fallbackMessage) {
    message = fallbackMessage;
  }
  if (extras.length) {
    message = `${message}\n\nAlso: ${extras.join(' ')}`;
  }

  return { ...base, message };
}

export function showImageSafetyAlert({ code, message, issues, onConfirm }) {
  const copy = getImageSafetyCopy(code, message, issues);
  return {
    type: copy.type,
    title: copy.title,
    message: copy.message,
    primaryButton: {
      text: copy.button || 'OK',
      onPress: () => {
        if (onConfirm) onConfirm();
      },
    },
  };
}
