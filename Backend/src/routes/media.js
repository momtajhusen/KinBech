const path = require('path');
const multer = require('multer');
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { uploadLimiter, uploadDailyLimiter } = require('../middleware/security');
const { publicUploadPath } = require('../config/uploads');
const { gateImageUpload } = require('../utils/imageSafetyCheck');
const { rememberPhotoHash } = require('../utils/imageHash');
const { putUpload } = require('../utils/r2');
const { compressListingMedia } = require('../utils/compressMedia');
const { detectFileType, declaredKind, kindsMatch } = require('../utils/fileType');
const {
  PRIVATE_FOLDERS,
  privateFilename,
  putPrivate,
  readPrivate,
  signedPrivateUrl,
  verifySignature,
} = require('../utils/privateMedia');
const FlaggedMedia = require('../models/FlaggedMedia');

const ALLOWED_FOLDERS = new Set(['avatars', 'listings', 'shops', 'categories', 'voice', 'documents', 'misc']);
const AUDIO_EXT = {
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/3gpp': '.3gp',
};
const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };

const UNSUPPORTED = {
  message: 'Unsupported format. Please upload a JPG, PNG or WebP photo, an MP4 video, or a PDF document.',
  code: 'UNSUPPORTED_FORMAT',
};

function makeFilename(ext) {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext}`;
}

function allowedMime(mimeType) {
  return Boolean(declaredKind(mimeType));
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (allowedMime(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error(UNSUPPORTED.message));
  },
});

function rejectUpload(status, body) {
  const error = new Error(body.message);
  error.status = status;
  error.body = body;
  return error;
}

/**
 * Trust the bytes, not the client: pick the real type from magic bytes and check it
 * fits both the declared type and the folder.
 */
function resolveType(buffer, declaredMime, folder) {
  const declared = declaredKind(declaredMime);
  const detected = detectFileType(buffer);
  if (!detected || !kindsMatch(declared, detected)) return null;
  if (detected.kind === 'pdf' && folder !== 'documents') return null;
  if (folder === 'documents' && !['image', 'pdf'].includes(detected.kind)) return null;
  // m4a/3gp voice notes share the mp4 container with video.
  if (declared === 'audio' && detected.kind === 'video') {
    const mime = AUDIO_EXT[String(declaredMime).toLowerCase()] ? String(declaredMime).toLowerCase() : 'audio/mp4';
    return { mime, ext: AUDIO_EXT[mime] || '.m4a', kind: 'audio' };
  }
  return detected;
}

async function saveCheckedFile({ buffer, declaredMime, folder, user }) {
  const type = resolveType(buffer, declaredMime, folder);
  if (!type) throw rejectUpload(415, UNSUPPORTED);

  let flagged = null;
  if (type.kind === 'image') {
    const gate = await gateImageUpload({ buffer, mimeType: type.mime, filename: `upload${type.ext}`, folder });
    if (!gate.ok) {
      // Listing photos are kept but the listing goes to manual review instead of being rejected.
      if (folder === 'listings' && (gate.status === 422 || gate.status === 503)) {
        flagged = gate.body || {};
      } else {
        throw rejectUpload(gate.status || 422, gate.body || { message: 'Image blocked' });
      }
    }
  }

  let stored;
  try {
    stored = await compressListingMedia({ buffer, mimeType: type.mime, filename: makeFilename(type.ext), folder });
  } catch {
    throw rejectUpload(415, UNSUPPORTED);
  }

  if (PRIVATE_FOLDERS.has(folder)) {
    const filename = privateFilename(user._id, path.extname(stored.filename));
    const ref = await putPrivate({ folder, filename, body: stored.buffer, contentType: stored.mimeType });
    return { ...stored, filename, url: ref, viewUrl: signedPrivateUrl(ref) };
  }

  await putUpload({ folder, filename: stored.filename, body: stored.buffer, contentType: stored.mimeType });
  if (folder === 'listings' && type.kind === 'image') {
    await rememberPhotoHash({ buffer: stored.buffer, filename: stored.filename, userId: user?._id });
  }
  if (flagged) {
    await FlaggedMedia.create({
      filename: stored.filename,
      folder,
      user: user?._id || null,
      code: flagged.code || 'IMAGE_BLOCKED',
      message: flagged.message || '',
      reasons: (flagged.issues || []).flatMap((issue) => issue.reasons || []).slice(0, 10),
    });
    stored.review = { code: flagged.code || 'IMAGE_BLOCKED', message: flagged.message || '' };
  }
  const url = publicUploadPath(folder, stored.filename);
  return { ...stored, url, viewUrl: url };
}

function uploadResponse(folder, stored) {
  return {
    url: stored.url,
    viewUrl: stored.viewUrl,
    filename: stored.filename,
    folder,
    mimeType: stored.mimeType,
    size: stored.buffer.length,
    review: stored.review || null,
  };
}

function uploadError(res, error) {
  if (error.body) return res.status(error.status || 422).json(error.body);
  console.error('[media] upload failed:', error.message || error);
  return res.status(500).json({ message: 'Upload failed. Please try again.' });
}

function pickFolder(raw) {
  const folder = String(raw || 'misc').toLowerCase();
  return ALLOWED_FOLDERS.has(folder) ? folder : 'misc';
}

const router = express.Router();

router.post('/upload', requireAuth, uploadLimiter, uploadDailyLimiter, (req, res) => {
  const folder = pickFolder(req.query.folder);

  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Upload failed' });
    }
    if (!req.file?.buffer) {
      return res.status(400).json({ message: 'Please choose a file to upload' });
    }
    try {
      const stored = await saveCheckedFile({
        buffer: req.file.buffer,
        declaredMime: req.file.mimetype,
        folder,
        user: req.user,
      });
      return res.status(201).json(uploadResponse(folder, stored));
    } catch (error) {
      return uploadError(res, error);
    }
  });
});

/** JSON base64 upload — reliable with Expo (avoids FormDataPart errors). */
router.post('/upload-base64', requireAuth, uploadLimiter, uploadDailyLimiter, async (req, res) => {
  try {
    const folder = pickFolder(req.body?.folder || req.query.folder);
    const mimeType = String(req.body?.mimeType || 'image/jpeg').toLowerCase();
    let data = String(req.body?.data || '');

    if (!data) {
      return res.status(400).json({ message: 'Missing image data' });
    }
    if (!allowedMime(mimeType)) {
      return res.status(415).json(UNSUPPORTED);
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
      return res.status(413).json({ message: 'This file is too large (max 20 MB). Please choose a smaller one.', code: 'PAYLOAD_TOO_LARGE' });
    }

    const stored = await saveCheckedFile({ buffer, declaredMime: mimeType, folder, user: req.user });
    return res.status(201).json(uploadResponse(folder, stored));
  } catch (error) {
    return uploadError(res, error);
  }
});

/** Short-lived signed link for KYC documents (issued only to the shop owner and admins). */
router.get('/private/:folder/:filename', async (req, res) => {
  const { folder, filename } = req.params;
  if (!verifySignature(folder, filename, req.query.exp, req.query.sig)) {
    return res.status(403).json({ message: 'This link has expired. Please reopen the document.', code: 'LINK_EXPIRED' });
  }
  try {
    const body = await readPrivate(`private:${folder}/${filename}`);
    if (!body) return res.status(404).json({ message: 'Document not found' });
    const ext = path.extname(filename).toLowerCase();
    res.setHeader('Content-Type', CONTENT_TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', 'inline');
    // The browser's PDF viewer needs to run; the API-wide `default-src 'none'` would block it.
    if (ext === '.pdf') res.removeHeader('Content-Security-Policy');
    return res.end(body);
  } catch (error) {
    console.error('[media] private read failed:', error.message || error);
    return res.status(502).json({ message: 'Could not open the document. Please try again.' });
  }
});

module.exports = router;
