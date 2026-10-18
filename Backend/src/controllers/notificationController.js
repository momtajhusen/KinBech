const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');

const MEETUP_TITLE = /meetup/i;

const CATEGORY_FILTERS = {
  messages: { type: 'chat', icon: { $ne: 'call-outline' } },
  calls: { $or: [{ type: 'call' }, { icon: 'call-outline' }] },
  meetups: { type: 'system', $or: [{ icon: 'location-outline' }, { title: MEETUP_TITLE }] },
  listings: { type: 'listing' },
  offers: { type: { $in: ['promotion', 'broadcast'] } },
  account: { type: 'system', icon: { $ne: 'location-outline' }, title: { $not: MEETUP_TITLE } },
};

const CATEGORY_KEYS = Object.keys(CATEGORY_FILTERS);

function categoryOf(item) {
  if (item.type === 'call' || item.icon === 'call-outline') return 'calls';
  if (item.type === 'chat') return 'messages';
  if (item.type === 'listing') return 'listings';
  if (item.type === 'promotion' || item.type === 'broadcast') return 'offers';
  if (item.icon === 'location-outline' || MEETUP_TITLE.test(item.title || '')) return 'meetups';
  return 'account';
}

function scopedFilter(userId, { category, ids, onlyRead } = {}) {
  const filter = { user: userId };
  if (CATEGORY_FILTERS[category]) Object.assign(filter, CATEGORY_FILTERS[category]);
  if (Array.isArray(ids) && ids.length) {
    filter._id = { $in: ids.filter((id) => mongoose.isValidObjectId(id)).slice(0, 200) };
  }
  if (onlyRead) filter.unread = false;
  return filter;
}

async function categoryCounts(userId) {
  const pairs = await Promise.all(
    CATEGORY_KEYS.map(async (key) => {
      const base = { user: userId, ...CATEGORY_FILTERS[key] };
      const [total, unread] = await Promise.all([
        Notification.countDocuments(base),
        Notification.countDocuments({ ...base, unread: true }),
      ]);
      return [key, { total, unread }];
    })
  );
  return Object.fromEntries(pairs);
}

async function getNotifications(req, res, next) {
  try {
    const category = CATEGORY_FILTERS[req.query.category] ? req.query.category : '';
    const filter = scopedFilter(req.user._id, { category });
    if (req.query.unread === '1') filter.unread = true;
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const wantCounts = req.query.counts === '1';

    const [notifications, unreadCount, counts] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ user: req.user._id, unread: true }),
      wantCounts ? categoryCounts(req.user._id) : null,
    ]);

    res.json({
      unreadCount,
      ...(counts ? { counts } : {}),
      notifications: notifications.map((item) => ({
        id: String(item._id),
        type: item.type || 'system',
        category: categoryOf(item),
        title: item.title,
        body: item.body || item.message || '',
        icon: item.icon || 'notifications-outline',
        unread: item.unread !== false,
        route: item.route || '',
        params: item.params || null,
        tab: item.tab || '',
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    next(error);
  }
}

async function deleteNotification(req, res, next) {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    const result = await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
    if (!result.deletedCount) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function clearNotifications(req, res, next) {
  try {
    const { category, ids } = req.body || {};
    const onlyRead = req.body?.onlyRead !== false;
    const result = await Notification.deleteMany(
      scopedFilter(req.user._id, { category, ids, onlyRead })
    );
    res.json({ ok: true, deleted: result.deletedCount || 0 });
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
    const { category, ids } = req.body || {};
    const result = await Notification.updateMany(
      { ...scopedFilter(req.user._id, { category, ids }), unread: true },
      { unread: false }
    );
    res.json({ ok: true, updated: result.modifiedCount || 0 });
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
  deleteNotification,
  clearNotifications,
  createBroadcastNotification,
  getBroadcastNotifications,
};