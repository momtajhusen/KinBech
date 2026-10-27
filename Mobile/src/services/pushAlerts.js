const KinBechCall = require('../../modules/kinbech-call').default;
// Android fixes a channel's sound when it is created, so a new sound needs a new channel id.
const ALERT_CHANNEL_ID = 'kinbech-alerts-v2';
const OLD_ALERT_CHANNEL_IDS = ['kinbech-alerts'];
// res/raw/kinbech_notification.mp3 in modules/kinbech-call (same file as assets/sounds/new-message.mp3).
const ALERT_SOUND = 'kinbech_notification';
const { getActiveChatId } = require('./sounds');
const { resolveMediaUrl } = require('../utils/listing');

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
  const notifee = notifeeModule.default;
  await notifee.createChannel({
    id: ALERT_CHANNEL_ID,
    name: 'KinBech alerts',
    importance: AndroidImportance.HIGH,
    sound: ALERT_SOUND,
    vibration: true,
  });
  await Promise.all(OLD_ALERT_CHANNEL_IDS.map((id) => notifee.deleteChannel(id).catch(() => {})));
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
    KinBechCall?.cancelChatAlert?.(id);
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

// Push and the notifications poller can deliver the same server notification within seconds.
const shownNoteIds = new Set();

export async function displayAlert({ id, title, body, data, image }) {
  if (!title) return;
  if (id && id.startsWith('note-')) {
    if (shownNoteIds.has(id)) return;
    shownNoteIds.add(id);
    if (shownNoteIds.size > 200) shownNoteIds.delete(shownNoteIds.values().next().value);
  }
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
  if (isChat && chatId && KinBechCall?.showChatAlert) {
    try {
      const shown = await KinBechCall.showChatAlert({
        chatId,
        title,
        body: body || 'New message',
        listingTitle: data?.listingTitle ? String(data.listingTitle) : '',
        senderImage,
        itemImage: productImage,
      });
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
    sound: ALERT_SOUND,
    color: '#047857',
    showTimestamp: true,
    pressAction: {
      id: 'default',
      launchActivity: 'default',
    },
  };
  // No circularLargeIcon: Notifee crops a bitmap it already recycled ("Canvas: trying to use a recycled bitmap").
  if (productImage) {
    android.largeIcon = productImage;
  } else if (senderImage) {
    android.largeIcon = senderImage;
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
  const notification = {
    id: notificationId,
    title,
    body: body || '',
    subtitle: listingTitle || undefined,
    data: data || {},
    android,
  };
  try {
    await notifeeModule.default.displayNotification(notification);
  } catch {
    // A broken or unreachable picture should not cost the user the alert itself.
    const { largeIcon, style, ...plain } = android;
    await notifeeModule.default.displayNotification({ ...notification, android: plain });
  }
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

/** Chat the app was opened for by tapping a native chat alert. */
export async function consumePendingChatAlert() {
  try {
    return KinBechCall?.consumeChatLaunch?.() || null;
  } catch {
    return null;
  }
}

export function subscribeNativeChatAlert(onOpen) {
  if (!KinBechCall?.addListener) return () => {};
  const subscription = KinBechCall.addListener('onChatOpen', (event) => {
    if (event?.chatId) onOpen(event);
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
