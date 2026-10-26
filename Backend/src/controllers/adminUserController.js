const mongoose = require('mongoose');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const Chat = require('../models/Chat');
const Report = require('../models/Report');
const Review = require('../models/Review');
const Notification = require('../models/Notification');
const SupportTicket = require('../models/SupportTicket');
const AuditLog = require('../models/AuditLog');
const Message = require('../models/Message');
const { linkedAccounts } = require('../utils/fraudSignals');
const { ADMIN_ROLES } = require('../utils/adminScopes');
const { listSessions, revokeAllSessions } = require('../utils/sessions');
const { cancelDeletion, GRACE_DAYS } = require('../utils/accountDeletion');
const { recordAudit } = require('../utils/audit');

const DAY = 24 * 60 * 60 * 1000;
const MAX_DAYS = 365;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pageParams(query, fallbackLimit = 20) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || fallbackLimit));
  return { page, limit, skip: (page - 1) * limit };
}

function displayName(user) {
  return user?.name || user?.phone || user?.email || 'user';
}

function presentTicket(ticket) {
  const user = ticket.user && typeof ticket.user === 'object' && ticket.user._id ? ticket.user : null;
  return {
    id: String(ticket._id),
    userId: user ? String(user._id) : ticket.user ? String(ticket.user) : null,
    name: ticket.name || user?.name || '',
    phone: ticket.phone || user?.phone || '',
    userStatus: user?.status || null,
    subject: ticket.subject,
    message: ticket.message,
    status: ticket.status,
    reply: ticket.reply || '',
    repliedAt: ticket.repliedAt || null,
    repliedByName: ticket.repliedByName || '',
    adminNote: ticket.adminNote || '',
    resolvedAt: ticket.resolvedAt || null,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

async function getSupportTickets(req, res, next) {
  try {
    const { page, limit, skip } = pageParams(req.query);
    const filter = {};
    if (['open', 'resolved'].includes(req.query.status)) filter.status = req.query.status;
    const search = String(req.query.q || '').trim();
    if (search) {
      const re = new RegExp(escapeRegex(search), 'i');
      filter.$or = [{ subject: re }, { message: re }, { name: re }, { phone: re }];
    }

    const [total, tickets, open, resolved] = await Promise.all([
      SupportTicket.countDocuments(filter),
      SupportTicket.find(filter)
        .populate('user', 'name phone status')
        .sort({ status: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments({ status: 'open' }),
      SupportTicket.countDocuments({ status: 'resolved' }),
    ]);

    res.json({
      tickets: tickets.map(presentTicket),
      counts: { open, resolved },
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
}

/** Reply (shown in the app's Contact Us screen + an in-app notification), note, open/resolve. */
async function updateSupportTicket(req, res, next) {
  try {
    const { ticketId } = req.params;
    if (!mongoose.isValidObjectId(ticketId)) return res.status(400).json({ message: 'Invalid ticket' });
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });

    const reply = req.body.reply !== undefined ? String(req.body.reply || '').trim().slice(0, 1000) : null;
    const note = req.body.adminNote !== undefined ? String(req.body.adminNote || '').trim().slice(0, 1000) : null;
    const status = ['open', 'resolved'].includes(req.body.status) ? req.body.status : null;
    if (reply === null && note === null && !status) {
      return res.status(400).json({ message: 'Nothing to update' });
    }

    const changes = [];
    if (reply) {
      ticket.reply = reply;
      ticket.repliedAt = new Date();
      ticket.repliedBy = req.user._id;
      ticket.repliedByName = req.user.name || 'KinBech support';
      changes.push('replied');
    }
    if (note !== null) {
      ticket.adminNote = note;
      changes.push('note');
    }
    if (status && status !== ticket.status) {
      ticket.status = status;
      ticket.resolvedAt = status === 'resolved' ? new Date() : null;
      ticket.resolvedBy = status === 'resolved' ? req.user._id : null;
      changes.push(status);
    }
    await ticket.save();

    if (reply && ticket.user) {
      await Notification.create({
        user: ticket.user,
        type: 'system',
        title: 'KinBech support replied',
        body: `${ticket.subject}: ${reply}`.slice(0, 240),
        icon: 'chatbubble-ellipses-outline',
      }).catch(() => {});
    }

    recordAudit(req, {
      action: 'support.ticket.update',
      targetType: 'support_ticket',
      targetId: ticket._id,
      summary: `Ticket "${ticket.subject}" ${changes.join(', ') || 'updated'}`,
      meta: { userId: ticket.user ? String(ticket.user) : '', status: ticket.status },
    });

    await ticket.populate('user', 'name phone status');
    res.json({ ticket: presentTicket(ticket.toObject()) });
  } catch (error) {
    next(error);
  }
}

async function getDeletionRequests(req, res, next) {
  try {
    const scope = req.query.scope === 'deleted' ? 'deleted' : 'pending';
    const { page, limit, skip } = pageParams(req.query);
    const filter = scope === 'deleted'
      ? { deletedAt: { $ne: null } }
      : { deletionScheduledFor: { $ne: null }, deletedAt: null };

    const [total, users, pending, deleted] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select('name phone email deletionRequestedAt deletionScheduledFor deletedAt createdAt soldCount')
        .sort(scope === 'deleted' ? { deletedAt: -1 } : { deletionScheduledFor: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({ deletionScheduledFor: { $ne: null }, deletedAt: null }),
      User.countDocuments({ deletedAt: { $ne: null } }),
    ]);

    const ids = users.map((u) => u._id);
    const [listingCounts, shopCounts] = await Promise.all([
      Listing.aggregate([{ $match: { seller: { $in: ids } } }, { $group: { _id: '$seller', count: { $sum: 1 } } }]),
      Shop.aggregate([{ $match: { owner: { $in: ids } } }, { $group: { _id: '$owner', count: { $sum: 1 } } }]),
    ]);
    const listingMap = new Map(listingCounts.map((row) => [String(row._id), row.count]));
    const shopMap = new Map(shopCounts.map((row) => [String(row._id), row.count]));

    res.json({
      requests: users.map((user) => ({
        id: String(user._id),
        name: user.name || '',
        phone: user.phone || '',
        email: user.email || '',
        requestedAt: user.deletionRequestedAt || null,
        scheduledFor: user.deletionScheduledFor || null,
        deletedAt: user.deletedAt || null,
        joinedAt: user.createdAt,
        listingsCount: listingMap.get(String(user._id)) || 0,
        shopsCount: shopMap.get(String(user._id)) || 0,
      })),
      counts: { pending, deleted },
      graceDays: GRACE_DAYS,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
}

/** Restores listings/shops the request hid. The user still signs in again to use the app. */
async function cancelDeletionRequest(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    const user = await User.findById(userId).select('name phone email deletionScheduledFor deletedAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.deletedAt) return res.status(400).json({ message: 'This account is already deleted' });
    const cancelled = await cancelDeletion(user._id);
    if (!cancelled) return res.status(400).json({ message: 'No deletion is scheduled for this account' });

    recordAudit(req, {
      action: 'user.deletion.cancel',
      targetType: 'user',
      targetId: user._id,
      summary: `Cancelled account deletion for ${displayName(user)}`,
      meta: { scheduledFor: user.deletionScheduledFor },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function getUserDetail(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    const user = await User.findById(userId)
      .select('-password')
      .populate('referredBy', 'name phone')
      .populate('strikes.by', 'name')
      .lean();
    if (!user) return res.status(404).json({ message: 'User not found' });

    const id = user._id;
    const [
      listingStatus,
      recentListings,
      shops,
      reportsAgainst,
      reportsFiled,
      recentReports,
      ratingRows,
      chatsCount,
      referralsCount,
      tickets,
      sessions,
      audit,
      linked,
      scamFlags,
    ] = await Promise.all([
      Listing.aggregate([{ $match: { seller: id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Listing.find({ seller: id })
        .select('title price status photos views createdAt featuredUntil')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Shop.find({ owner: id }).select('name status isVerified logo createdAt').lean(),
      Report.aggregate([{ $match: { reportedUser: id } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Report.countDocuments({ reporter: id }),
      Report.find({ reportedUser: id })
        .populate('reporter', 'name phone')
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Review.aggregate([
        { $match: { status: 'approved', $or: [{ seller: id }, { reviewedUser: id }] } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
      ]),
      Chat.countDocuments({ participants: id }),
      User.countDocuments({ referredBy: id }),
      SupportTicket.find({ user: id }).sort({ createdAt: -1 }).limit(5).lean(),
      listSessions(id),
      AuditLog.find({ targetId: String(id) }).sort({ createdAt: -1 }).limit(20).lean(),
      linkedAccounts(id),
      Message.countDocuments({ sender: id, safetyFlag: 'scam_words', createdAt: { $gte: new Date(Date.now() - 30 * DAY) } }),
    ]);

    const countMap = (rows) => Object.fromEntries(rows.map((row) => [row._id, row.count]));
    const listingCounts = countMap(listingStatus);
    const reportCounts = countMap(reportsAgainst);
    const now = Date.now();
    const rating = ratingRows[0] || null;

    res.json({
      user: {
        id: String(id),
        name: user.name || '',
        phone: user.phone || '',
        email: user.email || '',
        avatarUrl: user.avatarUrl || '',
        bio: user.bio || '',
        location: user.location || '',
        role: user.role,
        status: user.status,
        profileComplete: Boolean(user.profileComplete),
        joinedAt: user.createdAt,
        lastActiveAt: user.lastActiveAt || null,
        soldCount: user.soldCount || 0,
        boughtCount: user.boughtCount || 0,
        dealsCompleted: user.dealsCompleted || 0,
        trustScore: user.trustScore ?? null,
        trustTier: user.trustTier || 'new',
        rankBoost: user.rankBoost || 0,
        featuredCredits: user.featuredCredits || 0,
        referralCode: user.referralCode || '',
        referredBy: user.referredBy
          ? { id: String(user.referredBy._id), name: displayName(user.referredBy) }
          : null,
        referralsCount,
        isTester: Boolean(user.isTester),
      },
      restrictions: {
        suspended: user.status === 'suspended',
        suspendedUntil: user.suspendedUntil || null,
        chatRestricted: Boolean(user.chatRestrictedUntil && new Date(user.chatRestrictedUntil).getTime() > now),
        chatRestrictedUntil: user.chatRestrictedUntil || null,
        restrictionReason: user.restrictionReason || '',
        strikes: (user.strikes || []).map((strike) => ({
          reason: strike.reason || '',
          at: strike.at || null,
          by: strike.by?.name || '',
        })),
      },
      deletion: {
        requestedAt: user.deletionRequestedAt || null,
        scheduledFor: user.deletionScheduledFor || null,
        deletedAt: user.deletedAt || null,
      },
      stats: {
        listings: {
          total: Object.values(listingCounts).reduce((sum, n) => sum + n, 0),
          active: listingCounts.active || 0,
          pending: listingCounts.pending || 0,
          sold: listingCounts.sold || 0,
          hidden: (listingCounts.hidden || 0) + (listingCounts.removed || 0),
        },
        reports: {
          against: Object.values(reportCounts).reduce((sum, n) => sum + n, 0),
          pending: reportCounts.pending || 0,
          filed: reportsFiled,
        },
        rating: rating ? { avg: Math.round(rating.avg * 10) / 10, count: rating.count } : { avg: null, count: 0 },
        chats: chatsCount,
        scamFlags30d: scamFlags,
      },
      linked,
      listings: recentListings.map((listing) => ({
        id: String(listing._id),
        title: listing.title,
        price: listing.price,
        status: listing.status,
        photo: listing.photos?.[0] || '',
        views: listing.views || 0,
        featured: Boolean(listing.featuredUntil && new Date(listing.featuredUntil).getTime() > now),
        createdAt: listing.createdAt,
      })),
      shops: shops.map((shop) => ({
        id: String(shop._id),
        name: shop.name,
        status: shop.status,
        isVerified: Boolean(shop.isVerified),
        logo: shop.logo || '',
        createdAt: shop.createdAt,
      })),
      reports: recentReports.map((report) => ({
        id: String(report._id),
        reason: report.reason,
        details: report.details || '',
        status: report.status,
        reporter: report.reporter ? displayName(report.reporter) : 'Deleted user',
        createdAt: report.createdAt,
      })),
      tickets: tickets.map(presentTicket),
      sessions,
      audit: audit.map((row) => ({
        id: String(row._id),
        action: row.action,
        summary: row.summary,
        actorName: row.actorName || '',
        actorRole: row.actorRole || '',
        createdAt: row.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

function clampDays(value) {
  const days = Number(value);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.min(MAX_DAYS, Math.round(days));
}

/**
 * One endpoint for every account action on the User 360 page. Each action is audited.
 * suspend {days?, reason} | reinstate | restrict_chat {days, reason} | lift_chat
 * | force_logout | set_credits {credits}
 */
async function moderateUser(req, res, next) {
  try {
    const { userId } = req.params;
    if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ message: 'Invalid user' });
    const action = String(req.body.action || '');
    const reason = String(req.body.reason || '').trim().slice(0, 300);
    const allowed = ['suspend', 'reinstate', 'restrict_chat', 'lift_chat', 'force_logout', 'set_credits'];
    if (!allowed.includes(action)) return res.status(400).json({ message: 'Unknown action' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot moderate your own account' });
    }
    if (ADMIN_ROLES.includes(user.role)) {
      return res.status(403).json({ message: 'Manage admin accounts from Settings & Roles' });
    }
    if (user.deletedAt) return res.status(400).json({ message: 'This account is deleted' });

    let summary = '';
    const meta = {};
    let kick = false;

    if (action === 'suspend') {
      if (!reason) return res.status(400).json({ message: 'Reason is required' });
      const days = clampDays(req.body.days);
      user.status = 'suspended';
      user.suspendedUntil = days ? new Date(Date.now() + days * DAY) : null;
      user.restrictionReason = reason;
      user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
      kick = true;
      meta.days = days || 'permanent';
      summary = `Suspended ${displayName(user)} ${days ? `for ${days} day${days === 1 ? '' : 's'}` : 'permanently'}: ${reason}`;
    } else if (action === 'reinstate') {
      user.status = 'active';
      user.suspendedUntil = null;
      summary = `Reinstated ${displayName(user)}`;
    } else if (action === 'restrict_chat') {
      if (!reason) return res.status(400).json({ message: 'Reason is required' });
      const days = clampDays(req.body.days);
      if (!days) return res.status(400).json({ message: 'Days must be at least 1' });
      user.chatRestrictedUntil = new Date(Date.now() + days * DAY);
      user.restrictionReason = reason;
      meta.days = days;
      summary = `Restricted chat for ${displayName(user)} for ${days} day${days === 1 ? '' : 's'}: ${reason}`;
    } else if (action === 'lift_chat') {
      user.chatRestrictedUntil = null;
      summary = `Lifted chat restriction for ${displayName(user)}`;
    } else if (action === 'force_logout') {
      user.tokenVersion = (Number(user.tokenVersion) || 0) + 1;
      kick = true;
      summary = `Signed ${displayName(user)} out of every device`;
    } else if (action === 'set_credits') {
      const credits = Number(req.body.credits);
      if (!Number.isInteger(credits) || credits < 0 || credits > 1000) {
        return res.status(400).json({ message: 'Credits must be a whole number from 0 to 1000' });
      }
      meta.from = user.featuredCredits || 0;
      meta.to = credits;
      user.featuredCredits = credits;
      summary = `Featured credits for ${displayName(user)}: ${meta.from} → ${credits}`;
    }

    await user.save();
    if (kick) meta.sessionsRevoked = await revokeAllSessions(user._id);

    if (action === 'restrict_chat' || (action === 'set_credits' && meta.to > meta.from)) {
      await Notification.create({
        user: user._id,
        type: 'system',
        title: action === 'restrict_chat' ? 'Chat temporarily restricted' : 'Featured credits added',
        body: action === 'restrict_chat'
          ? `${reason} You can chat again after ${user.chatRestrictedUntil.toDateString()}.`
          : `You now have ${meta.to} featured credit${meta.to === 1 ? '' : 's'} to boost your listings.`,
        icon: action === 'restrict_chat' ? 'chatbubbles-outline' : 'rocket-outline',
      }).catch(() => {});
    }

    await recordAudit(req, { action: `user.${action}`, targetType: 'user', targetId: user._id, summary, meta });
    res.json({ ok: true, summary });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getSupportTickets,
  updateSupportTicket,
  getDeletionRequests,
  cancelDeletionRequest,
  getUserDetail,
  moderateUser,
};
