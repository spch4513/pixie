import { FilesetResolver, HandLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision';

// Self-hosted copies (see scripts/setup-mediapipe.mjs) with official CDN fallbacks.
// Only these static assets are ever fetched; camera frames never leave the device.
const BASE = import.meta.env.BASE_URL;
const LOCAL_WASM = `${BASE}mediapipe/wasm`;
const LOCAL_MODEL = `${BASE}mediapipe/hand_landmarker.task`;
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

export const LANDMARK = { WRIST: 0, THUMB_TIP: 4, INDEX_MCP: 5, INDEX_TIP: 8, MIDDLE_MCP: 9, PINKY_MCP: 17 } as const;

export interface HandTracker {
  detect(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult | null;
  readonly delegate: 'GPU' | 'CPU';
  close(): void;
}

async function assetAvailable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    // SPA hosts answer unknown paths with index.html, so an HTML response means "missing".
    return res.ok && !(res.headers.get('content-type') ?? '').includes('text/html');
  } catch {
    return false;
  }
}

async function create(delegate: 'GPU' | 'CPU', wasmBase: string, modelPath: string): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(wasmBase);
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath, delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.55,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function createHandTracker(): Promise<HandTracker> {
  const [localWasm, localModel] = await Promise.all([
    assetAvailable(`${LOCAL_WASM}/vision_wasm_internal.wasm`),
    assetAvailable(LOCAL_MODEL),
  ]);
  const wasmBase = localWasm ? LOCAL_WASM : CDN_WASM;
  const modelPath = localModel ? LOCAL_MODEL : CDN_MODEL;

  let landmarker: HandLandmarker;
  let delegate: 'GPU' | 'CPU' = 'GPU';
  try {
    landmarker = await create('GPU', wasmBase, modelPath);
  } catch (gpuErr) {
    console.warn('[pixie] GPU delegate unavailable, falling back to CPU', gpuErr);
    delegate = 'CPU';
    landmarker = await create('CPU', wasmBase, modelPath);
  }

  let lastTs = -1;
  let closed = false;
  return {
    delegate,
    detect(video, timestampMs) {
      if (closed) return null;
      // MediaPipe requires strictly increasing timestamps in VIDEO mode.
      const ts = timestampMs <= lastTs ? lastTs + 1 : timestampMs;
      lastTs = ts;
      return landmarker.detectForVideo(video, ts);
    },
    close() {
      if (closed) return;
      closed = true;
      landmarker.close();
    },
  };
}
