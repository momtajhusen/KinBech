import { useEffect, useRef } from 'react';

export default function ExplorePagination({
  shown,
  total,
  hasMore,
  loading,
  onLoadMore,
  label = 'listings',
}) {
  const sentinelRef = useRef(null);
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadRef.current();
      },
      { rootMargin: '700px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, shown]);

  if (!total && !loading) return null;
  const percent = total ? Math.min(100, Math.round((shown / total) * 100)) : 0;

  return (
    <div className="explore-pagination">
      <div ref={sentinelRef} className="explore-pagination-sentinel" aria-hidden />
      <p className="explore-pagination-meta">
        Showing {shown.toLocaleString('en-IN')} of {total.toLocaleString('en-IN')} {label}
      </p>
      <div className="explore-pagination-track" aria-hidden>
        <span style={{ width: `${percent}%` }} />
      </div>
      {hasMore ? (
        <button
          type="button"
          className="btn btn-outline explore-load-more"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? <span className="explore-spinner" aria-label="Loading" /> : 'Load more'}
        </button>
      ) : total > 0 ? (
        <span className="explore-pagination-done">You&apos;ve seen everything here</span>
      ) : null}
    </div>
  );
}
