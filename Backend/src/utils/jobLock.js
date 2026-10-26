const mongoose = require('mongoose');

/**
 * Lease lock in Mongo so a periodic job runs on one server instance at a time.
 * Returns true when this process holds `name` for `ttlMs`.
 */
async function acquireJobLock(name, ttlMs) {
  const locks = mongoose.connection.db.collection('job_locks');
  const now = new Date();
  try {
    const result = await locks.findOneAndUpdate(
      { _id: name, $or: [{ until: { $lt: now } }, { until: null }] },
      { $set: { until: new Date(now.getTime() + ttlMs), pid: process.pid, at: now } },
      { upsert: true, returnDocument: 'after' }
    );
    return Boolean(result);
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

/** Runs `fn` every `intervalMs` (first run after `delayMs`) under a lock. */
function scheduleJob(name, intervalMs, fn, { delayMs = 60 * 1000 } = {}) {
  const run = async () => {
    try {
      if (mongoose.connection.readyState !== 1) return;
      if (!(await acquireJobLock(name, Math.max(intervalMs - 5000, 30 * 1000)))) return;
      await fn();
    } catch (error) {
      console.error(`[job:${name}]`, error.message);
    }
  };
  setTimeout(run, delayMs).unref();
  setInterval(run, intervalMs).unref();
}

module.exports = { acquireJobLock, scheduleJob };
