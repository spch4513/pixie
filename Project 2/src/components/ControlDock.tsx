import { useId } from 'react';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

interface ControlDockProps {
  hasSelection: boolean;
  locked: boolean;
  detail: number;
  recording: boolean;
  recordDisabledReason: string | null;
  busy: boolean;
  onToggleLock(): void;
  onClear(): void;
  onDetail(value: number): void;
  onPhoto(): void;
  onToggleRecord(): void;
}

function detailWord(v: number): string {
  if (v < 0.2) return 'Fine';
  if (v < 0.45) return 'Crisp';
  if (v < 0.7) return 'Bold';
  return 'Chunky';
}

export function ControlDock(props: ControlDockProps) {
  const { hasSelection, locked, detail, recording, recordDisabledReason, busy } = props;
  const sliderId = useId();
  const lockLabel = !hasSelection ? 'Lock (place a Pixie area first)' : locked ? 'Locked — tap to unlock' : 'Lock the Pixie area';

  return (
    <div className="dock" role="toolbar" aria-label="Pixie controls">
      <div className="dock-detail">
        <label htmlFor={sliderId} className="dock-detail-label">
          Pixel Detail
        </label>
        <span className="dock-detail-end" aria-hidden="true">
          Fine
        </span>
        <input
          id={sliderId}
          className="pixel-slider"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(detail * 100)}
          aria-valuetext={`${detailWord(detail)} pixels`}
          onChange={(e) => props.onDetail(Number(e.currentTarget.value) / 100)}
          style={{ ['--fill' as string]: `${Math.round(detail * 100)}%` }}
        />
        <span className="dock-detail-end" aria-hidden="true">
          Chunky
        </span>
      </div>

      <div className="dock-row">
        <div className="dock-group">
          <IconButton
            variant={locked ? 'dock-inverted' : 'dock'}
            icon={locked ? 'lock' : 'unlock'}
            label={lockLabel}
            caption={locked ? 'Locked' : 'Lock'}
            aria-pressed={locked}
            disabled={!hasSelection}
            onClick={props.onToggleLock}
          />
          <IconButton variant="dock" icon="clear" label="Clear Pixie area" caption="Clear" disabled={!hasSelection} onClick={props.onClear} />
        </div>

        <button type="button" className="shutter" aria-label="Take photo" data-tip="Take photo" data-tip-side="top" onClick={props.onPhoto} disabled={busy}>
          <span className="shutter-core" aria-hidden="true" />
          <span className="icon-btn-caption" aria-hidden="true">
            Photo
          </span>
        </button>

        <div className="dock-group dock-group--end">
          <button
            type="button"
            className={`rec-btn ${recording ? 'is-recording' : ''}`}
            aria-label={recording ? 'Stop recording' : recordDisabledReason ?? 'Record video'}
            aria-pressed={recording}
            data-tip={recording ? 'Stop recording' : recordDisabledReason ?? 'Record video'}
            data-tip-side="top"
            onClick={props.onToggleRecord}
            aria-disabled={!!recordDisabledReason && !recording}
          >
            <span className="rec-btn-face">
              <Icon name={recording ? 'stop' : 'record'} />
            </span>
            <span className="icon-btn-caption" aria-hidden="true">
              {recording ? 'Stop' : 'Video'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
