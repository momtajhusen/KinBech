const ErrorEvent = require('../models/ErrorEvent');
const { captureError, developerHint } = require('../utils/monitoring');

function serializeError(doc) {
  const obj = doc.toObject ? doc.toObject() : doc;
  return {
    id: obj._id,
    message: obj.message,
    stack: obj.stack,
    name: obj.name,
    source: obj.source,
    severity: obj.severity,
    statusCode: obj.statusCode,
    method: obj.method,
    path: obj.path,
    route: obj.route,
    url: obj.url,
    userId: obj.userId,
    user: obj.userId && obj.userId._id
      ? {
          id: obj.userId._id,
          name: obj.userId.name,
          phone: obj.userId.phone,
        }
      : null,
    userLabel: obj.userLabel,
    requestId: obj.requestId,
    release: obj.release,
    environment: obj.environment,
    platform: obj.platform,
    appVersion: obj.appVersion,
    device: obj.device,
    userAgent: obj.userAgent,
    extra: obj.extra || {},
    breadcrumbs: obj.breadcrumbs || [],
    sentryEventId: obj.sentryEventId,
    status: obj.status,
    notes: obj.notes,
    occurrenceCount: obj.occurrenceCount || 1,
    lastSeenAt: obj.lastSeenAt,
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt,
    developerHint: developerHint(obj),
  };
}

/** Public/client ingest — mobile, website, admin can POST crashes */
async function reportClientError(req, res, next) {
  try {
    const body = req.body || {};
    const message = String(body.message || '').trim();
    if (!message) {
      return res.status(400).json({ message: 'message is required' });
    }

    const source = ['mobile', 'website', 'admin'].includes(body.source)
      ? body.source
      : 'unknown';

    const event = await captureError({
      message,
      stack: body.stack || '',
      name: body.name || 'ClientError',
      source,
      severity: body.severity === 'fatal' ? 'fatal' : body.severity === 'warning' ? 'warning' : 'error',
      statusCode: Number(body.statusCode) || 0,
      method: body.method || '',
      path: body.path || body.route || '',
      route: body.route || body.path || '',
      url: body.url || '',
      userId: req.user?._id || body.userId || null,
      userLabel: req.user?.name || body.userLabel || '',
      platform: body.platform || '',
      appVersion: body.appVersion || '',
      device: body.device || '',
      userAgent: body.userAgent || req.headers['user-agent'] || '',
      extra: body.extra && typeof body.extra === 'object' ? body.extra : {},
      breadcrumbs: Array.isArray(body.breadcrumbs) ? body.breadcrumbs : [],
      release: body.release || '',
    });

    res.status(201).json({
      ok: true,
      id: event?._id || null,
    });
  } catch (error) {
    next(error);
  }
}

async function listErrorsAdmin(req, res, next) {
  try {
    const {
      status,
      source,
      severity,
      q,
      limit = 100,
    } = req.query;

    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (source && source !== 'all') filter.source = source;
    if (severity && severity !== 'all') filter.severity = severity;
    if (q) {
      const re = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ message: re }, { path: re }, { stack: re }, { userLabel: re }];
    }

    const docs = await ErrorEvent.find(filter)
      .populate('userId', 'name phone')
      .sort({ lastSeenAt: -1 })
      .limit(Math.min(200, Math.max(1, parseInt(limit, 10) || 100)));

    const openCount = await ErrorEvent.countDocuments({ status: 'open' });
    const fatalCount = await ErrorEvent.countDocuments({
      status: { $in: ['open', 'acknowledged'] },
      severity: 'fatal',
    });

    res.json({
      errors: docs.map(serializeError),
      stats: { openCount, fatalCount, totalReturned: docs.length },
    });
  } catch (error) {
    next(error);
  }
}

async function getErrorAdmin(req, res, next) {
  try {
    const doc = await ErrorEvent.findById(req.params.id).populate('userId', 'name phone email');
    if (!doc) return res.status(404).json({ message: 'Error event not found' });
    res.json({ error: serializeError(doc) });
  } catch (error) {
    next(error);
  }
}

async function updateErrorAdmin(req, res, next) {
  try {
    const doc = await ErrorEvent.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Error event not found' });

    const { status, notes } = req.body;
    if (status && ['open', 'acknowledged', 'resolved', 'ignored'].includes(status)) {
      doc.status = status;
      if (status === 'resolved' || status === 'ignored') {
        doc.resolvedBy = req.user._id;
        doc.resolvedAt = new Date();
      }
    }
    if (notes !== undefined) {
      doc.notes = String(notes || '').slice(0, 2000);
    }
    await doc.save();
    await doc.populate('userId', 'name phone');
    res.json({ message: 'Updated', error: serializeError(doc) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  reportClientError,
  listErrorsAdmin,
  getErrorAdmin,
  updateErrorAdmin,
};
