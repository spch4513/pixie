import type { HandData, PinchInput, Rect, Size } from '../types';
import { HAND_CONNECTIONS, LANDMARK } from './handTracker';

const INK = '#0a0a0a';
const PAPER = '#ffffff';
const LABEL_FONT = '600 10px "IBM Plex Mono", ui-monospace, Menlo, monospace';

export interface OverlayFrame {
  view: Size;
  /** The exact pixelated region (view px), or null when there is no selection. */
  box: Rect | null;
  locked: boolean;
  /** 0..1 emphasis while moving/resizing (drives dim + label). */
  editAmount: number;
  cells: { cols: number; rows: number } | null;
  hands: readonly HandData[];
  pointers: readonly PinchInput[];
  debug: boolean;
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.rect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, view: Size, inverted: boolean): { x: number; y: number } {
  ctx.font = LABEL_FONT;
  const padX = 6;
  const h = 18;
  const w = Math.ceil(ctx.measureText(text).width) + padX * 2;
  const lx = Math.max(0, Math.min(x, view.width - w));
  const ly = Math.max(0, Math.min(y, view.height - h));
  ctx.fillStyle = inverted ? PAPER : INK;
  ctx.fillRect(lx, ly, w, h);
  ctx.strokeStyle = inverted ? INK : PAPER;
  ctx.lineWidth = 1;
  ctx.strokeRect(lx + 0.5, ly + 0.5, w - 1, h - 1);
  ctx.fillStyle = inverted ? INK : PAPER;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, lx + padX, ly + h / 2 + 0.5);
  return { x: lx, y: ly };
}

function drawPadlock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  // 10×12 pixel-style padlock glyph so "locked" isn't signalled by colour alone.
  ctx.fillStyle = INK;
  ctx.fillRect(x - 1, y - 1, 12, 14);
  ctx.fillStyle = PAPER;
  ctx.fillRect(x, y + 5, 10, 7);
  ctx.fillRect(x + 2, y, 6, 2);
  ctx.fillRect(x + 1, y + 1, 2, 4);
  ctx.fillRect(x + 7, y + 1, 2, 4);
  ctx.fillStyle = INK;
  ctx.fillRect(x + 4, y + 7, 2, 3);
}

