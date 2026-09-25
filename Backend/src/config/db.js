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

async function connectWithUri(uri, label) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME || 'KinBech',
  });
  const { host, name } = mongoose.connection;
  console.log(`${label} connected: ${host} / ${name}`);
}

async function connectDb() {
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const localUri =
    process.env.MONGODB_LOCAL_URI ||
    (isDevelopment ? 'mongodb://127.0.0.1:27017/KinBech' : null);
  const atlasUri = buildAtlasUri();
  // Local make run: stick to local Mongo — don't fall through to broken Atlas creds.
  const localOnly =
    isDevelopment &&
    process.env.MONGODB_ALLOW_ATLAS_FALLBACK !== 'true';

  if (isDevelopment && localUri) {
    try {
      await connectWithUri(localUri, 'Local MongoDB');
      return;
    } catch (error) {
      if (localOnly) {
        throw new Error(
          `Local MongoDB connection failed (${error.message}). ` +
            'Run `make start-mongodb` or set MONGODB_ALLOW_ATLAS_FALLBACK=true to try Atlas.'
        );
      }
      console.warn(
        `⚠️  Local MongoDB failed (${error.message}). Falling back to Atlas…`
      );
      try {
        await mongoose.disconnect();
      } catch (_) {
        // ignore
      }
    }
  }

  if (!atlasUri) {
    throw new Error(
      'MONGODB_URI is missing (and local MongoDB is unavailable)'
    );
  }

  try {
    await connectWithUri(atlasUri, 'MongoDB Atlas');
  } catch (error) {
    if (/bad auth|authentication failed|AtlasError/i.test(String(error.message))) {
      throw new Error(
        'MongoDB Atlas authentication failed. Fix MONGODB_USER / MONGODB_PASSWORD, ' +
          'or for local dev use MONGODB_LOCAL_URI=mongodb://127.0.0.1:27017/KinBech'
      );
    }
    throw error;
  }
}

module.exports = { connectDb, buildAtlasUri };
