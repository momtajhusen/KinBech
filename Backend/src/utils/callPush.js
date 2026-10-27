const admin = require('firebase-admin');
const User = require('../models/User');

function messagingClient() {
  if (admin.apps.length) return admin.messaging();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  const credential = admin.credential.cert(JSON.parse(raw));
  admin.initializeApp({ credential });
  return admin.messaging();
}

function stringData(data) {
  const payload = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (value == null) return;
    payload[key] = String(value);
  });
  return payload;
}

// A call push still matters if the phone was briefly offline, but not after the ring window ends.
const CALL_PUSH_TTL_MS = 60 * 1000;

const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

/** Sends one push and reports why it did not go out, instead of failing silently. */
async function deliverPush({ userId, title, body, data, incomingCall = false, dataOnly = false }) {
  const user = await User.findById(userId).select('fcmToken preferences').lean();
  if (!user?.fcmToken) return { sent: false, reason: 'no_token' };
  // The in-app notifications switch silences alerts, not calls.
  if (!incomingCall && user.preferences?.notifications === false) {
    return { sent: false, reason: 'notifications_off' };
  }

  let messaging;
  try {
    messaging = messagingClient();
  } catch (error) {
    console.warn('[push] Firebase credentials are invalid:', error?.message || error);
    return { sent: false, reason: 'firebase_invalid' };
  }
  if (!messaging) {
    console.warn('[push] FIREBASE_SERVICE_ACCOUNT_JSON is not set; pushes are disabled.');
    return { sent: false, reason: 'firebase_not_configured' };
  }

  const payload = stringData(
    incomingCall
      ? data
      : {
          ...data,
          title: title || 'KinBech',
          body: body || '',
        }
  );
  const message = {
    token: user.fcmToken,
    data: payload,
    android: incomingCall
      ? { priority: 'high', ttl: CALL_PUSH_TTL_MS, directBootOk: true }
      : { priority: 'high' },
  };

  if (!incomingCall && !dataOnly) {
    message.notification = {
      title: title || 'KinBech',
      body: body || '',
    };
    message.android.notification = {
      channelId: 'kinbech-alerts',
      sound: 'default',
    };
  }

  try {
    await messaging.send(message);
    return { sent: true, reason: 'sent' };
  } catch (error) {
    const code = error?.errorInfo?.code || error?.code || 'unknown';
    console.warn(`[push] ${incomingCall ? 'call' : 'alert'} push to ${userId} failed: ${code}`, error?.message || '');
    if (DEAD_TOKEN_CODES.has(code)) {
      await User.updateOne({ _id: userId, fcmToken: user.fcmToken }, { $set: { fcmToken: '' } }).catch(() => {});
    }
    return { sent: false, reason: code };
  }
}

async function sendUserPush(options) {
  return (await deliverPush(options)).sent;
}

/** Resolves to { sent, reason } so callers can tell the caller whether the phone was reached. */
async function sendIncomingCallPush({ userId, chatId, callerName, callerImage }) {
  return deliverPush({
    userId,
    title: 'Incoming call',
    body: `${callerName || 'Someone'} is calling`,
    incomingCall: true,
    data: {
      type: 'incoming_call',
      chatId,
      callerName: callerName || 'KinBech user',
      callerImage: callerImage || '',
      sentAt: Date.now(),
    },
  });
}

module.exports = { sendIncomingCallPush, sendUserPush, messagingClient };
