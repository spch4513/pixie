import { useEffect } from 'react';

export interface ToastData {
  id: number;
  message: string;
  tone?: 'info' | 'warn';
  action?: { label: string; onClick(): void };
  /** ms; 0 keeps it until dismissed */
  duration?: number;
}

interface ToastProps {
  toast: ToastData | null;
  onDismiss(): void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!toast || toast.duration === 0) return;
    const id = window.setTimeout(onDismiss, toast.duration ?? 3200);
    return () => window.clearTimeout(id);
  }, [toast, onDismiss]);

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast ? (
        <div key={toast.id} className={`toast ${toast.tone === 'warn' ? 'toast--warn' : ''}`}>
          <span className="toast-msg">{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                toast.action!.onClick();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button type="button" className="toast-close" aria-label="Dismiss message" onClick={onDismiss}>
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}
