const fs = require('fs');
const mongoose = require('mongoose');
const PlatformAlert = require('../models/PlatformAlert');
const { getUploadsRoot } = require('../config/uploads');
const { emitActivity } = require('./realtime');
const { alertActivityEvent } = require('./activityEvents');

const WINDOW_MS = 5 * 60 * 1000;
const COOLDOWN_MS = 30 * 60 * 1000;
const DISK_CHECK_MS = 10 * 60 * 1000;

const hits = { server_errors: [], auth_surge: [] };
const lastRaised = new Map();

function threshold(kind) {
  if (kind === 'server_errors') return Number(process.env.ALERT_5XX_PER_5MIN) || 25;
  return Number(process.env.ALERT_AUTH_FAIL_PER_5MIN) || 60;
}

async function postWebhook(alert) {
  const url = String(process.env.ALERT_WEBHOOK_URL || '').trim();
  if (!url) return;
  const text = `KinBech alert: ${alert.title} — ${alert.message}`;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `text` for Slack, `content` for Discord.
      body: JSON.stringify({ text, content: text }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (error) {
    console.warn('[alerts] webhook failed:', error.message);
  }
}

/**
 * Opens a platform alert (bell + live activity + optional webhook). One per type per 30 min.
 * `ongoing` alerts describe a state (e.g. low disk): while one is still open it is refreshed
 * in place instead of stacking a new alert every cooldown.
 */
async function raiseAlert({ type, title, message, metricValue = 0, baselineValue = 0, key = type, ongoing = false }) {
  const now = Date.now();
  if (ongoing) {
    try {
      const existing = await PlatformAlert.findOneAndUpdate(
        { type, status: { $in: ['open', 'acknowledged'] } },
        { $set: { title, message, metricValue, baselineValue } },
        { sort: { createdAt: -1 }, new: true }
      );
      if (existing) return existing;
    } catch (error) {
      console.warn('[alerts] could not refresh alert:', error.message);
      return null;
    }
  }
  if (now - (lastRaised.get(key) || 0) < COOLDOWN_MS) return null;
  lastRaised.set(key, now);
  try {
    // Survives restarts: skip if the same alert is already open from the last 30 min.
    const recent = await PlatformAlert.exists({
      type,
      ...(key === type ? {} : { message }),
      status: { $in: ['open', 'acknowledged'] },
      createdAt: { $gte: new Date(now - COOLDOWN_MS) },
    });
    if (recent) return null;
    console.warn(`[alerts] ${title}: ${message}`);
    const alert = await PlatformAlert.create({
      type,
      title,
      message,
      metricValue,
      baselineValue,
      changePct: 0,
      notifiedAt: new Date(),
    });
    emitActivity(alertActivityEvent(alert));
    postWebhook(alert);
    return alert;
  } catch (error) {
    console.warn('[alerts] could not save alert:', error.message);
    return null;
  }
}

function bump(kind) {
  const now = Date.now();
  const list = hits[kind];
  list.push(now);
  while (list.length && list[0] < now - WINDOW_MS) list.shift();
  const limit = threshold(kind);
  if (list.length > limit * 2) list.splice(0, list.length - limit * 2);
  if (list.length < limit) return;
  if (kind === 'server_errors') {
    raiseAlert({
      type: 'server_errors',
      title: '5xx error spike',
      message: `${list.length} server errors in the last 5 minutes. Check the Error Log and server logs.`,
      metricValue: list.length,
      baselineValue: limit,
    });
  } else {
    raiseAlert({
      type: 'auth_surge',
      title: 'Login failure surge',
      message: `${list.length} failed or rate-limited sign-in requests in 5 minutes. Possible brute force.`,
      metricValue: list.length,
      baselineValue: limit,
    });
  }
}

/** Counts 5xx responses and failed sign-ins. */
function trackResponses(req, res, next) {
  res.on('finish', () => {
    const status = res.statusCode;
    if (status >= 500) bump('server_errors');
    else if (status === 401 || status === 429) {
      const path = req.originalUrl.split('?')[0].replace(/^\/v1(?=\/)/, '');
      if (/^\/auth\/(login|signup|otp|admin\/login)/.test(path)) bump('auth_surge');
    }
  });
  next();
}

/** Keeps only the newest open alert of a type; older copies are marked resolved. */
async function closeDuplicateAlerts(type) {
  const active = await PlatformAlert.find({ type, status: { $in: ['open', 'acknowledged'] } })
    .sort({ createdAt: -1 })
    .select('_id')
    .lean();
  if (active.length < 2) return;
  await PlatformAlert.updateMany(
    { _id: { $in: active.slice(1).map((item) => item._id) } },
    { $set: { status: 'resolved' } }
  );
}

async function checkDisk() {
  if (typeof fs.promises.statfs !== 'function') return;
  try {
    const stats = await fs.promises.statfs(getUploadsRoot());
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    if (!total) return;
    const freePct = Math.round((free / total) * 100);
    const minPct = Number(process.env.ALERT_DISK_FREE_PCT) || 10;
    await closeDuplicateAlerts('disk_low');
    if (freePct < minPct) {
      await raiseAlert({
        type: 'disk_low',
        title: 'Disk space low',
        message: `Only ${freePct}% (${(free / 1024 ** 3).toFixed(1)} GB) free on the uploads disk.`,
        metricValue: freePct,
        baselineValue: minPct,
        ongoing: true,
      });
    } else {
      await PlatformAlert.updateMany(
        { type: 'disk_low', status: { $in: ['open', 'acknowledged'] } },
        { $set: { status: 'resolved' } }
      );
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('[alerts] disk check failed:', error.message);
  }
}

let monitorStarted = false;

function startHealthMonitor() {
  if (monitorStarted) return;
  monitorStarted = true;
  checkDisk();
  setInterval(checkDisk, DISK_CHECK_MS).unref();

  let downTimer = null;
  mongoose.connection.on('disconnected', () => {
    // Short blips reconnect on their own; alert only if it stays down.
    clearTimeout(downTimer);
    downTimer = setTimeout(() => {
      if (mongoose.connection.readyState !== 1) {
        console.error('[alerts] MongoDB still disconnected after 60s');
        postWebhook({ title: 'Database down', message: 'MongoDB has been disconnected for over a minute.' });
      }
    }, 60 * 1000);
  });
  mongoose.connection.on('reconnected', () => clearTimeout(downTimer));
}

module.exports = { raiseAlert, trackResponses, startHealthMonitor };
