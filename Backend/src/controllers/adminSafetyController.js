const mongoose = require('mongoose');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const Session = require('../models/Session');
const OtpEvent = require('../models/OtpEvent');
const Notification = require('../models/Notification');
const { ADMIN_ROLES } = require('../utils/adminScopes');
const { scamMatches } = require('../utils/chatIntent');
const { applyStrike } = require('../utils/strikes');
const { recordAudit } = require('../utils/audit');
const { DAY, maskInstall, presentUsers, pick } = require('../utils/fraudSignals');

const OPEN_REVIEW = { 'safetyReview.status': { $nin: ['dismissed', 'actioned'] } };
const OTP_PHONE_SENDS = 5;
const OTP_IP_PHONES = 4;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function displayName(user) {
  return user?.name || user?.phone || 'user';
}

function windowDays(value) {
  const days = Number(value);
  return [1, 7, 30, 90].includes(days) ? days : 30;
}

function reviewFilter(status) {
  if (status === 'dismissed' || status === 'actioned') return { 'safetyReview.status': status };
  if (status === 'all') return {};
  return OPEN_REVIEW;
}

/**
 * Flagged chat messages only. Admins never see the rest of the conversation; every page
 * load is written to the audit log.
 */
async function getScamFlags(req, res, next) {
  try {
    const days = windowDays(req.query.days);
    const since = new Date(Date.now() - days * DAY);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const status = ['open', 'dismissed', 'actioned', 'all'].includes(req.query.status) ? req.query.status : 'open';

    const base = { safetyFlag: 'scam_words', createdAt: { $gte: since } };
    const filter = { ...base, ...reviewFilter(status) };

    const search = String(req.query.q || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      const ids = await User.find({ $or: [{ name: re }, { phone: re }] }).select('_id').limit(200).lean();
      filter.sender = { $in: ids.map((u) => u._id) };
    }
    if (mongoose.isValidObjectId(req.query.sender)) {
      filter.sender = new mongoose.Types.ObjectId(String(req.query.sender));
    }

    const [total, messages, openCount, last24h, windowTexts, topSenders] = await Promise.all([
      Message.countDocuments(filter),
      Message.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('sender', 'name phone status chatRestrictedUntil strikes avatarUrl')
        .populate('safetyReview.by', 'name')
        .lean(),
      Message.countDocuments({ ...base, ...OPEN_REVIEW }),
      Message.countDocuments({ safetyFlag: 'scam_words', createdAt: { $gte: new Date(Date.now() - DAY) } }),
      Message.find(base).select('text').sort({ createdAt: -1 }).limit(2000).lean(),
      Message.aggregate([
        { $match: { ...base, ...OPEN_REVIEW } },
        { $group: { _id: '$sender', flags: { $sum: 1 }, chats: { $addToSet: '$chat' }, lastAt: { $max: '$createdAt' } } },
        { $sort: { flags: -1, lastAt: -1 } },
        { $limit: 8 },
      ]),
    ]);

    const chatIds = [...new Set(messages.map((m) => String(m.chat)))];
    const chats = await Chat.find({ _id: { $in: chatIds } })
      .select('participants listing safetyFlags')
      .populate('participants', 'name phone')
      .populate('listing', 'title price')
      .lean();
    const chatOf = new Map(chats.map((c) => [String(c._id), c]));

    const byCategory = {};
    for (const row of windowTexts) {
      for (const match of scamMatches(row.text)) byCategory[match.category] = (byCategory[match.category] || 0) + 1;
    }

    const senderPeople = await presentUsers(topSenders.map((row) => row._id));
    const now = Date.now();

    const flags = messages.map((message) => {
      const chat = chatOf.get(String(message.chat));
      const sender = message.sender || null;
      const other = chat?.participants?.find((p) => String(p._id) !== String(sender?._id));
      return {
        id: String(message._id),
        chatId: String(message.chat),
        text: message.text,
        kind: message.kind,
        deleted: Boolean(message.deletedForEveryone),
        edited: Boolean(message.editedAt),
        matches: scamMatches(message.text),
        createdAt: message.createdAt,
        sender: sender
          ? {
            id: String(sender._id),
            name: sender.name || '',
            phone: sender.phone || '',
            avatarUrl: sender.avatarUrl || '',
            status: sender.status,
            strikes: (sender.strikes || []).length,
            chatRestricted: Boolean(sender.chatRestrictedUntil && new Date(sender.chatRestrictedUntil).getTime() > now),
          }
          : { id: null, name: 'Deleted user' },
        recipient: other ? { id: String(other._id), name: other.name || other.phone || '' } : null,
        listing: chat?.listing ? { id: String(chat.listing._id), title: chat.listing.title, price: chat.listing.price } : null,
        chatFlags: chat?.safetyFlags || 0,
        review: {
          status: message.safetyReview?.status || '',
          by: message.safetyReview?.by?.name || '',
          at: message.safetyReview?.at || null,
          note: message.safetyReview?.note || '',
        },
      };
    });

    recordAudit(req, {
      action: 'scam.monitor.view',
      targetType: 'chat_flags',
      summary: `Viewed ${flags.length} flagged message${flags.length === 1 ? '' : 's'} (${status}, ${days}d, page ${page})`,
      meta: { messageIds: flags.map((f) => f.id).slice(0, 50) },
    });

    res.json({
      flags,
      summary: { open: openCount, last24h, byCategory, windowDays: days },
      topSenders: topSenders.map((row) => ({
        ...(senderPeople.get(String(row._id)) || { id: String(row._id), name: 'Deleted user' }),
        flags: row.flags,
        chats: row.chats.length,
        lastAt: row.lastAt,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
}

async function markReviewed(filter, status, req, note) {
  const set = {
    'safetyReview.status': status,
    'safetyReview.by': status ? req.user._id : null,
    'safetyReview.at': status ? new Date() : null,
  };
  if (note !== undefined) set['safetyReview.note'] = note;
  const result = await Message.updateMany(filter, { $set: set });
  return result.modifiedCount || 0;
}

/** Dismiss (false alarm), mark actioned, or reopen. `allFromSender` applies to every open flag of that sender. */
async function reviewScamFlag(req, res, next) {
  try {
    const { messageId } = req.params;
    if (!mongoose.isValidObjectId(messageId)) return res.status(400).json({ message: 'Invalid message' });
    const status = ['dismissed', 'actioned', ''].includes(req.body.status) ? req.body.status : null;
    if (status === null) return res.status(400).json({ message: 'Unknown status' });
    const note = req.body.note !== undefined ? String(req.body.note || '').trim().slice(0, 300) : undefined;

    const message = await Message.findOne({ _id: messageId, safetyFlag: 'scam_words' }).select('sender');
    if (!message) return res.status(404).json({ message: 'Flagged message not found' });

    const filter = req.body.allFromSender
      ? { safetyFlag: 'scam_words', sender: message.sender, ...OPEN_REVIEW }
      : { _id: message._id };
    const updated = await markReviewed(filter, status, req, note);

    recordAudit(req, {
      action: 'scam.flag.review',
      targetType: 'message',
      targetId: message._id,
      summary: `${status || 'Reopened'} ${updated} scam flag${updated === 1 ? '' : 's'}${note ? `: ${note}` : ''}`,
      meta: { status, senderId: String(message.sender), allFromSender: Boolean(req.body.allFromSender) },
    });
    res.json({ ok: true, updated });
  } catch (error) {
    next(error);
  }
}

/**
 * Act on the sender of a flagged message: warn (notification only), restrict chat for N days,
 * or add a strike. All open flags from that sender are marked actioned.
 */
async function actOnScamFlag(req, res, next) {
  try {
    const { messageId } = req.params;
    if (!mongoose.isValidObjectId(messageId)) return res.status(400).json({ message: 'Invalid message' });
    const action = String(req.body.action || '');
    if (!['warn', 'restrict_chat', 'strike'].includes(action)) return res.status(400).json({ message: 'Unknown action' });
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    if (!reason) return res.status(400).json({ message: 'Reason is required' });

    const message = await Message.findOne({ _id: messageId, safetyFlag: 'scam_words' }).select('sender');
    if (!message) return res.status(404).json({ message: 'Flagged message not found' });
    const user = await User.findById(message.sender);
    if (!user || user.deletedAt) return res.status(404).json({ message: 'Sender not found' });
    if (ADMIN_ROLES.includes(user.role)) return res.status(403).json({ message: 'The sender is an admin account' });

    let summary = '';
    if (action === 'warn') {
      await Notification.create({
        user: user._id,
        type: 'system',
        title: 'Safety warning from KinBech',
        body: `${reason} Keep payments and chats inside KinBech and meet in person before paying.`,
        icon: 'shield-outline',
      });
      summary = `Warned ${displayName(user)} about a flagged chat: ${reason}`;
    } else if (action === 'restrict_chat') {
      const days = Math.min(90, Math.max(1, Math.round(Number(req.body.days) || 3)));
      user.chatRestrictedUntil = new Date(Date.now() + days * DAY);
      user.restrictionReason = reason;
      await user.save();
      await Notification.create({
        user: user._id,
        type: 'system',
        title: 'Chat temporarily restricted',
        body: `${reason} You can chat again after ${user.chatRestrictedUntil.toDateString()}.`,
        icon: 'chatbubbles-outline',
      }).catch(() => {});
      summary = `Restricted chat for ${displayName(user)} for ${days} day${days === 1 ? '' : 's'} (scam flag): ${reason}`;
    } else {
      const { count, action: outcome } = await applyStrike(user, reason, req.user._id);
      summary = `Strike ${count} (${outcome}) for ${displayName(user)} (scam flag): ${reason}`;
    }

    const updated = await markReviewed({ safetyFlag: 'scam_words', sender: user._id, ...OPEN_REVIEW }, 'actioned', req, reason);
    await recordAudit(req, {
      action: `scam.${action}`,
      targetType: 'user',
      targetId: user._id,
      summary,
      meta: { messageId: String(message._id), flagsClosed: updated },
    });
    res.json({ ok: true, summary, flagsClosed: updated });
  } catch (error) {
    next(error);
  }
}

/**
 * Fraud signals across the platform:
 * - one app install used by several accounts
 * - OTP floods per phone and per IP
 * - suspended users coming back on a new number from the same install
 */
async function getFraudSignals(req, res, next) {
  try {
    const hours = [24, 72, 168].includes(Number(req.query.hours)) ? Number(req.query.hours) : 24;
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const suspendedUsers = await User.find({ status: 'suspended', role: 'user' }).select('_id phone').lean();
    const suspendedIds = suspendedUsers.map((u) => u._id);
    const suspendedPhones = suspendedUsers.map((u) => u.phone).filter(Boolean);

    const [sharedInstalls, otpPhones, otpIps, suspendedSessionInstalls, blockedRows] = await Promise.all([
      Session.aggregate([
        { $match: { kind: 'app', installId: { $gt: '' } } },
        { $group: { _id: '$installId', users: { $addToSet: '$user' }, devices: { $addToSet: '$deviceName' }, lastSeenAt: { $max: '$lastSeenAt' } } },
        { $match: { 'users.1': { $exists: true } } },
        { $project: { users: 1, devices: 1, lastSeenAt: 1, count: { $size: '$users' } } },
        { $sort: { count: -1, lastSeenAt: -1 } },
        { $limit: 50 },
      ]),
      OtpEvent.aggregate([
        { $match: { createdAt: { $gte: since }, phone: { $gt: '' } } },
        {
          $group: {
            _id: '$phone',
            sent: { $sum: { $cond: [{ $in: ['$event', ['sent', 'sms_failed']] }, 1, 0] } },
            failed: { $sum: { $cond: [{ $eq: ['$event', 'failed'] }, 1, 0] } },
            verified: { $sum: { $cond: [{ $eq: ['$event', 'verified'] }, 1, 0] } },
            ips: { $addToSet: '$ip' },
            lastAt: { $max: '$createdAt' },
          },
        },
        { $match: { $or: [{ sent: { $gte: OTP_PHONE_SENDS } }, { failed: { $gte: OTP_PHONE_SENDS } }] } },
        { $sort: { sent: -1, failed: -1 } },
        { $limit: 50 },
      ]),
      OtpEvent.aggregate([
        { $match: { createdAt: { $gte: since }, ip: { $gt: '' }, event: { $in: ['sent', 'sms_failed'] } } },
        { $group: { _id: '$ip', phones: { $addToSet: '$phone' }, sent: { $sum: 1 }, lastAt: { $max: '$createdAt' } } },
        { $project: { phones: 1, sent: 1, lastAt: 1, phoneCount: { $size: '$phones' } } },
        { $match: { phoneCount: { $gte: OTP_IP_PHONES } } },
        { $sort: { phoneCount: -1 } },
        { $limit: 50 },
      ]),
      suspendedIds.length
        ? Session.aggregate([
          { $match: { user: { $in: suspendedIds }, installId: { $gt: '' } } },
          { $group: { _id: '$installId', users: { $addToSet: '$user' } } },
        ])
        : [],
      OtpEvent.aggregate([
        { $match: { event: 'blocked_suspended', createdAt: { $gte: new Date(Date.now() - 7 * DAY) } } },
        { $group: { _id: '$user', attempts: { $sum: 1 }, installs: { $addToSet: '$installId' }, lastAt: { $max: '$createdAt' } } },
        { $sort: { lastAt: -1 } },
        { $limit: 50 },
      ]),
    ]);

    const bannedInstalls = new Map();
    for (const row of suspendedSessionInstalls) bannedInstalls.set(row._id, new Set(row.users.map(String)));
    for (const row of blockedRows) {
      for (const install of row.installs || []) {
        if (!install || !row._id) continue;
        if (!bannedInstalls.has(install)) bannedInstalls.set(install, new Set());
        bannedInstalls.get(install).add(String(row._id));
      }
    }
    const installKeys = [...bannedInstalls.keys()];

    const [evasionSessions, evasionOtp] = installKeys.length
      ? await Promise.all([
        Session.aggregate([
          { $match: { installId: { $in: installKeys }, user: { $nin: suspendedIds } } },
          { $group: { _id: '$installId', users: { $addToSet: '$user' }, lastSeenAt: { $max: '$lastSeenAt' } } },
        ]),
        OtpEvent.aggregate([
          { $match: { installId: { $in: installKeys }, event: { $in: ['sent', 'verified'] }, phone: { $nin: suspendedPhones } } },
          { $group: { _id: '$installId', phones: { $addToSet: '$phone' }, lastAt: { $max: '$createdAt' } } },
        ]),
      ])
      : [[], []];

    const evasionByInstall = new Map();
    for (const row of evasionSessions) evasionByInstall.set(row._id, { users: row.users.map(String), phones: [], lastAt: row.lastSeenAt });
    for (const row of evasionOtp) {
      const entry = evasionByInstall.get(row._id) || { users: [], phones: [], lastAt: row.lastAt };
      entry.phones = row.phones;
      if (row.lastAt > entry.lastAt) entry.lastAt = row.lastAt;
      evasionByInstall.set(row._id, entry);
    }

    const ids = [
      ...sharedInstalls.flatMap((g) => g.users),
      ...blockedRows.map((r) => r._id).filter(Boolean),
      ...installKeys.flatMap((k) => [...bannedInstalls.get(k)]),
      ...[...evasionByInstall.values()].flatMap((e) => e.users),
    ];
    const people = await presentUsers(ids);

    const phonesSeen = [...new Set([...otpPhones.map((r) => r._id), ...[...evasionByInstall.values()].flatMap((e) => e.phones)])];
    const phoneUsers = await User.find({ phone: { $in: phonesSeen } }).select('_id phone name status').lean();
    const userByPhone = new Map(phoneUsers.map((u) => [u.phone, { id: String(u._id), name: u.name || '', status: u.status }]));

    const evasion = [...evasionByInstall.entries()]
      .map(([install, entry]) => ({
        install: maskInstall(install),
        suspended: pick(people, [...bannedInstalls.get(install)]),
        accounts: pick(people, entry.users),
        newPhones: entry.phones
          .filter((phone) => !entry.users.some((u) => people.get(u)?.phone === phone))
          .map((phone) => ({ phone, user: userByPhone.get(phone) || null })),
        lastAt: entry.lastAt,
      }))
      .filter((row) => row.accounts.length || row.newPhones.length)
      .sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));

    res.json({
      hours,
      thresholds: { otpPhoneSends: OTP_PHONE_SENDS, otpIpPhones: OTP_IP_PHONES },
      evasion,
      blockedLogins: blockedRows
        .filter((row) => row._id)
        .map((row) => ({ user: pick(people, [row._id])[0], attempts: row.attempts, lastAt: row.lastAt })),
      sharedInstalls: sharedInstalls.map((g) => ({
        install: maskInstall(g._id),
        devices: g.devices.filter(Boolean),
        count: g.count,
        lastSeenAt: g.lastSeenAt,
        users: pick(people, g.users),
      })),
      otpPhones: otpPhones.map((row) => ({
        phone: row._id,
        user: userByPhone.get(row._id) || null,
        sent: row.sent,
        failed: row.failed,
        verified: row.verified,
        ips: row.ips.filter(Boolean).length,
        lastAt: row.lastAt,
      })),
      otpIps: otpIps.map((row) => ({
        ip: row._id,
        phones: row.phoneCount,
        sent: row.sent,
        samplePhones: row.phones.slice(0, 6),
        lastAt: row.lastAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { getScamFlags, reviewScamFlag, actOnScamFlag, getFraudSignals };
