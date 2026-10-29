import { api, getSessionTokens } from './api';
import { signInWithGoogleQuietly } from './googleAuth';
import { clearParkedSessions, readParkedSession, writeParkedSession } from './tokenStorage';
import { isAdminUser } from '../utils/admin';

export function accountTypeOf(user) {
  return isAdminUser(user) ? 'admin' : 'user';
}

function sameEmail(a, b) {
  return Boolean(a && b) && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

async function resumeParked(type, email) {
  const parked = await readParkedSession(type);
  if (!parked) return null;
  let { token, refreshToken } = parked;
  let result = await api.meAs(token);
  if (!result.data?.user && result.data?.code === 'TOKEN_EXPIRED' && refreshToken) {
    const refreshed = await api.refreshAs(refreshToken);
    if (!refreshed.data?.token) {
      if (refreshed.status >= 400 && refreshed.status < 500) await writeParkedSession(type, null);
      return null;
    }
    token = refreshed.data.token;
    refreshToken = refreshed.data.refreshToken || refreshToken;
    // The old refresh token is spent now; losing the new one would end this session.
    await writeParkedSession(type, { token, refreshToken });
    result = await api.meAs(token);
  }
  const user = result.data?.user;
  if (!user || accountTypeOf(user) !== type || !sameEmail(user.email, email)) {
    if (result.status >= 400 && result.status < 500) await writeParkedSession(type, null);
    return null;
  }
  return {
    token: result.data.token || token,
    refreshToken: result.data.refreshToken || refreshToken,
    user,
  };
}

async function signInAs(type, email) {
  const google = await signInWithGoogleQuietly();
  if (google.cancelled) return { cancelled: true };
  if (email && google.user?.email && !sameEmail(google.user.email, email)) {
    throw new Error(`Pick ${email} to switch accounts.`);
  }
  const { data, error } = await api.googleLoginAs({ idToken: google.idToken, account: type });
  if (!data?.token || !data?.user) {
    throw new Error(data?.message || error || 'Could not switch account. Please try again.');
  }
  if (accountTypeOf(data.user) !== type) {
    api.logout('', data.token).catch(() => {});
    throw new Error(type === 'admin' ? 'This Google account has no admin access.' : 'No seller account on this Google email.');
  }
  return { token: data.token, refreshToken: data.refreshToken || '', user: data.user };
}

/**
 * Opens the other account on this Google email. The current session is parked, so switching
 * back is instant while it is still valid. Resolves `{ token, refreshToken, user }` or `{ cancelled: true }`.
 */
export async function openLinkedAccount(currentUser, target) {
  const current = await getSessionTokens();
  const next = (await resumeParked(target, currentUser?.email)) || (await signInAs(target, currentUser?.email));
  if (next.cancelled) return next;
  if (current.token) await writeParkedSession(accountTypeOf(currentUser), current);
  await writeParkedSession(target, null);
  return next;
}

/** On log out the parked account is signed out on the server too. */
export async function closeParkedSessions() {
  const parked = await Promise.all(['admin', 'user'].map((type) => readParkedSession(type)));
  parked.forEach((session) => {
    if (session?.token) api.logout('', session.token).catch(() => {});
  });
  await clearParkedSessions();
}
