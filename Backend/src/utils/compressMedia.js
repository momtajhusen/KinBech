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

async function compressListingMedia({ buffer, mimeType, filename, folder }) {
  const folderName = String(folder || '').toLowerCase();
  const compressImages = IMAGE_FOLDERS.has(folderName);
  const compressVideos = folderName === 'listings';
  if ((!compressImages && !compressVideos) || !buffer?.length) {
    return { buffer, mimeType, filename };
  }

  const mime = String(mimeType || '').toLowerCase();
  const ext = path.extname(filename || '').toLowerCase();
  const isGif = mime === 'image/gif' || ext === '.gif';
  const isImage = !isGif && (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext));
  const isVideo = mime.startsWith('video/') || ['.mp4', '.mov', '.m4v', '.webm'].includes(ext);

  try {
    const result = isImage && compressImages
      ? await compressImage(buffer)
      : isVideo && compressVideos
        ? await compressVideo(buffer)
        : null;
    if (!result) return { buffer, mimeType, filename };
    return {
      buffer: result.buffer,
      mimeType: result.mimeType,
      filename: replaceExtension(filename, result.ext),
    };
  } catch (error) {
    console.error('[media] compress skipped:', error.message || error);
    return { buffer, mimeType, filename };
  }
}

module.exports = { compressListingMedia };
