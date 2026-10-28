import { useState } from 'react';
import { IMAGE_DIR, SITE_IMAGES, imagePrompt } from '../content/siteImages';

const EXTENSIONS = ['webp', 'png'];

function SlotHint({ name, size }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(imagePrompt(name));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="site-image-hint">
      <strong>{name}.webp</strong>
      <span>{size[0]} × {size[1]}</span>
      <button type="button" onClick={copy}>{copied ? 'Prompt copied' : 'Copy prompt'}</button>
    </div>
  );
}

export default function SiteImage({ name, className = '', priority = false }) {
  const image = SITE_IMAGES[name];
  const [attempt, setAttempt] = useState(0);
  if (!image) return null;

  const [width, height] = image.size;
  const classes = `site-image site-image--${image.backdrop}${className ? ` ${className}` : ''}`;
  const style = { aspectRatio: `${width} / ${height}` };

  if (attempt >= EXTENSIONS.length) {
    return (
      <div className={`${classes} site-image--empty`} style={style} role="img" aria-label={image.alt || undefined}>
        <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="18" height="16" rx="4" />
          <circle cx="9" cy="10" r="2" />
          <path d="m21 16-5-5-9 9" />
        </svg>
        {import.meta.env.DEV ? <SlotHint name={name} size={image.size} /> : null}
      </div>
    );
  }

  return (
    <div className={classes} style={style}>
      <img
        key={attempt}
        src={`${IMAGE_DIR}/${name}.${EXTENSIONS[attempt]}`}
        alt={image.alt}
        width={width}
        height={height}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        onError={() => setAttempt((n) => Math.max(n, attempt + 1))}
      />
    </div>
  );
}
