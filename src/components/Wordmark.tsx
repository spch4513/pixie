import { useEffect, useRef } from 'react';

const FONT_FAMILY = '"Archivo Variable", "Archivo", "Helvetica Neue", Arial, sans-serif';

/**
 * The start-screen wordmark is a tiny live demo of the product: a "Pixie area" drifts across
 * the word and pixelates whatever it covers, using the same downsample → crisp-upscale trick
 * as the camera renderer.
 */
export function Wordmark() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const src = document.createElement('canvas');
    const srcCtx = src.getContext('2d')!;
    const low = document.createElement('canvas');
    const lowCtx = low.getContext('2d')!;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let raf = 0;
    let disposed = false;
    let W = 0;
    let H = 0;
    let dpr = 1;

    const layout = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = src.width = Math.round(W * dpr);
      canvas.height = src.height = Math.round(H * dpr);
      srcCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      srcCtx.fillStyle = '#ffffff';
      srcCtx.fillRect(0, 0, W, H);
      srcCtx.fillStyle = '#0a0a0a';
      srcCtx.textBaseline = 'alphabetic';
      srcCtx.textAlign = 'center';
      // Fit the word to the width using the variable font's expanded, black cut.
      let size = H * 0.98;
      srcCtx.font = `900 ${size}px ${FONT_FAMILY}`;
      if ('fontStretch' in srcCtx) (srcCtx as CanvasRenderingContext2D & { fontStretch: string }).fontStretch = 'expanded';
      const measured = srcCtx.measureText('PIXIE').width;
      if (measured > W * 0.98) {
        size *= (W * 0.98) / measured;
        srcCtx.font = `900 ${size}px ${FONT_FAMILY}`;
      }
      srcCtx.fillText('PIXIE', W / 2, H * 0.5 + size * 0.36);
    };

    const draw = (time: number) => {
      if (disposed) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(src, 0, 0);

      const bw = Math.min(W * 0.34, H * 1.05);
      const bh = H * 0.9;
      const cell = Math.max(5, Math.round(bh / 9));
      const cols = Math.max(2, Math.floor(bw / cell));
      const rows = Math.max(2, Math.floor(bh / cell));
      const w = cols * cell;
      const h = rows * cell;
      const phase = reduced ? 0.62 : (Math.sin(time / 2200) + 1) / 2;
      const bx = (W - w) * (0.08 + phase * 0.84);
      const by = (H - h) / 2;
      const px = (v: number) => Math.round(v * dpr);
      if (low.width !== cols || low.height !== rows) {
        low.width = cols;
        low.height = rows;
      }
      lowCtx.imageSmoothingEnabled = true;
      lowCtx.drawImage(src, px(bx), px(by), px(w), px(h), 0, 0, cols, rows);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(low, 0, 0, cols, rows, px(bx), px(by), px(w), px(h));

      // Selection chrome.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = '#0a0a0a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(Math.round(bx) + 0.75, Math.round(by) + 0.75, w - 1.5, h - 1.5);
      ctx.fillStyle = '#0a0a0a';
      const L = Math.min(14, w / 4);
      for (const [cx, cy, sx, sy] of [
        [bx - 4, by - 4, 1, 1],
        [bx + w + 4, by - 4, -1, 1],
        [bx - 4, by + h + 4, 1, -1],
        [bx + w + 4, by + h + 4, -1, -1],
      ] as const) {
        ctx.fillRect(Math.min(cx, cx + sx * L), Math.min(cy, cy + sy * 3), L, 3);
        ctx.fillRect(Math.min(cx, cx + sx * 3), Math.min(cy, cy + sy * L), 3, L);
      }
      if (!reduced) raf = requestAnimationFrame(draw);
    };

    const start = () => {
      if (disposed) return;
      layout();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(draw);
    };

    const fontReady = document.fonts?.load?.(`900 100px ${FONT_FAMILY}`) ?? Promise.resolve();
    fontReady.then(start, start);
    const ro = new ResizeObserver(start);
    ro.observe(canvas);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className="wordmark-canvas" aria-hidden="true" />;
}
