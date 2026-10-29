import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';

/** The other account (admin seat or seller account) on this Google email, and a switch to it. */
export function useAccountSwitch() {
  const { user, switchAccount } = useAuth();
  const [linked, setLinked] = useState(null);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState('');
  const userId = user?._id || user?.id || '';

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (userId) {
        api.getLinkedAccount().then(({ data }) => {
          if (alive && data) setLinked(data.account || null);
        });
      }
      return () => {
        alive = false;
      };
    }, [userId])
  );

  const switchNow = useCallback(async () => {
    if (!linked || switching) return;
    setSwitching(true);
    setError('');
    try {
      await switchAccount(linked.type);
    } catch (e) {
      setError(e?.message || 'Could not switch account. Please try again.');
    } finally {
      setSwitching(false);
    }
  }, [linked, switching, switchAccount]);

  return { linked, switching, error, clearError: () => setError(''), switchNow };
}
