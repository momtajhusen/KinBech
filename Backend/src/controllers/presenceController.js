const mongoose = require('mongoose');
const LivePresence = require('../models/LivePresence');
const User = require('../models/User');
const Listing = require('../models/Listing');
const Shop = require('../models/Shop');
const { clientIp, describeDevice } = require('../utils/sessions');

/** A row counts as live while its last ping is newer than this; the app pings every 30s. */
const LIVE_WINDOW_MS = 75 * 1000;
/** A gap longer than this starts a new visit (fresh trail and start time). */
const NEW_VISIT_GAP_MS = 5 * 60 * 1000;
const TRAIL_MAX = 20;
const LAST_ACTIVE_EVERY_MS = 60 * 1000;

const PARAM_KEYS = ['listingId', 'shopId', 'sellerId', 'otherUserId', 'query', 'category', 'tab'];

function cleanParams(raw) {
  const params = {};
  PARAM_KEYS.forEach((key) => {
    const value = raw && raw[key] != null ? String(raw[key]).trim().slice(0, 120) : '';
    params[key] = value;
  });
  return params;
}

function cleanScreen(value) {
  return String(value || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 60);
}

const isId = (value) => Boolean(value) && mongoose.isValidObjectId(value);

/** Turns ids into names, reusing the previous lookup when the id did not change. */
async function resolveContext(params, previous) {
  const prevParams = previous?.params || {};
  const prev = previous?.context || {};
  const context = { listingTitle: '', listingPrice: null, shopName: '', personName: '' };

  if (isId(params.listingId)) {
    if (params.listingId === prevParams.listingId && prev.listingTitle) {
      context.listingTitle = prev.listingTitle;
      context.listingPrice = prev.listingPrice;
    } else {
      const listing = await Listing.findById(params.listingId).select('title price').lean();
      if (listing) {
        context.listingTitle = listing.title || '';
        context.listingPrice = listing.price ?? null;
      }
    }
  }

  if (isId(params.shopId)) {
    if (params.shopId === prevParams.shopId && prev.shopName) {
      context.shopName = prev.shopName;
    } else {
      const shop = await Shop.findById(params.shopId).select('name').lean();
      context.shopName = shop?.name || '';
    }
  }

  const personId = isId(params.sellerId) ? params.sellerId : isId(params.otherUserId) ? params.otherUserId : '';
  if (personId) {
    const samePerson = personId === (prevParams.sellerId || prevParams.otherUserId);
    if (samePerson && prev.personName) {
      context.personName = prev.personName;
    } else {
      const person = await User.findById(personId).select('name').lean();
      context.personName = person?.name || '';
    }
  }

  return context;
}

function trailLabel(params, context) {
  return (
    context.listingTitle ||
    context.shopName ||
    context.personName ||
    (params.query ? `"${params.query}"` : '') ||
    params.category ||
    ''
  ).slice(0, 80);
}

/**
 * POST /auth/presence  { event: 'screen' | 'ping' | 'leave', screen, params }
 * Works signed in or as a guest; staff accounts are not tracked.
 */
