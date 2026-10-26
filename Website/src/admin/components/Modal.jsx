import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

let openCount = 0;

/** Theme variables live on .admin-app, so overlays must render inside it. */
export const modalRoot = () => document.querySelector('.admin-app') || document.body;

/**
 * Admin dialog. Pass `onSubmit` to make the body + footer one <form> (Enter submits).
 * Esc and the backdrop close it unless `busy` is true.
 */
export default function Modal({
  title,
  subtitle,
  icon: Icon,
  tone = 'primary',
  size = 'md',
  onClose,
  onSubmit,
  footer,
  busy = false,
  children,
}) {
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = busy ? null : onClose;

  useEffect(() => {
    openCount += 1;
    document.body.classList.add('kb-modal-open');
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      const layers = document.querySelectorAll('.kb-modal-overlay, .crop-overlay');
      if (layers[layers.length - 1] === panelRef.current?.parentElement) closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    const first = panelRef.current?.querySelector('.kb-modal-body input:not([type=hidden]):not([type=checkbox]):not([type=color]):not([type=file]), .kb-modal-body textarea, .kb-modal-body select');
    if (first) first.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      openCount -= 1;
      if (openCount <= 0) {
        openCount = 0;
        document.body.classList.remove('kb-modal-open');
      }
    };
  }, []);

  const Shell = onSubmit ? 'form' : 'div';
  const shellProps = onSubmit
    ? { onSubmit: (event) => { event.preventDefault(); if (!busy) onSubmit(event); } }
    : {};

  return createPortal(
    <div className="kb-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeRef.current?.(); }}>
      <div ref={panelRef} className={`kb-modal size-${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <header className="kb-modal-head">
          {Icon ? (
            <span className={`kb-modal-icon tone-${tone}`}><Icon aria-hidden /></span>
          ) : null}
          <div className="kb-modal-heading">
            <h3 className="kb-modal-title">{title}</h3>
            {subtitle ? <p className="kb-modal-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="kb-modal-close" onClick={() => closeRef.current?.()} disabled={busy} aria-label="Close">
            <X aria-hidden />
          </button>
        </header>
        <Shell className="kb-modal-shell" {...shellProps}>
          <div className="kb-modal-body">{children}</div>
          {footer ? <footer className="kb-modal-foot">{footer}</footer> : null}
        </Shell>
      </div>
    </div>,
    modalRoot(),
  );
}

/** On/off row with a label and a short explanation. */
export function ModalSwitch({ checked, onChange, label, hint, disabled = false }) {
  return (
    <label className={`kb-switch ${disabled ? 'is-disabled' : ''}`}>
      <span className="kb-switch-text">
        <span className="kb-switch-label">{label}</span>
        {hint ? <span className="kb-switch-hint">{hint}</span> : null}
      </span>
      <input type="checkbox" checked={Boolean(checked)} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="kb-switch-track" aria-hidden />
    </label>
  );
}

/** Pick one of a few options shown as cards (icon, title, description). */
export function OptionCards({ value, onChange, options, columns = 2 }) {
  return (
    <div className="kb-options" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }} role="radiogroup">
      {options.map((option) => {
        const OptionIcon = option.icon;
        const on = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            className={`kb-option ${on ? 'on' : ''} ${option.tone ? `tone-${option.tone}` : ''}`}
            onClick={() => onChange(option.value)}
          >
            {OptionIcon ? <OptionIcon className="kb-option-icon" aria-hidden /> : null}
            <span className="kb-option-title">{option.label}</span>
            {option.description ? <span className="kb-option-desc">{option.description}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
