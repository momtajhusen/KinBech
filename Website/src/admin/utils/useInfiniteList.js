import { useCallback, useEffect, useRef, useState } from 'react';

const defaultKey = (item) => item?.id ?? item?._id;

/**
 * Page-by-page list for admin screens with infinite scroll.
 * `fetchPage(page)` resolves to `{ items, total, totalPages }`; wrap it in useCallback —
 * a new identity (filter or search changed) starts again from page 1.
 * `reload()` refetches every page loaded so far, so an action never duplicates or
 * drops rows and the scroll position stays put.
 */
export default function useInfiniteList(fetchPage, { getKey = defaultKey } = {}) {
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const genRef = useRef(0);
  const pageRef = useRef(1);
  const busyRef = useRef(false);
  const keyRef = useRef(getKey);
  keyRef.current = getKey;

  const applyMeta = (res) => {
    setTotal(res?.total ?? 0);
    setTotalPages(Math.max(1, res?.totalPages || 1));
  };

  useEffect(() => {
    const gen = ++genRef.current;
    pageRef.current = 1;
    busyRef.current = false;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    fetchPage(1)
      .then((res) => {
        if (gen !== genRef.current) return;
        setItems(res?.items || []);
        setPage(1);
        applyMeta(res);
      })
      .catch((e) => {
        if (gen !== genRef.current) return;
        setItems([]);
        applyMeta(null);
        setError(e);
      })
      .finally(() => {
        if (gen === genRef.current) setLoading(false);
      });
  }, [fetchPage]);

  const hasMore = !loading && page < totalPages;

  const loadMore = useCallback(async () => {
    if (busyRef.current || pageRef.current >= totalPages) return;
    const gen = genRef.current;
    const next = pageRef.current + 1;
    busyRef.current = true;
    setLoadingMore(true);
    try {
      const res = await fetchPage(next);
      if (gen !== genRef.current) return;
      setItems((prev) => {
        const seen = new Set(prev.map((item) => keyRef.current(item)));
        return [...prev, ...(res?.items || []).filter((item) => !seen.has(keyRef.current(item)))];
      });
      pageRef.current = next;
      setPage(next);
      applyMeta(res);
    } catch {
      /* InfiniteLoader shows Try again */
    } finally {
      if (gen === genRef.current) {
        busyRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [fetchPage, totalPages]);

  const reload = useCallback(async () => {
    const gen = genRef.current;
    const pages = Array.from({ length: pageRef.current }, (_, i) => i + 1);
    try {
      const results = await Promise.all(pages.map((p) => fetchPage(p)));
      if (gen !== genRef.current) return;
      const seen = new Set();
      const merged = [];
      results.forEach((res) => (res?.items || []).forEach((item) => {
        const key = keyRef.current(item);
        if (seen.has(key)) return;
        seen.add(key);
        merged.push(item);
      }));
      setItems(merged);
      applyMeta(results[results.length - 1]);
    } catch (e) {
      if (gen === genRef.current) setError(e);
    }
  }, [fetchPage]);

  return { items, setItems, total, setTotal, loading, loadingMore, hasMore, loadMore, reload, error };
}
