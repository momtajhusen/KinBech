import { Minus, Plus } from 'lucide-react';

export const MAX_DAILY_POSTS = 1000;
export const POST_LIMIT_PRESETS = [0, 3, 5, 10, 20, 50];

export const clampPosts = (value) => Math.min(MAX_DAILY_POSTS, Math.max(0, Math.round(Number(value) || 0)));

export const postLimitLabel = (value) => (value === 0 ? 'No limit' : `Up to ${value} post${value === 1 ? '' : 's'} / 24 h`);

export default function PostLimitStepper({ id, value, onChange, disabled }) {
  return (
    <div className="post-limit-stepper">
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => onChange(clampPosts(value - 1))}
        disabled={disabled || value <= 0}
      >
        <Minus className="item-icon" aria-hidden />
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min="0"
        max={MAX_DAILY_POSTS}
        value={value}
        onChange={(e) => onChange(clampPosts(e.target.value))}
        disabled={disabled}
      />
      <button
        type="button"
        aria-label="Increase"
        onClick={() => onChange(clampPosts(value + 1))}
        disabled={disabled || value >= MAX_DAILY_POSTS}
      >
        <Plus className="item-icon" aria-hidden />
      </button>
    </div>
  );
}

export function PostLimitPresets({ value, onPick, disabled }) {
  return (
    <div className="post-limit-presets">
      {POST_LIMIT_PRESETS.map((preset) => (
        <button
          type="button"
          key={preset}
          className={value === preset ? 'active' : ''}
          onClick={() => onPick(preset)}
          disabled={disabled}
        >
          {preset === 0 ? 'No limit' : preset}
        </button>
      ))}
    </div>
  );
}
