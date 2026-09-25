const RestrictedKeyword = require('../models/RestrictedKeyword');
const {
  invalidateKeywordCache,
  ensureSeedKeywords,
  MATCH_FIELDS,
} = require('../utils/listingModeration');

function toPublic(doc) {
  return {
    id: String(doc._id),
    keyword: doc.keyword,
    matchFields: doc.matchFields || ['title', 'description'],
    matchMode: doc.matchMode || 'contains',
    severity: doc.severity || 'hold',
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
  return fields.length ? fields : ['title', 'description'];
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

    const docs = await RestrictedKeyword.find(filter).sort({ keyword: 1 });
    return res.json({
      keywords: docs.map(toPublic),
      matchFields: MATCH_FIELDS,
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
      matchMode: ['contains', 'exact', 'word'].includes(req.body.matchMode)
        ? req.body.matchMode
        : 'contains',
      severity: req.body.severity === 'block' ? 'block' : 'hold',
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
    if (req.body.matchMode != null && ['contains', 'exact', 'word'].includes(req.body.matchMode)) {
      doc.matchMode = req.body.matchMode;
    }
    if (req.body.severity != null) {
      doc.severity = req.body.severity === 'block' ? 'block' : 'hold';
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

module.exports = {
  listKeywords,
  createKeyword,
  updateKeyword,
  deleteKeyword,
};
