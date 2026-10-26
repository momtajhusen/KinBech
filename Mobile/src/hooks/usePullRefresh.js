import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

export function usePullRefresh(loadFn) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadFn();
    } finally {
      setRefreshing(false);
    }
  }, [loadFn]);
  return { refreshing, onRefresh };
}

export function refreshControl(colors, refreshing, onRefresh, enabled = true) {
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      enabled={enabled}
      tintColor={colors.primary}
      colors={[colors.primary]}
    />
  );
}