function drawSelection(ctx: CanvasRenderingContext2D, f: OverlayFrame): void {
  const b = f.box!;
  const { width: W, height: H } = f.view;

  // Dim everything outside the box; stronger while editing.
  const dim = 0.12 + 0.33 * f.editAmount;
  ctx.fillStyle = `rgba(0,0,0,${dim.toFixed(3)})`;
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.rect(b.x, b.y, b.width, b.height);
  ctx.fill('evenodd');

  // Double outline (black under white) stays visible on any camera content.
  ctx.beginPath();
  roundRectPath(ctx, b.x - 1, b.y - 1, b.width + 2, b.height + 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.strokeStyle = PAPER;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Halftone accent: a row of dots just inside the border.
  const inset = 5;
  const step = 7;
  const dotAlpha = 0.35 + 0.5 * f.editAmount;
  ctx.fillStyle = `rgba(255,255,255,${dotAlpha.toFixed(3)})`;
  const x0 = b.x + inset;
  const x1 = b.x + b.width - inset;
  const y0 = b.y + inset;
  const y1 = b.y + b.height - inset;
  if (x1 - x0 > 20 && y1 - y0 > 20) {
    for (let x = x0 + step; x < x1 - step / 2; x += step) {
      ctx.fillRect(x - 0.75, y0 - 0.75, 1.5, 1.5);
      ctx.fillRect(x - 0.75, y1 - 0.75, 1.5, 1.5);
    }
    for (let y = y0 + step; y < y1 - step / 2; y += step) {
      ctx.fillRect(x0 - 0.75, y - 0.75, 1.5, 1.5);
      ctx.fillRect(x1 - 0.75, y - 0.75, 1.5, 1.5);
    }
  }

  // Corner brackets with square handles.
  const len = Math.min(18, b.width / 3, b.height / 3);
  const o = 4;
  const corners: Array<[number, number, number, number]> = [
    [b.x - o, b.y - o, 1, 1],
    [b.x + b.width + o, b.y - o, -1, 1],
    [b.x - o, b.y + b.height + o, 1, -1],
    [b.x + b.width + o, b.y + b.height + o, -1, -1],
  ];
  for (const [cx, cy, sx, sy] of corners) {
    ctx.fillStyle = INK;
    ctx.fillRect(Math.min(cx, cx + sx * len) - 1, Math.min(cy, cy + sy * 3) - 1, len + 2, 5);
    ctx.fillRect(Math.min(cx, cx + sx * 3) - 1, Math.min(cy, cy + sy * len) - 1, 5, len + 2);
    ctx.fillStyle = PAPER;
    ctx.fillRect(Math.min(cx, cx + sx * len), Math.min(cy, cy + sy * 3), len, 3);
    ctx.fillRect(Math.min(cx, cx + sx * 3), Math.min(cy, cy + sy * len), 3, len);
  }

  // Labels.
  const labelY = b.y - 28 >= 0 ? b.y - 28 : b.y + b.height + 10;
  if (f.locked) {
    const at = drawLabel(ctx, '   LOCKED', b.x - o, labelY, f.view, true);
    drawPadlock(ctx, at.x + 6, at.y + 3);
  } else if (f.editAmount > 0.02) {
    ctx.globalAlpha = Math.min(1, f.editAmount * 1.4);
    const cells = f.cells ? `  ${f.cells.cols}×${f.cells.rows}` : '';
    drawLabel(ctx, `PIXIE AREA${cells}`, b.x - o, labelY, f.view, false);
    ctx.globalAlpha = 1;
  }
}

/** Small reticle at each hand's pinch point: open ring = ready, filled square = pinching. */
function drawCursors(ctx: CanvasRenderingContext2D, f: OverlayFrame): void {
  for (const hand of f.hands) {
    if (hand.stale) continue;
    const p = hand.pinch;
    const m = p.midpoint;
    ctx.globalAlpha = f.locked ? 0.45 : 1;
    if (p.active) {
      ctx.fillStyle = INK;
      ctx.fillRect(m.x - 7, m.y - 7, 14, 14);
      ctx.fillStyle = PAPER;
      ctx.fillRect(m.x - 5, m.y - 5, 10, 10);
      ctx.fillStyle = INK;
      ctx.fillRect(m.x - 2, m.y - 2, 4, 4);
    } else {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 9, 0, Math.PI * 2);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.strokeStyle = PAPER;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  for (const ptr of f.pointers) {
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = INK;
    ctx.fillRect(ptr.point.x - 6, ptr.point.y - 6, 12, 12);
    ctx.fillStyle = PAPER;
    ctx.fillRect(ptr.point.x - 4, ptr.point.y - 4, 8, 8);
  }
  ctx.globalAlpha = 1;
}

function drawDebugHands(ctx: CanvasRenderingContext2D, hands: readonly HandData[]): void {
  ctx.font = '10px "IBM Plex Mono", ui-monospace, monospace';
  ctx.textBaseline = 'top';
  for (const hand of hands) {
    const v = hand.viewLandmarks;
    ctx.globalAlpha = hand.stale ? 0.4 : 1;
    ctx.strokeStyle = '#00e5ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(v[a].x, v[a].y);
      ctx.lineTo(v[b].x, v[b].y);
    }
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < v.length; i++) ctx.fillRect(v[i].x - 2, v[i].y - 2, 4, 4);

    const p = hand.pinch;
    ctx.fillStyle = '#ffea00';
    ctx.fillRect(p.thumb.x - 4, p.thumb.y - 4, 8, 8);
    ctx.fillRect(p.index.x - 4, p.index.y - 4, 8, 8);
    ctx.strokeStyle = p.active ? '#ff3b30' : '#ffea00';
    ctx.beginPath();
    ctx.moveTo(p.thumb.x, p.thumb.y);
    ctx.lineTo(p.index.x, p.index.y);
    ctx.stroke();
    ctx.fillStyle = p.active ? '#ff3b30' : '#ffffff';
    ctx.beginPath();
    ctx.arc(p.midpoint.x, p.midpoint.y, 5, 0, Math.PI * 2);
    ctx.fill();

    const w = v[LANDMARK.WRIST];
    const tip = hand.landmarks[LANDMARK.INDEX_TIP];
    const label = `#${hand.id} ${hand.handedness || '?'} ${p.active ? 'PINCH' : 'open'} r=${p.ratio.toFixed(2)}${
      tip ? ` idx(${tip.x.toFixed(3)},${tip.y.toFixed(3)})` : ''
    }`;
    const tw = ctx.measureText(label).width + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(w.x - tw / 2, w.y + 10, tw, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, w.x - tw / 2 + 4, w.y + 13);
  }
  ctx.globalAlpha = 1;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, dpr: number, f: OverlayFrame): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (f.box) drawSelection(ctx, f);
  drawCursors(ctx, f);
  if (f.debug) drawDebugHands(ctx, f.hands);
}
