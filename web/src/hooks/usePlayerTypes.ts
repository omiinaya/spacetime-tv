/**
 * Shared types and constants for video player hooks.
 *
 * Extracted from useVideoPlayer.ts to reduce file size and improve
 * maintainability. Imported by useVideoPlayer.ts (main hook) and
 * the three sub-hooks (useMpegtsPlayer, useRemuxPlayer, useHlsPlayer).
 */

// ── Quality inference ────────────────────────────────────────
export type ConnectionQuality = "excellent" | "good" | "fair" | "poor";

export interface ProbeResult {
  codec: string;
  codec_long?: string;
  width?: number;
  height?: number;
  profile?: string;
  container?: string;
  error?: string;
  native?: boolean;
}

// WebKit-prefixed fullscreen API (not in standard TS DOM types)
export interface DocumentWithWebkit extends Document {
  webkitFullscreenElement: Element | null;
  webkitExitFullscreen: () => void;
}

export interface VideoElementWithWebkit extends HTMLVideoElement {
  webkitRequestFullscreen?: () => Promise<void>;
  webkitEnterFullscreen?: () => void;
}

export type PlayPhase = "probing" | "loading" | "playing" | "paused" | "error";

export type ErrorType =
  | "timeout" // Generic loading timeout
  | "transcode_timeout" // ffmpeg transcode took too long
  | "retry_exhausted" // Live TV gave up after 5 retries
  | "stream_error" // mpegts/HLS internal error
  | "not_supported" // Browser can't play this format
  | "empty_stream"; // CDN returned 0 bytes / 405

// ── Quality / Speed tiers ────────────────────────────────────
export const QUALITIES = [
  { label: "Original", height: null },
  { label: "1080p", height: 1080 },
  { label: "720p", height: 720 },
  { label: "360p", height: 360 },
] as const;

export const SPEEDS = [0.5, 1, 1.5, 2] as const;

// ── Video source types ───────────────────────────────────────
export type VideoSourceType = "live" | "movie" | "series";

// ── Hook parameter / return types ────────────────────────────
export interface UseVideoPlayerParams {
  type: VideoSourceType;
  id: string | undefined;
  seriesId: string | undefined;
  epId: string | undefined;
  onAutoAdvance?: (nextUrl: string) => void;
  /** When set and type is "live", use the timeshift stream URL instead of live */
  timeshiftDuration?: number;
}

export interface UseVideoPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  phase: PlayPhase;
  errorMsg: string | null;
  errorType: ErrorType | null;
  loadingStep: string;
  transcoding: boolean;
  volume: number;
  muted: boolean;
  playbackRate: number;
  qualityIdx: number;
  currentTime: number;
  duration: number;
  buffered: number;
  resumePos: number | null;
  showResumePrompt: boolean;
  isLive: boolean;
  isVod: boolean;
  isBehindLive: boolean;
  secondsBehindLive: number;
  liveSeekableStart: number;
  liveSeekableEnd: number;
  // Connection quality
  connectionQuality: ConnectionQuality;
  stallCount: number;
  suggestLowerQuality: boolean;
  downloadSpeed: number;
  // Actions
  seekToLive: () => void;
  togglePlay: () => void;
  seekTo: (time: number) => void;
  seek: (delta: number) => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  setSpeed: (rate: number) => void;
  setQuality: (idx: number) => void;
  switchAudioTrack: (audioIndex: number) => void;
  resumePlayback: () => void;
  startFromBeginning: () => void;
  retryStream: () => void;
  onAutoAdvance?: (nextUrl: string) => void;
}
