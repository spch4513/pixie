import type { CameraFacing } from '../types';
import { Icon } from './Icon';
import { Wordmark } from './Wordmark';

interface StartScreenProps {
  onStart(facing: CameraFacing): void;
  notice?: string | null;
}

const STEPS = ['Pinch', 'Drag', 'Scale', 'Lock', 'Capture'];

export function StartScreen({ onStart, notice }: StartScreenProps) {
  return (
    <main className="start">
      <div className="start-halftone" aria-hidden="true" />
      <header className="start-meta">
        <span>Pixie / Live camera filter</span>
        <span>No. 01 — Local only</span>
      </header>

      <section className="start-hero" aria-labelledby="pixie-title">
        <h1 id="pixie-title" className="visually-hidden">
          PIXIE
        </h1>
        <Wordmark />
        <p className="start-tagline">
          <span>Pinch reality into pixels.</span>
        </p>
      </section>

      <section className="start-actions" aria-label="Choose a camera">
        <p className="start-kicker">Choose a camera to begin</p>
        <div className="start-buttons">
          <button type="button" className="start-btn start-btn--ink" onClick={() => onStart('user')}>
            <Icon name="selfie" size={28} />
            <span className="start-btn-text">
              <span className="start-btn-title">Selfie camera</span>
              <span className="start-btn-sub">Front · mirrored</span>
            </span>
          </button>
          <button type="button" className="start-btn start-btn--paper" onClick={() => onStart('environment')}>
            <Icon name="rear" size={28} />
            <span className="start-btn-text">
              <span className="start-btn-title">Rear camera</span>
              <span className="start-btn-sub">Back · true view</span>
            </span>
          </button>
        </div>
        {notice ? (
          <p className="start-notice" role="alert">
            <Icon name="alert" size={16} /> {notice}
          </p>
        ) : null}
        <p className="start-privacy">
          <Icon name="shield" size={16} />
          Your camera stays on this device.
        </p>
      </section>

      <footer className="start-steps" aria-label="How it works">
        <ol>
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className="start-step-n">{String(i + 1).padStart(2, '0')}</span> {s}
            </li>
          ))}
        </ol>
      </footer>
    </main>
  );
}
