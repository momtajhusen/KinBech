const CALL_CHANNEL_ID = 'incoming-calls-v2';
const DECLINE_MS = 15000;

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

export async function dismissIncomingCallNotification(chatId) {
  if (!chatId) return;
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

export function callFromData(data) {
  if (!data || data.type !== 'incoming_call' || !data.chatId) return null;
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

export async function displayIncomingCall(call, { fullScreen = false } = {}) {
  const notifeeModule = loadNotifee();
  if (!notifeeModule || !call?.chatId) return;
  const notifee = notifeeModule.default;
  const { AndroidCategory, AndroidImportance, AndroidStyle, AndroidVisibility } = notifeeModule;
  const { resolveMediaUrl } = require('../utils/listing');
  await ensureCallChannel();
  if (isCallDeclined(call.chatId)) return;
  const { startIncomingRing } = require('./sounds');
  startIncomingRing();
  const avatar = resolveMediaUrl(call.callerImage || '');
  const avatarUrl = /^https?:\/\//i.test(avatar) ? avatar : '';
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

export async function consumeInitialCallNotification() {
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

export function subscribeCallNotificationEvents(onOpen) {
  const notifeeModule = loadNotifee();
  if (!notifeeModule) return () => {};
  const notifee = notifeeModule.default;
  const { EventType } = notifeeModule;
  return notifee.onForegroundEvent(async ({ type, detail }) => {
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
}

export async function handleIncomingCallMessage(remoteMessage) {
  const call = callFromData(remoteMessage?.data);
  if (!call) return false;
  await displayIncomingCall(call);
  setPendingIncomingCall(call);
  return true;
}
