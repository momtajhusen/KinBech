const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { ensureUploadDir } = require('../config/uploads');

let client;

function settings() {
  const endpoint = String(process.env.R2_ENDPOINT || '').trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || '').trim();
  const bucket = String(process.env.R2_BUCKET || 'kinbech').trim();
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { endpoint, accessKeyId, secretAccessKey, bucket };
}

function connection() {
  const cfg = settings();
  if (!cfg) return null;
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: cfg.endpoint,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }
  return { client, bucket: cfg.bucket };
}

function isEnabled() {
  return Boolean(settings());
}

function objectKey(folder, filename) {
  const safeFolder = String(folder || 'misc').replace(/[^a-z0-9_-]/gi, '') || 'misc';
  const safeName = path.basename(String(filename || ''));
  return `uploads/${safeFolder}/${safeName}`;
}

async function putUpload({ folder, filename, body, contentType }) {
  const conn = connection();
  const key = objectKey(folder, filename);
  if (!conn) {
    const dir = ensureUploadDir(folder);
    fs.writeFileSync(path.join(dir, path.basename(filename)), body);
    return { key, storage: 'disk' };
  }
  await conn.client.send(new PutObjectCommand({
    Bucket: conn.bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
  }));
  return { key, storage: 'r2' };
}

async function getUpload(key, range) {
  const conn = connection();
  if (!conn || !key) return null;
  try {
    return await conn.client.send(new GetObjectCommand({
      Bucket: conn.bucket,
      Key: key,
      Range: range || undefined,
    }));
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    if (error?.name === 'NoSuchKey' || status === 404) return null;
    throw error;
  }
}

async function deleteUpload(key) {
  const conn = connection();
  if (!conn || !key) return;
  await conn.client.send(new DeleteObjectCommand({
    Bucket: conn.bucket,
    Key: key,
  }));
}

module.exports = {
  isEnabled,
  objectKey,
  putUpload,
  getUpload,
  deleteUpload,
};
