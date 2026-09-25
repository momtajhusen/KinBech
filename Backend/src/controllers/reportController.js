const Report = require('../models/Report');
const User = require('../models/User');
const { maybeAutoRestrictFromReports } = require('../utils/userRestriction');

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

    // Create report
    const report = await Report.create({
      reporter: req.user._id,
      reportedUser: reportedUserId,
      reportedListing: req.body.listingId || null,
      reason,
      details: details || '',
    });

    // Block user if requested
    if (blockUser) {
      await User.findByIdAndUpdate(req.user._id, {
        $addToSet: { blockedUserIds: reportedUserId }
      });
      await User.findByIdAndUpdate(reportedUserId, {
        $addToSet: { blockedUserIds: req.user._id }
      });
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

    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Add to both users' blocked lists
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { blockedUserIds: userId }
    });
    await User.findByIdAndUpdate(userId, {
      $addToSet: { blockedUserIds: req.user._id }
    });

    res.json({ message: 'User blocked successfully' });
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

    // Remove from both users' blocked lists
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { blockedUserIds: userId }
    });
    await User.findByIdAndUpdate(userId, {
      $pull: { blockedUserIds: req.user._id }
    });

    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    next(error);
  }
}

async function getMyReports(req, res, next) {
  try {
    const reports = await Report.find({ reporter: req.user._id })
      .populate('reportedUser', 'name phone avatarUrl')
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
    const { status } = req.query;
    const filter = {};
    
    if (status) {
      filter.status = status;
    }

    const reports = await Report.find(filter)
      .populate('reporter', 'name phone avatarUrl')
      .populate('reportedUser', 'name phone avatarUrl')
      .populate('reportedListing', 'title photos')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({ reports });
  } catch (error) {
    next(error);
  }
}

async function updateReportStatus(req, res, next) {
  try {
    const { reportId } = req.params;
    const { status, notes } = req.body;

    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ message: 'Report not found' });
    }

    report.status = status || report.status;
    report.notes = notes || report.notes;
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();

    await report.save();

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