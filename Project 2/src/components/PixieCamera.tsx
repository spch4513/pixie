import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import type { CameraFacing, CaptureResult, PixieError, RecordingState } from '../types';
import { openCamera, stopStream, toCameraError, type CameraSession } from '../lib/camera';
import { capturePhoto, downloadCapture, releaseCapture, shareCapture } from '../lib/capture';
import { commandForKey, type CommandSource, type PixieCommand } from '../lib/commands';
import { PixieEngine } from '../lib/engine';
import { createHandTracker } from '../lib/handTracker';
import { CanvasRecorder, recordingSupportIssue } from '../lib/recorder';
import { readPref, StorageKeys, writePref } from '../lib/storage';
import { clamp } from '../lib/transform';
import { CapturePreview } from './CapturePreview';
import { ControlDock } from './ControlDock';
import { ErrorPanel, type ErrorAction } from './ErrorPanel';
import { HelpOverlay } from './HelpOverlay';
import { Toast, type ToastData } from './Toast';
import { TopBar } from './TopBar';

interface PixieCameraProps {
  initialFacing: CameraFacing;
  onExit(): void;
}

type CameraStatus = 'starting' | 'live' | 'error';
type TrackingStatus = 'loading' | 'ready' | 'failed';

const MAX_RECORDING_MS = 5 * 60 * 1000;
const IDLE_RECORDING: RecordingState = { status: 'idle', startedAt: null, mimeType: null, extension: null };

