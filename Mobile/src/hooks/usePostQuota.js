import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../services/api';

/** "5h 20m" until the next post slot frees up; null when no time is known. */
export function timeUntil(value) {
  if (!value) return null;
  const ms = new Date(value).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 'a moment';
  const minutes = Math.ceil(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

/** Daily post allowance for the Sell screens, refreshed every time the screen comes into view. */
export function usePostQuota(sellerType, { shopId, enabled = true } = {}) {
  const [quota, setQuota] = useState(null);

  const reload = useCallback(async () => {
    if (!enabled) return null;
    const { data } = await api.getPostQuota(sellerType, shopId);
    if (data?.quota) setQuota(data.quota);
    return data?.quota || null;
  }, [enabled, sellerType, shopId]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const blocked = Boolean(quota && !quota.unlimited && quota.remaining <= 0);
  return { quota, blocked, reload, setQuota };
}
