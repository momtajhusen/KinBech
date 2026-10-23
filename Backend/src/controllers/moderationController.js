const RestrictedKeyword = require('../models/RestrictedKeyword');
const {
  invalidateKeywordCache,
  ensureSeedKeywords,
  MATCH_FIELDS,
  SURFACES,
  testPublicText,
} = require('../utils/listingModeration');

function toPublic(doc) {
  return {
    id: String(doc._id),
    keyword: doc.keyword,
    matchFields: doc.matchFields || ['title', 'description'],
    surfaces: doc.surfaces?.length ? doc.surfaces : SURFACES,
    matchMode: doc.matchMode || 'contains',
    severity: doc.severity || 'block',
    isActive: doc.isActive !== false,
    notes: doc.notes || '',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function normalizeKeyword(raw) {
  return String(raw || '').trim().toLowerCase();
}

function parseMatchFields(raw) {
  const allowed = new Set(MATCH_FIELDS);
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const fields = [...new Set(list.filter((f) => allowed.has(f)))];
  return fields.length ? fields : ['title', 'description', 'searchWords', 'name', 'bio', 'shopName', 'shopDescription'];
}

function parseSurfaces(raw) {
  const allowed = new Set(SURFACES);
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  const surfaces = [...new Set(list.filter((s) => allowed.has(s)))];
  return surfaces.length ? surfaces : [...SURFACES];
}

async function listKeywords(req, res, next) {
  try {
    await ensureSeedKeywords();
    const filter = {};
    if (req.query.active === 'true') filter.isActive = true;
    if (req.query.active === 'false') filter.isActive = false;
    if (req.query.severity === 'hold' || req.query.severity === 'block') {
      filter.severity = req.query.severity;
    }
    if (req.query.q) {
      const q = normalizeKeyword(req.query.q);
      filter.keyword = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const [total, docs, allCount, blockCount, holdCount] = await Promise.all([
      RestrictedKeyword.countDocuments(filter),
      RestrictedKeyword.find(filter)
        .sort({ keyword: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      RestrictedKeyword.countDocuments({}),
      RestrictedKeyword.countDocuments({ severity: 'block' }),
      RestrictedKeyword.countDocuments({ severity: 'hold' }),
    ]);

    return res.json({
      keywords: docs.map(toPublic),
      total,
      page,
      totalPages: Math.ceil(total / limit),
      stats: {
        all: allCount,
        block: blockCount,
        hold: holdCount,
      },
      matchFields: MATCH_FIELDS,
      surfaces: SURFACES,
      severities: ['hold', 'block'],
      matchModes: ['contains', 'exact', 'word'],
    });
  } catch (error) {
    next(error);
  }
}

async function createKeyword(req, res, next) {
  try {
    const keyword = normalizeKeyword(req.body.keyword);
    if (!keyword) {
      return res.status(400).json({ message: 'Keyword is required' });
    }

    const doc = await RestrictedKeyword.create({
      keyword,
      matchFields: parseMatchFields(req.body.matchFields),
      surfaces: parseSurfaces(req.body.surfaces),
      matchMode: ['contains', 'exact', 'word'].includes(req.body.matchMode)
        ? req.body.matchMode
        : 'contains',
      severity: req.body.severity === 'hold' ? 'hold' : 'block',
      isActive: req.body.isActive !== false,
      notes: String(req.body.notes || '').trim(),
      createdBy: req.user?._id || null,
    });

    invalidateKeywordCache();
    return res.status(201).json({ keyword: toPublic(doc) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This keyword already exists' });
    }
    next(error);
  }
}

async function updateKeyword(req, res, next) {
  try {
    const doc = await RestrictedKeyword.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Keyword not found' });
    }

    if (req.body.keyword != null) {
      const keyword = normalizeKeyword(req.body.keyword);
      if (!keyword) {
        return res.status(400).json({ message: 'Keyword cannot be empty' });
      }
      doc.keyword = keyword;
    }
    if (req.body.matchFields != null) {
      doc.matchFields = parseMatchFields(req.body.matchFields);
    }
    if (req.body.surfaces != null) {
      doc.surfaces = parseSurfaces(req.body.surfaces);
    }
    if (req.body.matchMode != null && ['contains', 'exact', 'word'].includes(req.body.matchMode)) {
      doc.matchMode = req.body.matchMode;
    }
    if (req.body.severity != null) {
      doc.severity = req.body.severity === 'hold' ? 'hold' : 'block';
    }
    if (req.body.isActive != null) {
      doc.isActive = Boolean(req.body.isActive);
    }
    if (req.body.notes != null) {
      doc.notes = String(req.body.notes).trim();
    }

    await doc.save();
    invalidateKeywordCache();
    return res.json({ keyword: toPublic(doc) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This keyword already exists' });
    }
    next(error);
  }
}

async function deleteKeyword(req, res, next) {
  try {
    const doc = await RestrictedKeyword.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: 'Keyword not found' });
    }
    invalidateKeywordCache();
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
}

async function testKeyword(req, res, next) {
  try {
    const text = String(req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ message: 'Enter text to test' });
    }
    const surface = SURFACES.includes(req.body.surface) ? req.body.surface : 'listing';
    const result = await testPublicText({
      text,
      surface,
      field: req.body.field,
    });
    return res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
  testKeyword,
};
