import { useEffect, useRef, useState } from 'react';

const canObserve = typeof IntersectionObserver !== 'undefined';

export default function ExplorePagination({
  shown,
  total,
  hasMore,
  loading,
  onLoadMore,
  label = 'listings',
  skeleton = null,
}) {
  const sentinelRef = useRef(null);
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;
  const startedAtRef = useRef(null);
  const [stalled, setStalled] = useState(false);

  // A load that ends without new items failed; stop auto-loading until the user retries.
  useEffect(() => {
    if (loading) {
      startedAtRef.current = shown;
      return;
    }
    if (startedAtRef.current != null) {
      setStalled(hasMore && shown === startedAtRef.current);
      startedAtRef.current = null;
    }
  }, [loading, shown, hasMore]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || stalled || !canObserve) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadRef.current();
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, shown, stalled]);

  if (!total && !loading) return null;
  const percent = total ? Math.min(100, Math.round((shown / total) * 100)) : 0;
  const retry = () => {
    setStalled(false);
    onLoadMore();
  };

  return (
    <div className="explore-pagination">
      <div ref={sentinelRef} className="explore-pagination-sentinel" aria-hidden />
      {loading && skeleton ? <div className="explore-pagination-skeleton">{skeleton}</div> : null}
      {loading ? (
        <p className="explore-pagination-loading" role="status">
          <span className="explore-spinner" aria-hidden />
          Loading more {label}…
        </p>
      ) : null}
      <p className="explore-pagination-meta">
        Showing {shown.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} {label}
      </p>
      <div className="explore-pagination-track" aria-hidden>
        <span style={{ width: `${percent}%` }} />
      </div>
      {hasMore && !loading && (stalled || !canObserve) ? (
        <button type="button" className="btn btn-outline explore-load-more" onClick={retry}>
          {stalled ? 'Try again' : 'Load more'}
        </button>
      ) : null}
      {!hasMore && total > 0 ? (
        <span className="explore-pagination-done">You&apos;ve seen everything here</span>
      ) : null}
    </div>
  );
}
