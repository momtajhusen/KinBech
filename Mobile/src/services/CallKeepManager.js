import { AppState, Platform } from 'react-native';
import {
  callFromData,
  declineIncomingCall,
  dismissIncomingCallNotification,
  displayIncomingCall,
  isCallDeclined,
} from './callNotifications';
import { openInAppCall } from '../navigation/navigationRef';
import { startIncomingRing, stopCallSounds } from './sounds';

const listeners = new Set();
const presented = new Map();
const suppressingEnd = new Set();
let bannerCall = null;
let setupPromise = null;
let listening = false;
let appUiReady = false;

export function markCallUiMounted() {
  appUiReady = true;
}

export function isAppUiReady() {
  return appUiReady;
}

export async function isDeviceLocked() {
  if (Platform.OS !== 'android') return false;
  try {
    const { NativeModules } = require('react-native');
    if (!NativeModules.CallDevice?.isLocked) return false;
    return Boolean(await NativeModules.CallDevice.isLocked());
  } catch {
    return false;
  }
}

function loadCallKeep() {
  if (Platform.OS !== 'android') return null;
  try {
    const { NativeModules } = require('react-native');
    if (!NativeModules.RNCallKeep) return null;
    const mod = require('react-native-callkeep');
    return mod?.default || null;
  } catch (error) {
    console.warn('CallKeep is not in this build yet:', error?.message || error);
    return null;
  }
}

export function uuidForChat(chatId) {
  const hex = String(chatId || '').toLowerCase().replace(/[^a-f0-9]/g, '');
  const body = `${hex}00000000000000000000000000000000`.slice(0, 32);
  return `${body.slice(0, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}-${body.slice(16, 20)}-${body.slice(20, 32)}`;
}

export function chatIdFromUuid(uuid) {
  const hex = String(uuid || '').replace(/-/g, '').toLowerCase();
  const id = hex.slice(0, 24);
  return /^[a-f0-9]{24}$/.test(id) ? id : '';
}

function callOptions() {
  return {
    ios: { appName: 'KinBech' },
    android: {
      alertTitle: 'Allow KinBech calls',
      alertDescription: 'KinBech needs a phone account so incoming calls can ring when the app is closed or the phone is locked.',
      cancelButton: 'Cancel',
      okButton: 'Allow',
      additionalPermissions: [],
      selfManaged: true,
      foregroundService: {
        channelId: 'com.codersalpha.kinbech.calls',
        channelName: 'KinBech calls',
        notificationTitle: 'KinBech voice call',
        notificationIcon: 'ic_launcher',
      },
    },
  };
}

export async function ensureCallKeep() {
  const RNCallKeep = loadCallKeep();
  if (!RNCallKeep) return null;
  if (!setupPromise) {
    setupPromise = Promise.resolve()
      .then(() => RNCallKeep.setup(callOptions()))
      .then(() => {
        try {
          RNCallKeep.setAvailable(true);
        } catch {
          /* phone account may still be registering */
        }
        return RNCallKeep;
      })
      .catch((error) => {
        setupPromise = null;
        console.warn('CallKeep setup failed:', error?.message || error);
        return null;
      });
  }
  return setupPromise;
}

function rememberCall(call, extra = {}) {
  const id = String(call.chatId);
  const previous = presented.get(id) || {};
  presented.set(id, {
    ...previous,
    chatId: id,
    callerName: call.callerName || previous.callerName || 'KinBech user',
    callerImage: call.callerImage || previous.callerImage || '',
    at: previous.at || Date.now(),
    ...extra,
  });
}

function rememberedCall(chatId) {
  return presented.get(String(chatId)) || null;
}

export function subscribeIncomingBanner(listener) {
  listeners.add(listener);
  listener(bannerCall);
  return () => listeners.delete(listener);
}

function emitBanner() {
  listeners.forEach((listener) => listener(bannerCall));
}

export function showIncomingCallBanner(call) {
  if (!call?.chatId || isCallDeclined(call.chatId)) return;
  const same = bannerCall && String(bannerCall.chatId) === String(call.chatId);
  bannerCall = {
    chatId: String(call.chatId),
    callerName: call.callerName || 'KinBech user',
    callerImage: call.callerImage || '',
  };
  rememberCall(bannerCall);
  emitBanner();
  if (!same) startIncomingRing();
}

export function releaseIncomingCall(chatId) {
  if (!chatId) return;
  presented.delete(String(chatId));
  if (bannerCall && String(bannerCall.chatId) === String(chatId)) {
    bannerCall = null;
    emitBanner();
  }
}

export function hideIncomingCallBanner({ keepLock = false } = {}) {
  if (!bannerCall) return;
  if (!keepLock) presented.delete(String(bannerCall.chatId));
  bannerCall = null;
  emitBanner();
  stopCallSounds();
}

export function dismissNativeIncomingCall(chatId) {
  if (!chatId) return;
  const uuid = uuidForChat(chatId);
  suppressingEnd.add(uuid);
  const RNCallKeep = loadCallKeep();
  try {
    RNCallKeep?.endCall(uuid);
  } catch {
    suppressingEnd.delete(uuid);
  }
}

