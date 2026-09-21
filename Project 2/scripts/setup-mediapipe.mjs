// Copies the MediaPipe WASM runtime into public/ and fetches the hand model once,
// so the app can run fully self-hosted. Failures are non-fatal: at runtime Pixie
// falls back to the official CDN copies of the same files.
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDest = join(root, 'public/mediapipe/wasm');
const modelDest = join(root, 'public/mediapipe/hand_landmarker.task');
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function exists(p) {
  try {
    return (await stat(p)).size > 0;
  } catch {
    return false;
  }
}

async function copyWasm() {
  await mkdir(wasmDest, { recursive: true });
  for (const name of await readdir(wasmSrc)) {
    await copyFile(join(wasmSrc, name), join(wasmDest, name));
  }
  console.log('[pixie] MediaPipe WASM copied to public/mediapipe/wasm');
}

async function fetchModel() {
  if (await exists(modelDest)) return;
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await mkdir(dirname(modelDest), { recursive: true });
    await writeFile(modelDest, buf);
    console.log(`[pixie] Hand model saved (${(buf.length / 1e6).toFixed(1)} MB)`);
  } catch (err) {
    console.warn(`[pixie] Could not download hand model (${err.message}). The app will load it from the CDN at runtime.`);
  }
}

try {
  await copyWasm();
} catch (err) {
  console.warn(`[pixie] Could not copy WASM (${err.message}). The app will load it from the CDN at runtime.`);
}
await fetchModel();
