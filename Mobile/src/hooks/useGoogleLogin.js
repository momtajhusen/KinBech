import { useCallback, useRef, useState } from 'react';
import { announceSignIn } from '../components/SignedInModal';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { signInWithGoogle } from '../services/googleAuth';

/**
 * Native Google account chooser -> KinBech session.
 * `signIn()` resolves `{ status: 'ok', needsProfile, deletionCancelled }`, `{ status: 'cancelled' }` or `{ status: 'error' }`.
 */
export function useGoogleLogin() {
  const { saveSession } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const busyRef = useRef(false);

  const signIn = useCallback(async () => {
    if (busyRef.current) return { status: 'busy' };
    busyRef.current = true;
    setError('');
    setLoading(true);
    try {
      const account = await signInWithGoogle();
      if (account.cancelled) return { status: 'cancelled' };

      const { data, error: apiError } = await api.googleLogin({ idToken: account.idToken });
      if (apiError || !data?.token) {
        setError(apiError || 'Could not sign in. Please try again.');
        return { status: 'error' };
      }

      await saveSession(data.token, data.user);
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
