const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const listingRoutes = require('./routes/listings');
const chatRoutes = require('./routes/chats');
const wishlistRoutes = require('./routes/wishlist');
const notificationRoutes = require('./routes/notifications');
const reportRoutes = require('./routes/reports');
const reviewRoutes = require('./routes/reviews');
const shopRoutes = require('./routes/shops');
const sellerRoutes = require('./routes/sellers');
const categoryRoutes = require('./routes/categories');
const moderationRoutes = require('./routes/moderation');
const mapRoutes = require('./routes/map');
const mediaRoutes = require('./routes/media');
const aiRoutes = require('./routes/ai');
const errorRoutes = require('./routes/errors');
const { notFound, errorHandler } = require('./middleware/error');
const { serveUploads } = require('./utils/serveUploads');
const { initSentry } = require('./utils/monitoring');
const {
  corsOptions,
  securityHeaders,
  globalLimiter,
  perUserLimiter,
  sanitizeInput,
  cloudflareClientIp,
} = require('./middleware/security');
const { trackResponses } = require('./utils/securityAlerts');
const { audienceMiddleware } = require('./utils/audience');

initSentry();

const app = express();

// Production sits behind nginx on the same host; only trust loopback proxies by default.
app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
app.disable('x-powered-by');

app.use(cloudflareClientIp);
app.use(securityHeaders);
app.use(cors(corsOptions));
// Static images are cheap and load in bursts; keep them out of the API limits.
app.use('/uploads', serveUploads);
app.use(trackResponses);
app.use(globalLimiter);
app.use(perUserLimiter);

// Every route is also served under /v1 so clients can pin a version.
const withV1 = (paths) => paths.flatMap((path) => [path, `/v1${path}`]);

// Body limits: tiny for auth, large only where base64 media is posted.
const AUTH_BODY_PATHS = ['/auth/login', '/auth/signup', '/auth/otp', '/auth/admin/login', '/auth/complete-signup'];
app.use(withV1(AUTH_BODY_PATHS), express.json({ limit: '16kb' }));
app.use(withV1(['/media/upload-base64']), express.json({ limit: '40mb' }));
app.use(withV1(['/ai/listing-suggest']), express.json({ limit: '15mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeInput);
app.use(audienceMiddleware);

// The mobile app polls these every few seconds; logging them buries everything else.
const QUIET_POLL_PATHS = new Set(['/chats', '/chats/incoming-call', '/notifications']);

if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    if (!(req.method === 'GET' && QUIET_POLL_PATHS.has(req.path))) {
      console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
    }
    next();
  });
}

const api = express.Router();
api.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'kinbech-api' });
});
api.use('/auth', authRoutes);
api.use('/listings', listingRoutes);
api.use('/chats', chatRoutes);
api.use('/wishlist', wishlistRoutes);
api.use('/notifications', notificationRoutes);
api.use('/reports', reportRoutes);
api.use('/reviews', reviewRoutes);
api.use('/shops', shopRoutes);
api.use('/sellers', sellerRoutes);
api.use('/categories', categoryRoutes);
api.use('/moderation', moderationRoutes);
api.use('/map', mapRoutes);
api.use('/media', mediaRoutes);
api.use('/ai', aiRoutes);
api.use('/errors', errorRoutes);

app.use('/v1', api);
app.use(api);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
