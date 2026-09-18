const Notification = require('../models/Notification');
const User = require('../models/User');

async function getNotifications(req, res, next) {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ notifications });
  } catch (error) {
    next(error);
  }
}

async function markAsRead(req, res, next) {
  try {
    const { id } = req.params;
    const notification = await Notification.findOneAndUpdate(
      { _id: id, user: req.user._id },
      { unread: false },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    await Notification.updateMany(
      { user: req.user._id, unread: true },
      { unread: false }
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function createBroadcastNotification(req, res, next) {
  try {
    const { title, message, audience, deliveryMethod } = req.body;

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    // Create a broadcast notification record (for admin tracking)
    const broadcast = await Notification.create({
      type: 'broadcast',
      title,
      body: message, // Store in body field
      message: message, // Also store in message for compatibility
      audience: audience || 'all',
      deliveryMethod: deliveryMethod || 'both',
      sender: req.user._id,
      createdAt: new Date(),
    });

    const targetAudience = audience || 'all';
    const userFilter = { role: 'user', status: { $ne: 'suspended' } };
    if (targetAudience === 'individual_sellers') {
      userFilter.sellerTypePreference = { $in: ['individual', 'both'] };
    } else if (targetAudience === 'shop_sellers') {
      userFilter.sellerTypePreference = { $in: ['shop', 'both'] };
    }

    const users = await User.find(userFilter).select('_id').limit(2000).lean();
    if (users.length) {
      await Notification.insertMany(
        users.map((u) => ({
          user: u._id,
          type: 'broadcast',
          title,
          body: message,
          message,
          icon: 'megaphone-outline',
          unread: true,
          audience: targetAudience,
          deliveryMethod: deliveryMethod || 'both',
          sender: req.user._id,
        }))
      );
    }

    res.status(201).json({ 
      message: 'Broadcast notification created successfully',
      broadcast: {
        id: broadcast._id,
        title: broadcast.title,
        message: broadcast.message || broadcast.body,
        audience: broadcast.audience,
        deliveryMethod: broadcast.deliveryMethod,
        createdAt: broadcast.createdAt,
      }
    });
  } catch (error) {
    next(error);
  }
}

async function getBroadcastNotifications(req, res, next) {
  try {
    const broadcasts = await Notification.find({ type: 'broadcast' })
      .populate('sender', 'name')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({ broadcasts });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  createBroadcastNotification,
  getBroadcastNotifications,
};