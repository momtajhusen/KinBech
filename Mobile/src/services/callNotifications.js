import KinBechCall from '../../modules/kinbech-call';

const CALL_CHANNEL_ID = 'incoming-calls-v2';
const DECLINE_MS = 15000;
const RING_TIMEOUT_MS = 60000;

let pendingCall = null;
const listeners = new Set();
const declinedUntil = new Map();

function callNotificationId(chatId) {
  return `call-${chatId}`;
}

export function markCallDeclined(chatId) {
  if (!chatId) return;
  const id = String(chatId);
  declinedUntil.set(id, Date.now() + DECLINE_MS);
  if (pendingCall && String(pendingCall.chatId) === id) pendingCall = null;
}

export function isCallDeclined(chatId) {
  if (!chatId) return false;
  const id = String(chatId);
  const until = declinedUntil.get(id);
  if (!until) return false;
  if (Date.now() > until) {
    declinedUntil.delete(id);
    return false;
  }
  return true;
}

async function ensureAuthToken() {
  try {
    const { getAuthToken, setAuthToken } = require('./api');
    if (getAuthToken()) return;
    const { readToken } = require('./tokenStorage');
    const stored = await readToken();
    if (stored) setAuthToken(stored);
  } catch {
    /* decline still dismisses the notification */
  }
}

export async function declineIncomingCall(chatId) {
  if (!chatId) return;
  markCallDeclined(chatId);
  const { stopCallSounds } = require('./sounds');
  stopCallSounds();
  dismissNativeCallStyle(chatId);
  const notifeeModule = loadNotifee();
  if (notifeeModule) {
    try {
      await notifeeModule.default.cancelNotification(callNotificationId(chatId));
    } catch {
      /* notification may already be gone */
    }
  }
  try {
    await ensureAuthToken();
    const { api } = require('./api');
    await api.endCall(chatId);
  } catch {
    /* the screen and poll also stop this ring */
  }
}

function dismissNativeCallStyle(chatId) {
  try {
    KinBechCall?.dismissIncomingCall(String(chatId));
  } catch {
    /* already dismissed */
  }
}

export async function dismissIncomingCallNotification(chatId) {
  if (!chatId) return;
  dismissNativeCallStyle(chatId);
  const notifeeModule = loadNotifee();
  if (!notifeeModule) return;
  try {
    await notifeeModule.default.cancelNotification(callNotificationId(chatId));
  } catch {
    /* already dismissed */
  }
}

function loadNotifee() {
  try {
    return require('@notifee/react-native');
  } catch (error) {
    console.warn('Notifee is not available:', error?.message || error);
    return null;
  }
}

const CLOCK_SKEW_MS = 5 * 60 * 1000;

/** A call push delivered after the ring window (the phone was offline); a far-off phone clock is ignored. */
function isStaleCallPush(data) {
  const sent = Number(data?.sentAt);
  if (!sent) return false;
  const age = Date.now() - sent;
  if (Math.abs(age) > CLOCK_SKEW_MS) return false;
  return age >= RING_TIMEOUT_MS - 5000;
}

export function callFromData(data) {
  if (!data || data.type !== 'incoming_call' || !data.chatId) return null;
  if (isStaleCallPush(data)) return null;
  return {
    chatId: String(data.chatId),
    callerName: String(data.callerName || data.name || 'KinBech user'),
    callerImage: String(data.callerImage || data.image || ''),
  };
}

export function setPendingIncomingCall(call) {
  if (!call?.chatId || isCallDeclined(call.chatId)) return;
  pendingCall = call;
  listeners.forEach((listener) => listener(call));
}

export function subscribeIncomingCall(listener) {
  listeners.add(listener);
  if (pendingCall && !isCallDeclined(pendingCall.chatId)) listener(pendingCall);
  return () => listeners.delete(listener);
}

export async function ensureCallChannel() {
  const notifeeModule = loadNotifee();
  if (!notifeeModule) return false;
  const notifee = notifeeModule.default;
  const { AndroidImportance } = notifeeModule;
  try {
    await notifee.deleteChannel('incoming-calls');
  } catch {
    /* the old channel used the message notification sound */
  }
  await notifee.createChannel({
    id: CALL_CHANNEL_ID,
    name: 'Incoming calls',
    importance: AndroidImportance.HIGH,
    vibration: true,
    bypassDnd: true,
    lights: true,
  });
  return true;
}

/** Android's built-in call notification: red Decline and green Answer, ringtone, full screen when locked. */
async function displayNativeCallStyle(call, avatarUrl) {
  if (!KinBechCall?.showIncomingCall) return false;
  try {
    return Boolean(
      await KinBechCall.showIncomingCall({
        chatId: String(call.chatId),
        callerName: call.callerName || 'KinBech user',
        callerImage: avatarUrl,
        timeoutMs: RING_TIMEOUT_MS,
      })
    );
  } catch (error) {
    console.warn('Native call notification failed:', error?.message || error);
    return false;
  }
}

