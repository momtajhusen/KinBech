import { createNavigationContainerRef } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

let pendingCall = null;

export function openInAppCall(call, { autoAnswer = false } = {}) {
  if (!call?.chatId) return;
  const params = {
    chatId: String(call.chatId),
    name: call.callerName || call.name || 'KinBech user',
    image: call.callerImage || call.image || undefined,
    incoming: true,
    autoAnswer,
    listing: call.listing || undefined,
  };
  if (navigationRef.isReady()) {
    navigationRef.navigate('Call', params);
    return;
  }
  pendingCall = params;
}

export function flushPendingCallNavigation() {
  if (!pendingCall || !navigationRef.isReady()) return;
  const params = pendingCall;
  pendingCall = null;
  navigationRef.navigate('Call', params);
}
