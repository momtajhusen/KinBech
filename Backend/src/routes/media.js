const path = require('path');
const fs = require('fs');
const multer = require('multer');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ensureUploadDir, publicUploadPath } = require('../config/uploads');
const { gateImageUpload } = require('../utils/imageSafetyCheck');

const ALLOWED_FOLDERS = new Set(['avatars', 'listings', 'shops', 'categories', 'misc']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm']);
const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/webm': '.webm',
};

function makeUploader(folder) {
  const uploadDir = ensureUploadDir(folder);
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const mime = String(file.mimetype || '');
      let safeExt = ext;
      if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext)) {
        if (mime.startsWith('image/')) safeExt = '.jpg';
        else if (mime.startsWith('video/')) safeExt = '.mp4';
        else safeExt = '.bin';
      }
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    },
  });

  return multer({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mime = String(file.mimetype || '');
      if (mime.startsWith('image/') || mime.startsWith('video/')) {
        cb(null, true);
        return;
      }
      cb(new Error('Only image or video files are allowed'));
    },
  });
}

const router = express.Router();

router.post('/upload', requireAuth, (req, res) => {
  const folderRaw = String(req.query.folder || 'misc').toLowerCase();
  const folder = ALLOWED_FOLDERS.has(folderRaw) ? folderRaw : 'misc';
  const upload = makeUploader(folder);

  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose a file to upload' });
    }

    const absolutePath = path.join(ensureUploadDir(folder), req.file.filename);
    try {
      const gate = await gateImageUpload({
        filePath: absolutePath,
        mimeType: req.file.mimetype,
        filename: req.file.filename,
        folder,
      });
      if (!gate.ok) {
        return res.status(gate.status || 422).json(gate.body);
      }
    } catch (scanErr) {
      console.error('[media] nsfw gate error:', scanErr.message || scanErr);
    }

    const url = publicUploadPath(folder, req.file.filename);
    return res.status(201).json({
      url,
      filename: req.file.filename,
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

    const ext =
      MIME_EXT[mimeType] ||
      (mimeType.startsWith('video/') ? '.mp4' : '.jpg');
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;

    // Scan images BEFORE writing to disk so NSFW never lands in /uploads
    if (mimeType.startsWith('image/') || IMAGE_EXTS.has(ext)) {
      const gate = await gateImageUpload({
        buffer,
        mimeType,
        filename,
        folder,
      });
      if (!gate.ok) {
        return res.status(gate.status || 422).json(gate.body);
      }
    }

    const dir = ensureUploadDir(folder);
    fs.writeFileSync(path.join(dir, filename), buffer);

    const url = publicUploadPath(folder, filename);
    return res.status(201).json({
      url,
      filename,
      folder,
      mimeType,
      size: buffer.length,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Upload failed' });
  }
});

module.exports = router;