function onAnswer(data) {
  const uuid = data?.callUUID || data?.uuid;
  const chatId = chatIdFromUuid(uuid) || String(data?.handle || '');
  if (!chatId) return;
  const known = rememberedCall(chatId);
  suppressingEnd.add(uuidForChat(chatId));
  hideIncomingCallBanner({ keepLock: true });
  stopCallSounds();
  dismissIncomingCallNotification(chatId);
  openInAppCall(
    {
      chatId,
      callerName: data?.name || known?.callerName || 'KinBech user',
      callerImage: known?.callerImage || '',
    },
    { autoAnswer: true }
  );
  try {
    loadCallKeep()?.endCall(uuidForChat(chatId));
  } catch {
    suppressingEnd.delete(uuidForChat(chatId));
  }
}

function onEnd(data) {
  const uuid = data?.callUUID || data?.uuid;
  const key = uuidForChat(chatIdFromUuid(uuid) || '');
  if ((uuid && suppressingEnd.has(uuid)) || suppressingEnd.has(key)) {
    suppressingEnd.delete(uuid);
    suppressingEnd.delete(key);
    return;
  }
  const chatId = chatIdFromUuid(uuid);
  if (!chatId || isCallDeclined(chatId)) return;
  presented.delete(String(chatId));
  hideIncomingCallBanner();
  declineIncomingCall(chatId);
}

function onShowIncomingUi(data) {
  const chatId = chatIdFromUuid(data?.callUUID) || rememberedCall(data?.handle)?.chatId;
  const known = chatId ? rememberedCall(chatId) : null;
  if (!chatId || isCallDeclined(chatId)) return;
  displayIncomingCall(
    {
      chatId,
      callerName: data?.name || known?.callerName || 'KinBech user',
      callerImage: known?.callerImage || '',
    },
    { fullScreen: true }
  ).catch(() => {});
}

export function registerCallKeepHandlers() {
  const RNCallKeep = loadCallKeep();
  if (!RNCallKeep || listening) return;
  listening = true;
  RNCallKeep.addEventListener('answerCall', onAnswer);
  RNCallKeep.addEventListener('endCall', onEnd);
  RNCallKeep.addEventListener('showIncomingCallUi', onShowIncomingUi);
  RNCallKeep.addEventListener('createIncomingConnectionFailed', onShowIncomingUi);
  RNCallKeep.getInitialEvents?.()
    .then((events) => {
      (events || []).forEach((event) => {
        const name = event?.name;
        const data = event?.data || event;
        if (name === 'RNCallKeepPerformAnswerCallAction') onAnswer(data);
        if (name === 'RNCallKeepPerformEndCallAction') onEnd(data);
      });
      RNCallKeep.clearInitialEvents?.();
    })
    .catch(() => {});
}

async function showSystemIncomingCall(call) {
  rememberCall(call);
  const RNCallKeep = await Promise.race([
    ensureCallKeep(),
    new Promise((resolve) => setTimeout(() => resolve(loadCallKeep()), 1500)),
  ]);
  if (RNCallKeep) {
    try {
      RNCallKeep.displayIncomingCall(
        uuidForChat(call.chatId),
        String(call.chatId),
        call.callerName || 'KinBech user',
        'generic',
        false
      );
    } catch (error) {
      console.warn('Could not register the incoming call with Android:', error?.message || error);
    }
  }
  try {
    await displayIncomingCall(call, { fullScreen: true });
  } catch (error) {
    console.warn('Could not show the full-screen incoming call:', error?.message || error);
  }
}

async function showHeadsUpCall(call) {
  rememberCall(call);
  hideIncomingCallBanner();
  try {
    await displayIncomingCall(call, { fullScreen: false });
  } catch (error) {
    console.warn('Could not show the incoming-call banner:', error?.message || error);
  }
}

function showInAppCall(call) {
  hideIncomingCallBanner();
  dismissIncomingCallNotification(call.chatId);
  openInAppCall(call, { autoAnswer: false });
}

export async function presentIncomingCall(call, { mode } = {}) {
  if (!call?.chatId || isCallDeclined(call.chatId)) return;
  let nextMode = mode;
  if (!nextMode || nextMode === 'auto') {
    if (!appUiReady) nextMode = 'killed';
    else if (AppState.currentState === 'active') nextMode = 'foreground';
    else if (await isDeviceLocked()) nextMode = 'locked';
    else nextMode = 'background';
  }
  const id = String(call.chatId);
  const existing = presented.get(id);
  if (existing && existing.mode === nextMode && Date.now() - existing.at < 20000) return;
  rememberCall(call, { at: Date.now(), mode: nextMode, system: nextMode !== 'foreground' });
  if (nextMode === 'foreground') {
    showInAppCall(call);
    return;
  }
  if (nextMode === 'background') {
    await showHeadsUpCall(call);
    return;
  }
  await showSystemIncomingCall(call);
}

export async function presentIncomingCallFromRemoteMessage(remoteMessage, options) {
  const call = callFromData(remoteMessage?.data);
  if (!call) return false;
  await presentIncomingCall(call, options);
  return true;
}

export async function callKeepHeadlessTask(data) {
  try {
    const chatId = chatIdFromUuid(data?.callUUID) || '';
    if (!chatId) return;
    await presentIncomingCall(
      {
        chatId,
        callerName: data?.name || 'KinBech user',
        callerImage: '',
      },
      { mode: 'killed' }
    );
  } catch (error) {
    console.warn('Killed-state incoming call failed:', error?.message || error);
  }
}

registerCallKeepHandlers();
