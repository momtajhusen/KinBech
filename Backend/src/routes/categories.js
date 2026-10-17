const path = require('path');
const multer = require('multer');
const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { gateImageUpload } = require('../utils/imageSafetyCheck');
const { putUpload } = require('../utils/r2');
const {
  listCategories,
  listCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
} = require('../controllers/categoryController');

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
      const ext = path.extname(req.file.originalname || '').toLowerCase();
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext) ? ext : '.jpg';
      req.file.filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${safeExt}`;
      try {
        const gate = await gateImageUpload({
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          filename: req.file.filename,
          folder: 'categories',
        });
        if (!gate.ok) {
          return res.status(gate.status || 422).json(gate.body);
        }
        await putUpload({
          folder: 'categories',
          filename: req.file.filename,
          body: req.file.buffer,
          contentType: req.file.mimetype,
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
router.post('/admin', requireAdmin, createCategory);
router.patch('/admin/:id', requireAdmin, updateCategory);
router.delete('/admin/:id', requireAdmin, deleteCategory);

module.exports = router;
