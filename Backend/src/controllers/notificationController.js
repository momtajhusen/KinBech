const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { messagingClient } = require('../utils/callPush');

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

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function broadcastPayload(doc, status) {
  return {
    id: doc._id,
    title: doc.title,
    message: doc.message || doc.body,
    audience: doc.audience,
    city: doc.city || '',
    deliveryMethod: doc.deliveryMethod,
    sentAt: doc.createdAt,
    status: status || doc.broadcastStatus || 'sent',
    sender: doc.sender ? { name: doc.sender.name } : null,
  };
}

async function audienceFilter(audience, city) {
  const userFilter = { role: 'user', status: { $ne: 'suspended' } };
  if (audience === 'individual_sellers') {
    userFilter.sellerTypePreference = { $in: ['individual', 'both'] };
  } else if (audience === 'shop_sellers') {
    userFilter.sellerTypePreference = { $in: ['shop', 'both'] };
  } else if (audience === 'buyers') {
    userFilter.sellerTypePreference = 'individual';
    userFilter.soldCount = 0;
  } else if (audience === 'specific_city') {
    const place = String(city || '').trim();
    if (!place) {
      const error = new Error('City is required for a city audience');
      error.status = 400;
      throw error;
    }
    userFilter.location = new RegExp(escapeRegex(place), 'i');
  }
  return userFilter;
}

async function pushBroadcast(users, title, message) {
  const messaging = messagingClient();
  if (!messaging) return 0;
  const tokens = users
    .filter((user) => user.fcmToken && user.preferences?.notifications !== false)
    .map((user) => user.fcmToken);
  let sent = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const chunk = tokens.slice(i, i + 500);
    const result = await messaging.sendEachForMulticast({
      tokens: chunk,
      notification: { title, body: message },
      data: { type: 'broadcast', title, body: message },
    }).catch(() => null);
    sent += result?.successCount || 0;
  }
  return sent;
}

async function deliverBroadcast(master, users) {
  const method = master.deliveryMethod || 'both';
  const title = master.title;
  const message = master.message || master.body;
  if (method === 'banner' || method === 'both') {
    if (users.length) {
      await Notification.insertMany(
        users.map((user) => ({
          user: user._id,
          type: 'broadcast',
          title,
          body: message,
          message,
          icon: 'megaphone-outline',
          unread: true,
          audience: master.audience,
          deliveryMethod: method,
          broadcastStatus: 'sent',
          city: master.city || '',
          sender: master.sender,
        }))
      );
    }
  }
  if (method === 'push' || method === 'both') {
    await pushBroadcast(users, title, message);
  }
}

async function createBroadcastNotification(req, res, next) {
  try {
    const { title, message, audience, deliveryMethod, city, id } = req.body;
    const saveAsDraft = Boolean(req.body.saveAsDraft);

    if (!title || !message) {
      return res.status(400).json({ message: 'Title and message are required' });
    }

    const targetAudience = audience || 'all';
    const allowedAudiences = ['all', 'buyers', 'individual_sellers', 'shop_sellers', 'specific_city'];
    if (!allowedAudiences.includes(targetAudience)) {
      return res.status(400).json({ message: 'Invalid audience' });
    }
    if (targetAudience === 'specific_city' && !String(city || '').trim() && !saveAsDraft) {
      return res.status(400).json({ message: 'City is required for a city audience' });
    }

    const fields = {
      type: 'broadcast',
      title: String(title).trim(),
      body: message,
      message,
      audience: targetAudience,
      city: String(city || '').trim(),
      deliveryMethod: deliveryMethod || 'both',
      sender: req.user._id,
      user: null,
      broadcastStatus: saveAsDraft ? 'draft' : 'sent',
    };

    let broadcast;
    if (id) {
      broadcast = await Notification.findOne({ _id: id, type: 'broadcast', user: null });
      if (!broadcast) return res.status(404).json({ message: 'Broadcast not found' });
      Object.assign(broadcast, fields);
      await broadcast.save();
    } else {
      broadcast = await Notification.create(fields);
    }

    if (!saveAsDraft) {
      const users = await User.find(await audienceFilter(targetAudience, fields.city))
        .select('_id fcmToken preferences')
        .limit(2000)
        .lean();
      await deliverBroadcast(broadcast, users);
    }

    res.status(id ? 200 : 201).json({
      message: saveAsDraft ? 'Draft saved' : 'Broadcast notification sent',
      broadcast: broadcastPayload(broadcast, broadcast.broadcastStatus),
    });
  } catch (error) {
    if (error.status === 400) return res.status(400).json({ message: error.message });
    next(error);
  }
}

async function deleteBroadcastNotification(req, res, next) {
  try {
    const doc = await Notification.findOne({
      _id: req.params.id,
      type: 'broadcast',
      user: null,
    });
    if (!doc) return res.status(404).json({ message: 'Broadcast not found' });
    await Notification.deleteMany({
      type: 'broadcast',
      sender: doc.sender,
      title: doc.title,
      message: doc.message,
      createdAt: {
        $gte: new Date(doc.createdAt.getTime() - 2000),
        $lte: new Date(doc.createdAt.getTime() + 120000),
      },
    });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function getBroadcastNotifications(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const filter = { type: 'broadcast', user: null };
    if (req.query.status === 'draft') filter.broadcastStatus = 'draft';
    else filter.broadcastStatus = { $ne: 'draft' };

    const [total, docs] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.find(filter)
        .populate('sender', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      broadcasts: docs.map((b) => broadcastPayload(b)),
      total,
      page,
      totalPages: Math.ceil(total / limit)
    });
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
  deleteBroadcastNotification,
  getBroadcastNotifications,
};