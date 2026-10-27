import { Vibration } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { stopRingVibration } from './sounds';

// expo-haptics throws on import in builds made before it was added; plain vibration covers those.
let Haptics = null;
if (requireOptionalNativeModule('ExpoHaptics')) {
  try {
    Haptics = require('expo-haptics');
  } catch {
    Haptics = null;
  }
}

const FALLBACK = {
  answer: [0, 35, 70, 55],
  connected: [0, 60],
  decline: [0, 80],
  end: [0, 80],
  remoteEnd: [0, 40, 90, 40],
  failed: [0, 120, 80, 120],
  ringing: [0, 25],
  toggleOn: 30,
  toggleOff: 18,
};

function playHaptic(kind) {
  const { ImpactFeedbackStyle, NotificationFeedbackType } = Haptics;
  switch (kind) {
    case 'answer':
      return Haptics.notificationAsync(NotificationFeedbackType.Success);
    case 'connected':
    case 'decline':
    case 'end':
      return Haptics.impactAsync(ImpactFeedbackStyle.Heavy);
    case 'remoteEnd':
      return Haptics.notificationAsync(NotificationFeedbackType.Warning);
    case 'failed':
      return Haptics.notificationAsync(NotificationFeedbackType.Error);
    case 'ringing':
      return Haptics.impactAsync(ImpactFeedbackStyle.Light);
    case 'toggleOn':
      return Haptics.impactAsync(ImpactFeedbackStyle.Rigid);
    case 'toggleOff':
      return Haptics.impactAsync(ImpactFeedbackStyle.Soft);
    default:
      return Haptics.selectionAsync();
  }
}

/**
 * Short buzz for a call moment: answer, connected, decline, end, remoteEnd, failed,
 * ringing (the other phone started ringing), toggleOn, toggleOff.
 */
export function callHaptic(kind) {
  stopRingVibration();
  try {
    if (Haptics) {
      playHaptic(kind)?.catch?.(() => {});
      return;
    }
    Vibration.vibrate(FALLBACK[kind] ?? 20);
  } catch {
    /* no vibrator */
  }
}
