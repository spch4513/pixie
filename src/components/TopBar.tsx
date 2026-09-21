import { IconButton } from './IconButton';

interface TopBarProps {
  facing: 'user' | 'environment';
  flipDisabled: boolean;
  flipDisabledReason?: string;
  debug: boolean;
  onFlip(): void;
  onHelp(): void;
  onToggleDebug(): void;
  onHome(): void;
}

export function TopBar({ facing, flipDisabled, flipDisabledReason, debug, onFlip, onHelp, onToggleDebug, onHome }: TopBarProps) {
  const flipLabel = flipDisabled && flipDisabledReason ? flipDisabledReason : facing === 'user' ? 'Switch to rear camera' : 'Switch to selfie camera';
  return (
    <header className="topbar">
      <button type="button" className="topbar-brand" onClick={onHome} aria-label="PIXIE — back to camera selection" data-tip="Back to start" data-tip-side="bottom">
        <span className="topbar-glyph" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="topbar-word">PIXIE</span>
      </button>
      <nav className="topbar-actions" aria-label="Camera tools">
        <IconButton icon="flip" label={flipLabel} onClick={onFlip} disabled={flipDisabled} />
        <IconButton icon="help" label="How to use Pixie" onClick={onHelp} />
        <IconButton icon="debug" label={debug ? 'Hide debug view' : 'Show debug view'} aria-pressed={debug} onClick={onToggleDebug} className={debug ? 'is-on' : ''} />
      </nav>
    </header>
  );
}
