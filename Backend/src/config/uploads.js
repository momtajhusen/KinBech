const fs = require('fs');
const path = require('path');

/**
 * Persistent uploads root.
 * Prefer UPLOADS_DIR outside the git repo so `git pull` never deletes media.
 * Example (VPS): UPLOADS_DIR=/var/kinbech/uploads
 */
function getUploadsRoot() {
  const configured = String(process.env.UPLOADS_DIR || '').trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(__dirname, '../../uploads');
}

function ensureUploadDir(...parts) {
  const dir = path.join(getUploadsRoot(), ...parts);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function publicUploadPath(...parts) {
  return `/uploads/${parts.join('/')}`.replace(/\/+/g, '/');
}

module.exports = {
  getUploadsRoot,
  ensureUploadDir,
  publicUploadPath,
};
