import { useEffect, useRef } from 'react';
import type { PixieError } from '../types';
import { Icon } from './Icon';

export interface ErrorAction {
  label: string;
  onClick(): void;
  primary?: boolean;
}

interface ErrorPanelProps {
  error: PixieError;
  actions: ErrorAction[];
}

export function ErrorPanel({ error, actions }: ErrorPanelProps) {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
  }, [error.kind]);

  return (
    <div className="error-backdrop">
      <section className="error-panel" role="alertdialog" aria-labelledby="error-title" aria-describedby="error-body">
        <div className="error-badge" aria-hidden="true">
          <Icon name="alert" size={28} />
        </div>
        <p className="error-code">Error · {error.kind.replace(/-/g, ' ')}</p>
        <h2 id="error-title" className="error-title">
          {error.title}
        </h2>
        <p id="error-body" className="error-body">
          {error.message}
        </p>
        <div className="error-actions">
          {actions.map((a, i) => (
            <button key={a.label} ref={i === 0 ? firstRef : undefined} type="button" className={`btn ${a.primary ? 'btn--ink' : 'btn--outline-ink'}`} onClick={a.onClick}>
              {a.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