function initialDetail(): number {
  const v = Number(readPref(StorageKeys.detail));
  return Number.isFinite(v) && readPref(StorageKeys.detail) !== null ? clamp(v, 0, 1) : 0.45;
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const facingName = (f: CameraFacing) => (f === 'user' ? 'selfie' : 'rear');

export function PixieCamera({ initialFacing, onExit }: PixieCameraProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const debugRef = useRef<HTMLPreElement>(null);
  const engineRef = useRef<PixieEngine | null>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const recorderRef = useRef<CanvasRecorder | null>(null);
  const captureRef = useRef<CaptureResult | null>(null);
  const lastGoodFacingRef = useRef<CameraFacing | null>(null);
  const fallingBackRef = useRef(false);

  const [facing, setFacing] = useState<CameraFacing>(initialFacing);
  const [cameraKey, setCameraKey] = useState(0);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('starting');
  const [cameraError, setCameraError] = useState<PixieError | null>(null);
  const [trackingAttempt, setTrackingAttempt] = useState(0);
  const [tracking, setTracking] = useState<TrackingStatus>('loading');
  const [hasSelection, setHasSelection] = useState(false);
  const [locked, setLocked] = useState(false);
  const [detail, setDetail] = useState(initialDetail);
  const [debug, setDebug] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => readPref(StorageKeys.onboardingDone) !== '1');
  const [recording, setRecording] = useState<RecordingState>(IDLE_RECORDING);
  const [elapsed, setElapsed] = useState(0);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [flash, setFlash] = useState(0);
  const [recordIssue] = useState(recordingSupportIssue);

  const isRecording = recording.status !== 'idle';

  const showToast = useCallback((t: Omit<ToastData, 'id'>) => setToast({ ...t, id: performance.now() }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const replaceCapture = (next: CaptureResult | null) => {
    releaseCapture(captureRef.current);
    captureRef.current = next;
    setCapture(next);
  };

  // ─────────────────────────────── recording ───────────────────────────────

  const stopRecording = async (reason?: 'rotated' | 'limit' | 'error') => {
    const recorder = recorderRef.current;
    if (!recorder?.active) return;
    setRecording((r) => ({ ...r, status: 'stopping' }));
    const result = await recorder.stop();
    setRecording(IDLE_RECORDING);
    if (result) replaceCapture(result);
    else showToast({ message: 'That recording came out empty. Try again.', tone: 'warn' });
    if (reason === 'rotated') showToast({ message: 'The screen rotated, so recording stopped to keep the clip intact.', tone: 'warn', duration: 5000 });
    if (reason === 'limit') showToast({ message: 'Clips are capped at 5 minutes. Recording stopped.', duration: 5000 });
  };

  const startRecording = (force = false) => {
    const engine = engineRef.current;
    if (!engine || cameraStatus !== 'live' || isRecording) return;
    if (recordIssue) {
      showToast({ message: recordIssue, tone: 'warn', duration: 6000 });
      return;
    }
    if (!hasSelection && !force) {
      showToast({ message: 'No Pixie area yet. Pinch to place one first.', action: { label: 'Record anyway', onClick: () => startRecording(true) }, duration: 6000 });
      return;
    }
    recorderRef.current ??= new CanvasRecorder();
    try {
      const started = recorderRef.current.start(engine.outputCanvas, (message) => showToast({ message, tone: 'warn' }));
      setElapsed(0);
      setRecording({ status: 'recording', startedAt: started.startedAt, mimeType: started.mimeType, extension: started.extension });
    } catch (err) {
      showToast({ message: (err as Error)?.message || 'Recording couldn’t start in this browser.', tone: 'warn', duration: 6000 });
    }
  };

  const onRecordLimit = useEffectEvent(() => void stopRecording('limit'));
  useEffect(() => {
    if (recording.status !== 'recording' || recording.startedAt === null) return;
    const startedAt = recording.startedAt;
    const id = window.setInterval(() => {
      const ms = Date.now() - startedAt;
      setElapsed(ms);
      if (ms >= MAX_RECORDING_MS) onRecordLimit();
    }, 250);
    return () => window.clearInterval(id);
  }, [recording.status, recording.startedAt]);

  // ─────────────────────────────── photo ───────────────────────────────

  const takePhoto = async (force = false) => {
    const engine = engineRef.current;
    if (!engine || cameraStatus !== 'live') return;
    if (!hasSelection && !force) {
      showToast({ message: 'No Pixie area yet. Pinch to place one first.', action: { label: 'Shoot anyway', onClick: () => void takePhoto(true) }, duration: 6000 });
      return;
    }
    setFlash((n) => n + 1);
    try {
      replaceCapture(await capturePhoto(engine.outputCanvas));
    } catch (err) {
      showToast({ message: (err as Error)?.message || 'The photo couldn’t be saved.', tone: 'warn' });
    }
  };

  // ─────────────────────────────── commands ───────────────────────────────

  const applyLock = (next: boolean, source: CommandSource) => {
    if (!hasSelection || next === locked) return;
    setLocked(next);
    engineRef.current?.setLocked(next);
    if (source !== 'touch') showToast({ message: next ? 'Locked. Gestures won’t move it.' : 'Unlocked. Pinch to move or scale.', duration: 1800 });
  };

  const flipCamera = () => {
    if (isRecording) {
      showToast({ message: 'Stop recording before switching cameras.' });
      return;
    }
    setCameraStatus('starting');
    setCameraError(null);
    setFacing((f) => (f === 'user' ? 'environment' : 'user'));
  };

  const runCommand = (cmd: PixieCommand, source: CommandSource) => {
    switch (cmd.type) {
      case 'lock':
        return applyLock(true, source);
      case 'unlock':
        return applyLock(false, source);
      case 'toggle-lock':
        return applyLock(!locked, source);
      case 'clear':
        engineRef.current?.clearSelection();
        engineRef.current?.setLocked(false);
        setLocked(false);
        return;
      case 'photo':
        return void takePhoto();
      case 'toggle-record':
        return isRecording ? void stopRecording() : startRecording();
      case 'flip-camera':
        return flipCamera();
      case 'set-detail':
        return setDetail(clamp(cmd.value, 0, 1));
      case 'nudge-detail':
        return setDetail((d) => clamp(Math.round((d + cmd.delta) * 100) / 100, 0, 1));
      case 'help':
        return setHelpOpen(true);
      case 'toggle-debug':
        return setDebug((d) => !d);
    }
  };

  const onKeyCommand = useEffectEvent((e: KeyboardEvent) => {
    if (helpOpen || capture || cameraStatus === 'error') return;
    const cmd = commandForKey(e);
    if (!cmd) return;
    // Space/Enter on a focused button should activate that button, not a shortcut.
    if ((e.target as HTMLElement)?.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
    e.preventDefault();
    runCommand(cmd, 'keyboard');
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => onKeyCommand(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ─────────────────────────────── engine ───────────────────────────────

  const onOutputResize = useEffectEvent(() => {
    if (recorderRef.current?.active) void stopRecording('rotated');
  });
  const onLockedInteraction = useEffectEvent(() => {
    showToast({ message: 'Area is locked. Tap Unlock to move it.', duration: 2200 });
  });
  const onTrackingError = useEffectEvent((err: unknown) => {
    console.error('[pixie] hand tracking stopped', err);
    setTracking('failed');
  });

  useEffect(() => {
    const engine = new PixieEngine(
      { stage: stageRef.current!, output: outputRef.current!, overlay: overlayRef.current!, video: videoRef.current! },
      {
        onSelectionChange: (has) => setHasSelection(has),
        onFirstFrame: () => setCameraStatus('live'),
        onTrackingError: (err) => onTrackingError(err),
        onOutputResize: () => onOutputResize(),
        onLockedInteraction: () => onLockedInteraction(),
      },
    );
    engineRef.current = engine;
    engine.start();
    return () => {
      engine.dispose();
      engineRef.current = null;
      recorderRef.current?.dispose();
      recorderRef.current = null;
      releaseCapture(captureRef.current);
      captureRef.current = null;
    };
  }, []);

  useEffect(() => {
    engineRef.current?.setDetail(detail);
    writePref(StorageKeys.detail, detail.toFixed(2));
  }, [detail]);

  useEffect(() => {
    engineRef.current?.setDebug(debug, debugRef.current);
  }, [debug]);

  // Hand tracker: loads in the background; touch/mouse control works in the meantime.
  useEffect(() => {
    let cancelled = false;
    let tracker: Awaited<ReturnType<typeof createHandTracker>> | null = null;
    createHandTracker().then(
      (t) => {
        if (cancelled) {
          t.close();
          return;
        }
        tracker = t;
        engineRef.current?.setTracker(t);
        setTracking('ready');
      },
      (err) => {
        if (cancelled) return;
        console.error('[pixie] hand tracking failed to initialise', err);
        setTracking('failed');
      },
    );
    return () => {
      cancelled = true;
      engineRef.current?.setTracker(null);
      tracker?.close();
    };
  }, [trackingAttempt]);

  // Camera: (re)opens on facing change or reconnect. Cleanup stops the old stream first,
  // because many phones can't hold two cameras open at once.
  const onCameraFailure = useEffectEvent((err: unknown, requested: CameraFacing) => {
    const error = toCameraError(err);
    const previous = lastGoodFacingRef.current;
    if (previous && previous !== requested && !fallingBackRef.current && error.kind !== 'permission-denied') {
      fallingBackRef.current = true;
      showToast({ message: `Couldn’t open the ${facingName(requested)} camera. Staying on ${facingName(previous)}.`, tone: 'warn', duration: 5000 });
      setFacing(previous);
      return;
    }
    fallingBackRef.current = false;
    setCameraError(error);
    setCameraStatus('error');
  });
  const onCameraEnded = useEffectEvent(() => {
    if (recorderRef.current?.active) void stopRecording('error');
    setCameraError({
      kind: 'stream-interrupted',
      title: 'Camera stream interrupted',
      message: 'The camera stopped sending video — another app may have taken it, or it was disconnected.',
    });
    setCameraStatus('error');
  });

  useEffect(() => {
    let stale = false;
    let session: CameraSession | null = null;
    const onEnded = () => {
      if (!stale) onCameraEnded();
    };
    (async () => {
      try {
        session = await openCamera(facing);
      } catch (err) {
        if (!stale) onCameraFailure(err, facing);
        return;
      }
      if (stale) {
        stopStream(session.stream);
        return;
      }
      sessionRef.current = session;
      session.track.addEventListener('ended', onEnded);
      try {
        await engineRef.current?.attachStream(session.stream, session.mirrored);
      } catch (err) {
        if (stale) return;
        console.warn('[pixie] video playback', err);
      }
      lastGoodFacingRef.current = facing;
      fallingBackRef.current = false;
    })();
    return () => {
      stale = true;
      if (session) {
        session.track.removeEventListener('ended', onEnded);
        stopStream(session.stream);
      }
      if (sessionRef.current === session) sessionRef.current = null;
      engineRef.current?.detachStream();
    };
  }, [facing, cameraKey]);

  // Returning to the tab after the OS reclaimed the camera: reconnect automatically.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const track = sessionRef.current?.track;
      if (track && track.readyState === 'ended') {
        setCameraStatus('starting');
        setCameraError(null);
        setCameraKey((k) => k + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // ─────────────────────────────── handlers ───────────────────────────────

  const reconnect = () => {
    setCameraError(null);
    setCameraStatus('starting');
    setCameraKey((k) => k + 1);
  };

  const closeHelp = useCallback(() => {
    setHelpOpen(false);
    writePref(StorageKeys.onboardingDone, '1');
  }, []);

  const goHome = () => {
    if (isRecording) {
      showToast({ message: 'Stop recording before leaving the camera.' });
      return;
    }
    onExit();
  };

  const onShare = async () => {
    if (!capture) return;
    const outcome = await shareCapture(capture);
    if (outcome === 'fallback') {
      downloadCapture(capture);
      showToast({ message: 'Sharing isn’t available here, so it was downloaded instead.' });
    }
  };

  const onRetake = () => {
    replaceCapture(null);
    startRecording(true);
  };

  const errorActions = (err: PixieError): ErrorAction[] => {
    const back = { label: 'Back to start', onClick: onExit };
    switch (err.kind) {
      case 'insecure-context':
      case 'unsupported-browser':
        return [{ ...back, primary: true }];
      case 'camera-unavailable':
        return [
          { label: 'Try the other camera', primary: true, onClick: () => { setCameraError(null); setCameraStatus('starting'); setFacing((f) => (f === 'user' ? 'environment' : 'user')); } },
          { label: 'Try again', onClick: reconnect },
          back,
        ];
      case 'stream-interrupted':
        return [{ label: 'Reconnect camera', primary: true, onClick: reconnect }, back];
      default:
        return [{ label: 'Try again', primary: true, onClick: reconnect }, back];
    }
  };

  const hint =
    cameraStatus !== 'live' || hasSelection || helpOpen
      ? null
      : tracking === 'ready'
        ? 'Pinch anywhere to place'
        : tracking === 'loading'
          ? 'Warming up hand tracking…'
          : 'Drag with a finger to place';

  return (
    <div className={`live ${debug ? 'is-debug' : ''}`}>
      <div ref={stageRef} className="stage" aria-label="Live camera. Pinch or drag to place the pixel area." role="application">
        <video ref={videoRef} className="stage-video" muted playsInline autoPlay aria-hidden="true" />
        <canvas ref={outputRef} className="stage-output" aria-hidden="true" />
        <div className="stage-grid" aria-hidden="true" />
        <canvas ref={overlayRef} className="stage-overlay" aria-hidden="true" />
      </div>
      <div className="frame-texture" aria-hidden="true" />

      <TopBar
        facing={facing}
        flipDisabled={isRecording || cameraStatus === 'starting'}
        flipDisabledReason={isRecording ? 'Stop recording to switch cameras' : 'Camera is starting'}
        debug={debug}
        onFlip={() => runCommand({ type: 'flip-camera' }, 'touch')}
        onHelp={() => runCommand({ type: 'help' }, 'touch')}
        onToggleDebug={() => runCommand({ type: 'toggle-debug' }, 'touch')}
        onHome={goHome}
      />

      <div className="status-row" aria-live="polite">
        {isRecording ? (
          <span className="chip chip--rec">
            <span className="rec-dot" aria-hidden="true" />
            <span>REC</span>
            <span className="chip-time">{formatElapsed(elapsed)}</span>
            <span className="visually-hidden">Recording in progress</span>
          </span>
        ) : null}
        {tracking === 'failed' ? (
          <span className="chip chip--warn">
            Hand tracking unavailable — drag to edit
            <button type="button" className="chip-action" onClick={() => { setTracking('loading'); setTrackingAttempt((n) => n + 1); }}>
              Retry
            </button>
          </span>
        ) : null}
      </div>

      {debug ? <pre ref={debugRef} className="debug-panel" aria-label="Debug information" /> : null}

      {hint ? (
        <p className="hint" aria-hidden="true">
          <span className="hint-mark" /> {hint}
        </p>
      ) : null}

      {cameraStatus === 'starting' ? (
        <div className="loading" role="status">
          <span className="loading-grid" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${(i % 3) * 90 + Math.floor(i / 3) * 90}ms` }} />
            ))}
          </span>
          <span>Opening {facingName(facing)} camera…</span>
        </div>
      ) : null}

      <ControlDock
        hasSelection={hasSelection}
        locked={locked}
        detail={detail}
        recording={isRecording}
        recordDisabledReason={recordIssue ? 'Video recording isn’t supported here' : null}
        busy={cameraStatus !== 'live'}
        onToggleLock={() => runCommand({ type: 'toggle-lock' }, 'touch')}
        onClear={() => runCommand({ type: 'clear' }, 'touch')}
        onDetail={(value) => runCommand({ type: 'set-detail', value }, 'touch')}
        onPhoto={() => runCommand({ type: 'photo' }, 'touch')}
        onToggleRecord={() => runCommand({ type: 'toggle-record' }, 'touch')}
      />

      <Toast toast={toast} onDismiss={dismissToast} />

      {flash > 0 ? <div key={flash} className="flash" aria-hidden="true" /> : null}

      {helpOpen ? <HelpOverlay onClose={closeHelp} /> : null}

      {capture ? (
        <CapturePreview
          capture={capture}
          onDownload={() => downloadCapture(capture)}
          onShare={() => void onShare()}
          onDiscard={() => replaceCapture(null)}
          onRetake={capture.kind === 'video' ? onRetake : undefined}
        />
      ) : null}

      {cameraStatus === 'error' && cameraError ? <ErrorPanel error={cameraError} actions={errorActions(cameraError)} /> : null}
    </div>
  );
}
