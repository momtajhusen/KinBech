const Category = require('../models/Category');
const { PRODUCT_DEFAULTS, SHOP_DEFAULTS } = require('../utils/categoryDefaults');

function absoluteUrl(req, imageUrl) {
  const relative = normalizeStoredImageUrl(imageUrl);
  if (!relative) return '';
  if (/^https?:\/\//i.test(relative)) return relative;
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.get('host');
  if (!host) return relative;
  return `${proto}://${host}${relative.startsWith('/') ? relative : `/${relative}`}`;
}

function normalizeStoredImageUrl(imageUrl) {
  if (!imageUrl) return '';
  const value = String(imageUrl).trim();
  try {
    if (/^https?:\/\//i.test(value)) {
      const parsed = new URL(value);
      if (parsed.pathname.startsWith('/uploads/')) return parsed.pathname;
    }
  } catch {
    /* ignore */
  }
  return value.startsWith('/') ? value : value;
}

function toPublic(doc, req) {
  const relativeImage = normalizeStoredImageUrl(doc.imageUrl || '');
  return {
    id: String(doc._id),
    type: doc.type,
    name: doc.name,
    icon: doc.icon || 'pricetag-outline',
    imageUrl: relativeImage,
    imageUrlFull: absoluteUrl(req, relativeImage),
    color: doc.color || '#5B39C6',
    description: doc.description || '',
    sortOrder: doc.sortOrder || 0,
    isActive: doc.isActive !== false,
    requiresPreApproval: Boolean(doc.requiresPreApproval),
  };
}

async function ensureDefaults(type) {
  const count = await Category.countDocuments({ type });
  if (count > 0) return;
  const source = type === 'shop' ? SHOP_DEFAULTS : PRODUCT_DEFAULTS;
  await Category.insertMany(
    source.map((item, index) => ({
      type,
      name: item.name,
      icon: item.icon,
      color: item.color,
      description: item.description || '',
      sortOrder: index,
      isActive: true,
    }))
  );
}

async function listCategories(req, res, next) {
  try {
    const type = req.query.type === 'shop' ? 'shop' : req.query.type === 'product' ? 'product' : null;
    if (type) {
      await ensureDefaults(type);
    } else {
      await ensureDefaults('product');
      await ensureDefaults('shop');
    }

    const filter = { isActive: true };
    if (type) filter.type = type;

    const docs = await Category.find(filter).sort({ sortOrder: 1, name: 1 });
    const categories = docs.map((doc) => toPublic(doc, req));

    if (type) {
      return res.json({ categories, type });
    }
    const product = categories.filter((c) => c.type === 'product');
    const shop = categories.filter((c) => c.type === 'shop');
    return res.json({ categories, product, shop });
  } catch (error) {
    next(error);
  }
}

async function listCategoriesAdmin(req, res, next) {
  try {
    const type = req.query.type === 'shop' ? 'shop' : req.query.type === 'product' ? 'product' : null;
    if (type) await ensureDefaults(type);
    else {
      await ensureDefaults('product');
      await ensureDefaults('shop');
    }

    const filter = {};
    if (type) filter.type = type;
    const docs = await Category.find(filter).sort({ type: 1, sortOrder: 1, name: 1 });
    return res.json({ categories: docs.map((doc) => toPublic(doc, req)) });
  } catch (error) {
    next(error);
  }
}

function toStoredImageUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const parsed = new URL(value);
    if (parsed.pathname.startsWith('/uploads/')) return parsed.pathname;
  } catch {
    /* keep as-is */
  }
  return value;
}

async function createCategory(req, res, next) {
  try {
    const type = req.body.type === 'shop' ? 'shop' : 'product';
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ message: 'Category name is required' });
    }

    const doc = await Category.create({
      type,
      name,
      icon: String(req.body.icon || 'pricetag-outline').trim(),
      imageUrl: toStoredImageUrl(req.body.imageUrl),
      color: String(req.body.color || '#5B39C6').trim(),
      description: String(req.body.description || '').trim(),
      sortOrder: Number(req.body.sortOrder) || 0,
      isActive: req.body.isActive !== false,
      requiresPreApproval: Boolean(req.body.requiresPreApproval),
    });

    return res.status(201).json({ category: toPublic(doc, req) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A category with this name already exists' });
    }
    next(error);
  }
}

async function updateCategory(req, res, next) {
  try {
    const doc = await Category.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Category not found' });
    }

    if (req.body.name != null) doc.name = String(req.body.name).trim();
    if (req.body.icon != null) doc.icon = String(req.body.icon).trim();
    if (req.body.imageUrl != null) doc.imageUrl = toStoredImageUrl(req.body.imageUrl);
    if (req.body.color != null) doc.color = String(req.body.color).trim();
    if (req.body.description != null) doc.description = String(req.body.description).trim();
    if (req.body.sortOrder != null) doc.sortOrder = Number(req.body.sortOrder) || 0;
    if (req.body.isActive != null) doc.isActive = Boolean(req.body.isActive);
    if (req.body.requiresPreApproval != null) {
      doc.requiresPreApproval = Boolean(req.body.requiresPreApproval);
    }

    await doc.save();
    return res.json({ category: toPublic(doc, req) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'A category with this name already exists' });
    }
    next(error);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const doc = await Category.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Category not found' });
    }
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function uploadCategoryImage(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose an image to upload' });
    }
    const imageUrl = `/uploads/categories/${req.file.filename}`;
    return res.status(201).json({
      imageUrl,
      url: absoluteUrl(req, imageUrl),
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listCategories,
  listCategoriesAdmin,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
};
