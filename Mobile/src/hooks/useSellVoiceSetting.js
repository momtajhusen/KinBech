import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { askVoiceMic } from './useSellVoice';

let askedThisLaunch = false;

/**
 * The sell screens' voice helper on/off, saved on the account (`preferences.sellVoice`, on by default) so it
 * stays the same in every sell session and after a restart. With `askMic` the mic permission is asked once
 * per launch when the helper is on; turning it on asks again, and it stays off when the mic is refused.
 */
export function useSellVoiceSetting({ askMic = false } = {}) {
  const { user, token, saveSession } = useAuth();
  const saved = user?.preferences?.sellVoice !== false;
  const [on, setOn] = useState(saved);
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    setOn(saved);
  }, [saved]);

  useEffect(() => {
    if (!askMic || !saved || askedThisLaunch) return;
    askedThisLaunch = true;
    askVoiceMic();
  }, [askMic, saved]);

  const change = useCallback(async (next) => {
    if (next && !(await askVoiceMic())) {
      setOn(false);
      return;
    }
    setOn(next);
    const { data } = await api.updatePreferences({ sellVoice: next });
    const current = userRef.current;
    if (data?.user) {
      await saveSession(data.token || token, data.user);
    } else if (current) {
      // Offline: keep it on this phone; the account catches up the next time it is changed.
      await saveSession(token, { ...current, preferences: { ...(current.preferences || {}), sellVoice: next } });
    }
  }, [saveSession, token]);

  return [on, change];
}
