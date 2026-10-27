import { NativeModules, Platform } from 'react-native';

function device() {
  if (Platform.OS !== 'android') return null;
  return NativeModules.CallDevice || null;
}

export function dismissNativeIncomingUi() {
  try {
    device()?.dismissIncoming?.();
  } catch {
    /* notification may already be gone */
  }
}

export async function consumeNativePendingCall() {
  const mod = device();
  if (!mod?.consumePendingCall) return null;
  try {
    const call = await mod.consumePendingCall();
    if (!call?.chatId) return null;
    return {
      chatId: String(call.chatId),
      callerName: String(call.callerName || 'KinBech user'),
      callerImage: String(call.callerImage || ''),
      autoAnswer: Boolean(call.autoAnswer),
    };
  } catch {
    return null;
  }
}
