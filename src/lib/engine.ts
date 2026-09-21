import type { CameraTransform, PinchInput, Point, Rect } from '../types';
import { approachFactor } from './filters';
import { GestureMachine } from './gesture';
import type { HandTracker } from './handTracker';
import { HandTracking } from './hands';
import { drawOverlay, type OverlayFrame } from './overlay';
import { composeFrame, PixelRenderer, type PixelInfo } from './pixelate';
import { computeCameraTransform } from './transform';

export interface EngineElements {
  stage: HTMLElement;
  output: HTMLCanvasElement;
  overlay: HTMLCanvasElement;
  video: HTMLVideoElement;
}

export interface EngineCallbacks {
  onSelectionChange(hasSelection: boolean): void;
  onFirstFrame(): void;
  onTrackingError(error: unknown): void;
  /** Output canvas buffer changed size (rotation, resize, camera switch). */
  onOutputResize(): void;
  /** Someone tried to move the box while it is locked. */
  onLockedInteraction(): void;
}

const MAX_OVERLAY_DPR = 2;
const DEBUG_TEXT_INTERVAL = 200;

const fmt = (n: number, d = 1) => n.toFixed(d);
const fmtRect = (r: Rect | null | undefined) =>
  r ? `x ${fmt(r.x)}  y ${fmt(r.y)}  w ${fmt(r.width)}  h ${fmt(r.height)}` : '—';

/**
 * Owns the real-time loop: camera frame → hand detection → gestures → composited output
 * canvas → overlay canvas. Nothing here touches React state per frame; React only hears
 * about coarse changes through `callbacks`.
 */
export class PixieEngine {
  private readonly els: EngineElements;
  private readonly cb: EngineCallbacks;
  private readonly outCtx: CanvasRenderingContext2D;
  private readonly overlayCtx: CanvasRenderingContext2D;
  private readonly renderer = new PixelRenderer();
  private readonly hands = new HandTracking();
  private readonly gesture = new GestureMachine();
  private readonly resizeObserver: ResizeObserver;
  private readonly pointers = new Map<number, { point: Point; start: Point }>();
  private pointerInputs: PinchInput[] = [];
  private readonly overlayFrame: OverlayFrame;

  private tracker: HandTracker | null = null;
  private transform: CameraTransform | null = null;
  private mirrored = true;
  private detail = 0.45;
  private debug = false;
  private debugText: HTMLElement | null = null;
  private reducedMotion = false;

  private raf = 0;
  private running = false;
  private lastNow = 0;
  private lastVideoTime = -1;
  private lastDetect = 0;
  private detectInterval = 0;
  private detectCost = 0;
  private frameMs = 16.7;
  private lastDebugText = 0;
  private editAmount = 0;
  private hadSelection = false;
  private firstFrameSent = false;
  private lastPinchCount = 0;
  private lastLockedNotice = 0;
  private lastInfo: PixelInfo | null = null;
  private viewW = 0;
  private viewH = 0;

  constructor(els: EngineElements, callbacks: EngineCallbacks) {
    this.els = els;
    this.cb = callbacks;
    const out = els.output.getContext('2d', { alpha: false });
    const ov = els.overlay.getContext('2d');
    if (!out || !ov) throw new Error('Canvas 2D is not available in this browser.');
    this.outCtx = out;
    this.overlayCtx = ov;
    this.overlayFrame = {
      view: { width: 1, height: 1 },
      box: null,
      locked: false,
      editAmount: 0,
      cells: null,
      hands: this.hands.hands,
      pointers: this.pointerInputs,
      debug: false,
    };

    this.resizeObserver = new ResizeObserver(() => this.syncLayout());
    this.resizeObserver.observe(els.stage);
    window.addEventListener('orientationchange', this.syncLayout);

    const s = els.stage;
    s.addEventListener('pointerdown', this.onPointerDown);
    s.addEventListener('pointermove', this.onPointerMove);
    s.addEventListener('pointerup', this.onPointerUp);
    s.addEventListener('pointercancel', this.onPointerUp);
    s.addEventListener('lostpointercapture', this.onPointerUp);

    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.reducedMotion = !!mq?.matches;
  }

  // ───────────────────────────────── public API ─────────────────────────────────

  get outputCanvas(): HTMLCanvasElement {
    return this.els.output;
  }

  get hasSelection(): boolean {
    return this.gesture.selection.target !== null;
  }

  async attachStream(stream: MediaStream, mirrored: boolean): Promise<void> {
    const v = this.els.video;
    this.mirrored = mirrored;
    this.hands.reset();
    this.firstFrameSent = false;
    this.lastVideoTime = -1;
    v.srcObject = stream;
    v.muted = true;
    v.playsInline = true;
    await v.play();
    this.syncLayout();
  }

  detachStream(): void {
    const v = this.els.video;
    v.pause();
    v.srcObject = null;
    this.hands.reset();
  }

