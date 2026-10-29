const Notification = require('../models/Notification');
const User = require('../models/User');
const { ADMIN_ROLES, hasScope } = require('./adminScopes');
const { sendUserPush } = require('./callPush');

const REPEAT_COOLDOWN_MS = 10 * 60 * 1000;
const lastSent = new Map();

/** "Ram Shrestha (tester)" — admins act differently on sandbox accounts. */
function whoLabel(user, fallback = 'A user') {
  const name = user?.name || user?.phone || user?.email || fallback;
  return user?.isTester ? `${name} (tester)` : name;
}

function clip(text, max = 90) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

/**
 * Bell entry + push for every active admin whose role covers `scope`.
 * Never awaited and never throws, so a request is not slowed or failed by it.
 * `route`/`params` open the matching screen in the mobile admin panel.
 * Calls sharing a `key` (e.g. scam words in one chat) send at most one alert per 10 minutes.
 */
function notifyAdmins({ scope, title, body = '', route = 'AdminDashboard', params = {}, icon = 'shield-checkmark-outline', key = '' }) {
  if (key) {
    const now = Date.now();
    if (now - (lastSent.get(key) || 0) < REPEAT_COOLDOWN_MS) return;
    lastSent.set(key, now);
    if (lastSent.size > 2000) lastSent.delete(lastSent.keys().next().value);
  }
  (async () => {
    const admins = await User.find({ role: { $in: ADMIN_ROLES }, status: { $ne: 'suspended' }, deletedAt: null })
      .select('_id role')
      .lean();
    const recipients = admins.filter((admin) => hasScope(admin.role, scope));
    await Promise.all(
      recipients.map(async (admin) => {
        const note = await Notification.create({ user: admin._id, type: 'system', title, body, icon, route, params });
        await sendUserPush({
          userId: admin._id,
          title,
          body,
          data: { ...params, type: 'admin', route, notificationId: String(note._id) },
        });
      })
    );
  })().catch((error) => console.warn('[admin-notify]', error?.message || error));
}

module.exports = { notifyAdmins, whoLabel, clip };
