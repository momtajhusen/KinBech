import { getApps } from '@react-native-firebase/app';
import {
  getInitialNotification as getInitialFcmNotification,
  getMessaging,
  getToken,
  onMessage,
  onNotificationOpenedApp,
  onTokenRefresh,
} from '@react-native-firebase/messaging';
import { PermissionsAndroid, Platform } from 'react-native';
import { api } from './api';
import { ensureCallChannel } from './callNotifications';
import { endRingingCall, presentIncomingCallFromRemoteMessage } from './CallKeepManager';
import { alertFromMessage, displayAlert, ensureAlertChannel } from './pushAlerts';

let messagingInstance;
let messagingChecked = false;

function getMessagingInstance() {
  if (messagingChecked) return messagingInstance;
  messagingChecked = true;

  try {
    if (!getApps().length) {
      messagingInstance = null;
      return null;
    }
    messagingInstance = getMessaging();
  } catch (error) {
    console.warn('Firebase messaging is unavailable:', error?.message || error);
    messagingInstance = null;
  }

  return messagingInstance;
}

const needsRuntimeNotificationPermission = () => Platform.OS === 'android' && Platform.Version >= 33;

/** Checks without prompting. */
export async function getNotificationPermission() {
  if (!needsRuntimeNotificationPermission()) return { granted: true, canAskAgain: true };
  const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return { granted, canAskAgain: true };
}

/** Shows the system dialog. Only call from a user tap (the permission prompt), never at startup. */
export async function requestNotificationPermission() {
  if (!needsRuntimeNotificationPermission()) return { granted: true, canAskAgain: true };
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
  return {
    granted: result === PermissionsAndroid.RESULTS.GRANTED,
    canAskAgain: result !== PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
  };
}

export async function getFCMToken() {
  const messaging = getMessagingInstance();
  if (!messaging) return null;

  const { granted } = await getNotificationPermission();
  if (!granted) return null;

  try {
    await ensureCallChannel();
    await ensureAlertChannel();
    const token = await getToken(messaging);
    api.saveDeviceToken(token).catch(() => {});
    return token;
  } catch (error) {
    console.warn('Error getting FCM token:', error?.message || error);
    return null;
  }
}

export function setupTokenRefreshListener(callback) {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};

  return onTokenRefresh(messaging, (token) => {
    api.saveDeviceToken(token).catch(() => {});
    if (callback) callback(token);
  });
}

export function setupForegroundMessageListener() {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};

  return onMessage(messaging, async (remoteMessage) => {
    if (remoteMessage?.data?.type === 'call_ended') {
      endRingingCall(remoteMessage.data.chatId);
      return;
    }
    const handled = await presentIncomingCallFromRemoteMessage(remoteMessage, { mode: 'foreground' });
    if (handled) return;
    const alert = alertFromMessage(remoteMessage);
    if (alert) await displayAlert(alert);
  });
}

export function setupNotificationOpenListener(callback) {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};

  return onNotificationOpenedApp(messaging, (remoteMessage) => {
    console.log('Notification opened from background:', remoteMessage);
    if (callback) callback(remoteMessage);
  });
}

export async function getInitialNotification() {
  const messaging = getMessagingInstance();
  if (!messaging) return null;

  try {
    const remoteMessage = await getInitialFcmNotification(messaging);
    if (remoteMessage) {
      console.log('App opened from quit state by notification:', remoteMessage);
    }
    return remoteMessage;
  } catch (error) {
    console.warn('Unable to read the opening notification:', error?.message || error);
    return null;
  }
}

export function setupFCMListeners(callback) {
  const foregroundUnsubscribe = setupForegroundMessageListener();
  const openUnsubscribe = setupNotificationOpenListener(callback);
  const tokenRefreshUnsubscribe = setupTokenRefreshListener((token) => {
    if (__DEV__) console.log('New FCM token received');
  });

  return () => {
    foregroundUnsubscribe();
    openUnsubscribe();
    tokenRefreshUnsubscribe();
  };
}
