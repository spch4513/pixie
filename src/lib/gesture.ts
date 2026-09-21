import type { GestureState, PinchInput, Point, Rect, SelectionState, Size } from '../types';
import { approachFactor } from './filters';
import { clamp, clampRectToView, distance, pointInRect, rectCenter, rectFromCenter } from './transform';

const DEFAULT_SIDE = 0.44; // default box side for a quick pinch, fraction of the view's short side
const MIN_SIDE_PX = 48;
const MIN_SIDE_FRACTION = 0.08;
const GRAB_MARGIN = 0.2; // pinches this close to the box (fraction of its short side) grab it
const DRAW_THRESHOLD = 28; // px a fresh pinch must travel before it starts drawing a rectangle
const FOLLOW_MS = 28; // display → target time constant (low = snappy)

/**
 * Gesture state machine (view coordinates, CSS px).
 *
 *                  ┌── on/near box ──▶ dragging (move, size kept)
 *   idle ──pinch──┤
 *                  └── elsewhere ───▶ placing ──moves > 28px──▶ drawing (rect from anchor to pinch)
 *   any one-hand state ──2nd pinch──▶ resizing (width/height follow the hands independently)
 *   resizing ──one released──▶ dragging     locked: ignores all inputs
 *
 * A pinch that is already held when the box gets locked, unlocked or cleared is "suppressed"
 * until released, so toggling state never makes the box leap to a hand mid-pinch.
 * Transitions re-baseline from the current *target* rect, so the box never jumps.
 */
export class GestureMachine {
  readonly state: GestureState = { mode: 'idle', grabOffset: null, dragInputId: null, anchor: null, resize: null };
  readonly selection: SelectionState = { target: null, display: null, locked: false };
  private readonly suppressed = new Set<string>();
  private readonly seen = new Set<string>();
  private readonly active: PinchInput[] = [];
  private view: Size = { width: 1, height: 1 };

  /** True while a gesture is actively moving/resizing the box. */
  get editing(): boolean {
    const m = this.state.mode;
    return m === 'dragging' || m === 'drawing' || m === 'resizing';
  }

  setView(next: Size): void {
    const prev = this.view;
    this.view = { width: next.width, height: next.height };
    if (prev.width <= 1 || !this.selection.target) return;
    // Keep the box at the same relative spot and relative size so rotation/resizing never drifts it.
    const k = Math.min(next.width, next.height) / Math.min(prev.width, prev.height);
    const remap = (r: Rect): Rect => {
      const c = rectCenter(r);
      return this.fit(rectFromCenter({ x: (c.x / prev.width) * next.width, y: (c.y / prev.height) * next.height }, r.width * k, r.height * k));
    };
    this.selection.target = remap(this.selection.target);
    this.selection.display = this.selection.display ? remap(this.selection.display) : this.selection.target;
    this.endGesture();
  }

  setLocked(locked: boolean, heldInputs: readonly PinchInput[]): void {
    this.selection.locked = locked;
    this.suppress(heldInputs);
    this.endGesture();
  }

  clear(heldInputs: readonly PinchInput[]): void {
    this.selection.target = null;
    this.selection.display = null;
    this.suppress(heldInputs);
    this.endGesture();
  }

  update(inputs: readonly PinchInput[], handsVisible: boolean, dtMs: number): void {
    // Forget suppression for inputs that were released.
    this.seen.clear();
    for (const i of inputs) this.seen.add(i.id);
    for (const id of this.suppressed) if (!this.seen.has(id)) this.suppressed.delete(id);

    if (this.selection.locked) {
      this.state.mode = 'locked';
      this.state.resize = null;
      this.state.dragInputId = null;
      this.state.anchor = null;
    } else {
      const active = this.active;
      active.length = 0;
      for (const i of inputs) if (!this.suppressed.has(i.id)) active.push(i);
      if (active.length >= 2) this.resize(active[0], active[1]);
      else if (active.length === 1) this.oneHand(active[0]);
      else {
        this.endGesture();
        this.state.mode = handsVisible ? 'tracking' : 'idle';
      }
    }
    this.follow(dtMs);
  }

  private suppress(inputs: readonly PinchInput[]): void {
    for (const i of inputs) this.suppressed.add(i.id);
  }

  private endGesture(): void {
    this.state.mode = this.selection.locked ? 'locked' : 'idle';
    this.state.grabOffset = null;
    this.state.dragInputId = null;
    this.state.anchor = null;
    this.state.resize = null;
  }

  private minSide(): number {
    return Math.max(MIN_SIDE_PX, Math.min(this.view.width, this.view.height) * MIN_SIDE_FRACTION);
  }

  private fit(r: Rect): Rect {
    const min = this.minSide();
    const width = clamp(r.width, Math.min(min, this.view.width), this.view.width);
    const height = clamp(r.height, Math.min(min, this.view.height), this.view.height);
    return clampRectToView(rectFromCenter(rectCenter(r), width, height), this.view);
  }

