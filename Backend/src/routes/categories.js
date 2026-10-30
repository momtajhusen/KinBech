const multer = require('multer');
const express = require('express');
const { requireScope } = require('../middleware/auth');
const { auditRoute } = require('../utils/audit');
const { gateImageUpload } = require('../utils/imageSafetyCheck');
const { putUpload } = require('../utils/r2');
const { detectFileType } = require('../utils/fileType');
const { sanitizeImage } = require('../utils/compressMedia');
const {
  listCategories,
  listCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
} = require('../controllers/categoryController');
const { categoryFixStatus, startManualCategoryFix } = require('../utils/categoryFix');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('image/')) {
      cb(new Error('Only image files are allowed'));
      return;
    }
    cb(null, true);
  },
});

const router = express.Router();

router.get('/', listCategories);
router.get('/admin', requireScope('categories'), listCategoriesAdmin);
router.post(
  '/admin/upload',
  requireScope('categories'),
  auditRoute('categories.upload.create', { targetType: 'category' }),
  (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Image upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'Please choose an image to upload' });
      }
      const detected = detectFileType(req.file.buffer);
      if (detected?.kind !== 'image') {
        return res.status(415).json({ message: 'Unsupported format. Please upload a JPG, PNG or WebP image.', code: 'UNSUPPORTED_FORMAT' });
      }
      try {
        const gate = await gateImageUpload({
          buffer: req.file.buffer,
          mimeType: detected.mime,
          filename: `upload${detected.ext}`,
          folder: 'categories',
        });
        if (!gate.ok) {
          return res.status(gate.status || 422).json(gate.body);
        }
        let clean;
        try {
          clean = await sanitizeImage(req.file.buffer, 'categories', detected.mime);
        } catch {
          return res.status(415).json({ message: 'Unsupported format. Please upload a JPG, PNG or WebP image.', code: 'UNSUPPORTED_FORMAT' });
        }
        req.file.filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${clean.ext}`;
        await putUpload({
          folder: 'categories',
          filename: req.file.filename,
          body: clean.buffer,
          contentType: clean.mimeType,
        });
      } catch (scanErr) {
        console.error('[categories] upload error:', scanErr.message || scanErr);
        return res.status(500).json({ message: 'Image upload failed' });
      }
      next();
    });
  },
  uploadCategoryImage
);
/** The daily category check (utils/categoryFix), run once now from the admin panel. */
router.get('/admin/fix-run', requireScope('categories'), async (req, res, next) => {
  try {
    res.json(await categoryFixStatus());
  } catch (error) {
    next(error);
  }
});
router.post('/admin/fix-run', requireScope('categories'), auditRoute('categories.fix-run'), async (req, res, next) => {
  try {
    const started = await startManualCategoryFix(req.user?._id);
    if (!started) return res.status(409).json({ message: 'A category check is already running.' });
    return res.status(202).json(await categoryFixStatus());
  } catch (error) {
    return next(error);
  }
});
router.post('/admin', requireScope('categories'), auditRoute('categories.create', { targetType: 'category' }), createCategory);
router.patch('/admin/:id', requireScope('categories'), auditRoute('categories.update', { targetType: 'category', param: 'id' }), updateCategory);
router.delete('/admin/:id', requireScope('categories'), auditRoute('categories.delete', { targetType: 'category', param: 'id' }), deleteCategory);

module.exports = router;
