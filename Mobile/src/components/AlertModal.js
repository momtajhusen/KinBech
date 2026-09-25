import React from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme, useThemedStyles } from '../theme';

const createStyles = (colors) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 28,
    width: '100%',
    maxWidth: 360,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  iconGlow: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    opacity: 0.3,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: colors.textMuted,
    lineHeight: 23,
    marginBottom: 28,
    textAlign: 'center',
  },
  buttonContainer: {
    gap: 12,
  },
  button: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: colors.gradientStart,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
});

export function AlertModal({
  visible,
  onClose,
  title,
  message,
  type = 'info',
  primaryButton,
  secondaryButton,
  loading = false,
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(createStyles);

  const getIconName = () => {
    switch (type) {
      case 'success':
        return 'checkmark-circle';
      case 'error':
        return 'close-circle';
      case 'warning':
        return 'warning';
      default:
        return 'information-circle';
    }
  };

  const getIconColors = () => {
    switch (type) {
      case 'success':
        return { bg: '#047857', glow: '#047857', icon: '#FFFFFF' };
      case 'error':
        return { bg: '#EF4444', glow: '#EF4444', icon: '#FFFFFF' };
      case 'warning':
        return { bg: '#F59E0B', glow: '#F59E0B', icon: '#FFFFFF' };
      default:
        return { bg: colors.primary, glow: colors.primary, icon: '#FFFFFF' };
    }
  };

  const iconColors = getIconColors();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconWrapper}>
            <View style={[styles.iconGlow, { backgroundColor: iconColors.glow }]} />
            <View style={[styles.iconContainer, { backgroundColor: iconColors.bg }]}>
              {loading ? (
                <ActivityIndicator color="#FFFFFF" size={32} />
              ) : (
                <Ionicons name={getIconName()} size={36} color={iconColors.icon} />
              )}
            </View>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.buttonContainer}>
            {primaryButton && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  primaryButton.onPress?.();
                  onClose?.();
                }}
                disabled={loading}
                style={styles.button}
              >
                <LinearGradient
                  colors={colors.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ ...styles.button, width: '100%' }}
                >
                  <Text style={styles.buttonText}>
                    {loading ? 'Please wait...' : primaryButton.text}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            )}

            {secondaryButton && (
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  secondaryButton.onPress?.();
                  onClose?.();
                }}
                disabled={loading}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryButtonText}>{secondaryButton.text}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
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
