import { useEffect, useRef, useState } from 'react';
import MIcon from './MIcon';

const canObserve = typeof IntersectionObserver !== 'undefined';

function scrollParent(node) {
  for (let el = node?.parentElement; el && el !== document.body; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

/** Footer for useInfiniteList: loads the next page before the user reaches the end. */
export default function InfiniteLoader({ shown, total, hasMore, loading, onLoadMore, label = 'entries' }) {
  const sentinelRef = useRef(null);
  const loadRef = useRef(onLoadMore);
  loadRef.current = onLoadMore;
  const startedAtRef = useRef(null);
  const [stalled, setStalled] = useState(false);

  // A load that ends without new rows failed; stop auto-loading until the user retries.
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
      { root: scrollParent(node), rootMargin: '600px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, shown, stalled]);

  if (!total && !loading) return null;

  const retry = () => {
    setStalled(false);
    onLoadMore();
  };

  return (
    <div className="infinite-loader">
      <div ref={sentinelRef} className="infinite-loader-sentinel" aria-hidden />
      {loading ? (
        <span className="infinite-loader-status" role="status">
          <span className="infinite-loader-spinner" aria-hidden />
          Loading more {label}…
        </span>
      ) : null}
      {hasMore && !loading && (stalled || !canObserve) ? (
        <button type="button" className="btn btn-secondary infinite-loader-retry" onClick={retry}>
          <MIcon name={stalled ? 'refresh' : 'expand_more'} />
          {stalled ? 'Try again' : 'Load more'}
        </button>
      ) : null}
      <span className="infinite-loader-meta">
        {hasMore || loading
          ? `Showing ${shown.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} ${label}`
          : `All ${total.toLocaleString('en-IN')} ${label} loaded`}
      </span>
    </div>
  );
}
