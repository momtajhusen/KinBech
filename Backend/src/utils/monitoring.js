const ErrorEvent = require('../models/ErrorEvent');

let sentryInitialized = false;

function loadSentry() {
  if (!process.env.SENTRY_DSN) return null;
  try {
    // Optional dependency — install with: npm i @sentry/node
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    return require('@sentry/node');
  } catch {
    return null;
  }
}

function initSentry() {
  if (sentryInitialized) return loadSentry();
  const Sentry = loadSentry();
  if (!Sentry || !process.env.SENTRY_DSN) return null;
  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      release: process.env.SENTRY_RELEASE || process.env.npm_package_version || undefined,
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
    });
    sentryInitialized = true;
    console.log('[monitoring] Sentry initialized');
  } catch (err) {
    console.error('[monitoring] Sentry init failed', err?.message || err);
  }
  return Sentry;
}

function fingerprintKey({ message, path, source, name }) {
  return [source || 'backend', name || 'Error', String(message || '').slice(0, 180), path || '']
    .join('|')
    .toLowerCase();
}

/**
 * Persist + optionally forward to Sentry.
 * Dedupes open events with same fingerprint within 1 hour (bumps occurrenceCount).
 */
async function captureError(payload = {}) {
  const {
    error,
    message,
    stack,
    name,
    source = 'backend',
    severity = 'error',
    statusCode = 500,
    method = '',
    path = '',
    route = '',
    url = '',
    userId = null,
    userLabel = '',
    requestId = '',
    platform = '',
    appVersion = '',
    device = '',
    userAgent = '',
    extra = {},
    breadcrumbs = [],
    release = process.env.SENTRY_RELEASE || '',
    environment = process.env.NODE_ENV || 'development',
  } = payload;

  const finalMessage =
    String(message || error?.message || 'Unknown error').trim().slice(0, 2000) || 'Unknown error';
  const finalStack = String(stack || error?.stack || '').slice(0, 20000);
  const finalName = String(name || error?.name || 'Error').slice(0, 120);

  let sentryEventId = '';
  const Sentry = initSentry();
  if (Sentry && (severity === 'error' || severity === 'fatal' || statusCode >= 500)) {
    try {
      sentryEventId = Sentry.captureException(error || new Error(finalMessage), {
        tags: { source, path, platform },
        extra: { ...extra, statusCode, method, route, url, userLabel, requestId },
        user: userId ? { id: String(userId), username: userLabel || undefined } : undefined,
      });
    } catch {
      /* ignore sentry failures */
    }
  }

  try {
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const existing = await ErrorEvent.findOne({
      status: { $in: ['open', 'acknowledged'] },
      source,
      path: path || '',
      message: finalMessage,
      lastSeenAt: { $gte: since },
    }).sort({ lastSeenAt: -1 });

    if (existing) {
      existing.occurrenceCount = (existing.occurrenceCount || 1) + 1;
      existing.lastSeenAt = new Date();
      existing.stack = finalStack || existing.stack;
      existing.statusCode = statusCode || existing.statusCode;
      if (sentryEventId) existing.sentryEventId = sentryEventId;
      if (userId) existing.userId = userId;
      if (userLabel) existing.userLabel = userLabel;
      if (extra && Object.keys(extra).length) {
        existing.extra = { ...(existing.extra || {}), ...extra };
      }
      await existing.save();
      return existing;
    }

    return await ErrorEvent.create({
      message: finalMessage,
      stack: finalStack,
      name: finalName,
      source,
      severity,
      statusCode,
      method,
      path,
      route,
      url,
      userId,
      userLabel,
      requestId,
      release,
      environment,
      platform,
      appVersion,
      device,
      userAgent,
      extra,
      breadcrumbs: Array.isArray(breadcrumbs) ? breadcrumbs.slice(0, 50) : [],
      sentryEventId: sentryEventId || '',
      lastSeenAt: new Date(),
    });
  } catch (persistErr) {
    console.error('[monitoring] failed to persist error event', persistErr?.message || persistErr);
    return null;
  }
}

function developerHint(event) {
  if (!event) return '';
  const bits = [];
  if (event.source === 'backend' && event.path) {
    bits.push(`Check Backend route handler for ${event.method || 'REQ'} ${event.path}.`);
  }
  if (event.source === 'mobile') {
    bits.push('Reproduce on Mobile; check recent screen/API call in breadcrumbs/extra.');
  }
  if (event.source === 'website' || event.source === 'admin') {
    bits.push('Reproduce on Website/Admin; check browser console + network tab.');
  }
  if (event.statusCode >= 500) {
    bits.push('Server 5xx — inspect stack + Mongo/Atlas connectivity and VPS logs (pm2 logs).');
  }
  if (String(event.message || '').toLowerCase().includes('mongo')) {
    bits.push('MongoDB/Atlas issue likely — verify MONGODB_URI credentials and IP allowlist.');
  }
  if (event.sentryEventId) {
    bits.push(`Open in Sentry by event id: ${event.sentryEventId}`);
  }
  return bits.join(' ');
}

module.exports = {
  initSentry,
  captureError,
  developerHint,
  fingerprintKey,
};
