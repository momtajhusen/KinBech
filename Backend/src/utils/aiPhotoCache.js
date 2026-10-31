const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * The cover photo the AI read while a seller fills the post form, kept for that sell session
 * so later steps (similar products) reuse it by key instead of the phone uploading it again.
 * The app deletes it when the listing is saved or the form is left, changed or closed.
 * On disk, so every server process on the machine can read it.
 */
const DIR = path.join(os.tmpdir(), 'kinbech-ai-photos');
// Only for sessions that never end cleanly (app killed, phone offline): any use renews it.
const ORPHAN_IDLE_MS = 24 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 60 * 1000;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MIME = Object.fromEntries(Object.entries(EXT).map(([mime, ext]) => [ext, mime]));

let lastSweep = 0;

function fileFor(userId, key, ext) {
  if (!/^[a-f0-9]{32}$/.test(key) || !/^[a-f0-9]{24}$/.test(userId)) return null;
  return path.join(DIR, `${userId}-${key}.${ext}`);
}

async function sweepOrphans() {
  if (Date.now() - lastSweep < SWEEP_EVERY_MS) return;
  lastSweep = Date.now();
  const names = await fs.promises.readdir(DIR).catch(() => []);
  await Promise.all(names.map(async (name) => {
    const file = path.join(DIR, name);
    const stat = await fs.promises.stat(file).catch(() => null);
    if (stat && Date.now() - stat.mtimeMs > ORPHAN_IDLE_MS) await fs.promises.unlink(file).catch(() => {});
  }));
}

/** Saves the photo for this user and returns its key, or '' when it could not be saved. */
async function rememberAiPhoto({ userId, data, mimeType }) {
  const key = crypto.createHash('md5').update(data).digest('hex');
  const file = fileFor(String(userId), key, EXT[mimeType] || 'jpg');
  if (!file) return '';
  try {
    await fs.promises.mkdir(DIR, { recursive: true });
    await fs.promises.writeFile(file, Buffer.from(data, 'base64'));
    sweepOrphans().catch(() => {});
    return key;
  } catch {
    return '';
  }
}

/** The photo saved under `key` by this same user, or null once its session has ended. */
async function readAiPhoto({ userId, key }) {
  for (const ext of Object.keys(MIME)) {
    const file = fileFor(String(userId), String(key || ''), ext);
    if (!file) return null;
    const buffer = await fs.promises.readFile(file).catch(() => null);
    if (!buffer) continue;
    const now = new Date();
    fs.promises.utimes(file, now, now).catch(() => {});
    return { data: buffer.toString('base64'), mimeType: MIME[ext] };
  }
  return null;
}

/** Ends the session copy of these photos for this user. */
async function forgetAiPhotos({ userId, keys }) {
  const list = (Array.isArray(keys) ? keys : [keys]).map(String).slice(0, 20);
  await Promise.all(list.flatMap((key) =>
    Object.keys(MIME).map((ext) => {
      const file = fileFor(String(userId), key, ext);
      return file ? fs.promises.unlink(file).catch(() => {}) : null;
    })
  ));
}

module.exports = { rememberAiPhoto, readAiPhoto, forgetAiPhotos };
