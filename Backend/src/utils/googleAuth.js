const { OAuth2Client } = require('google-auth-library');

let client = null;

/** Web client IDs the mobile app requests ID tokens for (comma-separated in GOOGLE_WEB_CLIENT_ID). */
function googleAudiences() {
  return String(process.env.GOOGLE_WEB_CLIENT_ID || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

function googleAuthConfigured() {
  return googleAudiences().length > 0;
}

/** Verifies signature, issuer, expiry and audience; throws if the token is not valid for this app. */
async function verifyGoogleIdToken(idToken) {
  if (!client) client = new OAuth2Client();
  const ticket = await client.verifyIdToken({ idToken, audience: googleAudiences() });
  const payload = ticket.getPayload() || {};
  return {
    sub: String(payload.sub || ''),
    email: String(payload.email || '').trim().toLowerCase(),
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    name: String(payload.name || '').trim(),
    picture: String(payload.picture || '').trim(),
  };
}

module.exports = { googleAuthConfigured, verifyGoogleIdToken };
