const fs = require('fs');
const path = require('path');
const { getUploadsRoot } = require('../config/uploads');
const { getUpload, isEnabled, objectKey } = require('./r2');

const CONTENT_TYPES = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.3gp': 'audio/3gpp',
  '.amr': 'audio/amr',
  '.pdf': 'application/pdf',
};

function localFile(rel) {
  const root = path.resolve(getUploadsRoot());
  const file = path.resolve(root, rel);
  if (file !== root && !file.startsWith(`${root}${path.sep}`)) return null;
  if (!fs.existsSync(file)) return null;
  const stat = fs.statSync(file);
  return stat.isFile() ? file : null;
}

function contentTypeFor(rel, fromObject) {
  if (fromObject && fromObject !== 'application/octet-stream') return fromObject;
  return CONTENT_TYPES[path.extname(rel).toLowerCase()] || 'application/octet-stream';
}

async function serveUploads(req, res, next) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();

  let rel = '';
  try {
    rel = decodeURIComponent(req.path || '').replace(/^\/+/, '');
  } catch {
    return res.status(400).end();
  }
  if (!rel || rel.includes('..') || rel.includes('\\')) return res.status(400).end();

  const local = localFile(rel);
  if (local) return res.sendFile(local);
  if (!isEnabled()) return res.status(404).end();

  const parts = rel.split('/');
  const filename = parts.pop();
  const folder = parts.join('/') || 'misc';

  try {
    const object = await getUpload(objectKey(folder, filename), req.headers.range);
    if (!object || !object.Body) return res.status(404).end();

    res.setHeader('Content-Type', contentTypeFor(rel, object.ContentType));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    if (object.ContentLength != null) res.setHeader('Content-Length', String(object.ContentLength));
    if (object.ContentRange) {
      res.status(206);
      res.setHeader('Content-Range', object.ContentRange);
    }
    if (req.method === 'HEAD') return res.end();

    const body = object.Body;
    if (typeof body.pipe === 'function') {
      body.on('error', () => {
        if (!res.headersSent) res.status(502).end();
        else res.destroy();
      });
      return body.pipe(res);
    }
    const bytes = await body.transformToByteArray();
    return res.end(Buffer.from(bytes));
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (status === 416) return res.status(416).end();
    console.error('[uploads] R2 read failed:', error.message || error);
    return res.status(502).end();
  }
}

function uploadRelPath(url) {
  const raw = String(url || '').trim();
  let pathname = '';
  if (raw.startsWith('/uploads/')) pathname = raw;
  else {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      return '';
    }
  }
  if (!pathname.startsWith('/uploads/')) return '';
  let rel = '';
  try {
    rel = decodeURIComponent(pathname.slice('/uploads/'.length));
  } catch {
    return '';
  }
  return !rel || rel.includes('..') || rel.includes('\\') ? '' : rel;
}

/** Bytes of a stored `/uploads/...` file from disk or R2, or null. */
async function readUploadBuffer(url) {
  const rel = uploadRelPath(url);
  if (!rel) return null;
  const local = localFile(rel);
  if (local) return fs.promises.readFile(local);
  if (!isEnabled()) return null;
  const parts = rel.split('/');
  const filename = parts.pop();
  const object = await getUpload(objectKey(parts.join('/') || 'misc', filename));
  if (!object?.Body) return null;
  return Buffer.from(await object.Body.transformToByteArray());
}

module.exports = { serveUploads, readUploadBuffer };
