// Native Google account picker. The module only exists in builds made after the plugin was added,
// so it is loaded lazily: an older dev build shows an error instead of crashing on import.
let sdk;
let configured = false;

function loadSdk() {
  if (sdk !== undefined) return sdk;
  try {
    sdk = require('@react-native-google-signin/google-signin');
  } catch (_error) {
    sdk = null;
  }
  return sdk;
}

function ensureConfigured() {
  const google = loadSdk();
  if (!google) {
    throw new Error('Google sign-in is not available in this build. Please update the app.');
  }
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  if (!webClientId) {
    throw new Error('Google sign-in is not configured yet.');
  }
  if (!configured) {
    google.GoogleSignin.configure({ webClientId, scopes: ['profile', 'email'] });
    configured = true;
  }
  return google;
}

function friendlyError(google, error) {
  if (google.isErrorWithCode(error)) {
    switch (error.code) {
      case google.statusCodes.IN_PROGRESS:
        return 'Google sign-in is already in progress.';
      case google.statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
        return 'Google Play services is missing or out of date on this device.';
      case '10':
      case 'DEVELOPER_ERROR':
        return 'Google sign-in is not set up for this app build yet.';
      default:
        break;
    }
  }
  return error?.message || 'Could not sign in with Google. Please try again.';
}

/**
 * Opens the native account chooser.
 * Resolves `{ idToken, user }`, or `{ cancelled: true }` when the sheet is dismissed.
 */
export async function signInWithGoogle() {
  const google = ensureConfigured();
  try {
    await google.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Clearing the cached account makes the chooser show every time instead of reusing the last one.
    await google.GoogleSignin.signOut().catch(() => {});
    const response = await google.GoogleSignin.signIn();
    if (google.isCancelledResponse(response)) return { cancelled: true };
    if (!google.isSuccessResponse(response) || !response.data?.idToken) {
      throw new Error('Google did not return an account. Please try again.');
    }
    return { idToken: response.data.idToken, user: response.data.user };
  } catch (error) {
    if (google.isErrorWithCode(error) && error.code === google.statusCodes.SIGN_IN_CANCELLED) {
      return { cancelled: true };
    }
    throw new Error(friendlyError(google, error));
  }
}

/** Fresh token for the Google account picked last time, without UI; the chooser opens only if none is remembered. */
export async function signInWithGoogleQuietly() {
  const google = ensureConfigured();
  try {
    const response = await google.GoogleSignin.signInSilently();
    if (google.isSuccessResponse(response) && response.data?.idToken) {
      return { idToken: response.data.idToken, user: response.data.user };
    }
  } catch (_error) {
    // remembered account was removed or revoked
  }
  return signInWithGoogle();
}

export async function signOutGoogle() {
  let google;
  try {
    google = ensureConfigured();
  } catch (_error) {
    return;
  }
  await google.GoogleSignin.signOut().catch(() => {});
}
