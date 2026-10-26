const { captureError, initSentry } = require('../utils/monitoring');

// Ensure Sentry boots with the API process when DSN is set
initSentry();

const isProduction = process.env.NODE_ENV === 'production';

function notFound(_req, res) {
  res.status(404).json({ message: 'Route not found', code: 'NOT_FOUND' });
}

/** Map well-known library errors to a status, code and safe user message. */
function describeError(error) {
  if (error.type === 'entity.too.large') {
    return { status: 413, code: 'PAYLOAD_TOO_LARGE', message: 'This file or request is too large. Please choose a smaller photo or video.' };
  }
  if (error.type === 'entity.parse.failed') {
    return { status: 400, code: 'BAD_JSON', message: 'The request could not be read. Please try again.' };
  }
  if (error.name === 'CastError') {
    return { status: 400, code: 'INVALID_ID', message: 'That item could not be found.' };
  }
  if (error.name === 'ValidationError') {
    const first = Object.values(error.errors || {})[0];
    return { status: 400, code: 'VALIDATION_FAILED', message: first?.message || 'Some details are not valid.' };
  }
  if (error.code === 11000) {
    return { status: 409, code: 'DUPLICATE', message: 'This already exists.' };
  }
  const status = error.status || error.statusCode || 500;
  if (status >= 500) {
    return { status, code: 'SERVER_ERROR', message: 'Something went wrong on our side. Please try again.' };
  }
  return { status, code: error.code && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED', message: error.message || 'Request failed' };
}

async function errorHandler(error, req, res, _next) {
  const { status, code, message } = describeError(error);

  if (status >= 500 || !isProduction) {
    console.error(isProduction ? `${req.method} ${req.path} failed: ${error.message}` : error);
  }

  // Persist server failures for admin Error Log (+ Sentry when configured)
  if (status >= 500 || error.capture === true) {
    captureError({
      error,
      source: 'backend',
      severity: status >= 500 ? 'error' : 'warning',
      statusCode: status,
      method: req.method,
      path: req.originalUrl || req.path,
      route: req.route?.path || '',
      url: `${req.protocol}://${req.get('host') || ''}${req.path || ''}`,
      userId: req.user?._id || null,
      userLabel: req.user?.name || '',
      userAgent: req.headers['user-agent'] || '',
      extra: {
        bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
      },
    }).catch(() => {});
  }

  if (res.headersSent) return;
  res.status(status).json({ message, code });
}

module.exports = { notFound, errorHandler };
