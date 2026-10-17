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

async function sendUserPush({ userId, title, body, data, incomingCall = false, dataOnly = false }) {
  const user = await User.findById(userId).select('fcmToken preferences').lean();
  if (!user?.fcmToken || user.preferences?.notifications === false) return false;

  const messaging = messagingClient();
  if (!messaging) return false;

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
      ? { priority: 'high', ttl: 0, directBootOk: true }
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

  await messaging.send(message);
  return true;
}

async function sendIncomingCallPush({ userId, chatId, callerName, callerImage }) {
  return sendUserPush({
    userId,
    title: 'Incoming call',
    body: `${callerName || 'Someone'} is calling`,
    incomingCall: true,
    data: {
      type: 'incoming_call',
      chatId,
      callerName: callerName || 'KinBech user',
      callerImage: callerImage || '',
    },
  });
}

module.exports = { sendIncomingCallPush, sendUserPush };
