/**
 * useFrameRateDetector — Detects source video frame rate using
 * requestVideoFrameCallback (modern browsers) and display refresh rate.
 *
 * Returns the estimated video frame rate (fps), the detected display
 * refresh rate (Hz), and whether video frame detection is supported.
 */
import { useState, useEffect, useRef } from "react";

// ── Public types ──────────────────────────────────────────────
export interface FrameRateInfo {
  /** Estimated video source frame rate, or 0 while gathering samples */
  videoFps: number;
  /** Detected display refresh rate (typically 60, 120, 144, or 0 if unknown) */
  displayHz: number;
  /** Whether the browser supports requestVideoFrameCallback */
  supported: boolean;
  /** Human-readable label, e.g. "60 fps" or "—" when unknown */
  label: string;
}

// ── Constants ─────────────────────────────────────────────────
/** Number of frame samples to average over for a stable estimate */
const SAMPLE_WINDOW = 30;
/** Minimum samples needed before reporting a value */
const MIN_SAMPLES = 5;
/** Idle threshold (ms) — if the gap between frames exceeds this, reset the window */
const MAX_FRAME_GAP_MS = 500;

// ── Type augmentation for Screen API (Chrome 100+: screen.refreshRate) ──
declare global {
  interface Screen {
    refreshRate?: number;
  }
}

// ── Helper: estimate display refresh rate ─────────────────────
function estimateDisplayHz(): number {
  if (typeof window === "undefined") return 0;
  // Use screen refresh rate if available (Chrome 100+ / modern browsers)
  const screen = window.screen;
  if (typeof screen.refreshRate === "number") {
    return Math.round(screen.refreshRate);
  }
  // Fallback: common default
  return 60;
}

// ── Hook ──────────────────────────────────────────────────────
export function useFrameRateDetector(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  active: boolean,
): FrameRateInfo {
  const [videoFps, setVideoFps] = useState(0);
  const [displayHz, setDisplayHz] = useState(0);
  const [supported, setSupported] = useState(false);

  // Refs for frame timing
  const frameTimesRef = useRef<number[]>([]);
  const prevTimestampRef = useRef<number>(0);
  const callbackHandleRef = useRef<number>(0);

  // Detect support once
  useEffect(() => {
    const hasRVFC = typeof HTMLVideoElement !== "undefined" &&
      "requestVideoFrameCallback" in HTMLVideoElement.prototype;
    setSupported(hasRVFC);
  }, []);

  // Estimate display refresh rate once
  useEffect(() => {
    setDisplayHz(estimateDisplayHz());
  }, []);

  // Main detection loop
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !active || !supported) return;

    // Defensive: guard against incomplete polyfills
    if (typeof video.requestVideoFrameCallback !== "function") return;

    const onFrame: VideoFrameRequestCallback = (_now, metadata) => {
      if (!metadata) return;

      const currentMediaTime = metadata.mediaTime;
      const prevTime = prevTimestampRef.current;

      if (prevTime > 0) {
        const delta = currentMediaTime - prevTime;
        // Ignore gaps that are too large (seek, pause, buffering)
        if (delta > 0 && delta < MAX_FRAME_GAP_MS / 1000) {
          frameTimesRef.current.push(delta);
          // Keep only the latest N samples
          if (frameTimesRef.current.length > SAMPLE_WINDOW) {
            frameTimesRef.current.shift();
          }
        }
      }
      prevTimestampRef.current = currentMediaTime;

      // Calculate rolling average
      const samples = frameTimesRef.current;
      if (samples.length >= MIN_SAMPLES) {
        const avgDelta =
          samples.reduce((a, b) => a + b, 0) / samples.length;
        const fps = Math.round(1 / avgDelta);
        setVideoFps(fps);
      }

      // Schedule next frame callback
      callbackHandleRef.current = video.requestVideoFrameCallback(onFrame);
    };

    // Start the loop
    callbackHandleRef.current = video.requestVideoFrameCallback(onFrame);

    return () => {
      if (callbackHandleRef.current && typeof video.cancelVideoFrameCallback === "function") {
        video.cancelVideoFrameCallback(callbackHandleRef.current);
      }
    };
  }, [videoRef, active, supported]);

  // Derive label
  const label = videoFps > 0 ? `${videoFps} fps` : "—";

  return { videoFps, displayHz, supported, label };
}

export default useFrameRateDetector;
