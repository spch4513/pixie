# PIXIE

**Pinch reality into pixels.**

Pixie is a live browser-camera filter. Pinch anywhere in the camera image to drop a rectangle; everything inside it becomes crisp, true-color pixel art while the rest of the frame stays normal. Drag it with a pinch, scale it with two hands, lock it in place, and capture a photo or video of the result.

It works on anything the camera sees — faces, hands, objects, backgrounds. There is no face tracking or auto-snapping: the box goes exactly where your hands put it.

Everything runs locally in your browser. No camera frames, photos, recordings or hand data ever leave the device.

---

## Features

- **Camera choice before permission** — a start screen lets you pick the selfie or rear camera; permission is requested only after you choose.
- **Live camera flip** without reloading.
- **Hand gestures** (MediaPipe Hand Landmarker, up to two hands)
  - one-hand pinch → place, or pinch-and-pull to draw any rectangle; pinch the box to move it
  - two-hand pinch → stretch width and height independently (hands wide = wide box, hands stacked = tall box)
- **Touch & mouse fallback** — one finger/mouse behaves like a one-hand pinch, two fingers like two hands. Useful when hand tracking is still loading, unavailable, or when two-handed gestures aren't practical.
- **Lock / Unlock** and **Clear** controls.
- **Pixel Detail** slider (Fine → Chunky), combined with box size.
- **Photo** (PNG) and **video** (MP4 or WebM) capture of the exact composited output, with Download, Share (Web Share API level 2) and Discard / Retake.
- **First-use field guide**, re-openable via Help, dismissal remembered in `localStorage`.
- **Debug view**: landmarks, skeleton, pinch points/state, normalised coordinates, gesture state, box bounds in view and source coordinates, camera transform, FPS and detection timing.
- **Keyboard shortcuts**: `L` lock, `X`/`Backspace` clear, `P` photo, `R` record, `F` flip, `[` / `]` pixel detail, `H`/`?` help, `` ` `` debug.
- Polished recovery states for permission, availability, interruption, switching, tracking, recording and orientation problems.

## Tech stack

| Piece | Version |
| --- | --- |
| Vite | 8.3 |
| React | 19.3 |
| TypeScript | 6.0 (TS 7 is not yet supported by typescript-eslint) |
| @mediapipe/tasks-vision | 1.0.1 (Hand Landmarker, VIDEO mode, GPU delegate with CPU fallback) |
| ESLint | 10 + typescript-eslint + react-hooks |
| Fonts | Archivo (variable, width axis) and IBM Plex Mono — both SIL Open Font License, self-hosted via Fontsource |

Rendering uses a hidden `<video>` element feeding two layered canvases; capture uses `canvas.toBlob()` and `canvas.captureStream()` + `MediaRecorder`. No backend.

## Getting started

Requires Node 20.19+ (or 22.12+).

```bash
npm install
npm run dev          # http://localhost:5173 (localhost counts as a secure context)
```

`npm run dev`/`build` first run `scripts/setup-mediapipe.mjs`, which copies the MediaPipe WASM runtime into `public/mediapipe/wasm` and downloads the ~7.8 MB hand model into `public/mediapipe/`. If that download fails, the app falls back to the official CDN copies at runtime.

Test on a phone over your LAN (self-signed HTTPS, accept the certificate warning once):

```bash
npm run dev:https    # then open https://<your-computer-ip>:5173 on the phone
```

Production:

```bash
npm run build        # type-check + bundle into dist/
npm run preview      # serve dist/ locally
npm run check        # type-check + lint
```

## Deploying safely with HTTPS

Browsers only expose the camera in a **secure context** — `https://` or `http://localhost`. Serving Pixie over plain HTTP from a real hostname will show the "Camera needs a secure connection" state.

