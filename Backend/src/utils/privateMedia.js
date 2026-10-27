const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

/**
 * KYC / business documents. Never under /uploads: stored outside the public folder
 * (or under `private/` in R2) and opened only through short-lived signed URLs.
 * Stored refs look like `private:documents/<ownerId>-<time>-<rand>.jpg`.
 */
const PRIVATE_PREFIX = 'private:';
const PRIVATE_FOLDERS = new Set(['documents']);
const DEFAULT_TTL_SECONDS = 10 * 60;

let client;

function privateRoot() {
  const configured = String(process.env.PRIVATE_UPLOADS_DIR || '').trim();
  return configured ? path.resolve(configured) : path.join(__dirname, '../../private_uploads');
}

function r2() {
  const endpoint = String(process.env.R2_ENDPOINT || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(process.env.R2_PRIVATE_BUCKET || process.env.R2_BUCKET || '').trim();
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  if (!client) {
    client = new S3Client({ region: 'auto', endpoint, credentials: { accessKeyId, secretAccessKey } });
  }
  return { client, bucket };
}

function cleanName(value) {
  return path.basename(String(value || '')).replace(/[^a-zA-Z0-9._-]/g, '');
}

function parseRef(ref) {
  const raw = String(ref || '');
  if (!raw.startsWith(PRIVATE_PREFIX)) return null;
  const [folder, filename, extra] = raw.slice(PRIVATE_PREFIX.length).split('/');
  if (extra !== undefined || !PRIVATE_FOLDERS.has(folder)) return null;
  const name = cleanName(filename);
  if (!name || name !== filename) return null;
  return { folder, filename: name };
}

const isPrivateRef = (ref) => Boolean(parseRef(ref));

/** Owner id embedded at upload time, so one seller can't attach another's file. */
function refOwnerId(ref) {
  const parsed = parseRef(ref);
  return parsed ? parsed.filename.split('-')[0] : '';
}

function privateFilename(ownerId, ext) {
  return `${String(ownerId)}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
}

async function putPrivate({ folder, filename, body, contentType }) {
  const conn = r2();
  if (conn) {
    await conn.client.send(new PutObjectCommand({
      Bucket: conn.bucket,
      Key: `private/${folder}/${filename}`,
      Body: body,
      ContentType: contentType || 'application/octet-stream',
    }));
  } else {
    const dir = path.join(privateRoot(), folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, filename), body);
  }
  return `${PRIVATE_PREFIX}${folder}/${filename}`;
}

async function readPrivate(ref) {
  const parsed = parseRef(ref);
  if (!parsed) return null;
  const local = path.join(privateRoot(), parsed.folder, parsed.filename);
  if (fs.existsSync(local)) return fs.promises.readFile(local);
  const conn = r2();
  if (!conn) return null;
  try {
    const object = await conn.client.send(new GetObjectCommand({
      Bucket: conn.bucket,
      Key: `private/${parsed.folder}/${parsed.filename}`,
    }));
    return object?.Body ? Buffer.from(await object.Body.transformToByteArray()) : null;
  } catch (error) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

async function deletePrivate(ref) {
  const parsed = parseRef(ref);
  if (!parsed) return;
  await fs.promises.unlink(path.join(privateRoot(), parsed.folder, parsed.filename)).catch(() => {});
  const conn = r2();
  if (!conn) return;
  await conn.client.send(new DeleteObjectCommand({
    Bucket: conn.bucket,
    Key: `private/${parsed.folder}/${parsed.filename}`,
  }));
}

function signingKey() {
  return crypto
    .createHash('sha256')
    .update(process.env.MEDIA_SIGNING_KEY || `${process.env.JWT_SECRET || ''}:kinbech-media`)
    .digest();
}

function signature(folder, filename, exp) {
  return crypto.createHmac('sha256', signingKey()).update(`${folder}/${filename}:${exp}`).digest('base64url');
}

/** `/media/private/documents/<file>?exp=…&sig=…`, valid for `ttlSeconds`. */
function signedPrivateUrl(ref, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const parsed = parseRef(ref);
  if (!parsed) return '';
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = signature(parsed.folder, parsed.filename, exp);
  return `/media/private/${parsed.folder}/${encodeURIComponent(parsed.filename)}?exp=${exp}&sig=${sig}`;
}

function verifySignature(folder, filename, exp, sig) {
  const expires = Number(exp);
  if (!PRIVATE_FOLDERS.has(folder) || !Number.isFinite(expires)) return false;
  if (expires < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signature(folder, filename, expires));
  const given = Buffer.from(String(sig || ''));
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

/** Business documents with a fresh `viewUrl` for private refs (legacy public URLs pass through). */
function withViewUrls(documents) {
  return (Array.isArray(documents) ? documents : []).map((doc) => {
    const plain = doc?.toObject ? doc.toObject() : doc;
    return {
      ...plain,
      viewUrl: isPrivateRef(plain?.url) ? signedPrivateUrl(plain.url) : plain?.url || '',
    };
  });
}

module.exports = {
  PRIVATE_FOLDERS,
  isPrivateRef,
  refOwnerId,
  privateFilename,
  putPrivate,
  readPrivate,
  deletePrivate,
  signedPrivateUrl,
  verifySignature,
  withViewUrls,
};
