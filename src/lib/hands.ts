import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';
import type { CameraTransform, HandData, PinchInput, Point } from '../types';
import { PointFilter } from './filters';
import { LANDMARK } from './handTracker';
import { distance, normalizedToView } from './transform';

/**
 * Pinch = thumb tip close to index tip, measured relative to palm size so it works at any
 * distance from the camera. Hysteresis: enter below PINCH_ENTER, only leave above PINCH_EXIT,
 * and only after RELEASE_FRAMES consecutive open readings — so a pinch doesn't flicker when
 * the fingers hover around the threshold.
 */
export const PINCH_ENTER = 0.26;
export const PINCH_EXIT = 0.38;
const RELEASE_FRAMES = 2;
/** A hand that disappears keeps its state (incl. an active pinch) for this long. */
const GRACE_MS = 220;
/** Max wrist travel between detections (fraction of the view's short side) to count as the same hand. */
const MATCH_RADIUS = 0.35;

interface Track extends HandData {
  filter: PointFilter;
  openFrames: number;
  matched: boolean;
}

function makePoints(n: number): Point[] {
  return Array.from({ length: n }, () => ({ x: 0, y: 0 }));
}

export class HandTracking {
  private tracks: Track[] = [];
  private nextId = 1;
  private readonly inputs: PinchInput[] = [];

  get hands(): readonly HandData[] {
    return this.tracks;
  }

  reset(): void {
    this.tracks = [];
  }

  update(result: HandLandmarkerResult | null, t: CameraTransform, now: number): void {
    for (const tr of this.tracks) tr.matched = false;

    if (result) {
      const radius = MATCH_RADIUS * Math.min(t.view.width, t.view.height);
      for (let i = 0; i < result.landmarks.length; i++) {
        const lms = result.landmarks[i];
        if (!lms || lms.length < 21) continue;
        const wrist = normalizedToView(t, lms[LANDMARK.WRIST].x, lms[LANDMARK.WRIST].y);

        let best: Track | null = null;
        let bestD = radius;
        for (const tr of this.tracks) {
          if (tr.matched) continue;
          const d = distance(tr.viewLandmarks[LANDMARK.WRIST], wrist);
          if (d < bestD) {
            bestD = d;
            best = tr;
          }
        }
        const track = best ?? this.createTrack();
        track.matched = true;
        track.stale = false;
        track.lastSeen = now;
        track.handedness = result.handedness?.[i]?.[0]?.categoryName ?? '';
        track.landmarks = lms;
        for (let k = 0; k < 21; k++) normalizedToView(t, lms[k].x, lms[k].y, track.viewLandmarks[k]);
        this.updatePinch(track, now);
      }
    }

    // Unseen hands: keep them briefly (stale) to bridge detection dropouts, then drop.
    this.tracks = this.tracks.filter((tr) => {
      if (tr.matched) return true;
      tr.stale = true;
      return now - tr.lastSeen < GRACE_MS;
    });
  }

  /** Re-project landmarks after the view/camera transform changed (resize, rotation). */
  reproject(t: CameraTransform): void {
    for (const tr of this.tracks) {
      for (let k = 0; k < tr.landmarks.length; k++) normalizedToView(t, tr.landmarks[k].x, tr.landmarks[k].y, tr.viewLandmarks[k]);
      tr.filter.reset();
      tr.pinch.midpoint.x = (tr.viewLandmarks[LANDMARK.THUMB_TIP].x + tr.viewLandmarks[LANDMARK.INDEX_TIP].x) / 2;
      tr.pinch.midpoint.y = (tr.viewLandmarks[LANDMARK.THUMB_TIP].y + tr.viewLandmarks[LANDMARK.INDEX_TIP].y) / 2;
    }
  }

  /** Active pinches, ordered by hand id so the "first" and "second" hand stay stable. */
  pinchInputs(): PinchInput[] {
    this.inputs.length = 0;
    for (const tr of this.tracks) {
      if (tr.pinch.active) this.inputs.push({ id: `hand-${tr.id}`, point: tr.pinch.midpoint });
    }
    this.inputs.sort((a, b) => (a.id < b.id ? -1 : 1));
    return this.inputs;
  }

  private createTrack(): Track {
    const track: Track = {
      id: this.nextId++,
      handedness: '',
      landmarks: [],
      viewLandmarks: makePoints(21),
      pinch: { active: false, ratio: 1, thumb: { x: 0, y: 0 }, index: { x: 0, y: 0 }, midpoint: { x: 0, y: 0 } },
      lastSeen: 0,
      stale: false,
      filter: new PointFilter(2.4, 0.04),
      openFrames: 0,
      matched: false,
    };
    this.tracks.push(track);
    return track;
  }

  private updatePinch(track: Track, now: number): void {
    const v = track.viewLandmarks;
    const thumb = v[LANDMARK.THUMB_TIP];
    const index = v[LANDMARK.INDEX_TIP];
    // Palm size: wrist→middle knuckle, with the knuckle span as a guard for foreshortened palms.
    const palm = Math.max(distance(v[LANDMARK.WRIST], v[LANDMARK.MIDDLE_MCP]), distance(v[LANDMARK.INDEX_MCP], v[LANDMARK.PINKY_MCP]) * 1.3, 1);
    const ratio = distance(thumb, index) / palm;
    const p = track.pinch;
    p.ratio = ratio;
    p.thumb.x = thumb.x;
    p.thumb.y = thumb.y;
    p.index.x = index.x;
    p.index.y = index.y;

    const wasActive = p.active;
    if (!p.active && ratio < PINCH_ENTER) {
      p.active = true;
      track.openFrames = 0;
    } else if (p.active) {
      track.openFrames = ratio > PINCH_EXIT ? track.openFrames + 1 : 0;
      if (track.openFrames >= RELEASE_FRAMES) p.active = false;
    }

    const mx = (thumb.x + index.x) / 2;
    const my = (thumb.y + index.y) / 2;
    if (p.active && !wasActive) track.filter.reset(); // start each pinch exactly where the fingers are
    track.filter.filter(mx, my, now, p.midpoint);
  }
}
