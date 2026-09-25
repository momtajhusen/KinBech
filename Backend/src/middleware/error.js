const { captureError, initSentry } = require('../utils/monitoring');

// Ensure Sentry boots with the API process when DSN is set
initSentry();

function notFound(_req, res) {
  res.status(404).json({ message: 'Route not found' });
}

async function errorHandler(error, req, res, _next) {
  console.error(error);
  const status = error.status || error.statusCode || 500;

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
      url: `${req.protocol}://${req.get('host') || ''}${req.originalUrl || ''}`,
      userId: req.user?._id || null,
      userLabel: req.user?.name || req.user?.phone || '',
      userAgent: req.headers['user-agent'] || '',
      extra: {
        bodyKeys: req.body && typeof req.body === 'object' ? Object.keys(req.body) : [],
        query: req.query || {},
      },
    }).catch(() => {});
  }

  res.status(status).json({
    message: error.message || 'Something went wrong',
  });
}

module.exports = { notFound, errorHandler };
