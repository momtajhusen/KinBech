const { NativeModules, Platform } = require('react-native');
const ALERT_CHANNEL_ID = 'kinbech-alerts';
const { getActiveChatId } = require('./sounds');
const { resolveMediaUrl } = require('../utils/listing');

function device() {
  if (Platform.OS !== 'android') return null;
  return NativeModules.CallDevice || null;
}

function pictureUrl(value) {
  const resolved = resolveMediaUrl(value || '');
  return /^https?:\/\//i.test(resolved) ? resolved : '';
}

function loadNotifee() {
  try {
    return require('@notifee/react-native');
  } catch {
    return null;
  }
}

export async function ensureAlertChannel() {
  const notifeeModule = loadNotifee();
  if (!notifeeModule) return false;
  const { AndroidImportance } = notifeeModule;
  await notifeeModule.default.createChannel({
    id: ALERT_CHANNEL_ID,
    name: 'KinBech alerts',
    importance: AndroidImportance.HIGH,
    sound: 'default',
    vibration: true,
  });
  return true;
}

export function messageAlertId(chatId) {
  return chatId ? `msg-${chatId}` : '';
}

export async function dismissChatAlerts(chatId) {
  const notifeeModule = loadNotifee();
  if (!notifeeModule || !chatId) return;
  const notifee = notifeeModule.default;
  const id = String(chatId);
  try {
    await notifee.cancelNotification(messageAlertId(id));
  } catch {
    /* already gone */
  }
  try {
    device()?.cancelChatAlert?.(id);
  } catch {
    /* native card is from the latest app build */
  }
  try {
    const shown = await notifee.getDisplayedNotifications();
    await Promise.all(
      (shown || []).map(async (item) => {
        const data = item?.notification?.data || {};
        if (String(data.chatId || '') === id && data.type === 'chat' && item.notification?.id) {
          await notifee.cancelNotification(item.notification.id);
        }
      })
    );
  } catch {
    /* tray may already be clear */
  }
}

export async function displayAlert({ id, title, body, data, image }) {
  if (!title) return;
  const notifeeModule = loadNotifee();
  const chatId = data?.chatId ? String(data.chatId) : '';
  const isChat = data?.type === 'chat';
  const notificationId = isChat && chatId ? messageAlertId(chatId) : id || `alert-${Date.now()}`;
  if (isChat && chatId && chatId === getActiveChatId()) {
    await dismissChatAlerts(chatId);
    return;
  }
  const senderImage = pictureUrl(data?.image || image || '');
  const productImage = pictureUrl(data?.listingImage || '');
  if (isChat && chatId && device()?.showChatCard) {
    try {
      const shown = await device().showChatCard(
        chatId,
        title,
        body || 'New message',
        senderImage,
        productImage
      );
      if (shown) return;
    } catch {
      /* fall back to the standard alert */
    }
  }
  if (!notifeeModule) return;
  const { AndroidImportance, AndroidStyle } = notifeeModule;
  await ensureAlertChannel();
  const android = {
    channelId: ALERT_CHANNEL_ID,
    importance: AndroidImportance.HIGH,
    sound: 'default',
    color: '#047857',
    showTimestamp: true,
    pressAction: {
      id: 'default',
      launchActivity: 'default',
    },
  };
  if (productImage) {
    android.largeIcon = productImage;
  } else if (senderImage) {
    android.largeIcon = senderImage;
    android.circularLargeIcon = true;
  }
  if (isChat && AndroidStyle?.MESSAGING) {
    const person = { name: title, ...(senderImage ? { icon: senderImage } : {}) };
    android.style = {
      type: AndroidStyle.MESSAGING,
      person,
      messages: [
        {
          text: body || 'New message',
          timestamp: Date.now(),
          person,
        },
      ],
    };
  }
  const listingTitle = data?.listingTitle ? String(data.listingTitle) : '';
  await notifeeModule.default.displayNotification({
    id: notificationId,
    title,
    body: body || '',
    subtitle: listingTitle || undefined,
    data: data || {},
    android,
  });
}

export function alertFromMessage(remoteMessage) {
  const data = remoteMessage?.data || {};
  if (data.type === 'incoming_call') return null;
  const title = remoteMessage?.notification?.title || data.title;
  const body = remoteMessage?.notification?.body || data.body || '';
  if (!title) return null;
  return {
    id: data.chatId && data.type === 'chat' ? messageAlertId(data.chatId) : data.notificationId ? `note-${data.notificationId}` : undefined,
    title,
    body,
    image: data.image || '',
    data,
  };
}

export async function consumePendingChatAlert() {
  const mod = device();
  if (!mod?.consumePendingMessage) return null;
  try {
    return await mod.consumePendingMessage();
  } catch {
    return null;
  }
}

export function subscribeNativeChatAlert(onOpen) {
  const { DeviceEventEmitter } = require('react-native');
  const subscription = DeviceEventEmitter.addListener('kinbechChatAlert', async () => {
    const pending = await consumePendingChatAlert();
    if (pending?.chatId) onOpen(pending);
  });
  return () => subscription.remove();
}

export function subscribeAlertPress(onOpen) {
  const notifeeModule = loadNotifee();
  if (!notifeeModule) return () => {};
  const { EventType } = notifeeModule;
  return notifeeModule.default.onForegroundEvent(async ({ type, detail }) => {
    if (type !== EventType.PRESS && detail.pressAction?.id !== 'default') return;
    const data = detail.notification?.data;
    if (!data || data.type === 'incoming_call') return;
    if (detail.notification?.id) {
      await notifeeModule.default.cancelNotification(detail.notification.id);
    }
    onOpen(data);
  });
}

export async function consumeInitialAlert() {
  const notifeeModule = loadNotifee();
  if (!notifeeModule) return null;
  try {
    const initial = await notifeeModule.default.getInitialNotification();
    const data = initial?.notification?.data;
    if (!data || data.type === 'incoming_call') return null;
    return data;
  } catch {
    return null;
  }
}
