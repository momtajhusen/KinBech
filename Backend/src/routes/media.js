const path = require('path');
const multer = require('multer');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { publicUploadPath } = require('../config/uploads');
const { gateImageUpload } = require('../utils/imageSafetyCheck');
const { putUpload } = require('../utils/r2');

const ALLOWED_FOLDERS = new Set(['avatars', 'listings', 'shops', 'categories', 'voice', 'documents', 'misc']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const DOC_EXTS = new Set(['.pdf']);
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/3gpp': '.3gp',
  'audio/amr': '.amr',
  'application/pdf': '.pdf',
};

function safeExtension(originalName, mimeType) {
  const ext = path.extname(originalName || '').toLowerCase();
  const mime = String(mimeType || '').toLowerCase();
  if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || DOC_EXTS.has(ext) || MIME_EXT[mime] === ext) {
    return ext;
  }
  if (MIME_EXT[mime]) return MIME_EXT[mime];
  if (mime.startsWith('image/')) return '.jpg';
  if (mime.startsWith('video/')) return '.mp4';
  if (mime.startsWith('audio/')) return '.m4a';
  return '.bin';
}

function makeFilename(originalName, mimeType) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExtension(originalName, mimeType)}`;
}

function allowedMime(mimeType) {
  const mime = String(mimeType || '').toLowerCase();
  return mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/') || mime === 'application/pdf';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMime(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Only image, video, audio, or PDF files are allowed'));
  },
});

async function saveCheckedFile({ buffer, mimeType, filename, folder }) {
  const isAudio = String(mimeType || '').startsWith('audio/');
  const ext = path.extname(filename || '').toLowerCase();
  if (!isAudio && (String(mimeType || '').startsWith('image/') || IMAGE_EXTS.has(ext))) {
    const gate = await gateImageUpload({
      buffer,
      mimeType,
      filename,
      folder,
    });
    if (!gate.ok) {
      const error = new Error(gate.body?.message || 'Image blocked');
      error.status = gate.status || 422;
      error.body = gate.body;
      throw error;
    }
  }
  await putUpload({ folder, filename, body: buffer, contentType: mimeType });
}

const router = express.Router();

router.post('/upload', requireAuth, (req, res) => {
  const folderRaw = String(req.query.folder || 'misc').toLowerCase();
  const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : 'misc';

  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'Please choose a file to upload' });
    }

    const filename = makeFilename(req.file.originalname, req.file.mimetype);
    try {
      await saveCheckedFile({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        filename,
        folder,
      });
    } catch (error) {
      if (error.body) return res.status(error.status || 422).json(error.body);
      console.error('[media] upload failed:', error.message || error);
      return res.status(500).json({ message: error.message || 'Upload failed' });
    }

    return res.status(201).json({
      url: publicUploadPath(folder, filename),
      filename,
      folder,
      mimeType: req.file.mimetype,
      size: req.file.size,
    });
  });
});

/** JSON base64 upload — reliable with Expo (avoids FormDataPart errors). */
router.post('/upload-base64', requireAuth, async (req, res) => {
  try {
    const folderRaw = String(req.body?.folder || req.query.folder || 'misc').toLowerCase();
    const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : 'misc';
    const mimeType = String(req.body?.mimeType || 'image/jpeg').toLowerCase();
    let data = String(req.body?.data || '');

    if (!data) {
      return res.status(400).json({ message: 'Missing image data' });
    }
    if (!allowedMime(mimeType)) {
      return res.status(400).json({ message: 'Only image, video, audio, or PDF files are allowed' });
    }

    const dataUrlMatch = data.match(/^data:([^;]+);base64,(.+)$/i);
    if (dataUrlMatch) {
      data = dataUrlMatch[2];
    }

    const buffer = Buffer.from(data, 'base64');
    if (!buffer.length) {
      return res.status(400).json({ message: 'Invalid image data' });
    }
    if (buffer.length > 20 * 1024 * 1024) {
      return res.status(400).json({ message: 'File too large (max 20MB)' });
    }

    const filename = makeFilename('', mimeType);
    await saveCheckedFile({ buffer, mimeType, filename, folder });

    return res.status(201).json({
      url: publicUploadPath(folder, filename),
      filename,
      folder,
      mimeType,
      size: buffer.length,
    });
  } catch (error) {
    if (error.body) return res.status(error.status || 422).json(error.body);
    return res.status(500).json({ message: error.message || 'Upload failed' });
  }
});

module.exports = router;
