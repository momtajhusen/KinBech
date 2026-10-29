import { useCallback, useRef, useState } from 'react';
import { chooseAccount } from '../components/AccountChoiceModal';
import { announceSignIn } from '../components/SignedInModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { signInWithGoogle } from '../services/googleAuth';
import { isAdminUser } from '../utils/admin';

/**
 * Native Google account chooser -> KinBech session.
 * `signIn({ beforeChoice })` resolves `{ status: 'ok', needsProfile, deletionCancelled }`, `{ status: 'cancelled' }` or `{ status: 'error' }`.
 * `beforeChoice` runs when the email has both an admin seat and an app account, before the picker opens.
 */
export function useGoogleLogin() {
  const { saveSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  const signIn = useCallback(async ({ beforeChoice } = {}) => {
    if (busyRef.current) return { status: 'busy' };
    busyRef.current = true;
    setError('');
    setLoading(true);
    try {
      const account = await signInWithGoogle();
      if (account.cancelled) return { status: 'cancelled' };

      let { data, error: apiError } = await api.googleLogin({ idToken: account.idToken });
      if (!apiError && data?.chooseAccount) {
        beforeChoice?.();
        const picked = await chooseAccount(data.accounts || []);
        if (!picked) return { status: 'cancelled' };
        ({ data, error: apiError } = await api.googleLogin({ idToken: account.idToken, account: picked }));
      }
      if (apiError || !data?.token) {
        setError(apiError || 'Could not sign in. Please try again.');
        return { status: 'error' };
      }

      await saveSession(data.token, data.user);
      if (isAdminUser(data.user)) return { status: 'ok', needsProfile: false, admin: true };
      const needsProfile = Boolean(data.isNewUser || !data.user?.profileComplete);
      const deletionCancelled = Boolean(data.deletionCancelled);
      announceSignIn({ user: data.user, google: account.user, isNew: needsProfile, deletionCancelled });
      return { status: 'ok', needsProfile, deletionCancelled };
    } catch (signInError) {
      setError(signInError?.message || 'Could not sign in with Google. Please try again.');
      return { status: 'error' };
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }, [saveSession]);

  return { signIn, loading, error, setError };
}
