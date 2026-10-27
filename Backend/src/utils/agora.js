const crypto = require('crypto');
const { RtcRole, RtcTokenBuilder } = require('agora-token');
const { accountById, pickCallAccount } = require('./callSettings');

const TOKEN_TTL_SECONDS = 60 * 60;

function uidForUser(userId) {
  const digest = crypto.createHash('sha256').update(String(userId)).digest();
  const uid = digest.readUInt32BE(0) & 0x7fffffff;
  return uid === 0 ? 1 : uid;
}

function channelForChat(chatId) {
  return `c${String(chatId)}`;
}

/**
 * Voice session on an Agora account from the admin panel. Pass `accountId` when joining a call
 * that is already ringing so both people land in the same Agora project.
 */
async function createRtcToken({ chatId, userId, accountId, ttlSeconds }) {
  const account = (accountId && await accountById(accountId)) || await pickCallAccount();
  const { appId, appCertificate } = account;
  // Agora drops the person from the channel when the token runs out, which enforces the daily limit.
  const ttl = ttlSeconds > 0 ? Math.min(TOKEN_TTL_SECONDS, Math.ceil(ttlSeconds)) : TOKEN_TTL_SECONDS;

  const channel = channelForChat(chatId);
  const uid = uidForUser(userId);
  const token = RtcTokenBuilder.buildTokenWithUid(
    appId,
    appCertificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    ttl,
    ttl
  );

  return {
    appId,
    channel,
    uid,
    token,
    expiresIn: ttl,
    accountId: account.id,
  };
}

module.exports = { createRtcToken, channelForChat, uidForUser };
