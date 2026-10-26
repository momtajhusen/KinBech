import { api, getAuthToken } from '../services/api';

export const pinnedStoresUtils = {
  // Get all pinned stores from backend
  getPinnedStores: async (params = {}) => {
    if (!getAuthToken()) return [];
    try {
      const { data, error } = await api.getPinnedStores(params);
      if (error) {
        console.error('Error fetching pinned stores:', error);
        return [];
      }
      return data?.stores || [];
    } catch (e) {
      console.error('Error reading pinned stores:', e);
      return [];
    }
  },

  // Add a store to pinned via backend
  pinStore: async (store) => {
    try {
      const storeType = store.sellerType === 'shop' ? 'shop' : 'individual';
      const storeId = store.shopId || store._id || store.id;

      const { error } = await api.pinStore({ storeId, storeType });
      if (error) {
        console.error('Error pinning store:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Error pinning store:', e);
      return false;
    }
  },

  // Remove a store from pinned via backend
  unpinStore: async (storeId) => {
    try {
      const { error } = await api.unpinStore(storeId);
      if (error) {
        console.error('Error unpinning store:', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Error unpinning store:', e);
      return false;
    }
  },

  // Check if a store is pinned (locally for quick checks)
  isStorePinned: async (storeId, pinnedList) => {
    try {
      if (pinnedList) {
        return pinnedList.some(s => String(s._id) === String(storeId));
      }
      const pinned = await pinnedStoresUtils.getPinnedStores();
      return pinned.some(s => String(s._id) === String(storeId));
    } catch (e) {
      console.error('Error checking pinned status:', e);
      return false;
    }
  },

  incrementUsage: async (storeId) => {
    if (!storeId || !getAuthToken()) return false;
    try {
      const { error } = await api.recordPinnedView(storeId);
      return !error;
    } catch (e) {
      console.error('Error recording pinned view:', e);
      return false;
    }
  },

  // Toggle pin status
  togglePin: async (store) => {
    const storeId = store.shopId || store._id || store.id;
    const isPinned = await pinnedStoresUtils.isStorePinned(storeId);
    if (isPinned) {
      return await pinnedStoresUtils.unpinStore(storeId);
    } else {
      return await pinnedStoresUtils.pinStore(store);
    }
  },

  // Clear all pinned stores (no longer needed with backend sync)
  clearAll: async () => {
    // Use unpinStore for each store if needed
    return true;
  },

  // Clean up pinned stores that no longer exist (no longer needed with backend sync)
  cleanupInvalidStores: async () => {
    // Backend handles this automatically
    return [];
  },
};

export default pinnedStoresUtils;