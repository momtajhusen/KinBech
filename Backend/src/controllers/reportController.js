const mongoose = require('mongoose');
const Report = require('../models/Report');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Chat = require('../models/Chat');
const { evaluateListingNow } = require('../utils/listingTrust');
const { maybeAutoRestrictFromReports } = require('../utils/userRestriction');
const listingQueryCache = require('../utils/listingQueryCache');
const { statusChange } = require('../utils/listing');
const { emitActivity } = require('../utils/realtime');
const { reportActivityEvent } = require('../utils/activityEvents');
const { setBlock } = require('../utils/blocks');
const { isAdminRole } = require('../utils/adminScopes');

async function createReport(req, res, next) {
  try {
    const { reportedUserId, reason, details, blockUser } = req.body;

    if (!reportedUserId || !reason) {
      return res.status(400).json({ message: 'Reported user ID and reason are required' });
    }

    if (String(reportedUserId) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot report yourself' });
    }

    const reportedUser = await User.findById(reportedUserId);
    if (!reportedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    let listingId = null;
    if (req.body.listingId) {
      const listing = await Listing.findById(req.body.listingId).select('seller').lean();
      if (!listing || String(listing.seller) !== String(reportedUserId)) {
        return res.status(400).json({ message: 'That listing does not belong to this user' });
      }
      listingId = listing._id;
    }

    // "Not available" / "No-show" can hide listings, so only a buyer who chatted about it counts.
    if (reason === 'not-available' || reason === 'no-show') {
      if (!listingId) {
        return res.status(400).json({ message: 'Choose the listing you are reporting' });
      }
      const chatted = await Chat.exists({ listing: listingId, participants: req.user._id });
      if (!chatted) {
        return res.status(403).json({ message: 'Chat with the seller about this item before reporting it', code: 'CHAT_REQUIRED' });
      }
      const recent = await Report.exists({
        reporter: req.user._id,
        reportedListing: listingId,
        reason,
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      });
      if (recent) {
        return res.json({ message: 'You already reported this item', duplicate: true });
      }
    }

    // Create report
    const report = await Report.create({
      reporter: req.user._id,
      reportedUser: reportedUserId,
      reportedListing: listingId,
      reason,
      details: details || '',
    });
    emitActivity(reportActivityEvent(report));
    if (reason === 'not-available') evaluateListingNow(listingId);

    if (blockUser && !isAdminRole(reportedUser.role)) {
      await setBlock(req.user._id, reportedUser._id, { messages: true, calls: true });
    }

    // 3+ distinct reporters in 14 days → temporary chat restriction
    const autoRestrict = await maybeAutoRestrictFromReports(reportedUserId);

    res.status(201).json({
      message: 'Report submitted successfully',
      report: {
        id: report._id,
        reason: report.reason,
        status: report.status,
      },
      autoRestrict: {
        applied: Boolean(autoRestrict.restricted),
        reporterCount: autoRestrict.reporterCount,
        until: autoRestrict.until || null,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function blockUser(req, res, next) {
  try {
    const { userId } = req.params;

    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot block yourself' });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid user' });
    }
    const targetUser = await User.findById(userId).select('role');
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (isAdminRole(targetUser.role)) {
      return res.status(400).json({ message: 'KinBech Support cannot be blocked.' });
    }

    const messages = req.body?.messages !== false;
    const calls = req.body?.calls !== false;
    if (!messages && !calls) {
      return res.status(400).json({ message: 'Choose messages, calls, or both to block.' });
    }
    await setBlock(req.user._id, targetUser._id, { messages, calls });

    res.json({
      message: messages && calls ? 'Messages and calls blocked' : messages ? 'Messages blocked' : 'Calls blocked',
      block: { messages, calls },
    });
  } catch (error) {
    next(error);
  }
}

async function unblockUser(req, res, next) {
  try {
    const { userId } = req.params;

    if (String(userId) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot unblock yourself' });
    }

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: 'Invalid user' });
    }
    await setBlock(req.user._id, userId, { messages: false, calls: false });

    res.json({ message: 'User unblocked successfully', block: { messages: false, calls: false } });
  } catch (error) {
    next(error);
  }
}

async function getMyReports(req, res, next) {
  try {
    const reports = await Report.find({ reporter: req.user._id })
      .populate('reportedUser', 'name avatarUrl')
      .populate('reportedListing', 'title photos')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ reports });
  } catch (error) {
    next(error);
  }
}

async function getAllReports(req, res, next) {
  try {
    const { status, q } = req.query;
    const filter = {};
    
    if (status) {
      filter.status = status;
    }

    const search = String(q || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const [userIds, listingIds] = await Promise.all([
        User.find({ name: re }).select('_id').lean(),
        Listing.find({ title: re }).select('_id').lean(),
      ]);
      filter.$or = [
        { reason: re },
        { reporter: { $in: userIds.map((u) => u._id) } },
        { reportedUser: { $in: userIds.map((u) => u._id) } },
        { reportedListing: { $in: listingIds.map((l) => l._id) } },
      ];
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, reports] = await Promise.all([
      Report.countDocuments(filter),
      Report.find(filter)
        .populate('reporter', 'name phone avatarUrl')
        .populate('reportedUser', 'name phone avatarUrl')
        .populate('reportedListing', 'title photos')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      reports,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (error) {
    next(error);
  }
}

async function updateReportStatus(req, res, next) {
  try {
    const { reportId } = req.params;
    const { status, notes } = req.body;

    const allowed = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid report status' });
    }

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    report.status = status || report.status;
    report.notes = notes || report.notes;
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();

    await report.save();

    if (report.status === 'reviewed' && report.reportedListing) {
      const listing = await Listing.findById(report.reportedListing);
      if (listing && listing.status === 'active') {
        listing.status = 'pending';
        listing.statusChange = statusChange('pending', 'admin', 'reported');
        listing.heldAt = listing.heldAt || new Date();
        listing.moderationReason = listing.moderationReason || `Reported: ${report.reason}`;
        await listing.save();
        listingQueryCache.invalidateAll();
      }
    }

    res.json({ 
      message: 'Report status updated successfully',
      report
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createReport,
  blockUser,
  unblockUser,
  getMyReports,
  getAllReports,
  updateReportStatus,
};