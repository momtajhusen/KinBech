import { useState } from 'react';
import { LayoutGrid, List } from 'lucide-react';

const STORAGE_PREFIX = 'kinbech.admin.view.';

export function useViewMode(pageKey, fallback = 'list') {
  const [view, setView] = useState(() => {
    try {
      const saved = window.localStorage.getItem(`${STORAGE_PREFIX}${pageKey}`);
      if (saved === 'card' || saved === 'list') return saved;
    } catch {
      /* storage unavailable */
    }
    return fallback;
  });

  const changeView = (next) => {
    setView(next);
    try {
      window.localStorage.setItem(`${STORAGE_PREFIX}${pageKey}`, next);
    } catch {
      /* storage unavailable */
    }
  };

  return [view, changeView];
}

export default function ViewToggle({ view, onChange }) {
  return (
    <div className="view-toggle" role="group" aria-label="Switch between list and card view">
      <button
        type="button"
        className={view === 'list' ? 'active' : ''}
        onClick={() => onChange('list')}
        title="List view"
        aria-pressed={view === 'list'}
      >
        <List className="item-icon" aria-hidden />
      </button>
      <button
        type="button"
        className={view === 'card' ? 'active' : ''}
        onClick={() => onChange('card')}
        title="Card view"
        aria-pressed={view === 'card'}
      >
        <LayoutGrid className="item-icon" aria-hidden />
      </button>
    </div>
  );
}
