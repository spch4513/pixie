import { useEffect, useRef, useState } from 'react';
import type { CaptureResult } from '../types';
import { canShareCapture } from '../lib/capture';
import { Icon } from './Icon';

interface CapturePreviewProps {
  capture: CaptureResult;
  onDownload(): void;
  onShare(): void;
  onDiscard(): void;
  onRetake?: () => void;
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function CapturePreview({ capture, onDownload, onShare, onDiscard, onRetake }: CapturePreviewProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [dims, setDims] = useState<string>('');
  const shareable = canShareCapture(capture);
  const isVideo = capture.kind === 'video';
  const format = capture.mimeType.split(';')[0].split('/')[1]?.toUpperCase() ?? '';

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    primaryRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div className="preview" role="dialog" aria-modal="true" aria-labelledby="preview-title">
      <div className="preview-head">
        <h2 id="preview-title" className="preview-title">
          {isVideo ? 'Your clip' : 'Your photo'}
        </h2>
        <p className="preview-meta">
          {format} · {formatBytes(capture.blob.size)}
          {dims ? ` · ${dims}` : ''}
        </p>
      </div>

      <div className="preview-media">
        {isVideo ? (
          <video
            src={capture.url}
            controls
            playsInline
            autoPlay
            muted
            loop
            onLoadedMetadata={(e) => setDims(`${e.currentTarget.videoWidth}×${e.currentTarget.videoHeight}`)}
          />
        ) : (
          <img src={capture.url} alt="Pixie photo preview" onLoad={(e) => setDims(`${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`)} />
        )}
      </div>

      <p className="preview-file" title={capture.filename}>
        {capture.filename}
      </p>

      <div className="preview-actions">
        <button ref={primaryRef} type="button" className="btn btn--paper" onClick={onDownload}>
          <Icon name="download" size={18} /> Download
        </button>
        {shareable ? (
          <button type="button" className="btn btn--outline" onClick={onShare}>
            <Icon name="share" size={18} /> Share
          </button>
        ) : null}
        {onRetake ? (
          <button type="button" className="btn btn--outline" onClick={onRetake}>
            <Icon name="retake" size={18} /> Retake
          </button>
        ) : null}
        <button type="button" className="btn btn--ghost" onClick={onDiscard}>
          <Icon name="trash" size={18} /> Discard
        </button>
      </div>
      {!shareable ? <p className="preview-hint">Sharing isn’t available in this browser — Download saves the file instead.</p> : null}
    </div>
  );
}
