import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import MIcon from './MIcon';
import { modalRoot } from './Modal';

/*
 * App-wide feedback: toasts for results and a styled confirm dialog for risky actions.
 * Both are plain functions so pages, helpers and the API layer can call them without hooks.
 */

const TITLES = { success: 'Done', error: 'Something went wrong', warning: 'Heads up', info: 'Note' };
const ICONS = { success: 'check_circle', error: 'error', warning: 'warning', info: 'info' };
const DURATION = { success: 3800, info: 4500, warning: 5500, error: 6500 };
const MAX_TOASTS = 4;
const AUTO_DELAY_MS = 180;
const MERGE_WINDOW_MS = 2500;

let toasts = [];
let dialogs = [];
let seq = 0;
const lastExplicit = { success: 0, error: 0, warning: 0, info: 0 };
// A request that succeeded can still end in a warning or note (e.g. saved but not pushed).
const OUTCOME = { success: 'ok', warning: 'ok', info: 'ok', error: 'error' };
const listeners = new Set();
let snapshot = { toasts, dialog: null };

function emit() {
  snapshot = { toasts, dialog: dialogs[0] || null };
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function show(kind, message, options = {}) {
  if (!message) return null;
  const text = String(message);
  const now = Date.now();
  const title = options.title || TITLES[kind];

  if (!options.auto) {
    lastExplicit[kind] = now;
    // A page's own message replaces the generic one the API layer just showed for the same action.
    const generic = [...toasts].reverse().find((t) => t.auto && OUTCOME[t.kind] === OUTCOME[kind] && now - t.createdAt < MERGE_WINDOW_MS);
    if (generic) {
      const duration = options.duration ?? DURATION[kind];
      toasts = toasts.map((t) => (t.id === generic.id ? { ...t, kind, message: text, title, duration, auto: false, version: t.version + 1 } : t));
      emit();
      return generic.id;
    }
  }

  const same = toasts.find((t) => t.kind === kind && t.message === text);
  if (same) {
    toasts = toasts.map((t) => (t.id === same.id ? { ...t, count: t.count + 1, version: t.version + 1 } : t));
    emit();
    return same.id;
  }

  const item = {
    id: ++seq,
    kind,
    title,
    message: text,
    auto: Boolean(options.auto),
    createdAt: now,
    duration: options.duration ?? DURATION[kind],
    count: 1,
    version: 0,
  };
  toasts = [...toasts, item].slice(-MAX_TOASTS);
  emit();
  return item.id;
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export const toast = {
  success: (message, options) => show('success', message, options),
  error: (message, options) => show('error', message, options),
  warning: (message, options) => show('warning', message, options),
  info: (message, options) => show('info', message, options),
  /** Generic result from the API layer; skipped if the page reports the same action itself. */
  auto: (kind, message, { skipIf, ...options } = {}) => {
    const queuedAt = Date.now();
    window.setTimeout(() => {
      const reported = Object.keys(lastExplicit).some((k) => OUTCOME[k] === OUTCOME[kind] && lastExplicit[k] >= queuedAt);
      if (reported || skipIf?.()) return;
      show(kind, message, { ...options, auto: true });
    }, AUTO_DELAY_MS);
  },
};

/**
 * Ask before a risky action. Resolves true when the admin confirms.
 * tone: danger | warning | primary | success. icon: a Material Symbols name.
 */
export function confirmAction({
  title,
  message,
  details,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'primary',
  icon,
} = {}) {
  return new Promise((resolve) => {
    dialogs = [...dialogs, { id: ++seq, title, message, details, confirmLabel, cancelLabel, tone, icon, resolve }];
    emit();
  });
}

function closeDialog(dialog, answer) {
  dialogs = dialogs.filter((d) => d.id !== dialog.id);
  emit();
  dialog.resolve(answer);
}

/** Pulls the server's message out of an axios error, with a fallback. */
export function errorMessage(error, fallback = 'Something went wrong') {
  if (error?.isAxiosError && !error.response) return "Can't reach the server. Check your internet and try again.";
  return error?.response?.data?.message || fallback;
}

const DIALOG_ICONS = { danger: 'delete_forever', warning: 'warning', primary: 'help', success: 'task_alt' };

function ConfirmDialog({ dialog }) {
  const confirmRef = useRef(null);
  const cancelRef = useRef(null);
  const [leaving, setLeaving] = useState(false);

  const finish = (answer) => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => closeDialog(dialog, answer), 160);
  };

  useEffect(() => {
    (dialog.tone === 'danger' ? cancelRef : confirmRef).current?.focus({ preventScroll: true });
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        finish(false);
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [dialog.id]);

  return (
    <div
      className={`kb-modal-overlay kb-confirm-overlay ${leaving ? 'is-leaving' : ''}`}
      onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false); }}
    >
      <div className={`kb-confirm tone-${dialog.tone}`} role="alertdialog" aria-modal="true" aria-labelledby={`kb-confirm-${dialog.id}`}>
        <span className="kb-confirm-icon">
          <MIcon name={dialog.icon || DIALOG_ICONS[dialog.tone] || 'help'} filled />
        </span>
        <h3 className="kb-confirm-title" id={`kb-confirm-${dialog.id}`}>{dialog.title}</h3>
        {dialog.message ? <p className="kb-confirm-message">{dialog.message}</p> : null}
        {dialog.details?.length ? (
          <ul className="kb-confirm-details">
            {dialog.details.map((line) => (
              <li key={line}><MIcon name="arrow_right" />{line}</li>
            ))}
          </ul>
        ) : null}
        <div className="kb-confirm-actions">
          <button type="button" ref={cancelRef} className="btn btn-secondary" onClick={() => finish(false)}>
            {dialog.cancelLabel}
          </button>
          <button type="button" ref={confirmRef} className={`btn kb-confirm-go tone-${dialog.tone}`} onClick={() => finish(true)}>
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToastItem({ item }) {
  const [paused, setPaused] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (paused || leaving) return undefined;
    const timer = window.setTimeout(() => setLeaving(true), item.duration);
    return () => window.clearTimeout(timer);
  }, [paused, leaving, item.duration, item.version]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = window.setTimeout(() => dismissToast(item.id), 280);
    return () => window.clearTimeout(timer);
  }, [leaving, item.id]);

  return (
    <div
      className={`kb-toast tone-${item.kind} ${leaving ? 'is-leaving' : ''} ${paused ? 'is-paused' : ''}`}
      role={item.kind === 'error' ? 'alert' : 'status'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="kb-toast-icon" key={`${item.kind}-${item.version}`}>
        <MIcon name={ICONS[item.kind]} filled />
      </span>
      <div className="kb-toast-body">
        <div className="kb-toast-title">
          {item.title}
          {item.count > 1 ? <span className="kb-toast-count">×{item.count}</span> : null}
        </div>
        <div className="kb-toast-text">{item.message}</div>
      </div>
      <button type="button" className="kb-toast-close" onClick={() => setLeaving(true)} aria-label="Dismiss">
        <MIcon name="close" />
      </button>
      <span
        className="kb-toast-progress"
        key={item.version}
        style={{ animationDuration: `${item.duration}ms` }}
        aria-hidden="true"
      />
    </div>
  );
}

/** Mount once inside .admin-app. */
export function FeedbackHost() {
  const state = useSyncExternalStore(subscribe, () => snapshot);
  const [root, setRoot] = useState(null);
  useEffect(() => setRoot(modalRoot()), []);
  if (!root) return null;
  return createPortal(
    <>
      <div className="kb-toasts" aria-live="polite">
        {state.toasts.map((item) => <ToastItem key={item.id} item={item} />)}
      </div>
      {state.dialog ? <ConfirmDialog key={state.dialog.id} dialog={state.dialog} /> : null}
    </>,
    root,
  );
}
