import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { useAuth } from './AuthContext';
import { requestLogin } from '../components/LoginPrompt';

const WishlistContext = createContext({
  isSaved: () => false,
  toggle: async () => false,
  refresh: async () => {},
});

function idsFromListings(listings) {
  return new Set(
    (listings || []).map((item) => String(item?.id || item?._id || item || '')).filter(Boolean)
  );
}

export function WishlistProvider({ children }) {
  const { isLoggedIn } = useAuth();
  const [savedIds, setSavedIds] = useState(() => new Set());
  const toggleRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!isLoggedIn) {
      setSavedIds(new Set());
      return;
    }
    const { data, error } = await api.getWishlist({ fields: 'ids' });
    if (error) return;
    setSavedIds(idsFromListings(data?.listings));
  }, [isLoggedIn]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isSaved = useCallback((listingId) => savedIds.has(String(listingId || '')), [savedIds]);

  const toggle = useCallback(async (listingId) => {
    const id = String(listingId || '');
    if (!id) return false;
    if (!isLoggedIn) {
      requestLogin('save', () => toggleRef.current?.(id));
      return false;
    }

    setSavedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

    const { data, error } = await api.toggleWishlist(id);
    if (error) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return false;
    }

    if (Array.isArray(data?.listings)) {
      setSavedIds(idsFromListings(data.listings));
    }
    return Boolean(data?.saved);
  }, [isLoggedIn]);
  toggleRef.current = toggle;

  const value = useMemo(
    () => ({ isSaved, toggle, refresh }),
    [isSaved, toggle, refresh]
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  return useContext(WishlistContext);
}
