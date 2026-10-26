const mongoose = require('mongoose');
const User = require('../models/User');
const Session = require('../models/Session');
const OtpEvent = require('../models/OtpEvent');
const MediaHash = require('../models/MediaHash');

const DAY = 24 * 60 * 60 * 1000;

function toId(value) {
  return mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(String(value)) : null;
}

function maskInstall(installId) {
  const id = String(installId || '');
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

async function presentUsers(ids) {
  const unique = [...new Set(ids.map(String))].filter((id) => mongoose.isValidObjectId(id));
  if (!unique.length) return new Map();
  const users = await User.find({ _id: { $in: unique } })
    .select('name phone status createdAt trustTier deletedAt')
    .lean();
  return new Map(users.map((u) => [String(u._id), {
    id: String(u._id),
    name: u.deletedAt ? 'Deleted user' : u.name || '',
    phone: u.deletedAt ? '' : u.phone || '',
    status: u.status,
    tier: u.trustTier,
    joined: u.createdAt,
  }]));
}

function pick(map, ids) {
  return [...new Set(ids.map(String))].map((id) => map.get(id) || { id, name: 'Deleted user', phone: '' });
}

/**
 * Accounts that look linked to one user, strongest signal first:
 * same app install, same network + device model (last 30 days), same listing photo.
 */
async function linkedAccounts(userId) {
  const id = toId(userId);
  if (!id) return null;
  const since = new Date(Date.now() - 30 * DAY);
  const user = await User.findById(id).select('phone').lean();

  const [sessionInstalls, otpInstalls, mySessions, myHashes, otpRows] = await Promise.all([
    Session.distinct('installId', { user: id, installId: { $gt: '' } }),
    OtpEvent.distinct('installId', { user: id, installId: { $gt: '' } }),
    Session.find({ user: id, kind: 'app', lastSeenAt: { $gte: since }, deviceName: { $nin: ['', 'Phone'] } })
      .select('ip lastIp deviceName')
      .limit(20)
      .lean(),
    MediaHash.distinct('hash', { user: id }),
    user?.phone
      ? OtpEvent.aggregate([
        { $match: { phone: user.phone, createdAt: { $gte: new Date(Date.now() - 7 * DAY) } } },
        { $group: { _id: '$event', count: { $sum: 1 } } },
      ])
      : [],
  ]);

  const installs = [...new Set([...sessionInstalls, ...otpInstalls])];
  const pairs = mySessions
    .map((s) => ({ ip: s.lastIp || s.ip, deviceName: s.deviceName }))
    .filter((p) => p.ip);

  const [sameInstall, sameNetwork, samePhotos] = await Promise.all([
    installs.length ? Session.distinct('user', { installId: { $in: installs }, user: { $ne: id } }) : [],
    pairs.length
      ? Session.distinct('user', {
        user: { $ne: id },
        lastSeenAt: { $gte: since },
        $or: pairs.flatMap((p) => [
          { lastIp: p.ip, deviceName: p.deviceName },
          { ip: p.ip, deviceName: p.deviceName },
        ]),
      })
      : [],
    myHashes.length ? MediaHash.distinct('user', { hash: { $in: myHashes.slice(0, 200) }, user: { $nin: [id, null] } }) : [],
  ]);

  const strong = new Set(sameInstall.map(String));
  const network = sameNetwork.map(String).filter((u) => !strong.has(u));
  const people = await presentUsers([...sameInstall, ...network, ...samePhotos]);
  const otp = Object.fromEntries(otpRows.map((row) => [row._id, row.count]));

  return {
    sameInstall: pick(people, sameInstall).slice(0, 20),
    sameNetwork: pick(people, network).slice(0, 20),
    samePhotos: pick(people, samePhotos).slice(0, 20),
    otp7d: {
      sent: (otp.sent || 0) + (otp.sms_failed || 0),
      failed: otp.failed || 0,
      verified: otp.verified || 0,
      blocked: otp.blocked_suspended || 0,
    },
  };
}

module.exports = { DAY, toId, maskInstall, presentUsers, pick, linkedAccounts };
