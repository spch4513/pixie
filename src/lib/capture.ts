import type { CaptureResult } from '../types';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** pixie-photo-YYYYMMDD-HHMMSS.png */
export function timestampedName(kind: 'photo' | 'video', extension: string, date = new Date()): string {
  const d = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `pixie-${kind}-${d}-${t}.${extension}`;
}

export function capturePhoto(canvas: HTMLCanvasElement): Promise<CaptureResult> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new Error('Image export is not supported in this browser.'));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('The photo could not be encoded.'));
        return;
      }
      resolve({
        kind: 'photo',
        blob,
        url: URL.createObjectURL(blob),
        filename: timestampedName('photo', 'png'),
        mimeType: 'image/png',
      });
    }, 'image/png');
  });
}

export function downloadCapture(capture: CaptureResult): void {
  const a = document.createElement('a');
  a.href = capture.url;
  a.download = capture.filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function fileFor(capture: CaptureResult): File | null {
  try {
    return new File([capture.blob], capture.filename, { type: capture.mimeType.split(';')[0] });
  } catch {
    return null;
  }
}

export function canShareCapture(capture: CaptureResult): boolean {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  const file = fileFor(capture);
  if (!file) return false;
  try {
    return navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Returns 'shared', 'cancelled', or 'fallback' (share failed → caller should download). */
export async function shareCapture(capture: CaptureResult): Promise<'shared' | 'cancelled' | 'fallback'> {
  const file = fileFor(capture);
  if (!file || !canShareCapture(capture)) return 'fallback';
  try {
    await navigator.share({ files: [file], title: 'Pixie', text: 'Pinch reality into pixels.' });
    return 'shared';
  } catch (err) {
    return (err as DOMException)?.name === 'AbortError' ? 'cancelled' : 'fallback';
  }
}

export function releaseCapture(capture: CaptureResult | null): void {
  if (capture) URL.revokeObjectURL(capture.url);
}
