export default function ExplorePagination({
  shown,
  total,
  page,
  totalPages,
  hasMore,
  loading,
  onLoadMore,
  label = 'listings',
}) {
  if (!total && !loading) return null;

  return (
    <div className="explore-pagination">
      <p className="explore-pagination-meta">
        Showing {shown} of {total} {label}
        {totalPages > 1 ? ` · Page ${page} of ${totalPages}` : ''}
      </p>
      {hasMore ? (
        <button
          type="button"
          className="btn btn-outline explore-load-more"
          onClick={onLoadMore}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      ) : total > 0 ? (
        <span className="explore-pagination-done">All caught up</span>
      ) : null}
    </div>
  );
}
