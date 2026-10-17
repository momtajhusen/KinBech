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
import { presentIncomingCallFromRemoteMessage } from './CallKeepManager';
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

export async function requestNotificationPermissions() {
  if (Platform.OS === 'android' && Platform.Version >= 33) {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      console.log('Notification permission denied');
      return false;
    }
  }
  return true;
}

export async function getFCMToken() {
  const messaging = getMessagingInstance();
  if (!messaging) return null;

  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

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
    console.log('New token to send to backend:', token);
  });

  return () => {
    foregroundUnsubscribe();
    openUnsubscribe();
    tokenRefreshUnsubscribe();
  };
}