  /** Rectangle with one fixed corner at `anchor` and the opposite corner at `p` (≥ min size). */
  private cornerRect(anchor: Point, p: Point): Rect {
    const min = this.minSide();
    const { width: W, height: H } = this.view;
    // Clip to the frame (so the anchored corner stays put when you pull past an edge)…
    const x0 = clamp(Math.min(anchor.x, p.x), 0, W);
    const x1 = clamp(Math.max(anchor.x, p.x), 0, W);
    const y0 = clamp(Math.min(anchor.y, p.y), 0, H);
    const y1 = clamp(Math.max(anchor.y, p.y), 0, H);
    const r = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    // …then grow any too-thin side away from the anchor.
    if (r.width < min) {
      r.width = min;
      r.x = p.x >= anchor.x ? x0 : x1 - min;
    }
    if (r.height < min) {
      r.height = min;
      r.y = p.y >= anchor.y ? y0 : y1 - min;
    }
    return clampRectToView(r, this.view);
  }

  private oneHand(input: PinchInput): void {
    const s = this.state;
    const sel = this.selection;
    const p = input.point;
    const continuing = s.dragInputId === input.id;

    if (!continuing || s.mode === 'resizing') {
      const origin = input.start ?? p; // where the pinch/press began, even if it already moved
      s.dragInputId = input.id;
      s.resize = null;
      if (s.mode === 'resizing' && sel.target) {
        // Second hand released: keep dragging with the remaining one from where the box is now.
        const c = rectCenter(sel.target);
        s.mode = 'dragging';
        s.grabOffset = { x: c.x - p.x, y: c.y - p.y };
        s.anchor = null;
      } else if (sel.target && pointInRect(origin, sel.target, GRAB_MARGIN * Math.min(sel.target.width, sel.target.height))) {
        // Pinch on/near the box: grab and move it.
        const c = rectCenter(sel.target);
        s.mode = 'dragging';
        s.grabOffset = { x: c.x - origin.x, y: c.y - origin.y };
        s.anchor = null;
      } else {
        // Pinch elsewhere: drop a default box here; if the pinch then travels, draw a rectangle.
        const side = Math.min(this.view.width, this.view.height) * DEFAULT_SIDE;
        const size = sel.target ? { w: sel.target.width, h: sel.target.height } : { w: side, h: side };
        sel.target = this.fit(rectFromCenter(origin, size.w, size.h));
        if (!sel.display) sel.display = { ...sel.target };
        s.mode = 'dragging';
        s.grabOffset = { x: 0, y: 0 };
        s.anchor = { x: origin.x, y: origin.y };
      }
    }

    if (s.anchor && s.mode === 'dragging' && distance(s.anchor, p) > DRAW_THRESHOLD) s.mode = 'drawing';

    if (s.mode === 'drawing' && s.anchor) {
      sel.target = this.cornerRect(s.anchor, p);
    } else {
      const off = s.grabOffset ?? { x: 0, y: 0 };
      const t = sel.target!;
      sel.target = this.fit(rectFromCenter({ x: p.x + off.x, y: p.y + off.y }, t.width, t.height));
    }
  }

  /**
   * Two hands: width follows the horizontal spread between the pinches and height the vertical
   * spread, independently, so the box becomes whatever rectangle your hands describe. Changes are
   * applied relative to a baseline captured when the second pinch appeared, so it never jumps; the
   * box also travels with the midpoint of your hands.
   */
  private resize(a: PinchInput, b: PinchInput): void {
    const s = this.state;
    const sel = this.selection;
    const spreadX = Math.abs(a.point.x - b.point.x);
    const spreadY = Math.abs(a.point.y - b.point.y);
    const mid: Point = { x: (a.point.x + b.point.x) / 2, y: (a.point.y + b.point.y) / 2 };
    const sameHands = s.resize && s.resize.inputIds[0] === a.id && s.resize.inputIds[1] === b.id;

    if (s.mode !== 'resizing' || !sameHands) {
      if (!sel.target) {
        // No box yet: the two pinches are its opposite corners.
        const min = this.minSide();
        sel.target = this.fit(rectFromCenter(mid, Math.max(spreadX, min), Math.max(spreadY, min)));
        sel.display = { ...sel.target };
      }
      const t = sel.target;
      s.resize = { width: t.width, height: t.height, center: rectCenter(t), spreadX, spreadY, mid, inputIds: [a.id, b.id] };
    }

    s.mode = 'resizing';
    s.dragInputId = null;
    s.grabOffset = null;
    s.anchor = null;
    const base = s.resize!;
    const width = base.width + (spreadX - base.spreadX);
    const height = base.height + (spreadY - base.spreadY);
    const center = { x: base.center.x + (mid.x - base.mid.x), y: base.center.y + (mid.y - base.mid.y) };
    sel.target = this.fit(rectFromCenter(center, width, height));
  }

  /** Eases the rendered rect toward the target (frame-rate independent). */
  private follow(dtMs: number): void {
    const { target } = this.selection;
    if (!target) {
      this.selection.display = null;
      return;
    }
    const d = this.selection.display;
    if (!d) {
      this.selection.display = { ...target };
      return;
    }
    const f = approachFactor(dtMs, FOLLOW_MS);
    d.x += (target.x - d.x) * f;
    d.y += (target.y - d.y) * f;
    d.width += (target.width - d.width) * f;
    d.height += (target.height - d.height) * f;
    if (Math.abs(target.x - d.x) < 0.05 && Math.abs(target.y - d.y) < 0.05 && Math.abs(target.width - d.width) < 0.05 && Math.abs(target.height - d.height) < 0.05) {
      d.x = target.x;
      d.y = target.y;
      d.width = target.width;
      d.height = target.height;
    }
  }
}
