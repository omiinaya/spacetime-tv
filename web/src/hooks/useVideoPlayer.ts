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
import type { ConnectionQuality, DocumentWithWebkit, PlayPhase, ErrorType, ProbeResult, UseVideoPlayerParams, UseVideoPlayerReturn } from "./usePlayerTypes";
export type { ConnectionQuality, ProbeResult, PlayPhase, ErrorType, UseVideoPlayerParams, UseVideoPlayerReturn } from "./usePlayerTypes";
export { QUALITIES, SPEEDS } from "./usePlayerTypes";
export { fmtTime } from "./usePlayerUtils";
import { getWatchPos, getVolume, getMuted, saveVolume, saveMuted, probeStream, transcodeCache, tryAutoplay } from "./usePlayerUtils";
import { QUALITIES } from "./usePlayerTypes";
import { useStreamUrls } from "./useStreamUrls";
import { useMpegtsPlayer, type MpegtsPlayerCallbacks } from "./useMpegtsPlayer";
import { useHlsPlayer, type HlsPlayerCallbacks } from "./useHlsPlayer";
import { useRemuxPlayer, type RemuxPlayerCallbacks } from "./useRemuxPlayer";
import { useShakaPlayer, type ShakaPlayerCallbacks } from "./useShakaPlayer";

// ── Constants for LIVE quality levels ─────────────────────────