export async function displayIncomingCall(call, { fullScreen = false } = {}) {
  if (!call?.chatId || isCallDeclined(call.chatId)) return;
  const { resolveMediaUrl } = require('../utils/listing');
  const avatar = resolveMediaUrl(call.callerImage || '');
  const avatarUrl = /^https?:\/\//i.test(avatar) ? avatar : '';
  if (await displayNativeCallStyle(call, avatarUrl)) return;

  const notifeeModule = loadNotifee();
  if (!notifeeModule) return;
  const notifee = notifeeModule.default;
  const { AndroidCategory, AndroidImportance, AndroidStyle, AndroidVisibility } = notifeeModule;
  await ensureCallChannel();
  if (isCallDeclined(call.chatId)) return;
  const { startIncomingRing } = require('./sounds');
  startIncomingRing();
  const android = {
    channelId: CALL_CHANNEL_ID,
    importance: AndroidImportance.HIGH,
    visibility: AndroidVisibility.PUBLIC,
    ongoing: true,
    autoCancel: false,
    color: '#16A34A',
    showTimestamp: true,
    pressAction: {
      id: 'default',
      launchActivity: 'default',
    },
    actions: [
      { title: 'Decline', pressAction: { id: 'decline' } },
      {
        title: 'Answer',
        pressAction: { id: 'answer', launchActivity: 'default' },
      },
    ],
  };
  if (avatarUrl) {
    android.largeIcon = avatarUrl;
    android.circularLargeIcon = true;
  }
  if (!fullScreen && avatarUrl && AndroidStyle?.MESSAGING) {
    const person = { name: call.callerName || 'KinBech user', icon: avatarUrl };
    android.style = {
      type: AndroidStyle.MESSAGING,
      person,
      messages: [
        {
          text: 'Incoming voice call',
          timestamp: Date.now(),
          person,
        },
      ],
    };
  }
  if (fullScreen) {
    android.category = AndroidCategory.CALL;
    android.lightUpScreen = true;
    android.fullScreenAction = {
      id: 'default',
      launchActivity: 'default',
    };
  }
  await notifee.displayNotification({
    id: callNotificationId(call.chatId),
    title: call.callerName || 'Incoming call',
    body: 'Incoming voice call',
    subtitle: 'KinBech',
    data: {
      type: 'incoming_call',
      chatId: call.chatId,
      callerName: call.callerName,
      callerImage: call.callerImage || '',
    },
    android,
  });
}

function releaseCallKeep(chatId) {
  try {
    require('./CallKeepManager').dismissNativeIncomingCall(chatId);
  } catch {
    /* CallKeep is not in every build */
  }
}

function callFromNativeAction(event) {
  if (!event?.chatId) return null;
  return {
    chatId: String(event.chatId),
    callerName: String(event.callerName || 'KinBech user'),
    callerImage: String(event.callerImage || ''),
  };
}

function consumeNativeLaunchCall() {
  try {
    const event = KinBechCall?.consumeLaunchAction?.();
    const call = callFromNativeAction(event);
    if (!call || isCallDeclined(call.chatId)) return null;
    if (event.action === 'answer') {
      releaseCallKeep(call.chatId);
      return { ...call, autoAnswer: true };
    }
    return call;
  } catch {
    return null;
  }
}

export async function consumeInitialCallNotification() {
  const nativeCall = consumeNativeLaunchCall();
  if (nativeCall) return nativeCall;
  const notifeeModule = loadNotifee();
  if (!notifeeModule) return null;
  try {
    const initial = await notifeeModule.default.getInitialNotification();
    const call = callFromData(initial?.notification?.data);
    if (!call) return null;
    if (initial?.pressAction?.id === 'decline' || isCallDeclined(call.chatId)) {
      await declineIncomingCall(call.chatId);
      return null;
    }
    return {
      ...call,
      autoAnswer: initial?.pressAction?.id === 'answer',
    };
  } catch (error) {
    console.warn('Could not read the opening call notification:', error?.message || error);
    return null;
  }
}

function subscribeNativeCallActions(onOpen) {
  if (!KinBechCall?.addListener) return () => {};
  const subscription = KinBechCall.addListener('onCallAction', async (event) => {
    const call = callFromNativeAction(event);
    if (!call) return;
    if (event.action === 'decline' || isCallDeclined(call.chatId)) {
      releaseCallKeep(call.chatId);
      await declineIncomingCall(call.chatId);
      return;
    }
    if (event.action === 'answer') {
      releaseCallKeep(call.chatId);
      onOpen({ ...call, autoAnswer: true });
      return;
    }
    onOpen(call);
  });
  return () => subscription.remove();
}

export function subscribeCallNotificationEvents(onOpen) {
  const unsubscribeNative = subscribeNativeCallActions(onOpen);
  const notifeeModule = loadNotifee();
  if (!notifeeModule) return unsubscribeNative;
  const notifee = notifeeModule.default;
  const { EventType } = notifeeModule;
  const unsubscribeNotifee = notifee.onForegroundEvent(async ({ type, detail }) => {
    const call = callFromData(detail.notification?.data);
    if (!call) return;
    const actionId = detail.pressAction?.id;
    if (actionId === 'decline' || isCallDeclined(call.chatId)) {
      await declineIncomingCall(call.chatId);
      return;
    }
    const answered =
      type === EventType.PRESS ||
      actionId === 'answer' ||
      actionId === 'default';
    if (!answered) return;
    if (detail.notification?.id) await notifee.cancelNotification(detail.notification.id);
    onOpen(actionId === 'answer' ? { ...call, autoAnswer: true } : call);
  });
  return () => {
    unsubscribeNative();
    unsubscribeNotifee();
  };
}

export async function handleIncomingCallMessage(remoteMessage) {
  const call = callFromData(remoteMessage?.data);
  if (!call) return false;
  await displayIncomingCall(call);
  setPendingIncomingCall(call);
  return true;
}
