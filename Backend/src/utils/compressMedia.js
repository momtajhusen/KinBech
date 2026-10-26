const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const sharp = require('sharp');

const IMAGE_MAX_EDGE = 1280;
const IMAGE_JPEG_QUALITY = 78;
const IMAGE_SKIP_UNDER_BYTES = 350 * 1024;
const VIDEO_MAX_EDGE = 1280;
const VIDEO_CRF = 26;
const VIDEO_TIMEOUT_MS = 90000;

function replaceExtension(filename, ext) {
  const base = path.basename(String(filename || 'upload'), path.extname(String(filename || '')));
  return `${base}${ext}`;
}

async function compressImage(buffer) {
  const meta = await sharp(buffer, { failOn: 'none', animated: false }).metadata();
  const pages = meta.pages || 1;
  if (pages > 1) return null;

  const width = meta.width || 0;
  const height = meta.height || 0;
  const alreadySmall =
    width > 0 &&
    height > 0 &&
    width <= IMAGE_MAX_EDGE &&
    height <= IMAGE_MAX_EDGE &&
    buffer.length <= IMAGE_SKIP_UNDER_BYTES &&
    meta.format === 'jpeg';
  if (alreadySmall) return null;

  const out = await sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: IMAGE_JPEG_QUALITY, mozjpeg: true, progressive: true })
    .toBuffer();

  if (!out.length || out.length >= buffer.length) return null;
  return { buffer: out, mimeType: 'image/jpeg', ext: '.jpg' };
}

function runFfmpeg(args) {
  const ffmpegPath = require('ffmpeg-static');
  if (!ffmpegPath) {
    throw new Error('ffmpeg is not installed');
  }
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('video compress timed out'));
    }, VIDEO_TIMEOUT_MS);
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-1500);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg exited ${code}`));
    });
  });
}

async function compressVideo(buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinbech-vid-'));
  const input = path.join(dir, 'in.bin');
  const output = path.join(dir, 'out.mp4');
  try {
    fs.writeFileSync(input, buffer);
    const edge = VIDEO_MAX_EDGE;
    const scale = `scale='if(gt(iw,ih),min(${edge},iw),-2)':'if(gt(iw,ih),-2,min(${edge},ih))'`;
    await runFfmpeg([
      '-y',
      '-i', input,
      '-vf', scale,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', String(VIDEO_CRF),
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '96k',
      '-movflags', '+faststart',
      '-map_metadata', '-1',
      output,
    ]);
    const out = fs.readFileSync(output);
    if (!out.length || out.length >= buffer.length) return null;
    return { buffer: out, mimeType: 'video/mp4', ext: '.mp4' };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const IMAGE_FOLDERS = new Set(['listings', 'avatars']);
const OTHER_IMAGE_MAX_EDGE = 2560;

/**
 * Every image is decoded and re-encoded: drops EXIF (GPS, device) and anything hidden
 * after the pixels. Throws when the bytes are not a real image.
 */
async function sanitizeImage(buffer, folder, mimeType) {
  if (mimeType === 'image/gif') {
    const out = await sharp(buffer, { animated: true, failOn: 'none' }).gif().toBuffer();
    return { buffer: out, mimeType: 'image/gif', ext: '.gif' };
  }
  if (IMAGE_FOLDERS.has(folder)) {
    const compressed = await compressImage(buffer);
    if (compressed) return compressed;
    const out = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize(IMAGE_MAX_EDGE, IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return { buffer: out, mimeType: 'image/jpeg', ext: '.jpg' };
  }
  // Logos, category icons and documents keep their format (PNG transparency matters).
  const pipeline = sharp(buffer, { failOn: 'none' })
    .rotate()
    .resize(OTHER_IMAGE_MAX_EDGE, OTHER_IMAGE_MAX_EDGE, { fit: 'inside', withoutEnlargement: true });
  if (mimeType === 'image/png') {
    return { buffer: await pipeline.png({ compressionLevel: 9 }).toBuffer(), mimeType: 'image/png', ext: '.png' };
  }
  if (mimeType === 'image/webp') {
    return { buffer: await pipeline.webp({ quality: 88 }).toBuffer(), mimeType: 'image/webp', ext: '.webp' };
  }
  return { buffer: await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer(), mimeType: 'image/jpeg', ext: '.jpg' };
}

/** Container remux without re-encoding; only drops metadata such as GPS. */
async function stripVideoMetadata(buffer, mimeType) {
  const ext = mimeType === 'video/webm' ? '.webm' : mimeType === 'video/quicktime' ? '.mov' : '.mp4';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kinbech-meta-'));
  const input = path.join(dir, `in${ext}`);
  const output = path.join(dir, `out${ext}`);
  try {
    fs.writeFileSync(input, buffer);
    await runFfmpeg(['-y', '-i', input, '-map', '0', '-c', 'copy', '-map_metadata', '-1', output]);
    const out = fs.readFileSync(output);
    return out.length ? { buffer: out, mimeType, ext } : null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * `mimeType` must come from magic bytes (utils/fileType). Images always re-encode;
 * listing videos compress, other videos only lose metadata.
 */
async function compressListingMedia({ buffer, mimeType, filename, folder }) {
  const folderName = String(folder || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (!buffer?.length) return { buffer, mimeType, filename };

  if (mime.startsWith('image/')) {
    const result = await sanitizeImage(buffer, folderName, mime);
    return { buffer: result.buffer, mimeType: result.mimeType, filename: replaceExtension(filename, result.ext) };
  }

  if (mime.startsWith('video/')) {
    try {
      const result =
        (folderName === 'listings' ? await compressVideo(buffer) : null) ||
        (await stripVideoMetadata(buffer, mime));
      if (result) {
        return { buffer: result.buffer, mimeType: result.mimeType, filename: replaceExtension(filename, result.ext) };
      }
    } catch (error) {
      console.error('[media] video processing skipped:', error.message || error);
    }
  }
  return { buffer, mimeType, filename };
}

module.exports = { compressListingMedia, sanitizeImage };
