import type { CameraFacing, PixieError } from '../types';

export interface CameraSession {
  stream: MediaStream;
  track: MediaStreamTrack;
  /** The facing the user asked for. */
  facing: CameraFacing;
  /** Selfie previews are mirrored like a mirror; rear previews show the true view. */
  mirrored: boolean;
}

export function cameraSupportError(): PixieError | null {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return {
      kind: 'insecure-context',
      title: 'Camera needs a secure connection',
      message: 'Browsers only allow camera access over HTTPS or on localhost. Open Pixie from an https:// address and try again.',
    };
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      kind: 'unsupported-browser',
      title: 'This browser can’t open the camera',
      message: 'Pixie needs camera access from the browser. Try a current version of Safari, Chrome, Edge or Firefox.',
    };
  }
  return null;
}

function constraintsFor(facing: CameraFacing, strict: boolean): MediaStreamConstraints {
  return {
    audio: false,
    video: {
      facingMode: strict ? { exact: facing } : { ideal: facing },
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 30, max: 60 },
    },
  };
}

/**
 * Opens a camera. We try `ideal` facing first (works on laptops with a single webcam),
 * and fall back to no facing constraint at all if the device rejects it.
 */
export async function openCamera(facing: CameraFacing): Promise<CameraSession> {
  const support = cameraSupportError();
  if (support) throw support;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraintsFor(facing, false));
  } catch (err) {
    const name = (err as DOMException)?.name;
    if (name === 'OverconstrainedError') {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: true }).catch((e) => {
        throw toCameraError(e);
      });
    } else {
      throw toCameraError(err);
    }
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    stopStream(stream);
    throw toCameraError(new DOMException('No video track', 'NotFoundError'));
  }
  // Laptops rarely report facingMode; trust the user's choice in that case.
  const reported = track.getSettings().facingMode;
  const actual: CameraFacing = reported === 'user' || reported === 'environment' ? reported : facing;
  return { stream, track, facing, mirrored: actual === 'user' };
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export function toCameraError(err: unknown): PixieError {
  if (err && typeof err === 'object' && 'kind' in err && 'title' in err) return err as PixieError;
  const name = (err as DOMException)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return {
        kind: 'permission-denied',
        title: 'Camera access is blocked',
        message:
          'Pixie can’t see anything without the camera. Allow camera access in your browser’s site settings (the icon next to the address bar), then try again.',
      };
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return {
        kind: 'camera-unavailable',
        title: 'No camera found',
        message: 'We couldn’t find a camera on this device. Connect one or try the other camera.',
      };
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return {
        kind: 'camera-in-use',
        title: 'Camera is busy',
        message: 'Another app or tab may be using the camera. Close it and try again.',
      };
    default:
      return {
        kind: 'unknown',
        title: 'Camera didn’t start',
        message: 'Something went wrong while opening the camera. Try again, or reload the page.',
      };
  }
}
