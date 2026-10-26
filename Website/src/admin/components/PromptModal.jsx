import { useState } from 'react';
import Modal from './Modal';

/**
 * Confirm dialog with an optional text field (reason presets) and an optional
 * "type DELETE" guard. `onConfirm(value)` may throw; its message is shown in the dialog.
 */
export default function PromptModal({
  title,
  subtitle,
  icon,
  tone = 'primary',
  field = null,
  confirmText = '',
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onClose,
  children,
}) {
  const [value, setValue] = useState(field?.initial ?? '');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (field?.required && !String(value).trim()) {
      setError(`${field.label || 'This field'} is required`);
      return;
    }
    if (confirmText && typed.trim() !== confirmText) {
      setError(`Type ${confirmText} to confirm`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onConfirm(typeof value === 'string' ? value.trim() : value);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Something went wrong');
      setBusy(false);
    }
  };

  const Input = field?.multiline ? 'textarea' : 'input';

  return (
    <Modal
      icon={icon}
      tone={danger ? 'danger' : tone}
      title={title}
      subtitle={subtitle}
      size="sm"
      busy={busy}
      onClose={onClose}
      onSubmit={submit}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            type="submit"
            className={`btn ${danger ? 'u360-danger-btn' : 'btn-primary'}`}
            disabled={busy || (confirmText && typed.trim() !== confirmText)}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      )}
    >
      {children}

      {field ? (
        <div className="form-group">
          {field.label ? <label htmlFor="prompt-field">{field.label}</label> : null}
          {field.presets?.length ? (
            <div className="u360-chips scam-presets">
              {field.presets.map((preset) => (
                <button key={preset} type="button" className={`u360-chip ${value === preset ? 'on' : ''}`} onClick={() => setValue(preset)}>{preset}</button>
              ))}
            </div>
          ) : null}
          <Input
            id="prompt-field"
            className={field.multiline ? 'form-textarea' : 'form-input'}
            type={field.multiline ? undefined : field.type || 'text'}
            rows={field.multiline ? 3 : undefined}
            min={field.min}
            max={field.max}
            maxLength={field.maxLength || (field.type === 'number' ? undefined : 300)}
            placeholder={field.placeholder}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          {field.hint ? <p className="form-hint">{field.hint}</p> : null}
        </div>
      ) : null}

      {confirmText ? (
        <div className="form-group">
          <label htmlFor="prompt-confirm">Type <strong>{confirmText}</strong> to confirm</label>
          <input id="prompt-confirm" className="form-input" autoComplete="off" value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={confirmText} />
        </div>
      ) : null}

      {error ? <div className="u360-error">{error}</div> : null}
    </Modal>
  );
}
