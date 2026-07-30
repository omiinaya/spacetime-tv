/**
 * useVideoPlayer — Main video player hook
 *
 * Coordinates three playback paths (live MPEG-TS, VOD remux, HLS).
 * Types, constants, and utility functions are extracted into
 * usePlayerTypes.ts and usePlayerUtils.ts.
 *
 * Public exports: useVideoPlayer, fmtTime, QUALITIES, SPEEDS
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type {
  DocumentWithWebkit,
  PlayPhase,
  ErrorType,
  ProbeResult,
  UseVideoPlayerParams,
  UseVideoPlayerReturn,
} from "./usePlayerTypes";
export type {
  ConnectionQuality,
  ProbeResult,
  PlayPhase,
  ErrorType,
  UseVideoPlayerParams,
  UseVideoPlayerReturn,
} from "./usePlayerTypes";
export { QUALITIES, SPEEDS } from "./usePlayerTypes";
export { fmtTime } from "./usePlayerUtils";
import {
  getWatchPos,
  getVolume,
  getMuted,
  saveVolume,
  saveMuted,
  probeStream,
  transcodeCache,
  tryAutoplay,
} from "./usePlayerUtils";
import { useStreamUrls } from "./useStreamUrls";
import { usePlayerConnectionQuality } from "./usePlayerConnectionQuality";
import { usePlayerControls } from "./usePlayerControls";
import { useMpegtsPlayer, type MpegtsPlayerCallbacks } from "./useMpegtsPlayer";
import { useHlsPlayer, type HlsPlayerCallbacks } from "./useHlsPlayer";
import { useRemuxPlayer, type RemuxPlayerCallbacks } from "./useRemuxPlayer";
import { useShakaPlayer, type ShakaPlayerCallbacks } from "./useShakaPlayer";
import {
  destroyAll,
  destroyAllExcept,
  type PlayerRefs,
} from "./usePlayerCleanup";

// ── Constants for LIVE quality levels ─────────────────────────

// ── Hook ──────────────────────────────────────────────────────
export function useVideoPlayer({
  type,
  id,
  seriesId,
  epId,
  onAutoAdvance,
  timeshiftDuration,
}: UseVideoPlayerParams): UseVideoPlayerReturn {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const containerRef = useRef<HTMLDivElement>(null!);
  const phaseRef = useRef<PlayPhase>("loading");
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const destroyAllRef = useRef<(() => void)[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  /** When true, the stream can be played natively by the browser (MP4/H.264) */
  const nativePlaybackRef = useRef(false);

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  const startLoadingTimeout = useCallback(() => {
    clearLoadingTimeout();
    const vodTimeout = type !== "live" ? 60000 : 20000;
    loadingTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current === "loading") {
        if (type === "live" && retryCount.current < 5) {
          retryCount.current++;
          const v = videoRef.current;
          if (v) {
            v.pause();
            v.removeAttribute("src");
            v.load();
          }
          destroyAllRef.current.forEach((fn) => fn());
          destroyAllRef.current = [];
          setRetryKey((k) => k + 1);
          return;
        }
        setPhase("error");
        if (type === "live") {
          setErrorType("retry_exhausted");
          setErrorMsg(
            "Unable to connect after several attempts. This channel may be temporarily offline.",
          );
        } else {
          setErrorType("timeout");
          setErrorMsg(
            "Stream timed out. The server may be slow or the content may be temporarily unavailable.",
          );
        }
      }
    }, vodTimeout);
  }, [type]);

  // ── State ──────────────────────────────────────────────────
  const [phase, _setPhase] = useState<PlayPhase>("loading");
  const setPhase = useCallback((p: PlayPhase) => {
    phaseRef.current = p;
    _setPhase(p);
  }, []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [transcoding, setTranscoding] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(getVolume());
  const [muted, setMuted] = useState(getMuted());
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityIdx, setQualityIdx] = useState(0);
  const [resumePos, setResumePos] = useState<number | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [buffered, setBuffered] = useState(0);

  // ── Connection quality ───────────────────────────────────────
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const {
    connectionQuality,
    stallCount,
    suggestLowerQuality,
    onStats,
    onStall,
  } = usePlayerConnectionQuality({ downloadSpeed, qualityIdx });

  // ── Live TV DVR state ──────────────────────────────────────────
  const [isBehindLive, setIsBehindLive] = useState(false);
  const [secondsBehindLive, setSecondsBehindLive] = useState(0);
  const [liveSeekableStart, setLiveSeekableStart] = useState(0);
  const [liveSeekableEnd, setLiveSeekableEnd] = useState(0);

  // ── Derived values and URL builders ──────────────────────────
  const {
    isLive,
    isVod,
    watchKey,
    streamId,
    dashUrl,
    streamPath,
    transcodePath,
    remuxUrl,
    vodTranscodeUrl,
    probeUrl,
    timeshiftUrl,
  } = useStreamUrls({ type, id, seriesId, epId, qualityIdx });

  // ── Sub-hooks: mpegts.js player (live TV) ─────────────────────
  const mpegtsCallbacks = useMemo<MpegtsPlayerCallbacks>(
    () => ({
      onPhaseChange: (phase) => {
        setPhase(phase);
      },
      onError: (type, msg) => {
        setErrorType(type);
        setErrorMsg(msg);
      },
      onAutoplayMuted: () => {
        setMuted(true);
      },
      onStats: (speed, dropped, decoded) => {
        setDownloadSpeed(speed);
        onStats(speed, dropped, decoded);
      },
      onStall: () => {
        onStall();
      },
      onPlaying: () => {
        clearLoadingTimeout();
        setPhase("playing");
      },
      onLiveTimeUpdate: (ct, start, end, behind, isBehind) => {
        setCurrentTime(ct);
        setLiveSeekableStart(start);
        setLiveSeekableEnd(end);
        setSecondsBehindLive(behind);
        setIsBehindLive(isBehind);
      },
      clearLoadingTimeout,
      startLoadingTimeout,
    }),
    [
      setPhase,
      setErrorType,
      setErrorMsg,
      setMuted,
      setDownloadSpeed,
      clearLoadingTimeout,
      startLoadingTimeout,
      setCurrentTime,
      setLiveSeekableStart,
      setLiveSeekableEnd,
      setSecondsBehindLive,
      setIsBehindLive,
      onStats,
      onStall,
    ],
  );

  const {
    playerRef: mpegtsPlayerRef,
    mpegtsCleanupRef,
    playMPEGTS: subHookPlayMPEGTS,
    destroy: destroyMpegts,
  } = useMpegtsPlayer(videoRef, mpegtsCallbacks);

  // ── Sub-hooks: useShakaPlayer (HLS/DASH fallback) ────────────────
  // Must be defined before useHlsPlayer since hls callbacks reference
  // subPlayShaka for unrecoverable error fallback.
  const shakaFallbackUrlRef = useRef<string | null>(null);
  const shakaCallbacks = useMemo<ShakaPlayerCallbacks>(
    () => ({
      onPhaseChange: setPhase,
      onError: (type, msg) => {
        setErrorType(type);
        setErrorMsg(msg);
      },
      onStall: () => {
        onStall();
      },
      onTimeUpdate: (ct, buf) => {
        setCurrentTime(ct);
        setBuffered(buf);
      },
      onDuration: (d) => setDuration(d),
      onAutoplayMuted: () => {
        setMuted(true);
      },
      clearLoadingTimeout,
    }),
    [
      setPhase,
      setErrorType,
      setErrorMsg,
      setMuted,
      setCurrentTime,
      setBuffered,
      setDuration,
      clearLoadingTimeout,
      onStall,
    ],
  );

  const {
    playerRef: shakaPlayerRef,
    shakaCleanupRef,
    playShaka: subPlayShaka,
    destroy: destroyShaka,
  } = useShakaPlayer(videoRef, shakaCallbacks);

  // ── Sub-hooks: useHlsPlayer (HLS VOD) — with shaka-player fallback ─
  const hlsCallbacks = useMemo<HlsPlayerCallbacks>(
    () => ({
      onPhaseChange: setPhase,
      onError: (type, msg) => {
        setErrorType(type);
        setErrorMsg(msg);
      },
      onStall: () => {
        onStall();
      },
      onTimeUpdate: (ct, buf) => {
        setCurrentTime(ct);
        setBuffered(buf);
      },
      onDuration: (d) => setDuration(d),
      onAutoplayMuted: () => {
        setMuted(true);
      },
      clearLoadingTimeout,
      onHlsFatalError: (url) => {
        // Fall back to shaka-player when hls.js fails unrecoverably.
        // Try DASH MPD first (better adaptive bitrate), then HLS as fallback.
        shakaFallbackUrlRef.current = url;
        setPhase("loading");
        setErrorMsg(null);
        // Compute watchKey inline since it's defined later in the hook
        const wk =
          type === "movie"
            ? `vod_${id}`
            : type === "series"
              ? `ep_${seriesId}_${epId}`
              : "";
        // Use DASH MPD if available (better adaptive streaming)
        if (dashUrl) {
          subPlayShaka(
            dashUrl,
            "application/dash+xml",
            null,
            type,
            seriesId,
            epId,
            id,
            wk,
            onAutoAdvance,
          );
        } else {
          subPlayShaka(
            url,
            "application/x-mpegURL",
            null,
            type,
            seriesId,
            epId,
            id,
            wk,
            onAutoAdvance,
          );
        }
      },
    }),
    [
      setPhase,
      setErrorType,
      setErrorMsg,
      setMuted,
      setCurrentTime,
      setBuffered,
      setDuration,
      clearLoadingTimeout,
      onStall,
      subPlayShaka,
      type,
      seriesId,
      epId,
      id,
      onAutoAdvance,
      dashUrl,
    ],
  );

  const {
    hlsRef: subHlsRef,
    hlsCleanupRef,
    destroy: destroyHls,
  } = useHlsPlayer(videoRef, hlsCallbacks);

  // ── Sub-hooks: useRemuxPlayer (VOD remux) ─────────────────────
  const remuxCallbacks = useMemo<RemuxPlayerCallbacks>(
    () => ({
      onPhaseChange: setPhase,
      onError: (type, msg) => {
        setErrorType(type);
        setErrorMsg(msg);
      },
      onStats: (speed, dropped, decoded) => {
        setDownloadSpeed(speed);
        onStats(speed, dropped, decoded);
      },
      onStall: () => {
        onStall();
      },
      onTimeUpdate: (ct, buf) => {
        setCurrentTime(ct);
        setBuffered(buf);
      },
      onDuration: (d) => setDuration(d),
      onAutoplayMuted: () => {
        setMuted(true);
      },
      clearLoadingTimeout,
      startLoadingTimeout,
      setTranscoding,
    }),
    [
      setPhase,
      setErrorType,
      setErrorMsg,
      setDownloadSpeed,
      setMuted,
      setCurrentTime,
      setBuffered,
      setDuration,
      clearLoadingTimeout,
      startLoadingTimeout,
      setTranscoding,
      onStats,
      onStall,
    ],
  );

  const {
    playerRef: remuxPlayerRef,
    remuxCleanupRef,
    vodUrlRef: remuxVodUrlRef,
    vodTranscodeRef: remuxVodTranscodeRef,
    playVodRemux: subPlayVodRemux,
    destroy: destroyRemux,
  } = useRemuxPlayer(videoRef, remuxCallbacks);

  // Populate destroy-all for use in startLoadingTimeout (defined before sub-hooks)
  destroyAllRef.current = [
    destroyMpegts,
    destroyHls,
    destroyRemux,
    destroyShaka,
  ];

  const playerRefs: PlayerRefs = {
    mpegtsCleanupRef,
    mpegtsPlayerRef,
    hlsCleanupRef,
    subHlsRef,
    remuxCleanupRef,
    remuxPlayerRef,
    shakaCleanupRef,
    shakaPlayerRef,
  };

  // ── Playback: MPEG-TS via mpegts.js (live TV only) ──────────
  const playMPEGTS = useCallback(
    (url: string, liveFlag: boolean, isTranscode: boolean) => {
      destroyAllExcept(playerRefs, "mpegts");
      setPhase("loading");
      setErrorMsg(null);
      if (isTranscode) setTranscoding(true);
      subHookPlayMPEGTS(url, liveFlag, isTranscode);
    },
    [setPhase, setErrorMsg, setTranscoding, subHookPlayMPEGTS],
  );

  // ── Playback: VOD via mpegts remux ──────────────────────────
  const playVodRemux = useCallback(
    (
      streamUrl: string,
      startPos: number | null = null,
      isTranscode: boolean = false,
    ) => {
      destroyAllExcept(playerRefs, "remux");
      subPlayVodRemux(
        streamUrl,
        startPos,
        isTranscode,
        type,
        seriesId,
        epId,
        id,
        watchKey,
        onAutoAdvance,
      );
    },
    [subPlayVodRemux, type, seriesId, epId, id, watchKey, onAutoAdvance],
  );

  // ── VOD startup ────────────────────────────────────────────
  const startVod = useCallback(
    async (
      _isCancelled: () => boolean,
      seekPos?: number,
      needsTranscode: boolean = false,
    ) => {
      // ── Native MP4/H.264 path — skip ffmpeg remux entirely ──
      if (nativePlaybackRef.current && !needsTranscode) {
        const v = videoRef.current;
        if (!v) return;
        destroyAll(playerRefs);
        setPhase("loading");
        setErrorMsg(null);
        startLoadingTimeout();
        setLoadingStep("Starting stream…");
        setTranscoding(false);
        // Register event listeners for time tracking
        const onTimeUpdate = () => {
          const ct = v.currentTime;
          const buf = v.buffered;
          const bufferedEnd = buf.length > 0 ? buf.end(buf.length - 1) : 0;
          setCurrentTime(ct);
          setBuffered(bufferedEnd);
          if (ct > 0.1) {
            clearLoadingTimeout();
            setPhase("playing");
          }
        };
        const onDuration = () => {
          const d = v.duration;
          if (d && isFinite(d)) setDuration(d);
        };
        const onWaiting = () => onStall();
        const onLoadedMeta = () => {
          if (seekPos && seekPos > 5) {
            v.currentTime = seekPos;
          }
        };
        v.addEventListener("timeupdate", onTimeUpdate);
        v.addEventListener("durationchange", onDuration);
        v.addEventListener("waiting", onWaiting);
        v.addEventListener("loadedmetadata", onLoadedMeta, { once: true });
        // Store cleanup on the video element itself so destroyAll can find it
        const elt = v as unknown as Record<string, unknown>;
        const flag = "__stv_native_listeners__";
        const old = elt[flag];
        if (typeof old === "function") old();
        elt[flag] = () => {
          v.removeEventListener("timeupdate", onTimeUpdate);
          v.removeEventListener("durationchange", onDuration);
          v.removeEventListener("waiting", onWaiting);
          v.removeEventListener("loadedmetadata", onLoadedMeta);
        };
        // Browser plays MP4 directly with Range-request proxy
        v.src = streamPath;
        v.load();
        tryAutoplay(v, () => setMuted(true));
        return;
      }
      // ── Standard remux/transcode path via ffmpeg + mpegts.js ──
      const streamUrl = needsTranscode ? vodTranscodeUrl : remuxUrl;
      if (!streamUrl) return;
      setPhase("loading");
      setErrorMsg(null);
      startLoadingTimeout();
      setLoadingStep(
        needsTranscode ? "Preparing H.264 conversion…" : "Starting stream…",
      );
      if (needsTranscode) setTranscoding(true);
      playVodRemux(streamUrl, seekPos ?? null, needsTranscode);
    },
    [remuxUrl, vodTranscodeUrl, streamPath, playVodRemux, nativePlaybackRef],
  );

  // ── Main effect ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let phaseTimedOut = false;
    const abortController = new AbortController();
    const video = videoRef.current;
    if (video) {
      video.volume = volume;
      video.playbackRate = playbackRate;
    }

    const safetyTimer = setTimeout(() => {
      if (cancelled) return;
      if (phaseRef.current === "probing") {
        phaseTimedOut = true;
        transcodeCache.set(streamId, "native");
        setPhase("loading");
        setLoadingStep("Starting stream…");
        setErrorMsg(null);
        startLoadingTimeout();
        if (isLive) {
          playMPEGTS(streamPath, true, false);
        } else {
          startVod(() => cancelled, undefined, false);
        }
      }
    }, 18_000);

    const start = async () => {
      setPhase("probing");
      setErrorMsg(null);
      setTranscoding(false);
      setLoadingStep("Detecting video format…");

      let needsTranscode = false;
      let probeHeight = 0;
      if (transcodeCache.has(streamId)) {
        needsTranscode = transcodeCache.get(streamId) === "hevc";
      } else {
        const probeTimer = setTimeout(() => {
          if (!cancelled && !phaseTimedOut)
            setLoadingStep("Analyzing video format…");
        }, 5_000);
        let result: ProbeResult;
        try {
          result = await probeStream(probeUrl, abortController.signal);
        } catch {
          result = { codec: "unknown" };
        } /* HTTP error or abort */
        clearTimeout(probeTimer);
        if (phaseTimedOut || cancelled) return;

        if (result.codec === "hevc") {
          needsTranscode = true;
          probeHeight = result.height || 0;
          transcodeCache.set(streamId, "hevc");
        } else if (result.codec === "unavailable") {
          if (isLive) {
            setPhase("error");
            setErrorType("empty_stream");
            setErrorMsg(
              "This channel is not available on the current CDN edge. Try a different channel or source.",
            );
            transcodeCache.set(streamId, "native");
            return;
          } else {
            setPhase("error");
            setErrorType("empty_stream");
            setErrorMsg(
              "This video is not available on the current CDN edge server.",
            );
            return;
          }
        } else {
          transcodeCache.set(streamId, "native");
          if (result.native) nativePlaybackRef.current = true;
        }
      }
      if (cancelled || phaseTimedOut) return;

      if (needsTranscode && isLive && probeHeight >= 2160 && qualityIdx === 0) {
        setQualityIdx(1);
      }

      if (isLive) {
        // Timeshift mode: skip probe, use timeshift URL directly
        if (timeshiftDuration && timeshiftDuration > 0) {
          const tsu = timeshiftUrl(timeshiftDuration);
          playMPEGTS(tsu, false, false);
          return;
        }
        const url = needsTranscode ? transcodePath || streamPath : streamPath;
        playMPEGTS(url, true, needsTranscode);
        return;
      }

      if (watchKey) {
        const pos = getWatchPos(watchKey);
        if (pos && pos > 5) {
          setResumePos(pos);
          setShowResumePrompt(true);
          setPhase("playing");
          transcodeCache.set(
            `_last_${streamId}`,
            needsTranscode ? "hevc" : "native",
          );
          return;
        }
      }

      await startVod(() => cancelled, undefined, needsTranscode);
    };

    start();
    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      clearLoadingTimeout();
      abortController.abort();
      const v = videoRef.current;
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }
      destroyMpegts();
      destroyHls();
      destroyRemux();
      destroyShaka();
    };
  }, [streamPath, retryKey]);

  // ── Retry ──────────────────────────────────────────────────
  const retryStream = useCallback(() => {
    clearLoadingTimeout();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    destroyMpegts();
    destroyHls();
    destroyRemux();
    destroyShaka();
    retryCount.current++;
    setPhase("loading");
    setErrorMsg(null);
    setRetryKey((k) => k + 1);
  }, [clearLoadingTimeout]);

  // ── Audio track switching (VOD) ────────────────────────────
  const switchAudioTrack = useCallback(
    (audioIndex: number) => {
      if (!isVod) return;
      const v = videoRef.current;
      if (!v) return;
      const savePos = v.currentTime;
      const sid = epId || id || "";
      if (!sid) return;
      const mediaType = type === "series" ? "series" : "movie";
      const audioUrl = `/api/audio/stream/${mediaType}/${sid}/${audioIndex}`;
      clearLoadingTimeout();
      v.pause();
      destroyAll(playerRefs);
      playVodRemux(audioUrl, savePos > 3 ? savePos : null, false);
    },
    [isVod, type, id, epId, playVodRemux, clearLoadingTimeout],
  );

  const resumePlayback = useCallback(() => {
    setShowResumePrompt(false);
    const needsTC = transcodeCache.get(`_last_${streamId}`) === "hevc";
    startVod(() => false, resumePos ?? undefined, needsTC);
  }, [resumePos, startVod, streamId]);

  const startFromBeginning = useCallback(() => {
    setShowResumePrompt(false);
    const needsTC = transcodeCache.get(`_last_${streamId}`) === "hevc";
    startVod(() => false, undefined, needsTC);
  }, [startVod, streamId]);

  // ── Cleanup on unmount ─────────────────────────────────────
  useEffect(() => {
    return () => {
      try {
        if (document.fullscreenElement)
          document.exitFullscreen().catch(() => {});
        const doc = document as DocumentWithWebkit;
        if (doc.webkitFullscreenElement) doc.webkitExitFullscreen();
      } catch {} // Error: fullscreen not supported or already exited
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      destroyMpegts();
      destroyHls();
      destroyRemux();
    };
  }, []);

  const {
    togglePlay,
    seekTo,
    seek,
    setVolume,
    toggleMute,
    setSpeed,
    setQuality,
    seekToLive,
  } = usePlayerControls({
    videoRef,
    subHlsRef,
    remuxVodUrlRef,
    remuxVodTranscodeRef,
    isLive,
    isVod,
    playVodRemux,
    destroyMpegts,
    destroyHls,
    setCurrentTime,
    setPhase,
    setVolumeState,
    volume,
    muted,
    setMuted,
    setPlaybackRate,
    setQualityIdx,
    setIsBehindLive,
    setSecondsBehindLive,
    clearLoadingTimeout,
    saveVolume,
    saveMuted,
  });

  return {
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    phase,
    errorMsg,
    errorType,
    loadingStep,
    transcoding,
    volume,
    muted,
    playbackRate,
    qualityIdx,
    currentTime,
    duration,
    buffered,
    resumePos,
    showResumePrompt,
    isLive,
    isVod,
    isBehindLive,
    secondsBehindLive,
    liveSeekableStart,
    liveSeekableEnd,
    connectionQuality,
    stallCount,
    suggestLowerQuality,
    downloadSpeed,
    seekToLive,
    switchAudioTrack,
    togglePlay,
    seekTo,
    seek,
    setVolume,
    toggleMute,
    setSpeed,
    setQuality,
    resumePlayback,
    startFromBeginning,
    retryStream,
    onAutoAdvance,
  };
}
