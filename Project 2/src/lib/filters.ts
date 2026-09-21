/**
 * One Euro filter (Casiez et al. 2012): an adaptive low-pass filter that smooths heavily
 * when the signal is slow (kills landmark jitter) and lightly when it is fast (keeps
 * drags responsive).
 */
class LowPass {
  private y = 0;
  private initialized = false;

  filter(x: number, alpha: number): number {
    if (!this.initialized) {
      this.y = x;
      this.initialized = true;
    } else {
      this.y = alpha * x + (1 - alpha) * this.y;
    }
    return this.y;
  }

  get value(): number {
    return this.y;
  }

  reset(): void {
    this.initialized = false;
  }
}

function smoothingAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

export class OneEuroFilter {
  private readonly x = new LowPass();
  private readonly dx = new LowPass();
  private lastTime: number | null = null;
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  constructor(minCutoff = 1.4, beta = 0.012, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  filter(value: number, timeMs: number): number {
    if (this.lastTime === null) {
      this.lastTime = timeMs;
      this.dx.filter(0, 1);
      return this.x.filter(value, 1);
    }
    const dt = Math.max(1e-3, (timeMs - this.lastTime) / 1000);
    this.lastTime = timeMs;
    const derivative = (value - this.x.value) / dt;
    const edx = this.dx.filter(derivative, smoothingAlpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    return this.x.filter(value, smoothingAlpha(cutoff, dt));
  }

  reset(): void {
    this.x.reset();
    this.dx.reset();
    this.lastTime = null;
  }
}

export class PointFilter {
  private readonly fx: OneEuroFilter;
  private readonly fy: OneEuroFilter;

  constructor(minCutoff?: number, beta?: number) {
    this.fx = new OneEuroFilter(minCutoff, beta);
    this.fy = new OneEuroFilter(minCutoff, beta);
  }

  filter(x: number, y: number, timeMs: number, out: { x: number; y: number }): void {
    out.x = this.fx.filter(x, timeMs);
    out.y = this.fy.filter(y, timeMs);
  }

  reset(): void {
    this.fx.reset();
    this.fy.reset();
  }
}

/** Frame-rate independent exponential approach: fraction of the gap to close after dt. */
export function approachFactor(dtMs: number, timeConstantMs: number): number {
  return 1 - Math.exp(-dtMs / Math.max(1, timeConstantMs));
}
