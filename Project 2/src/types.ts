// Shared models. All "view" coordinates are CSS pixels relative to the camera stage's
// top-left corner, exactly as the user sees the (possibly mirrored) preview.

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type CameraFacing = 'user' | 'environment';

/**
 * Describes how the intrinsic video frame is mapped onto the visible stage with
 * `object-fit: cover` semantics, plus the resolution of the composited output canvas.
 */
export interface CameraTransform {
  /** Intrinsic camera frame size (source pixels). */
  video: Size;
  /** Visible stage size (CSS pixels). */
  view: Size;
  /** Source pixels → CSS pixels scale factor (cover = max of the two axis ratios). */
  scale: number;
  /** Offset of the scaled video's top-left corner within the stage (≤ 0 when cropped). */
  offset: Point;
  /** The part of the source frame that is actually visible, in source pixels (unmirrored). */
  crop: Rect;
  /** True when the preview is horizontally flipped (selfie camera). */
  mirrored: boolean;
  /** Composited output canvas size in device pixels (same aspect as `view`). */
  output: Size;
  /** Output pixels per CSS pixel. */
  outputScale: number;
}

export interface PinchData {
  /** Whether the hand is currently considered pinching (after hysteresis/debounce). */
  active: boolean;
  /** Thumb–index distance divided by palm size (scale-invariant). */
  ratio: number;
  /** Raw thumb tip in view coordinates. */
  thumb: Point;
  /** Raw index tip in view coordinates. */
  index: Point;
  /** Smoothed midpoint between thumb and index tips (view coordinates). */
  midpoint: Point;
}

export interface NormalizedLandmarkLite {
  x: number;
  y: number;
  z: number;
}

export interface HandData {
  /** Stable id for the lifetime of a tracked hand. */
  id: number;
  handedness: string;
  /** Landmarks normalised to the source video frame (0..1, unmirrored). */
  landmarks: NormalizedLandmarkLite[];
  /** Landmarks projected into view coordinates (mirroring + cover crop applied). */
  viewLandmarks: Point[];
  pinch: PinchData;
  /** performance.now() of the last detection that saw this hand. */
  lastSeen: number;
  /** True while the hand is briefly missing but kept alive by the grace period. */
  stale: boolean;
}

export type GestureMode = 'idle' | 'tracking' | 'dragging' | 'drawing' | 'resizing' | 'locked';

/** Anything that can act like a pinch: a hand, or a touch/mouse pointer fallback. */
export interface PinchInput {
  id: string;
  point: Point;
  /** Where this input first went down, when known (touch/mouse). */
  start?: Point;
}

export interface ResizeBaseline {
  width: number;
  height: number;
  center: Point;
  /** Horizontal / vertical spread between the two pinches when resizing began. */
  spreadX: number;
  spreadY: number;
  /** Midpoint between the two pinches when resizing began. */
  mid: Point;
  inputIds: [string, string];
}

export interface GestureState {
  mode: GestureMode;
  /** Offset from the grabbing pinch to the box centre while dragging. */
  grabOffset: Point | null;
  dragInputId: string | null;
  /** Where a one-hand pinch started; the fixed corner while drawing a rectangle. */
  anchor: Point | null;
  resize: ResizeBaseline | null;
}

export interface SelectionState {
  /** Where gestures want the box to be. */
  target: Rect | null;
  /** Smoothed rect that is actually rendered. */
  display: Rect | null;
  locked: boolean;
}

export type RecordingStatus = 'idle' | 'recording' | 'stopping';

export interface RecordingState {
  status: RecordingStatus;
  startedAt: number | null;
  mimeType: string | null;
  extension: string | null;
}

export interface CaptureResult {
  kind: 'photo' | 'video';
  blob: Blob;
  url: string;
  filename: string;
  mimeType: string;
}

export type PixieErrorKind =
  | 'insecure-context'
  | 'unsupported-browser'
  | 'permission-denied'
  | 'camera-unavailable'
  | 'camera-in-use'
  | 'stream-interrupted'
  | 'switch-failed'
  | 'tracking-failed'
  | 'recording-unsupported'
  | 'capture-failed'
  | 'unknown';

export interface PixieError {
  kind: PixieErrorKind;
  title: string;
  message: string;
}
