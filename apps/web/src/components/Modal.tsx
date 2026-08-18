import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../i18n';

export function Modal({
  title,
  onClose,
  children,
  actions,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={dialog}
        className={`modal-card ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label={t('close')}>
            <X />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {actions && <footer className="modal-actions">{actions}</footer>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  message,
  danger = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  message: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button className="secondary" onClick={onCancel} disabled={busy}>
            {t('cancel')}
          </button>
          <button
            className={danger ? 'danger-action' : 'primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '…' : t('confirm')}
          </button>
        </>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  );
}

export function TextDialog({
  initialValue = '',
  onCancel,
  onSave,
}: {
  initialValue?: string | undefined;
  onCancel: () => void;
  onSave: (value: string) => void;
}) {
  const { t } = useI18n();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get('boardText') ?? '').trim();
    if (value) onSave(value);
  }
  return (
    <Modal title={t('textTitle')} onClose={onCancel}>
      <form className="modal-form" onSubmit={submit}>
        <textarea
          name="boardText"
          defaultValue={initialValue}
          maxLength={2000}
          rows={5}
          placeholder={t('textPlaceholder')}
          autoFocus
          required
        />
        <div className="modal-actions inline-actions">
          <button type="button" className="secondary" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button className="primary">{t('save')}</button>
        </div>
      </form>
    </Modal>
  );
}
