const path = require('path');
const multer = require('multer');
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { ensureUploadDir } = require('../config/uploads');
const { gateImageUpload } = require('../utils/imageSafetyCheck');
const {
  listCategories,
  listCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
} = require('../controllers/categoryController');

const uploadDir = ensureUploadDir('categories');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`);
  },
});

const upload = multer({
  storage,
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
router.get('/admin', requireAdmin, listCategoriesAdmin);
router.post(
  '/admin/upload',
  requireAdmin,
  (req, res, next) => {
    upload.single('image')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ message: err.message || 'Image upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'Please choose an image to upload' });
      }
      try {
        const filePath = path.join(uploadDir, req.file.filename);
        const gate = await gateImageUpload({
          filePath,
          mimeType: req.file.mimetype,
          filename: req.file.filename,
          folder: 'categories',
        });
        if (!gate.ok) {
          return res.status(gate.status || 422).json(gate.body);
        }
      } catch (scanErr) {
        console.error('[categories] nsfw gate error:', scanErr.message || scanErr);
      }
      next();
    });
  },
  uploadCategoryImage
);
router.post('/admin', requireAdmin, createCategory);
router.patch('/admin/:id', requireAdmin, updateCategory);
router.delete('/admin/:id', requireAdmin, deleteCategory);

module.exports = router;
