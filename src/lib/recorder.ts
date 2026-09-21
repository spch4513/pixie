import type { CaptureResult } from '../types';
import { timestampedName } from './capture';

/**
 * Preference order. MP4/H.264 first because it plays and shares everywhere (iOS Photos,
 * Android galleries, messaging apps); Safari only records MP4 anyway. WebM is the fallback
 * for browsers without MP4 recording (older Chrome, Firefox).
 */
const CANDIDATES: ReadonlyArray<{ mime: string; ext: string }> = [
  { mime: 'video/mp4;codecs=avc1.42E01E', ext: 'mp4' },
  { mime: 'video/mp4;codecs=avc1', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
];

export interface RecordingFormat {
  mimeType: string;
  extension: string;
}

export interface RecordingStarted extends RecordingFormat {
  /** Date.now() when the recorder started. */
  startedAt: number;
}

export function recordingSupportIssue(): string | null {
  if (typeof MediaRecorder === 'undefined') return 'This browser can’t record video. Photos still work — update your browser for video.';
  if (typeof HTMLCanvasElement === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    return 'This browser can’t record from a canvas. Photos still work.';
  }
  if (!pickRecordingFormat()) return 'No supported video format was found in this browser. Photos still work.';
  return null;
}

export function pickRecordingFormat(): RecordingFormat | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const c of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(c.mime)) return { mimeType: c.mime, extension: c.ext };
    } catch {
      /* some engines throw on unknown strings */
    }
  }
  return null;
}

/** Records the composited output canvas (never the raw camera, never the UI). No audio. */
export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private format: RecordingFormat | null = null;
  private stopResolver: ((r: CaptureResult | null) => void) | null = null;
  private onError: ((message: string) => void) | null = null;

  get active(): boolean {
    return this.recorder !== null && this.recorder.state !== 'inactive';
  }

  get mimeType(): string | null {
    return this.format?.mimeType ?? null;
  }

  start(canvas: HTMLCanvasElement, onError: (message: string) => void): RecordingStarted {
    const issue = recordingSupportIssue();
    if (issue) throw new Error(issue);
    const format = pickRecordingFormat()!;
    this.format = format;
    this.onError = onError;
    this.chunks = [];
    this.stream = canvas.captureStream(30);

    const px = canvas.width * canvas.height;
    const videoBitsPerSecond = Math.round(Math.min(12e6, Math.max(3e6, px * 30 * 0.12))); // crisp pixel edges need bits
    const recorder = new MediaRecorder(this.stream, { mimeType: format.mimeType, videoBitsPerSecond });
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    recorder.onerror = () => {
      this.onError?.('Recording stopped unexpectedly.');
      this.finish();
    };
    recorder.onstop = () => this.finish();
    recorder.start(1000); // timeslice keeps memory predictable and survives abrupt stops
    this.recorder = recorder;
    return { ...format, startedAt: Date.now() };
  }

  stop(): Promise<CaptureResult | null> {
    return new Promise((resolve) => {
      if (!this.recorder || this.recorder.state === 'inactive') {
        resolve(null);
        return;
      }
      this.stopResolver = resolve;
      try {
        this.recorder.requestData();
      } catch {
        /* not all engines allow requestData right before stop */
      }
      this.recorder.stop();
    });
  }

  private finish(): void {
    const format = this.format;
    const chunks = this.chunks;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
    const resolve = this.stopResolver;
    this.stopResolver = null;
    if (!resolve) return;
    if (!format || chunks.length === 0) {
      resolve(null);
      return;
    }
    const type = chunks[0].type || format.mimeType;
    const blob = new Blob(chunks, { type });
    const extension = type.includes('mp4') ? 'mp4' : type.includes('webm') ? 'webm' : format.extension;
    resolve({
      kind: 'video',
      blob,
      url: URL.createObjectURL(blob),
      filename: timestampedName('video', extension),
      mimeType: type,
    });
  }

  /** Hard stop used on unmount; discards any data. */
  dispose(): void {
    this.stopResolver = null;
    try {
      if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}
