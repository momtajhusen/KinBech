require('dotenv').config();

const http = require('http');

const app = require('./app');
const { connectDb, ensureUserPhoneIndex, sealPlaintextTaxIds } = require('./config/db');
const { initRealtime } = require('./utils/realtime');
const { warmupImageSafety } = require('./utils/imageSafetyCheck');
const { ensureSeedKeywords } = require('./utils/listingModeration');
const { startHealthMonitor } = require('./utils/securityAlerts');
const { startAccountPurgeJob } = require('./utils/accountDeletion');
const { startDealJobs } = require('./utils/deals');
const { startListingTrustJobs } = require('./utils/listingTrust');
const { backfillReviewSellers } = require('./controllers/reviewController');
const { startSellerScoreJob } = require('./utils/sellerScore');
const { startBoostJobs } = require('./utils/referral');
const { startDailyDigestJob } = require('./utils/dailyDigest');
const { startCategoryFixJob } = require('./utils/categoryFix');

const PORT = process.env.PORT || 5001;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  try {
    await connectDb();
    ensureUserPhoneIndex().catch((error) => {
      console.warn('User phone index check skipped:', error.message);
    });
    sealPlaintextTaxIds().catch((error) => {
      console.warn('PAN/VAT encryption migration skipped:', error.message);
    });
    startHealthMonitor();
    startAccountPurgeJob();
    startDealJobs();
    startListingTrustJobs();
    startSellerScoreJob();
    startBoostJobs();
    startDailyDigestJob();
    startCategoryFixJob();
    backfillReviewSellers().catch((error) => {
      console.warn('Review seller backfill skipped:', error.message);
    });
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
