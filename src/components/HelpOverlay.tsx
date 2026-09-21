import { useEffect, useRef } from 'react';

interface HelpOverlayProps {
  onClose(): void;
}

const STEPS: Array<{ title: string; body: string; glyph: string }> = [
  { title: 'Pinch to place', body: 'Touch thumb to index finger. Keep pinching and pull to draw a rectangle.', glyph: 'place' },
  { title: 'Pinch + drag to move', body: 'Pinch inside or near the box, then drag it.', glyph: 'move' },
  { title: 'Two hands to scale', body: 'Pinch with both hands; spread wide or tall to shape it.', glyph: 'scale' },
  { title: 'Lock to hold', body: 'Tap Lock so gestures can’t move it.', glyph: 'lock' },
  { title: 'Capture the moment', body: 'Shoot a photo or record a clip.', glyph: 'capture' },
];

function Glyph({ kind }: { kind: string }) {
  // Tiny pictograms built from squares, in keeping with the pixel theme.
  const common = { width: 40, height: 40, viewBox: '0 0 20 20', 'aria-hidden': true as const };
  switch (kind) {
    case 'place':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="14" height="14" fill="none" stroke="currentColor" strokeDasharray="2 2" />
          <rect x="8" y="8" width="4" height="4" fill="currentColor" />
        </svg>
      );
    case 'move':
      return (
        <svg {...common}>
          <rect x="2" y="6" width="8" height="8" fill="currentColor" />
          <rect x="10" y="6" width="8" height="8" fill="none" stroke="currentColor" strokeDasharray="2 2" />
          <path d="M11 10h5M14 8l2 2-2 2" stroke="currentColor" fill="none" />
        </svg>
      );
    case 'scale':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="8" height="8" fill="currentColor" />
          <rect x="2" y="2" width="16" height="16" fill="none" stroke="currentColor" strokeDasharray="2 2" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common}>
          <rect x="4" y="9" width="12" height="9" fill="currentColor" />
          <path d="M7 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="2" fill="none" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="2" y="5" width="16" height="12" fill="none" stroke="currentColor" strokeWidth="2" />
          <rect x="7" y="8" width="6" height="6" fill="currentColor" />
          <rect x="6" y="2" width="8" height="3" fill="currentColor" />
        </svg>
      );
  }
}

export function HelpOverlay({ onClose }: HelpOverlayProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    buttonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="help-backdrop" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div className="help-panel">
        <p className="help-kicker">Field guide</p>
        <h2 id="help-title" className="help-title">
          How to Pixie
        </h2>
        <ol className="help-steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="help-step">
              <span className="help-step-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="help-step-glyph">
                <Glyph kind={s.glyph} />
              </span>
              <span className="help-step-text">
                <strong>{s.title}</strong>
                <span>{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="help-note">No hands handy? Drag with a finger or mouse — two fingers scale.</p>
        <button ref={buttonRef} type="button" className="btn btn--ink help-go" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
