const crypto = require('crypto');
const { RtcRole, RtcTokenBuilder } = require('agora-token');

const TOKEN_TTL_SECONDS = 60 * 60;

function uidForUser(userId) {
  const digest = crypto.createHash('sha256').update(String(userId)).digest();
  const uid = digest.readUInt32BE(0) & 0x7fffffff;
  return uid === 0 ? 1 : uid;
}

function channelForChat(chatId) {
  return `c${String(chatId)}`;
}

function createRtcToken({ chatId, userId }) {
  const appId = String(process.env.AGORA_APP_ID || '').trim();
  const appCertificate = String(process.env.AGORA_APP_CERTIFICATE || '').trim();
  if (!appId || !appCertificate) {
    const error = new Error('Voice calls are not configured');
    error.status = 503;
    throw error;
  }

  const channel = channelForChat(chatId);
  const uid = uidForUser(userId);
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    TOKEN_TTL_SECONDS,
    TOKEN_TTL_SECONDS
  );

  return {
    appId,
    channel,
    uid,
    token,
    expiresIn: TOKEN_TTL_SECONDS,
  };
}

module.exports = { createRtcToken, channelForChat, uidForUser };