// ── Hook ──────────────────────────────────────────────────────
export function useVideoPlayer({ type, id, seriesId, epId, onAutoAdvance, timeshiftDuration }: UseVideoPlayerParams): UseVideoPlayerReturn {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const containerRef = useRef<HTMLDivElement>(null!);
  const phaseRef = useRef<PlayPhase>("loading");
  const userTouchedMuteRef = useRef(true);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const destroyAllRef = useRef<(() => void)[]>([]);
  const [retryKey, setRetryKey] = useState(0);
  /** When true, the stream can be played natively by the browser (MP4/H.264) */
  const nativePlaybackRef = useRef(false);


  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }
  }, []);

  const startLoadingTimeout = useCallback(() => {
    clearLoadingTimeout();
    const vodTimeout = type !== "live" ? 60000 : 20000;
    loadingTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current === "loading") {
        if (type === "live" && retryCount.current < 5) {
          retryCount.current++;
          const v = videoRef.current;
          if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
          destroyAllRef.current.forEach(fn => fn());
          destroyAllRef.current = [];
          setRetryKey(k => k + 1);
          return;
        }
        setPhase("error");
        if (type === "live") {
          setErrorType("retry_exhausted");
          setErrorMsg("Unable to connect after several attempts. This channel may be temporarily offline.");
        } else {
          setErrorType("timeout");
          setErrorMsg("Stream timed out. The server may be slow or the content may be temporarily unavailable.");
        }
      }
    }, vodTimeout);
  }, [type]);

  // ── State ──────────────────────────────────────────────────
  const [phase, _setPhase] = useState<PlayPhase>("loading");
  const setPhase = useCallback((p: PlayPhase) => { phaseRef.current = p; _setPhase(p); }, []);
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
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>("excellent");
  const [stallCount, setStallCount] = useState(0);
  const [suggestLowerQuality, setSuggestLowerQuality] = useState(false);
  const [downloadSpeed, setDownloadSpeed] = useState(0);
  const droppedFramesRef = useRef(0);
  const decodedFramesRef = useRef(0);
  const stallTimestampsRef = useRef<number[]>([]);

  // ── Live TV DVR state ──────────────────────────────────────────
  const [isBehindLive, setIsBehindLive] = useState(false);
  const [secondsBehindLive, setSecondsBehindLive] = useState(0);
  const [liveSeekableStart, setLiveSeekableStart] = useState(0);
  const [liveSeekableEnd, setLiveSeekableEnd] = useState(0);

  // ── Derived values and URL builders ──────────────────────────
  const {
    isLive, isVod, watchKey, streamId,
    dashUrl, streamPath, transcodePath, remuxUrl,
    vodTranscodeUrl, probeUrl, timeshiftUrl,
  } = useStreamUrls({ type, id, seriesId, epId, qualityIdx });

  // ── Sub-hooks: mpegts.js player (live TV) ─────────────────────
  const mpegtsCallbacks = useMemo<MpegtsPlayerCallbacks>(() => ({
    onPhaseChange: (phase) => { setPhase(phase); },
    onError: (type, msg) => { setErrorType(type); setErrorMsg(msg); },
    onAutoplayMuted: () => { setMuted(true); },
    onStats: (speed, dropped, decoded) => {
      setDownloadSpeed(speed);
      droppedFramesRef.current = dropped;
      decodedFramesRef.current = decoded;
    },
    onStall: () => { stallTimestampsRef.current.push(Date.now()); },
    onPlaying: () => { clearLoadingTimeout(); setPhase("playing"); },
    onLiveTimeUpdate: (ct, start, end, behind, isBehind) => {
      setCurrentTime(ct);
      setLiveSeekableStart(start);
      setLiveSeekableEnd(end);
      setSecondsBehindLive(behind);
      setIsBehindLive(isBehind);
    },
    clearLoadingTimeout,
    startLoadingTimeout,
  }), [setPhase, setErrorType, setErrorMsg, setMuted, setDownloadSpeed, clearLoadingTimeout, startLoadingTimeout, setCurrentTime, setLiveSeekableStart, setLiveSeekableEnd, setSecondsBehindLive, setIsBehindLive]);

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
  const shakaCallbacks = useMemo<ShakaPlayerCallbacks>(() => ({
    onPhaseChange: setPhase,
    onError: (type, msg) => { setErrorType(type); setErrorMsg(msg); },
    onStall: () => { stallTimestampsRef.current.push(Date.now()); },
    onTimeUpdate: (ct, buf) => { setCurrentTime(ct); setBuffered(buf); },
    onDuration: (d) => setDuration(d),
    onAutoplayMuted: () => { setMuted(true); },
    clearLoadingTimeout,
  }), [setPhase, setErrorType, setErrorMsg, setMuted, setCurrentTime, setBuffered, setDuration, clearLoadingTimeout]);

  const {
    playerRef: shakaPlayerRef,
    shakaCleanupRef,
    playShaka: subPlayShaka,
    destroy: destroyShaka,
  } = useShakaPlayer(videoRef, shakaCallbacks);

  // ── Sub-hooks: useHlsPlayer (HLS VOD) — with shaka-player fallback ─
  const hlsCallbacks = useMemo<HlsPlayerCallbacks>(() => ({
    onPhaseChange: setPhase,
    onError: (type, msg) => { setErrorType(type); setErrorMsg(msg); },
    onStall: () => { stallTimestampsRef.current.push(Date.now()); },
    onTimeUpdate: (ct, buf) => { setCurrentTime(ct); setBuffered(buf); },
    onDuration: (d) => setDuration(d),
    onAutoplayMuted: () => { setMuted(true); },
    clearLoadingTimeout,
    onHlsFatalError: (url) => {
      // Fall back to shaka-player when hls.js fails unrecoverably.
      // Try DASH MPD first (better adaptive bitrate), then HLS as fallback.
      shakaFallbackUrlRef.current = url;
      setPhase("loading");
      setErrorMsg(null);
      // Compute watchKey inline since it's defined later in the hook
      const wk = type === "movie" ? `vod_${id}` : type === "series" ? `ep_${seriesId}_${epId}` : "";
      // Use DASH MPD if available (better adaptive streaming)
      if (dashUrl) {
        subPlayShaka(dashUrl, "application/dash+xml", null, type, seriesId, epId, id, wk, onAutoAdvance);
      } else {
        subPlayShaka(url, "application/x-mpegURL", null, type, seriesId, epId, id, wk, onAutoAdvance);
      }
    },
  }), [setPhase, setErrorType, setErrorMsg, setMuted, setCurrentTime, setBuffered, setDuration, clearLoadingTimeout, subPlayShaka, type, seriesId, epId, id, onAutoAdvance, dashUrl]);

  const {
    hlsRef: subHlsRef,
    hlsCleanupRef,
    destroy: destroyHls,
  } = useHlsPlayer(videoRef, hlsCallbacks);

  // ── Sub-hooks: useRemuxPlayer (VOD remux) ─────────────────────
  const remuxCallbacks = useMemo<RemuxPlayerCallbacks>(() => ({
    onPhaseChange: setPhase,
    onError: (type, msg) => { setErrorType(type); setErrorMsg(msg); },
    onStats: (speed, dropped, decoded) => {
      setDownloadSpeed(speed);
      droppedFramesRef.current = dropped;
      decodedFramesRef.current = decoded;
    },
    onStall: () => { stallTimestampsRef.current.push(Date.now()); },
    onTimeUpdate: (ct, buf) => { setCurrentTime(ct); setBuffered(buf); },
    onDuration: (d) => setDuration(d),
    onAutoplayMuted: () => { setMuted(true); },
    clearLoadingTimeout,
    startLoadingTimeout,
    setTranscoding,
  }), [setPhase, setErrorType, setErrorMsg, setDownloadSpeed, setMuted, setCurrentTime, setBuffered, setDuration, clearLoadingTimeout, startLoadingTimeout, setTranscoding]);

  const {
    playerRef: remuxPlayerRef,
    remuxCleanupRef,
    vodUrlRef: remuxVodUrlRef,
    vodTranscodeRef: remuxVodTranscodeRef,
    playVodRemux: subPlayVodRemux,
    destroy: destroyRemux,
  } = useRemuxPlayer(videoRef, remuxCallbacks);

  // Populate destroy-all for use in startLoadingTimeout (defined before sub-hooks)
  destroyAllRef.current = [destroyMpegts, destroyHls, destroyRemux, destroyShaka];

  const computeConnectionQuality = useCallback(() => {
    const now = Date.now();
    const recentStalls = stallTimestampsRef.current.filter(t => now - t < 30000);
    stallTimestampsRef.current = recentStalls;
    const recentStallCount = recentStalls.length;
    const speed = downloadSpeed;
    const dropped = droppedFramesRef.current;
    const decoded = decodedFramesRef.current || 1;
    const dropRatio = dropped / decoded;
    let quality: ConnectionQuality;
    // Don't report quality until we have actual download speed data
    if (speed <= 0) {
      quality = "excellent";
    } else if (speed > 2000 && recentStallCount < 2 && dropRatio < 0.02) quality = "excellent";
    else if (speed > 500 && recentStallCount < 4 && dropRatio < 0.05) quality = "good";
    else if (speed > 100 && recentStallCount < 8) quality = "fair";
    else quality = "poor";
    setConnectionQuality(quality);
    setStallCount(recentStallCount);
    setSuggestLowerQuality(quality === "poor" && qualityIdx < QUALITIES.length - 1);
  }, [downloadSpeed, qualityIdx]);

  useEffect(() => {
    const interval = setInterval(computeConnectionQuality, 3000);
    return () => clearInterval(interval);
  }, [computeConnectionQuality]);

  // ── Playback: MPEG-TS via mpegts.js (live TV only) ──────────
  const playMPEGTS = useCallback((url: string, liveFlag: boolean, isTranscode: boolean) => {
    // Clean up HLS, remux, and shaka before delegating to sub-hook
    if (hlsCleanupRef.current) { hlsCleanupRef.current(); hlsCleanupRef.current = null; }
    try { subHlsRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
    subHlsRef.current = null;
    if (remuxCleanupRef.current) { remuxCleanupRef.current(); remuxCleanupRef.current = null; }
    try { remuxPlayerRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
    remuxPlayerRef.current = null;
    if (shakaCleanupRef.current) { shakaCleanupRef.current(); shakaCleanupRef.current = null; }
    try { shakaPlayerRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
    shakaPlayerRef.current = null;
    setPhase("loading"); setErrorMsg(null);
    if (isTranscode) setTranscoding(true);
    subHookPlayMPEGTS(url, liveFlag, isTranscode);
  }, [setPhase, setErrorMsg, setTranscoding, subHookPlayMPEGTS, hlsCleanupRef, subHlsRef, remuxCleanupRef, remuxPlayerRef, shakaCleanupRef, shakaPlayerRef]);

  // ── Playback: VOD via mpegts remux ──────────────────────────
  const playVodRemux = useCallback((streamUrl: string, startPos: number | null = null, isTranscode: boolean = false) => {
    // Clean up HLS and shaka if present before delegating to sub-hook
    if (hlsCleanupRef.current) { hlsCleanupRef.current(); hlsCleanupRef.current = null; }
    try { subHlsRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
    subHlsRef.current = null;
    if (shakaCleanupRef.current) { shakaCleanupRef.current(); shakaCleanupRef.current = null; }
    try { shakaPlayerRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
    shakaPlayerRef.current = null;
    if (mpegtsCleanupRef.current) { mpegtsCleanupRef.current(); mpegtsCleanupRef.current = null; }
    try { mpegtsPlayerRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
    mpegtsPlayerRef.current = null;
    subPlayVodRemux(streamUrl, startPos, isTranscode, type, seriesId, epId, id, watchKey, onAutoAdvance);
  }, [subPlayVodRemux, type, seriesId, epId, id, watchKey, onAutoAdvance, hlsCleanupRef, subHlsRef, shakaCleanupRef, shakaPlayerRef, mpegtsCleanupRef, mpegtsPlayerRef]);

  // ── VOD startup ────────────────────────────────────────────
  const startVod = useCallback(async (_isCancelled: () => boolean, seekPos?: number, needsTranscode: boolean = false) => {
    // ── Native MP4/H.264 path — skip ffmpeg remux entirely ──
    if (nativePlaybackRef.current && !needsTranscode) {
      const v = videoRef.current;
      if (!v) return;
      // Clean up any existing sub-hook players
      if (hlsCleanupRef.current) { hlsCleanupRef.current(); hlsCleanupRef.current = null; }
      try { subHlsRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
      subHlsRef.current = null;
      if (shakaCleanupRef.current) { shakaCleanupRef.current(); shakaCleanupRef.current = null; }
      try { shakaPlayerRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
      shakaPlayerRef.current = null;
      if (mpegtsCleanupRef.current) { mpegtsCleanupRef.current(); mpegtsCleanupRef.current = null; }
      try { mpegtsPlayerRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
      mpegtsPlayerRef.current = null;
      if (remuxCleanupRef.current) { remuxCleanupRef.current(); remuxCleanupRef.current = null; }
      try { remuxPlayerRef.current?.destroy(); } catch {} // cleanup — errors expected if already destroyed
      remuxPlayerRef.current = null;
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
      const onWaiting = () => stallTimestampsRef.current.push(Date.now());
      v.addEventListener("timeupdate", onTimeUpdate);
      v.addEventListener("durationchange", onDuration);
      v.addEventListener("waiting", onWaiting);
      // Handle resume seeking after metadata loads
      if (seekPos && seekPos > 5) {
        v.addEventListener("loadedmetadata", () => { v.currentTime = seekPos; }, { once: true });
      }
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
    setLoadingStep(needsTranscode ? "Preparing H.264 conversion…" : "Starting stream…");
    if (needsTranscode) setTranscoding(true);
    playVodRemux(streamUrl, seekPos ?? null, needsTranscode);
  }, [remuxUrl, vodTranscodeUrl, streamPath, playVodRemux, nativePlaybackRef]);

  const seekToLive = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const buf = v.buffered;
    if (buf.length === 0) return;
    const liveEdge = Math.max(buf.end(0) - 2, 0);
    v.currentTime = liveEdge;
    setCurrentTime(liveEdge);
    if (v.paused) v.play().catch(() => {});
    setIsBehindLive(false);
    setSecondsBehindLive(0);
  }, []);

  // ── Main effect ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let phaseTimedOut = false;
    const abortController = new AbortController();
    const video = videoRef.current;
    if (video) { video.volume = volume; video.playbackRate = playbackRate; }

    const safetyTimer = setTimeout(() => {
      if (cancelled) return;
      if (phaseRef.current === "probing") {
        phaseTimedOut = true;
        transcodeCache.set(streamId, "native");
        setPhase("loading");
        setLoadingStep("Starting stream…");
        setErrorMsg(null);
        startLoadingTimeout();
        if (isLive) { playMPEGTS(streamPath, true, false); }
        else { startVod(() => cancelled, undefined, false); }
      }
    }, 18_000);

    const start = async () => {
      setPhase("probing"); setErrorMsg(null); setTranscoding(false); setLoadingStep("Detecting video format…");

      let needsTranscode = false;
      let probeHeight = 0;
      if (transcodeCache.has(streamId)) {
        needsTranscode = transcodeCache.get(streamId) === "hevc";
      } else {
        const probeTimer = setTimeout(() => {
          if (!cancelled && !phaseTimedOut) setLoadingStep("Analyzing video format…");
        }, 5_000);
        let result: ProbeResult;
        try { result = await probeStream(probeUrl, abortController.signal); }
        catch { result = { codec: "unknown" }; }
        clearTimeout(probeTimer);
        if (phaseTimedOut || cancelled) return;

        if (result.codec === "hevc") {
          needsTranscode = true;
          probeHeight = result.height || 0;
          transcodeCache.set(streamId, "hevc");
        } else if (result.codec === "unavailable") {
          if (isLive) {
            setPhase("error"); setErrorType("empty_stream");
            setErrorMsg("This channel is not available on the current CDN edge. Try a different channel or source.");
            transcodeCache.set(streamId, "native");
            return;
          } else { setPhase("error"); setErrorType("empty_stream"); setErrorMsg("This video is not available on the current CDN edge server."); return; }
        } else { transcodeCache.set(streamId, "native"); if (result.native) nativePlaybackRef.current = true; }
      }
      if (cancelled || phaseTimedOut) return;

      if (needsTranscode && isLive && probeHeight >= 2160 && qualityIdx === 0) { setQualityIdx(1); }

      if (isLive) {
        // Timeshift mode: skip probe, use timeshift URL directly
        if (timeshiftDuration && timeshiftDuration > 0) {
          const tsu = timeshiftUrl(timeshiftDuration);
          playMPEGTS(tsu, false, false);
          return;
        }
        const url = needsTranscode ? (transcodePath || streamPath) : streamPath;
        playMPEGTS(url, true, needsTranscode);
        return;
      }

      if (watchKey) {
        const pos = getWatchPos(watchKey);
        if (pos && pos > 5) {
          setResumePos(pos);
          setShowResumePrompt(true);
          setPhase("playing");
          transcodeCache.set(`_last_${streamId}`, needsTranscode ? "hevc" : "native");
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
      if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
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
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    destroyMpegts();
    destroyHls();
    destroyRemux();
    destroyShaka();
    retryCount.current++;
    setPhase("loading");
    setErrorMsg(null);
    setRetryKey(k => k + 1);
  }, [clearLoadingTimeout]);

  // ── Audio track switching (VOD) ────────────────────────────
  const switchAudioTrack = useCallback((audioIndex: number) => {
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
    destroyMpegts();
    destroyHls();
    destroyRemux();
    destroyShaka();
    playVodRemux(audioUrl, savePos > 3 ? savePos : null, false);
  }, [isVod, type, id, epId, playVodRemux, clearLoadingTimeout]);

  // ── Controls ───────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPhase("playing"); }
    else { v.pause(); setPhase("paused"); }
  }, []);

  const seekTo = useCallback((time: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (isLive) {
      const buf = v.buffered;
      if (buf.length === 0) return;
      const clampedTime = Math.max(buf.start(0), Math.min(time, buf.end(0) - 1));
      v.currentTime = clampedTime;
      setCurrentTime(clampedTime);
      return;
    }
    if (subHlsRef.current) {
      v.currentTime = Math.max(0, time);
      setCurrentTime(v.currentTime);
      return;
    }
    if (!remuxVodUrlRef.current) return;
    try {
      v.currentTime = Math.max(0, time);
      setCurrentTime(v.currentTime);
    } catch {
      const url = remuxVodUrlRef.current;
      const isTC = remuxVodTranscodeRef.current;
      destroyMpegts();
      destroyHls();
      setPhase("loading");
      playVodRemux(url, Math.max(0, time), isTC);
    }
  }, [isLive, playVodRemux, destroyMpegts, destroyHls]);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    if (isLive) {
      const buf = v.buffered;
      if (buf.length === 0) return;
      const target = Math.max(buf.start(0), Math.min((v.currentTime || 0) + delta, buf.end(0) - 1));
      v.currentTime = target;
      setCurrentTime(target);
      return;
    }
    const target = Math.max(0, (v.currentTime || 0) + delta);
    if (subHlsRef.current) { v.currentTime = target; setCurrentTime(target); return; }
    seekTo(target);
  }, [isLive, seekTo]);

  const setVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (v) {
      v.volume = val;
      if (val > 0 && muted) { v.muted = false; userTouchedMuteRef.current = true; setMuted(false); saveMuted(false); }
    }
    setVolumeState(val);
    setMuted(val === 0);
    saveVolume(val);
  }, [muted]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    userTouchedMuteRef.current = true;
    if (muted) { v.muted = false; v.volume = volume || 0.8; setMuted(false); setVolumeState(v.volume); saveMuted(false); }
    else { v.muted = true; v.volume = 0; setMuted(true); saveMuted(true); }
  }, [muted, volume]);

  const setSpeed = useCallback((rate: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const setQuality = useCallback((idx: number) => { setQualityIdx(idx); }, []);

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
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        const doc = document as DocumentWithWebkit;
        if (doc.webkitFullscreenElement) doc.webkitExitFullscreen();
      } catch {} // Error: fullscreen not supported or already exited
      const video = videoRef.current;
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
      destroyMpegts();
      destroyHls();
      destroyRemux();
    };
  }, []);

  return {
    videoRef: videoRef as React.RefObject<HTMLVideoElement>,
    containerRef: containerRef as React.RefObject<HTMLDivElement>,
    phase, errorMsg, errorType, loadingStep, transcoding,
    volume, muted, playbackRate, qualityIdx,
    currentTime, duration, buffered,
    resumePos, showResumePrompt, isLive, isVod,
    isBehindLive, secondsBehindLive, liveSeekableStart, liveSeekableEnd,
    connectionQuality, stallCount, suggestLowerQuality, downloadSpeed,
    seekToLive, switchAudioTrack, togglePlay, seekTo, seek,
    setVolume, toggleMute, setSpeed, setQuality,
    resumePlayback, startFromBeginning, retryStream, onAutoAdvance,
  };
}
