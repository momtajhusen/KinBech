const express = require('express');
const cors = require('cors');
const path = require('path');

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
const mapRoutes = require('./routes/map');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

// More permissive CORS configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Log all requests for debugging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'kinbech-api' });
});

app.use('/auth', authRoutes);
app.use('/listings', listingRoutes);
app.use('/chats', chatRoutes);
app.use('/wishlist', wishlistRoutes);
app.use('/notifications', notificationRoutes);
app.use('/reports', reportRoutes);
app.use('/reviews', reviewRoutes);
app.use('/shops', shopRoutes);
app.use('/sellers', sellerRoutes);
app.use('/categories', categoryRoutes);
app.use('/map', mapRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