  setTracker(tracker: HandTracker | null): void {
    this.tracker = tracker;
    if (!tracker) this.hands.reset();
  }

  setLocked(locked: boolean): void {
    this.gesture.setLocked(locked, this.currentInputs());
  }

  clearSelection(): void {
    this.gesture.clear(this.currentInputs());
  }

  setDetail(detail: number): void {
    this.detail = detail;
  }

  setDebug(debug: boolean, textEl: HTMLElement | null): void {
    this.debug = debug;
    this.debugText = textEl;
    if (!debug && textEl) textEl.textContent = '';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastNow = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    window.removeEventListener('orientationchange', this.syncLayout);
    const s = this.els.stage;
    s.removeEventListener('pointerdown', this.onPointerDown);
    s.removeEventListener('pointermove', this.onPointerMove);
    s.removeEventListener('pointerup', this.onPointerUp);
    s.removeEventListener('pointercancel', this.onPointerUp);
    s.removeEventListener('lostpointercapture', this.onPointerUp);
    this.detachStream();
    this.renderer.dispose();
    this.tracker = null;
  }

  // ─────────────────────────────── layout / transform ───────────────────────────────

  private readonly syncLayout = (): void => {
    const stage = this.els.stage;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    const v = this.els.video;
    if (W < 2 || H < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const hasVideo = v.videoWidth > 0 && v.videoHeight > 0;
    const next = computeCameraTransform(
      { width: hasVideo ? v.videoWidth : W, height: hasVideo ? v.videoHeight : H },
      { width: W, height: H },
      this.mirrored,
      dpr,
    );
    this.transform = next;

    const out = this.els.output;
    if (out.width !== next.output.width || out.height !== next.output.height) {
      out.width = next.output.width;
      out.height = next.output.height;
      this.cb.onOutputResize();
    }
    const odpr = Math.min(dpr, MAX_OVERLAY_DPR);
    const ow = Math.round(W * odpr);
    const oh = Math.round(H * odpr);
    if (this.els.overlay.width !== ow || this.els.overlay.height !== oh) {
      this.els.overlay.width = ow;
      this.els.overlay.height = oh;
    }
    if (W !== this.viewW || H !== this.viewH) {
      this.viewW = W;
      this.viewH = H;
      this.gesture.setView(next.view);
    }
    this.hands.reproject(next);
  };

  // ─────────────────────────────── pointer fallback ───────────────────────────────
  // One finger / mouse acts like a one-hand pinch; two fingers like a two-hand pinch.

  private stagePoint(e: PointerEvent): Point {
    const r = this.els.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private rebuildPointerInputs(): void {
    const list: PinchInput[] = [];
    for (const [id, p] of this.pointers) list.push({ id: `ptr-${id}`, point: p.point, start: p.start });
    this.pointerInputs = list.slice(0, 2);
    this.overlayFrame.pointers = this.pointerInputs;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this.pointers.size >= 2) return;
    e.preventDefault();
    this.els.stage.setPointerCapture?.(e.pointerId);
    const at = this.stagePoint(e);
    this.pointers.set(e.pointerId, { point: at, start: { ...at } });
    this.rebuildPointerInputs();
    if (this.gesture.selection.locked) this.noticeLocked();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const np = this.stagePoint(e);
    p.point.x = np.x;
    p.point.y = np.y;
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.delete(e.pointerId)) return;
    this.rebuildPointerInputs();
  };

  private currentInputs(): PinchInput[] {
    return this.pointers.size > 0 ? this.pointerInputs : this.hands.pinchInputs();
  }

  private noticeLocked(): void {
    const now = performance.now();
    if (now - this.lastLockedNotice > 4000) {
      this.lastLockedNotice = now;
      this.cb.onLockedInteraction();
    }
  }