async function reportPresence(req, res, next) {
  try {
    if (req.user && req.user.role !== 'user') return res.status(204).end();

    const device = describeDevice(req);
    const key = device.installId || (req.user ? `user:${req.user._id}` : '');
    if (!key) return res.status(204).end();

    const event = String(req.body?.event || 'ping');
    if (event === 'leave') {
      await LivePresence.deleteOne({ key });
      return res.status(204).end();
    }

    const now = new Date();
    const userId = req.user ? req.user._id : null;
    const previous = await LivePresence.findOne({ key }).lean();
    const newVisit = !previous || now - new Date(previous.lastSeenAt) > NEW_VISIT_GAP_MS;
    const screen = cleanScreen(req.body?.screen) || previous?.screen || '';
    const params = req.body?.params ? cleanParams(req.body.params) : cleanParams(previous?.params);
    const changed =
      newVisit ||
      screen !== previous.screen ||
      PARAM_KEYS.some((k) => params[k] !== (previous.params?.[k] || ''));

    const base = {
      user: userId,
      deviceName: device.deviceName,
      platform: device.platform,
      appVersion: device.appVersion,
      ip: clientIp(req),
      lastSeenAt: now,
    };

    if (!changed) {
      await LivePresence.updateOne({ key }, { $set: base });
    } else {
      const context = await resolveContext(params, newVisit ? null : previous);
      const step = { screen, label: trailLabel(params, context), at: now };
      const set = { ...base, screen, params, context, screenSince: now };
      if (newVisit) {
        await LivePresence.updateOne(
          { key },
          { $set: { ...set, startedAt: now, screensCount: 1, trail: [step] } },
          { upsert: true }
        ).catch((error) => {
          // Two first pings from one install can race on the unique key; the other one won.
          if (error?.code !== 11000) throw error;
        });
      } else {
        await LivePresence.updateOne(
          { key },
          { $set: set, $inc: { screensCount: 1 }, $push: { trail: { $each: [step], $slice: -TRAIL_MAX } } }
        );
      }
    }

    if (userId) {
      User.updateOne(
        { _id: userId, $or: [{ lastActiveAt: null }, { lastActiveAt: { $lt: new Date(now - LAST_ACTIVE_EVERY_MS) } }] },
        { $set: { lastActiveAt: now } }
      ).catch(() => {});
    }

    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

function countBy(rows, pick) {
  const counts = new Map();
  rows.forEach((row) => {
    const value = pick(row);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

/** GET /auth/admin/live-users — who has the app open right now and where they are in it. */
async function getLiveUsers(req, res, next) {
  try {
    const now = Date.now();
    const since = new Date(now - LIVE_WINDOW_MS);
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const [rows, active5m, active1h, activeToday] = await Promise.all([
      LivePresence.find({ lastSeenAt: { $gte: since } })
        .sort({ lastSeenAt: -1 })
        .limit(500)
        .populate('user', 'name phone avatarUrl location isTester status createdAt soldCount boughtCount')
        .lean(),
      User.countDocuments({ role: 'user', lastActiveAt: { $gte: new Date(now - 5 * 60 * 1000) } }),
      User.countDocuments({ role: 'user', lastActiveAt: { $gte: new Date(now - 60 * 60 * 1000) } }),
      User.countDocuments({ role: 'user', lastActiveAt: { $gte: startOfDay } }),
    ]);

    const sessions = rows
      .map((row) => ({
        key: row.key,
        guest: !row.user,
        user: row.user
          ? {
              id: String(row.user._id),
              name: row.user.name || '',
              phone: row.user.phone || '',
              avatarUrl: row.user.avatarUrl || '',
              location: row.user.location || '',
              isTester: Boolean(row.user.isTester),
              status: row.user.status,
              joinedAt: row.user.createdAt,
              soldCount: row.user.soldCount || 0,
              boughtCount: row.user.boughtCount || 0,
            }
          : null,
        screen: row.screen,
        params: row.params || {},
        context: row.context || {},
        deviceName: row.deviceName,
        platform: row.platform,
        appVersion: row.appVersion,
        ip: row.ip,
        startedAt: row.startedAt,
        screenSince: row.screenSince,
        lastSeenAt: row.lastSeenAt,
        screensCount: row.screensCount || 0,
        trail: [...(row.trail || [])].reverse(),
      }))
      .sort((a, b) => new Date(b.screenSince) - new Date(a.screenSince));

    const signedIn = sessions.filter((s) => !s.guest);
    const totalMinutes = sessions.reduce((sum, s) => sum + (now - new Date(s.startedAt).getTime()) / 60000, 0);

    res.json({
      summary: {
        live: sessions.length,
        signedIn: signedIn.length,
        guests: sessions.length - signedIn.length,
        testers: signedIn.filter((s) => s.user.isTester).length,
        newVisits: sessions.filter((s) => now - new Date(s.startedAt).getTime() < 5 * 60 * 1000).length,
        avgMinutes: sessions.length ? Math.round(totalMinutes / sessions.length) : 0,
        active5m,
        active1h,
        activeToday,
      },
      byScreen: countBy(sessions, (s) => s.screen),
      byPlatform: countBy(sessions, (s) => s.platform),
      sessions,
      now,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = { reportPresence, getLiveUsers };
