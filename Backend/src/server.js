require('dotenv').config();

const http = require('http');

const app = require('./app');
const { connectDb } = require('./config/db');
const { initRealtime } = require('./utils/realtime');
const { warmupImageSafety } = require('./utils/imageSafetyCheck');
const { ensureSeedKeywords } = require('./utils/listingModeration');

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await connectDb();
    ensureSeedKeywords().catch((error) => {
      console.warn('Restricted keyword seed skipped:', error.message);
    });

    const server = http.createServer(app);
    initRealtime(server);

    server.listen(PORT, HOST, () => {
      console.log(`✅ KinBech API running on http://${HOST}:${PORT}`);
      console.log(`📱 For local development: http://localhost:${PORT}`);
      console.log(`🔗 Mobile app should connect to port ${PORT}`);
      warmupImageSafety();
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();
