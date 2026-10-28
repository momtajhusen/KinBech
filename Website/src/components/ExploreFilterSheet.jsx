import { useEffect } from 'react';
import ExploreRefinePanel from './ExploreRefinePanel';

export default function ExploreFilterSheet({
  open,
  onClose,
  refineProps,
  resultLabel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.body.classList.add('explore-filter-sheet-lock');
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('explore-filter-sheet-lock');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="explore-filter-sheet-root" role="presentation">
      <button
        type="button"
        className="explore-filter-sheet-backdrop"
        aria-label="Close filters"
        onClick={onClose}
      />
      <div className="explore-filter-sheet" role="dialog" aria-modal="true" aria-label="Filters">
        <div className="explore-filter-sheet-handle" aria-hidden />
        <div className="explore-filter-sheet-head">
          <h2>Filters</h2>
          <button type="button" className="explore-filter-sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="explore-filter-sheet-body">
          <ExploreRefinePanel {...refineProps} showSort className="refine-panel--sheet" />
        </div>
        <div className="explore-filter-sheet-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {resultLabel || 'Show results'}
          </button>
        </div>
      </div>
    </div>
  );
}
