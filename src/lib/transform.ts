import type { CameraTransform, Point, Rect, Size } from '../types';

/** Longest edge of the composited output canvas. Keeps encode/export cost bounded. */
const MAX_OUTPUT_EDGE = 1600;

/**
 * Builds the video → view mapping for an `object-fit: cover` preview.
 *
 * The video is scaled uniformly by `scale = max(viewW / videoW, viewH / videoH)` and centred,
 * so one axis overflows and is cropped equally on both sides. `crop` is the visible part of
 * the source frame. When mirrored, the whole *view* is flipped horizontally around its centre,
 * i.e. view.x = viewW − unmirroredX. Everything else (landmarks, selection, pixelation, export)
 * goes through the helpers below so they all agree on this single mapping.
 */
export function computeCameraTransform(
  video: Size,
  view: Size,
  mirrored: boolean,
  devicePixelRatio: number,
): CameraTransform {
  const vw = Math.max(1, video.width);
  const vh = Math.max(1, video.height);
  const W = Math.max(1, view.width);
  const H = Math.max(1, view.height);

  const scale = Math.max(W / vw, H / vh);
  const offset = { x: (W - vw * scale) / 2, y: (H - vh * scale) / 2 };
  const crop = { x: -offset.x / scale, y: -offset.y / scale, width: W / scale, height: H / scale };

  // Output resolution (same aspect as the view): follow the source's density, but allow up
  // to 2× so pixel-cell edges stay crisp on high-DPR screens; never above the display's DPR,
  // and capped at MAX_OUTPUT_EDGE for encoder/memory friendliness.
  const sourceDensity = crop.width / W; // source px per CSS px
  let outputScale = Math.min(devicePixelRatio, Math.max(2, sourceDensity));
  outputScale = Math.min(outputScale, MAX_OUTPUT_EDGE / Math.max(W, H));
  outputScale = Math.max(outputScale, 0.25);
  const output = {
    width: Math.max(2, Math.round((W * outputScale) / 2) * 2),
    height: Math.max(2, Math.round((H * outputScale) / 2) * 2),
  };
  // Re-derive the exact scale from the rounded size to avoid sub-pixel drift.
  outputScale = output.width / W;

  return { video: { width: vw, height: vh }, view: { width: W, height: H }, scale, offset, crop, mirrored, output, outputScale };
}

/** Normalised landmark (0..1 of the source frame) → view CSS pixels. */
export function normalizedToView(t: CameraTransform, nx: number, ny: number, out: Point = { x: 0, y: 0 }): Point {
  const x = t.offset.x + nx * t.video.width * t.scale;
  out.x = t.mirrored ? t.view.width - x : x;
  out.y = t.offset.y + ny * t.video.height * t.scale;
  return out;
}

/** View CSS pixel → source video pixel. */
export function viewToSource(t: CameraTransform, p: Point): Point {
  const ux = t.mirrored ? t.view.width - p.x : p.x;
  return { x: (ux - t.offset.x) / t.scale, y: (p.y - t.offset.y) / t.scale };
}

/**
 * View rect → source rect. Mirroring flips which view edge maps to the source's left edge,
 * so the source x starts at the view rect's *right* edge when mirrored.
 */
export function viewRectToSource(t: CameraTransform, r: Rect, out: Rect = { x: 0, y: 0, width: 0, height: 0 }): Rect {
  const leftView = t.mirrored ? t.view.width - (r.x + r.width) : r.x;
  out.x = (leftView - t.offset.x) / t.scale;
  out.y = (r.y - t.offset.y) / t.scale;
  out.width = r.width / t.scale;
  out.height = r.height / t.scale;
  return out;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function rectCenter(r: Rect): Point {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export function rectFromCenter(c: Point, width: number, height: number): Rect {
  return { x: c.x - width / 2, y: c.y - height / 2, width, height };
}

/** Shifts (never shrinks unless larger than the view) a rect so it lies fully inside the view. */
export function clampRectToView(r: Rect, view: Size): Rect {
  const width = Math.min(r.width, view.width);
  const height = Math.min(r.height, view.height);
  return {
    x: clamp(r.x, 0, view.width - width),
    y: clamp(r.y, 0, view.height - height),
    width,
    height,
  };
}

export function pointInRect(p: Point, r: Rect, margin = 0): boolean {
  return p.x >= r.x - margin && p.x <= r.x + r.width + margin && p.y >= r.y - margin && p.y <= r.y + r.height + margin;
}