  // ─────────────────────────────────── frame loop ───────────────────────────────────

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.tick);
    const dt = Math.min(100, Math.max(0, now - this.lastNow));
    this.lastNow = now;
    this.frameMs += (dt - this.frameMs) * 0.1;

    const v = this.els.video;
    if (v.readyState < 2 || v.videoWidth === 0 || !this.transform) return;
    if (v.videoWidth !== this.transform.video.width || v.videoHeight !== this.transform.video.height || this.mirrored !== this.transform.mirrored) {
      this.syncLayout();
    }
    const t = this.transform;

    this.detect(now, t);

    const inputs = this.currentInputs();
    const handsVisible = this.pointers.size > 0 || this.hands.hands.some((h) => !h.stale);
    if (this.gesture.selection.locked && inputs.length > this.lastPinchCount) this.noticeLocked();
    this.lastPinchCount = inputs.length;
    this.gesture.update(inputs, handsVisible, dt);

    const has = this.gesture.selection.target !== null;
    if (has !== this.hadSelection) {
      this.hadSelection = has;
      this.cb.onSelectionChange(has);
    }

    const goal = this.gesture.editing ? 1 : 0;
    this.editAmount = this.reducedMotion ? goal : this.editAmount + (goal - this.editAmount) * approachFactor(dt, goal ? 90 : 260);

    this.lastInfo = composeFrame(this.outCtx, v, t, this.renderer, this.gesture.selection.display, this.detail);

    const f = this.overlayFrame;
    f.view = t.view;
    f.box = this.lastInfo ? this.lastInfo.view : null;
    f.locked = this.gesture.selection.locked;
    f.editAmount = this.editAmount;
    f.cells = this.lastInfo; // PixelInfo carries cols/rows; avoids a per-frame object
    f.hands = this.hands.hands;
    f.debug = this.debug;
    drawOverlay(this.overlayCtx, this.els.overlay.width / t.view.width, f);

    if (!this.firstFrameSent) {
      this.firstFrameSent = true;
      this.cb.onFirstFrame();
    }
    if (this.debug && this.debugText && now - this.lastDebugText > DEBUG_TEXT_INTERVAL) {
      this.lastDebugText = now;
      this.debugText.textContent = this.debugReport(t);
    }
  };

  /**
   * Runs the landmarker at most once per new camera frame, and backs off when detection is
   * expensive (slow phones) so rendering stays smooth: interval ≈ 1.5× last detection cost.
   */
  private detect(now: number, t: CameraTransform): void {
    const v = this.els.video;
    if (!this.tracker) return;
    if (v.currentTime === this.lastVideoTime) return;
    if (now - this.lastDetect < this.detectInterval) return;
    this.lastVideoTime = v.currentTime;
    this.lastDetect = now;
    const t0 = performance.now();
    try {
      const result = this.tracker.detect(v, now);
      this.hands.update(result, t, now);
    } catch (err) {
      this.tracker = null;
      this.hands.reset();
      this.cb.onTrackingError(err);
      return;
    }
    const cost = performance.now() - t0;
    this.detectCost += (cost - this.detectCost) * 0.2;
    this.detectInterval = this.detectCost > 18 ? Math.min(66, this.detectCost * 1.5) : 0;
  }

  private debugReport(t: CameraTransform): string {
    const g = this.gesture;
    const lines: string[] = [];
    lines.push(`FPS ${fmt(1000 / Math.max(1, this.frameMs), 0)}  frame ${fmt(this.frameMs)}ms  detect ${fmt(this.detectCost)}ms  every ${fmt(this.detectInterval, 0)}ms`);
    lines.push(`tracker ${this.tracker ? this.tracker.delegate : 'off'}   gesture ${g.state.mode.toUpperCase()}   locked ${g.selection.locked ? 'yes' : 'no'}`);
    lines.push(`input ${this.pointers.size > 0 ? `pointer×${this.pointers.size}` : `hands×${this.hands.hands.length}`}`);
    for (const h of this.hands.hands) {
      const tip = h.landmarks[8];
      const thumb = h.landmarks[4];
      lines.push(
        `  hand #${h.id} ${h.handedness || '?'}${h.stale ? ' (stale)' : ''}  pinch ${h.pinch.active ? 'ON ' : 'off'} r=${fmt(h.pinch.ratio, 2)}`,
      );
      if (tip && thumb) lines.push(`    thumb n(${fmt(thumb.x, 3)}, ${fmt(thumb.y, 3)})  index n(${fmt(tip.x, 3)}, ${fmt(tip.y, 3)})`);
      lines.push(`    mid view(${fmt(h.pinch.midpoint.x)}, ${fmt(h.pinch.midpoint.y)})`);
    }
    if (g.state.resize) lines.push(`resize base ${fmt(g.state.resize.width)}×${fmt(g.state.resize.height)} spread0 ${fmt(g.state.resize.spreadX)}×${fmt(g.state.resize.spreadY)}`);
    lines.push(`video ${t.video.width}×${t.video.height}  view ${fmt(t.view.width, 0)}×${fmt(t.view.height, 0)}  mirrored ${t.mirrored}`);
    lines.push(`cover scale ${fmt(t.scale, 3)}  offset (${fmt(t.offset.x)}, ${fmt(t.offset.y)})`);
    lines.push(`crop  ${fmtRect(t.crop)}`);
    lines.push(`output ${t.output.width}×${t.output.height} @ ${fmt(t.outputScale, 2)}×  dpr ${window.devicePixelRatio}`);
    lines.push(`box view    ${fmtRect(g.selection.display)}`);
    const info = this.lastInfo;
    lines.push(`pixel view  ${fmtRect(info?.view)}`);
    lines.push(`pixel src   ${fmtRect(info?.source)}`);
    lines.push(info ? `cells ${info.cols}×${info.rows}  cell ${info.cell}px out  detail ${fmt(this.detail, 2)}` : `cells —  detail ${fmt(this.detail, 2)}`);
    return lines.join('\n');
  }
}
