const mongoose = require('mongoose');

/**
 * Build Atlas URI with credentials.
 * Do NOT use WHATWG `new URL()` for mongodb+srv — it can drop username/password,
 * leaving an unauthenticated connection (empty authenticatedUsers) that fails finds.
 */
function buildAtlasUri() {
  const baseUri = process.env.MONGODB_URI;
  if (!baseUri) return null;

  const user = process.env.MONGODB_USER;
  const password = process.env.MONGODB_PASSWORD;
  if (!user || !password) return baseUri;

  const encodedUser = encodeURIComponent(user);
  const encodedPass = encodeURIComponent(password);

  // Replace existing userinfo, or inject after scheme://
  if (/^mongodb(\+srv)?:\/\/[^/@]+@/.test(baseUri)) {
    return baseUri.replace(
      /^mongodb(\+srv)?:\/\/[^/@]+@/,
      `mongodb$1://${encodedUser}:${encodedPass}@`,
    );
  }

  return baseUri.replace(
    /^mongodb(\+srv)?:\/\//,
    `mongodb$1://${encodedUser}:${encodedPass}@`,
  );
}

async function connectDb() {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const localUri = process.env.MONGODB_LOCAL_URI;
  const atlasUri = buildAtlasUri();

  const uri = isDevelopment && localUri ? localUri : atlasUri;

  if (!uri) {
    throw new Error('MONGODB_URI is missing');
  }

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME || 'KinBech',
  });

  const { host, name } = mongoose.connection;
  const connectionType = isDevelopment && localUri ? 'Local MongoDB' : 'MongoDB Atlas';
  console.log(`${connectionType} connected: ${host} / ${name}`);
}

module.exports = { connectDb, buildAtlasUri };
