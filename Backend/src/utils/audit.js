const AuditLog = require('../models/AuditLog');

const SECRET_KEYS = /pass(word)?|secret|token|key|otp/i;

function scrub(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const clean = {};
  for (const [key, value] of Object.entries(meta)) {
    if (SECRET_KEYS.test(key)) continue;
    clean[key] = value;
  }
  return clean;
}

/**
 * Record an admin action. Never throws: a failed audit write must not break the action.
 */
function recordAudit(req, { action, targetType = '', targetId = '', summary = '', meta = {} }) {
  const actor = req.user || {};
  return AuditLog.create({
    actor: actor._id || null,
    actorName: actor.name || actor.email || '',
    actorRole: actor.role || '',
    action,
    targetType,
    targetId: targetId ? String(targetId) : '',
    summary,
    meta: scrub(meta),
    ip: req.ip || '',
  }).catch((error) => {
    console.warn('Audit log write failed:', error.message);
  });
}

function scalarFields(body) {
  const picked = {};
  if (!body || typeof body !== 'object') return picked;
  for (const [key, value] of Object.entries(body)) {
    if (SECRET_KEYS.test(key)) continue;
    if (['string', 'number', 'boolean'].includes(typeof value)) {
      picked[key] = typeof value === 'string' ? value.slice(0, 200) : value;
    }
  }
  return picked;
}

/**
 * Route middleware: audit an admin mutation once it succeeds (status < 400).
 * `param` names the route param holding the target id.
 */
function auditRoute(action, { targetType = '', param = '' } = {}) {
  return (req, res, next) => {
    res.on('finish', () => {
      if (res.statusCode >= 400 || !req.user) return;
      const meta = scalarFields(req.body);
      const detail = meta.status || meta.action || meta.name || meta.title || meta.word || '';
      recordAudit(req, {
        action,
        targetType,
        targetId: param ? req.params?.[param] : '',
        summary: detail ? `${action} (${detail})` : action,
        meta,
      });
    });
    next();
  };
}

module.exports = { recordAudit, auditRoute };