`dist/` is fully static, so any static host with TLS works (Netlify, Vercel, Cloudflare Pages, GitHub Pages, S3 + CloudFront, nginx with Let's Encrypt). The build uses a relative base (`./`), so it also works from a sub-path. Recommendations:

- Serve `.wasm` as `application/wasm` (all major hosts do).
- Optional hardening header: `Permissions-Policy: camera=(self), microphone=()`.
- If you add a Content-Security-Policy, allow `'wasm-unsafe-eval'` in `script-src`, `blob:` in `media-src`/`img-src` (capture previews), and — only if you don't self-host the model — `https://storage.googleapis.com` and `https://cdn.jsdelivr.net` in `connect-src`.

### This repository's deployment (unlisted link)

`.github/workflows/deploy.yml` builds Pixie on every push to `main` and publishes it with GitHub Pages under a secret path taken from the `PIXIE_PATH` repository secret: `https://<user>.github.io/pixie/<PIXIE_PATH>/`. The site root and every other path show a blank "Nothing here." page, `robots.txt` blocks crawlers, and every page carries `noindex`. This keeps the link **unlisted**, but it isn't access control: anyone who has the full link can open it. To change the link, change the secret and re-run the workflow.

## Camera permission notes

- Permission is requested only after the user taps **Selfie camera** or **Rear camera**.
- If permission is denied, Pixie explains how to re-enable it in site settings and offers **Try again**.
- Flipping stops the current stream before opening the other one — many phones cannot hold two cameras open at once. If the other camera fails to open, Pixie returns to the previous one and says so.
- If the stream ends (another app takes the camera, the device is unplugged, iOS reclaims it in the background), Pixie shows **Camera stream interrupted** with **Reconnect**, and reconnects automatically when you return to the tab.

## Browser compatibility

| Browser | Live filter | Photo | Video |
| --- | --- | --- | --- |
| iPhone Safari 15+ | ✓ | ✓ | ✓ MP4 (H.264) |
| Android Chrome | ✓ | ✓ | ✓ MP4 on recent versions, else WebM |
| Desktop Chrome / Edge | ✓ | ✓ | ✓ MP4 on 126+, else WebM |
| Desktop Safari 15+ | ✓ | ✓ | ✓ MP4 |
| Firefox | ✓ | ✓ | ✓ WebM |

Hand tracking uses WebGL2 (GPU delegate) where available and falls back to the CPU delegate automatically. Share requires Web Share API level 2 with file support (iOS/Android, Safari desktop, Chrome on Windows/ChromeOS); elsewhere the Share button is hidden and Download is offered.

---

## How it works

### Files

```
src/
  types.ts                 Point, Size, Rect, CameraTransform, PinchData, HandData,
                           GestureState, SelectionState, RecordingState, …
  lib/
    camera.ts              getUserMedia, facing/mirroring, error classification
    transform.ts           object-fit: cover mapping between video, view and output
    handTracker.ts         MediaPipe setup (self-hosted → CDN fallback, GPU → CPU)
    hands.ts               per-hand tracking ids, pinch hysteresis, smoothing, grace period
    filters.ts             One Euro filter + frame-rate-independent easing
    gesture.ts             gesture state machine (place / drag / resize / lock)
    pixelate.ts            cell-size formula, pixel renderer, frame compositor
    overlay.ts             selection chrome, dimming, pinch reticles, debug drawing
    engine.ts              requestAnimationFrame loop tying it all together
    capture.ts             PNG export, filenames, download/share helpers
    recorder.ts            MIME detection + MediaRecorder on the output canvas
    commands.ts            typed command bus (buttons, keys, future voice)
    storage.ts             safe localStorage wrapper
  components/              StartScreen, Wordmark, TopBar, ControlDock, HelpOverlay,
                           CapturePreview, ErrorPanel, Toast, PixieCamera (orchestrator)
  styles/                  theme.css, start.css, live.css
```

React owns only UI state (camera choice, lock, slider, dialogs, capture, errors). Video frames, landmarks, gestures and drawing live in the imperative `PixieEngine`, which never triggers a React render per frame.

### Coordinate spaces

| Space | Units | Used for |
| --- | --- | --- |
| **Source** | intrinsic video pixels, unmirrored | cropping for pixelation |
| **Normalised** | 0..1 of the source frame | MediaPipe landmarks |
| **View** | CSS pixels of the visible stage, as the user sees it (mirrored for selfie) | gestures, selection box, overlay |
| **Output** | device pixels of the composited canvas | display, photo, video |

### object-fit: cover and cropping

`computeCameraTransform` (in `lib/transform.ts`) mirrors CSS `object-fit: cover`:

```
scale  = max(viewW / videoW, viewH / videoH)
offset = ((viewW − videoW·scale) / 2, (viewH − videoH·scale) / 2)     // ≤ 0 on the cropped axis
crop   = (−offset.x / scale, −offset.y / scale, viewW / scale, viewH / scale)   // visible source rect
```

Landmark → view: `x = offset.x + nx·videoW·scale`, `y = offset.y + ny·videoH·scale`, then mirror.
View rect → source rect: un-mirror, subtract offset, divide by scale.

The **output canvas** has the same aspect ratio as the view, so it maps linearly (`outputScale` px per CSS px) and is displayed at 100% × 100% with no distortion. Its resolution follows the visible source density, allowed up to 2× (to keep pixel edges crisp on high-DPR phones), never above the device's DPR, and capped at 1600 px on the long edge for encoder and memory headroom. The overlay canvas uses `min(devicePixelRatio, 2)`.

Every mapping is recomputed when the stage resizes (ResizeObserver + `orientationchange`), when the camera's intrinsic size changes, or when the camera switches. The selection is stored in view space and, on resize/rotation, is re-mapped by relative position and scaled by the change in the view's short side, then clamped — so it never drifts.

### Selfie mirroring

Selfie previews are mirrored like a mirror; rear previews are not. Facing comes from `track.getSettings().facingMode`, falling back to the camera the user chose (laptops rarely report it).

Mirroring is applied in exactly one place in each direction:
- **drawing**: the compositor draws the frame with `setTransform(−1, 0, 0, 1, outputW, 0)`;
- **mapping**: `normalizedToView` flips x (`viewW − x`) and `viewRectToSource` un-flips it.

Because gestures, the overlay, pixelation, photos and videos all go through those helpers, what you see is what you get — photos and videos are saved mirrored, exactly as previewed.

### Pinch detection

For each hand (`lib/hands.ts`):

```
palm  = max(|wrist → middle knuckle|, 1.3 · |index knuckle → pinky knuckle|)
ratio = |thumb tip → index tip| / palm           // scale-invariant: works near or far from the camera
```

- **Hysteresis**: enter pinch below `0.26`, only leave above `0.38`, and only after **2 consecutive** open readings.
- **Smoothing**: the pinch midpoint runs through a One Euro filter (heavy smoothing when still, light when moving fast). The filter resets at the start of each pinch so the box starts exactly under the fingers.
- **Stable identity**: hands are matched frame-to-frame by nearest wrist, so "first" and "second" hand don't swap when MediaPipe reorders them.
- **Dropout grace**: a hand that disappears keeps its state (including an active pinch) for 220 ms, so a missed detection doesn't release the box.
- **Scheduling**: detection runs at most once per new camera frame; if it gets expensive (slow phones), it backs off to ~1.5× its own cost so rendering stays at display rate.

### Gesture state machine

```
                 ┌── on/near the box ──▶ dragging (move, size kept)
 idle ──pinch───┤
                 └── elsewhere ────────▶ placing ──moves > 28 px──▶ drawing
 any one-hand state ──2nd pinch──▶ resizing        resizing ──one released──▶ dragging
 locked: every input is ignored
```

- **Quick pinch** (barely moving) → drop a box at the pinch: default square the first time, or the current box's size if one exists.
- **Pinch and pull** → the start point becomes a fixed corner and the opposite corner follows your fingers, so you draw any rectangle: wide, tall or small. Pulling back past the start point flips direction, and pulling past a screen edge clips at the edge without moving the anchored corner.
- **Pinch on/near the box** (within 20% of its short side) → grab and move it; the grab offset is kept so it doesn't snap its centre to your fingers.
- **Two pinches** → width follows the *horizontal* spread between your hands and height follows the *vertical* spread, independently, and the box travels with the midpoint of your hands. Changes apply relative to a baseline captured when the second pinch appeared (`width = baseWidth + (spreadX − baseSpreadX)`, likewise for height), so starting a two-hand gesture never makes the box jump. With no box yet, the two pinches become its opposite corners.
- **Leaving resize** → the remaining hand continues dragging from the box's *current* position, so there's no jump.
- The box always stays fully inside the visible frame, with a minimum side of `max(48 px, 8% of short side)`.
- Responsiveness: the rendered rect eases toward the target with a 28 ms time constant, and the pinch midpoint's One Euro filter is tuned for low lag (min cutoff 2.4 Hz, β 0.04). Touch/mouse presses anchor at the exact press position.

### Locking

The box persists after hands leave. **Lock** freezes it: gestures and touch no longer move or resize it, the pixel effect stays active, the box shows a padlock "LOCKED" label and the dock button inverts and reads "Locked" (state is conveyed by text + icon, not colour). Any pinch that is *held* at the moment you lock, unlock or clear is suppressed until released, so toggling never makes the box leap to a hand mid-pinch. **Clear** removes the box and unlocks.

The command bus (`lib/commands.ts`) routes every intent (`lock`, `unlock`, `clear`, `photo`, `toggle-record`, …) through one function. Buttons and keyboard shortcuts are sources today; a voice source can be added by mapping recognised phrases (a starter table is included) to the same commands.

### Pixelation rendering

Per frame (`lib/pixelate.ts`):

1. Draw the visible (cover-cropped, mirrored-if-selfie) camera frame to the output canvas.
2. Snap the selection to a whole number of **square** output-pixel cells, centred in the box.
3. Map that exact region back to **source-video** coordinates.
4. `drawImage` the source crop into a tiny offscreen canvas at `cols × rows` with smoothing **on** — this averages the true colours of each cell.
5. `drawImage` the tiny canvas back into the box with `imageSmoothingEnabled = false` — crisp, square, blocky pixels.

No palettes, no quantisation: colours are the camera's own. The offscreen canvas only ever grows (in 32-cell steps), so it isn't reallocated per frame.

### Pixel Detail × box size

```
t        = Pixel Detail slider, 0 (Fine) … 1 (Chunky)
base(t)  = 4 + 28 · t^1.35                         cell size (CSS px) for a 240 px box
side     = √(boxWidth · boxHeight)                  aspect-independent "size"
cell     = base(t) · (side / 240)^0.6
cell     = clamp(cell, 3 px, min(boxW, boxH) / 3)   at least 3 cells across
cellOut  = max(2, round(cell · outputScale))        integer device px → exact squares
cols,rows ≤ 160                                     performance guard (cells grow if needed)
```

Small boxes stay detailed and large boxes get chunkier; the sub-linear exponent means a box 4× larger gets cells about 2.3× larger. The slider shifts the whole curve.

### Photo capture

The shutter calls `toBlob('image/png')` on the output canvas, the same pixels that are on screen. The selection outline, grid, reticles and debug info live on a separate overlay canvas and in the DOM, so they never appear in exports. Files are named `pixie-photo-YYYYMMDD-HHMMSS.png`.

### Video recording

`canvas.captureStream(30)` on the output canvas feeds `MediaRecorder` (no audio track, no microphone permission). The format is picked with `MediaRecorder.isTypeSupported` in this order: `video/mp4;codecs=avc1.42E01E` → `video/mp4;codecs=avc1` → `video/mp4` → `video/webm;codecs=vp9` → `vp8` → `video/webm`. MP4 comes first because it plays and shares everywhere. The file extension comes from the format that was actually recorded: `pixie-video-YYYYMMDD-HHMMSS.mp4` or `.webm`. The bitrate scales with resolution (3–12 Mbps) to keep block edges clean. A red REC indicator with elapsed time is shown, and clips are capped at 5 minutes.

## Browser limitations and fallbacks

- **Recording unsupported** (no `MediaRecorder` or `captureStream`): the Video button is dimmed and explains why; photos still work.
- **WebM from Chrome/Firefox** has no duration metadata, so some players show an unknown length until playback ends. MP4 from Chrome is fragmented, and a few older desktop players handle it poorly. Both play fine in browsers, iOS and Android.
- **Orientation change while recording**: the canvas size changes, which some encoders can't handle mid-stream. Pixie stops the recording, keeps the clip, and tells you why.
- **Camera flip while recording** is disabled, with a tooltip explaining why.
- **Share unavailable**: the Share button is hidden; if a share fails, Pixie downloads the file instead.
- **Hand tracking fails** (old GPU, blocked WASM, offline with no cached model): a banner offers **Retry**, and touch/mouse control keeps working.
- **localStorage blocked** (private mode): preferences just don't persist.
- **iOS Safari** pauses the camera when the tab is backgrounded; Pixie reconnects automatically on return.
- **Capturing with no box**: Pixie prompts you to place one first and offers "Shoot anyway" / "Record anyway".

## Accessibility

Semantic buttons throughout; icon-only controls have `aria-label`s plus visible tooltips on hover and keyboard focus, and dock controls have visible text captions. There is a two-tone focus ring that reads on black UI, white UI and live video. Lock and recording state use text and icons, not colour alone. Tap targets are 44–68 px. Dialogs move focus in and restore it on close, and Escape closes the guide. Keyboard shortcuts cover every action. `prefers-reduced-motion` disables the wordmark animation, flash, blinking and eased transitions.

## Privacy

All processing happens locally in your browser. Camera frames go from the camera into canvases on your device and nowhere else. Hand landmarks are computed on-device by MediaPipe (WebAssembly/WebGL), and photos and videos exist only as in-memory blobs until you download or share them. The only network requests are for the app's own static files and, if they aren't self-hosted, the MediaPipe model and runtime. Pixie has no server, no analytics and no uploads.
