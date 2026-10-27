import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

/** Plan, pending payment and today's post allowance, refreshed whenever the screen comes into view. */
export function useAccountStatus(enabled = true) {
  const [status, setStatus] = useState(null);
  const { user, refreshUser } = useAuth();
  const authRef = useRef({ user, refreshUser });
  authRef.current = { user, refreshUser };

  const reload = useCallback(async () => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    const { data } = await api.getMySubscription();
    if (!data) return;
    setStatus(data);
    // An admin can switch Tester mode while the app is open; pick it up here.
    const known = authRef.current;
    if (typeof data.isTester === 'boolean' && known.user && data.isTester !== Boolean(known.user.isTester)) {
      Promise.resolve(known.refreshUser?.()).catch(() => {});
    }
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  return { status, reload };
}
