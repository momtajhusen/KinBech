const path = require('path');
const multer = require('multer');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ensureUploadDir, publicUploadPath } = require('../config/uploads');

const ALLOWED_FOLDERS = new Set(['avatars', 'listings', 'shops', 'categories', 'misc']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

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

  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose a file to upload' });
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

module.exports = router;
