import { NativeModules, Platform } from 'react-native';

let watchRunning = false;

function device() {
  if (Platform.OS !== 'android') return null;
  return NativeModules.CallDevice || null;
}

export function isCallWatchRunning() {
  return watchRunning;
}

export async function startCallWatch(baseUrl, token) {
  const mod = device();
  if (!baseUrl || !token || !mod?.startWatch) {
    watchRunning = false;
    return false;
  }
  try {
    watchRunning = Boolean(await mod.startWatch(String(baseUrl), String(token)));
  } catch {
    watchRunning = false;
  }
  return watchRunning;
}

export function stopCallWatch() {
  watchRunning = false;
  try {
    device()?.stopWatch?.();
  } catch {
    /* already stopped */
  }
}

export function setCallWatchForeground(active) {
  try {
    device()?.setAppForeground?.(Boolean(active));
  } catch {
    /* older builds do not have the watcher */
  }
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
