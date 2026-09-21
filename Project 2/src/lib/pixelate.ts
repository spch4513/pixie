import type { CameraTransform, Rect } from '../types';
import { clamp, viewRectToSource } from './transform';

/** Reference box side (CSS px) at which the slider's base cell size applies unchanged. */
const REFERENCE_SIDE = 240;
/** How strongly box size drives chunkiness: 0 = not at all, 1 = linear. */
const SIZE_EXPONENT = 0.6;
const MIN_CELL_CSS = 3;
const MIN_CELLS_ACROSS = 3;
const MAX_CELLS = 160;

/**
 * Pixel cell size in CSS px for a box and a Pixel Detail setting.
 *
 *   t        = detail slider, 0 (fine) … 1 (chunky)
 *   base(t)  = 4 + 28 · t^1.35             cell size for a 240 px box
 *   side     = √(width · height)            box "size", aspect-independent
 *   cell     = base(t) · (side / 240)^0.6   bigger boxes → chunkier, smaller → finer
 *   clamped to [3 px, shortSide / 3]        always ≥ 3 cells across, never sub-3 px
 *
 * The sub-linear exponent means a box 4× larger gets cells ~2.3× larger — it reads as
 * chunkier without turning into a handful of blocks.
 */
export function cellSizeCss(width: number, height: number, detail: number): number {
  const t = clamp(detail, 0, 1);
  const base = 4 + 28 * Math.pow(t, 1.35);
  const side = Math.sqrt(Math.max(1, width * height));
  const cell = base * Math.pow(side / REFERENCE_SIDE, SIZE_EXPONENT);
  return clamp(cell, MIN_CELL_CSS, Math.max(MIN_CELL_CSS, Math.min(width, height) / MIN_CELLS_ACROSS));
}

export interface PixelInfo {
  cols: number;
  rows: number;
  /** Cell size in output pixels (integer, so every cell is an exact square). */
  cell: number;
  /** The pixelated region on the output canvas (output px, unmirrored screen orientation). */
  output: Rect;
  /** The same region in view CSS px — this is what the overlay outlines. */
  view: Rect;
  /** The cropped region of the source video frame (source px). */
  source: Rect;
}

export class PixelRenderer {
  private readonly low: HTMLCanvasElement;
  private readonly lowCtx: CanvasRenderingContext2D;
  readonly info: PixelInfo = {
    cols: 0,
    rows: 0,
    cell: 0,
    output: { x: 0, y: 0, width: 0, height: 0 },
    view: { x: 0, y: 0, width: 0, height: 0 },
    source: { x: 0, y: 0, width: 0, height: 0 },
  };

  constructor() {
    this.low = document.createElement('canvas');
    this.low.width = 64;
    this.low.height = 64;
    const ctx = this.low.getContext('2d', { alpha: false, willReadFrequently: false });
    if (!ctx) throw new Error('2D canvas unavailable');
    this.lowCtx = ctx;
  }

  /** Grows (never shrinks) the scratch canvas, so it is not reallocated every frame. */
  private ensureCapacity(cols: number, rows: number): void {
    if (cols <= this.low.width && rows <= this.low.height) return;
    this.low.width = Math.max(this.low.width, Math.ceil(cols / 32) * 32);
    this.low.height = Math.max(this.low.height, Math.ceil(rows / 32) * 32);
  }

  /**
   * Pixelates `viewRect` of the current frame onto `ctx` (the output canvas):
   * 1) snap the rect to a whole number of square output-pixel cells,
   * 2) map that exact region back to source-video pixels,
   * 3) downsample the source crop to cols×rows (smoothing ON = true colour averaging),
   * 4) upscale into the output rect with smoothing OFF = crisp blocks.
   */
  render(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, t: CameraTransform, viewRect: Rect, detail: number): PixelInfo {
    const os = t.outputScale;
    const outW = t.output.width;
    const outH = t.output.height;

    let cell = Math.max(2, Math.round(cellSizeCss(viewRect.width, viewRect.height, detail) * os));
    const rw = viewRect.width * os;
    const rh = viewRect.height * os;
    // Performance guard: never more than MAX_CELLS along an edge.
    cell = Math.max(cell, Math.ceil(Math.max(rw, rh) / MAX_CELLS));
    let cols = Math.max(MIN_CELLS_ACROSS, Math.round(rw / cell));
    let rows = Math.max(MIN_CELLS_ACROSS, Math.round(rh / cell));
    while (cols * cell > outW && cols > 1) cols--;
    while (rows * cell > outH && rows > 1) rows--;

    const w = cols * cell;
    const h = rows * cell;
    const x = clamp(Math.round(viewRect.x * os + (rw - w) / 2), 0, outW - w);
    const y = clamp(Math.round(viewRect.y * os + (rh - h) / 2), 0, outH - h);

    const info = this.info;
    info.cols = cols;
    info.rows = rows;
    info.cell = cell;
    info.output.x = x;
    info.output.y = y;
    info.output.width = w;
    info.output.height = h;
    info.view.x = x / os;
    info.view.y = y / os;
    info.view.width = w / os;
    info.view.height = h / os;
    viewRectToSource(t, info.view, info.source);

    // Float error can nudge the crop past the frame edge; Safari rejects out-of-bounds source rects.
    const s = info.source;
    s.x = clamp(s.x, 0, t.video.width - 1);
    s.y = clamp(s.y, 0, t.video.height - 1);
    s.width = Math.max(1, Math.min(s.width, t.video.width - s.x));
    s.height = Math.max(1, Math.min(s.height, t.video.height - s.y));
    this.ensureCapacity(cols, rows);
    const lc = this.lowCtx;
    lc.imageSmoothingEnabled = true;
    lc.imageSmoothingQuality = 'high';
    lc.drawImage(video, s.x, s.y, s.width, s.height, 0, 0, cols, rows);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (t.mirrored) {
      // The low-res tile holds unmirrored source content; flip it into the mirrored output.
      ctx.setTransform(-1, 0, 0, 1, outW, 0);
      ctx.drawImage(this.low, 0, 0, cols, rows, outW - x - w, y, w, h);
    } else {
      ctx.drawImage(this.low, 0, 0, cols, rows, x, y, w, h);
    }
    ctx.restore();
    return info;
  }

  dispose(): void {
    this.low.width = 0;
    this.low.height = 0;
  }
}

/**
 * Draws the visible (cover-cropped) part of the camera frame to the output canvas, mirrored
 * for the selfie camera, then the pixel region on top. The result is exactly what is
 * shown, photographed and recorded.
 */
export function composeFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  t: CameraTransform,
  renderer: PixelRenderer,
  selection: Rect | null,
  detail: number,
): PixelInfo | null {
  const { crop, output } = t;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  if (t.mirrored) ctx.setTransform(-1, 0, 0, 1, output.width, 0);
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, output.width, output.height);
  ctx.restore();
  if (!selection || selection.width < 1 || selection.height < 1) return null;
  return renderer.render(ctx, video, t, selection, detail);
}
