import { declineIncomingCall, callFromData } from './callNotifications';
import {
  dismissNativeIncomingCall,
  isAppUiReady,
  isDeviceLocked,
  presentIncomingCall,
} from './CallKeepManager';
import { alertFromMessage, displayAlert } from './pushAlerts';

function loadNotifee() {
  try {
    return require('@notifee/react-native');
  } catch (error) {
    console.warn('Notifee background handler was not registered:', error?.message || error);
    return null;
  }
}

const notifeeModule = loadNotifee();
if (notifeeModule) {
  const notifee = notifeeModule.default;
  const { EventType } = notifeeModule;
  notifee.onBackgroundEvent(async ({ type, detail }) => {
    const actionId = detail.pressAction?.id;
    if (type === EventType.ACTION_PRESS && actionId === 'decline') {
      const call = callFromData(detail.notification?.data);
      if (call?.chatId) {
        dismissNativeIncomingCall(call.chatId);
        await declineIncomingCall(call.chatId);
      }
    }
  });
}

try {
  const { getApps } = require('@react-native-firebase/app');
  if (getApps().length > 0) {
    const { getMessaging, setBackgroundMessageHandler } = require('@react-native-firebase/messaging');
    setBackgroundMessageHandler(getMessaging(), async (remoteMessage) => {
      if (remoteMessage?.data?.type === 'incoming_call') {
        const call = callFromData(remoteMessage.data);
        if (!call) return;
        let mode = 'killed';
        if (isAppUiReady()) {
          mode = (await isDeviceLocked()) ? 'locked' : 'background';
        }
        await presentIncomingCall(call, { mode });
        return;
      }
      if (remoteMessage?.notification) return;
      const alert = alertFromMessage(remoteMessage);
      if (alert) await displayAlert(alert);
    });
  }
} catch (error) {
  console.warn('Incoming call push handler was not registered:', error?.message || error);
}
