const mongoose = require('mongoose');

function buildAtlasUri() {
  const baseUri = process.env.MONGODB_URI;
  if (!baseUri) return null;

  const user = process.env.MONGODB_USER;
  const password = process.env.MONGODB_PASSWORD;
  if (!user || !password) return baseUri;

  // Prefer separate credentials so passwords with @ # etc. stay correct
  try {
    const url = new URL(baseUri);
    url.username = encodeURIComponent(user);
    url.password = encodeURIComponent(password);
    return url.toString();
  } catch {
    const encodedUser = encodeURIComponent(user);
    const encodedPass = encodeURIComponent(password);
    return baseUri.replace(
      /^mongodb(\+srv)?:\/\//,
      `mongodb$1://${encodedUser}:${encodedPass}@`,
    );
  }
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

module.exports = { connectDb };
