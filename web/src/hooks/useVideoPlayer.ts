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
import mpegts from "mpegts.js";
import Hls from "hls.js";
import { saveSeriesProgress, saveMovieProgress } from "@/lib/continueWatching";
import { queueProgress } from "@/lib/watchProgressSync";
import type { ConnectionQuality, DocumentWithWebkit, PlayPhase, ErrorType, UseVideoPlayerParams, UseVideoPlayerReturn } from "./usePlayerTypes";
export type { ConnectionQuality, ProbeResult, PlayPhase, ErrorType, UseVideoPlayerParams, UseVideoPlayerReturn } from "./usePlayerTypes";
export { QUALITIES, SPEEDS } from "./usePlayerTypes";
export { fmtTime } from "./usePlayerUtils";
import { getWatchPos, getVolume, getMuted, saveVolume, saveMuted, probeStream, tryAutoplay, transcodeCache, saveWatchPos } from "./usePlayerUtils";
import { QUALITIES } from "./usePlayerTypes";

// ── Constants for LIVE quality levels ─────────────────────────
const QUALITY_HEIGHTS = QUALITIES.map(q => q.height);


// ── Hook ──────────────────────────────────────────────────────
export function useVideoPlayer({ type, id, seriesId, epId, onAutoAdvance }: UseVideoPlayerParams): UseVideoPlayerReturn {
  const videoRef = useRef<HTMLVideoElement>(null!);
  const containerRef = useRef<HTMLDivElement>(null!);
  const playerRef = useRef<mpegts.Player | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsCleanup = useRef<(() => void) | null>(null);
  const phaseRef = useRef<PlayPhase>("loading");
  const userTouchedMuteRef = useRef(true);
  const vodUrlRef = useRef<string | null>(null);
  const vodTranscodeRef = useRef<boolean>(false);
  const loadingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);
  const [retryKey, setRetryKey] = useState(0);

  const onAutoplayMuted = useCallback(() => { setMuted(true); }, []);

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) { clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }
  }, []);

  const startLoadingTimeout = useCallback(() => {
    clearLoadingTimeout();
    loadingTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current === "loading") {
        if (type === "live" && retryCount.current < 5) {
          retryCount.current++;
          const v = videoRef.current;
          if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
          if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
          try { playerRef.current?.destroy(); } catch {}
          playerRef.current = null;
          try { hlsRef.current?.destroy(); } catch {}
          hlsRef.current = null;
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
    }, 20_000);
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
    if (speed > 2000 && recentStallCount < 2 && dropRatio < 0.02) quality = "excellent";
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

  // ── Derived ────────────────────────────────────────────────
  const isLive = type === "live";
  const isVod = type === "movie" || type === "series";
  const watchKey = type === "movie" ? `vod_${id}` : type === "series" ? `ep_${seriesId}_${epId}` : "";
  const streamId = epId || id || "";

  const streamPath = useMemo(() => {
    if (type === "live") return `/api/stream/live/${id}`;
    if (type === "movie") return `/api/stream/movie/${id}`;
    return `/api/stream/series/${seriesId}/${epId}`;
  }, [type, id, seriesId, epId]);

  const transcodePath = useMemo(() => {
    const qh = QUALITIES[qualityIdx].height;
    if (!isLive) return null;
    if (qh) return `/api/stream/live/${id}/quality/${qh}`;
    return `/api/stream/live/${id}/transcode`;
  }, [isLive, id, qualityIdx]);

  const remuxUrl = useMemo(() => {
    if (!isVod) return null;
    if (type === "movie") return `/api/stream/movie/${id}/remux`;
    return `/api/stream/series/${seriesId}/${epId}/remux`;
  }, [isVod, type, id, seriesId, epId]);

  const vodTranscodeUrl = useMemo(() => {
    if (!isVod) return null;
    if (type === "movie") return `/api/stream/movie/${id}/transcode`;
    return `/api/stream/series/${seriesId}/${epId}/transcode`;
  }, [isVod, type, id, seriesId, epId]);

  const hlsInitUrl = useMemo(() => {
    if (!isVod) return null;
    if (type === "movie") return `/api/movie/hls/${id}`;
    return `/api/series/hls/${seriesId}/${epId}`;
  }, [isVod, type, id, seriesId, epId]);

  const probeUrl = useMemo(() => {
    if (type === "live") return `/api/live/probe/${id}`;
    if (type === "movie") return `/api/movie/probe/${id}`;
    return `/api/series/probe/${streamId}`;
  }, [type, id, streamId]);

  // ── Playback: MPEG-TS via mpegts.js (live TV only) ──────────
  const playMPEGTS = useCallback((url: string, liveFlag: boolean, isTranscode: boolean) => {
    const video = videoRef.current;
    if (!video) return;

    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    video.removeAttribute("src");
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }

    setPhase("loading"); setErrorMsg(null);
    if (isTranscode) setTranscoding(true);
    startLoadingTimeout();

    const streamUrl = url;
    let reconnectAttempts = 0;
    const MAX_RECONNECTS = 100;

    const createPlayer = () => {
      const player = mpegts.createPlayer({ type: "mpegts", isLive: liveFlag, url: streamUrl }, {
        enableWorkerForMSE: true,
        liveBufferLatencyChasing: false,
        autoCleanupSourceBuffer: true,
        autoCleanupMaxBackwardDuration: 360,
        autoCleanupMinBackwardDuration: 240,
        liveSync: true,
        liveSyncMaxLatency: 2,
        liveSyncTargetLatency: 1,
        liveSyncPlaybackRate: 1.1,
      });
      playerRef.current = player;

      player.attachMediaElement(video);
      player.load();

      let loadStarted = false;
      player.on(mpegts.Events.MEDIA_INFO, () => {
        if (loadStarted) return;
        loadStarted = true;
        tryAutoplay(video, onAutoplayMuted).then((started) => {
          if (!started) { clearLoadingTimeout(); if (phaseRef.current === "loading" || phaseRef.current === "probing") setPhase("paused"); }
        });
      });

      player.on(mpegts.Events.LOADING_COMPLETE, () => {
        if (!loadStarted) {
          loadStarted = true;
          tryAutoplay(video, onAutoplayMuted).then((started) => {
            if (!started) { clearLoadingTimeout(); if (phaseRef.current === "loading" || phaseRef.current === "probing") setPhase("paused"); }
          });
        }
        reconnectAttempts = 0;
      });

      let playingFired = false;
      const onPlaying = () => {
        if (!playingFired) { playingFired = true; clearLoadingTimeout(); if (phaseRef.current === "loading" || phaseRef.current === "probing") setPhase("playing"); }
      };
      video.addEventListener("playing", onPlaying);

      let lastStatsTime = Date.now();
      player.on(mpegts.Events.STATISTICS_INFO, (stats: any) => {
        lastStatsTime = Date.now();
        if (typeof stats?.speed === "number") setDownloadSpeed(stats.speed);
        if (typeof stats?.droppedFrames === "number") droppedFramesRef.current = stats.droppedFrames;
        if (typeof stats?.decodedFrames === "number") decodedFramesRef.current = stats.decodedFrames;
      });

      const onWaiting = () => { stallTimestampsRef.current.push(Date.now()); };
      video.addEventListener("waiting", onWaiting);

      player.on(mpegts.Events.ERROR, (_t: string, detail: { response?: { code?: number } }) => {
        if (detail?.response?.code === 0) return;
        if (!liveFlag) return;
        if (reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts++;
          try { player.destroy(); } catch {}
          playerRef.current = null;
          video.removeEventListener("playing", onPlaying);
          setTimeout(() => { if (playerRef.current === null) createPlayer(); }, Math.min(reconnectAttempts * 1000, 5000));
        }
      });

      const onTimeUpdate = () => {
        if (!video || !liveFlag) return;
        const ct = video.currentTime;
        setCurrentTime(ct);
        const buf = video.buffered;
        if (buf.length > 0) {
          const s = buf.start(0);
          const e = buf.end(buf.length - 1);
          setLiveSeekableStart(s);
          setLiveSeekableEnd(e);
          const behind = Math.max(0, e - ct);
          setSecondsBehindLive(behind);
          setIsBehindLive(behind > 3);
        }
      };
      video.addEventListener("timeupdate", onTimeUpdate);

      const healthCheck = setInterval(() => {
        if (Date.now() - lastStatsTime > 15000 && liveFlag) {
          clearInterval(healthCheck);
          if (reconnectAttempts < MAX_RECONNECTS) {
            reconnectAttempts++;
            try { player.destroy(); } catch {}
            playerRef.current = null;
            video.removeEventListener("playing", onPlaying);
            setTimeout(() => { if (playerRef.current === null) createPlayer(); }, Math.min(reconnectAttempts * 1000, 5000));
          }
        }
      }, 5000);

      mpegtsCleanup.current = () => {
        clearInterval(healthCheck);
        video.removeEventListener("playing", onPlaying);
        video.removeEventListener("waiting", onWaiting);
        video.removeEventListener("timeupdate", onTimeUpdate);
      };
    };

    createPlayer();
  }, [onAutoplayMuted]);

  // ── Playback: VOD via mpegts remux ──────────────────────────
  const playVodRemux = useCallback((streamUrl: string, startPos: number | null = null, isTranscode: boolean = false) => {
    const video = videoRef.current;
    if (!video) return;

    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    video.removeAttribute("src");
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }

    const url = startPos && startPos > 5 ? `${streamUrl}?start=${startPos}` : streamUrl;
    vodUrlRef.current = streamUrl;
    vodTranscodeRef.current = isTranscode;

    const player = mpegts.createPlayer({ type: "mpegts", isLive: false, url }, {
      enableWorkerForMSE: true,
      autoCleanupSourceBuffer: false,
    });
    playerRef.current = player;
    let errorCount = 0;
    let timedOut = false;

    player.attachMediaElement(video);
    player.load();

    player.on(mpegts.Events.LOADING_COMPLETE, () => { tryAutoplay(video, onAutoplayMuted).then(() => {}); });

    let playStarted = false;
    const tryPlay = () => {
      if (playStarted) return;
      playStarted = true;
      clearLoadingTimeout();
      tryAutoplay(video, onAutoplayMuted).then(() => {});
    };
    player.on(mpegts.Events.MEDIA_INFO, () => tryPlay());

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
      if ((phaseRef.current === "loading" || phaseRef.current === "probing") && video.currentTime > 0.1) {
        clearLoadingTimeout();
        setPhase("playing");
      }
    };
    const onDurationChange = () => { const d = video.duration; if (d && isFinite(d)) setDuration(d); };
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);

    player.on(mpegts.Events.MEDIA_INFO, (info: { duration?: number }) => {
      if (info.duration && isFinite(info.duration)) setDuration(info.duration);
    });

    player.on(mpegts.Events.STATISTICS_INFO, (stats: any) => {
      if (typeof stats?.speed === "number") setDownloadSpeed(stats.speed);
      if (typeof stats?.droppedFrames === "number") droppedFramesRef.current = stats.droppedFrames;
      if (typeof stats?.decodedFrames === "number") decodedFramesRef.current = stats.decodedFrames;
    });

    const onWaiting = () => { stallTimestampsRef.current.push(Date.now()); };
    video.addEventListener("waiting", onWaiting);

    player.on(mpegts.Events.ERROR, (_t: string, detail: { response?: { code?: number } }) => {
      errorCount++;
      if (detail?.response?.code === 0 || errorCount < 3) return;
      if (!timedOut) { setPhase("error"); setErrorType("stream_error"); setErrorMsg("Stream interrupted. The connection may have been lost."); }
    });

    let saveInterval: ReturnType<typeof setInterval> | null = null;
    if (watchKey) {
      let syncCounter = 0;
      saveInterval = setInterval(() => {
        if (video && !video.paused) {
          const t = video.currentTime;
          if (t > 5) {
            saveWatchPos(watchKey, t);
            if (type === "series" && seriesId) {
              let metaName = "", metaCover = "", metaSeason = 0, metaEpNum = 0, metaEpTitle = "";
              let metaDuration = video?.duration || 0;
              try {
                const raw = sessionStorage.getItem(`stv_series_meta_${seriesId}`);
                if (raw) {
                  const m = JSON.parse(raw);
                  metaName = m.name || "";
                  metaCover = m.cover || m.episodeImage || "";
                  metaSeason = m.seasonNumber || 0;
                  metaEpNum = m.episodeNum || 0;
                  metaEpTitle = m.episodeTitle || "";
                  if (m.durationSeconds) metaDuration = m.durationSeconds;
                }
              } catch {}
              saveSeriesProgress({
                seriesId: parseInt(seriesId), seriesName: metaName, cover: metaCover,
                seasonNumber: metaSeason, episodeNum: metaEpNum, episodeId: epId || "",
                episodeTitle: metaEpTitle, progressSeconds: t, durationSeconds: metaDuration, updatedAt: Date.now(),
              });
              if (onAutoAdvance && metaDuration > 0 && (t / metaDuration) >= 0.95) {
                const autoAdvanced = sessionStorage.getItem(`stv_auto_advanced_${seriesId}`);
                if (!autoAdvanced && seriesId) {
                  sessionStorage.setItem(`stv_auto_advanced_${seriesId}`, "1");
                  const currentIdx = parseInt(sessionStorage.getItem(`stv_series_current_idx_${seriesId}`) || "0", 10);
                  const activeSeason = parseInt(sessionStorage.getItem(`stv_series_active_season_${seriesId}`) || "1", 10);
                  const episodesRaw = sessionStorage.getItem(`stv_series_episodes_${seriesId}_${activeSeason}`);
                  if (episodesRaw) {
                    try {
                      const episodes = JSON.parse(episodesRaw) as { id: string; episode_num: number; title: string }[];
                      const nextEp = episodes[currentIdx + 1];
                      if (nextEp) {
                        sessionStorage.setItem(`stv_series_current_idx_${seriesId}`, String(currentIdx + 1));
                        setTimeout(() => sessionStorage.removeItem(`stv_auto_advanced_${seriesId}`), 1000);
                        onAutoAdvance(`/watch/series/${seriesId}/${nextEp.id}`);
                      }
                    } catch {}
                  }
                }
              }
            } else if (type === "movie" && id) {
              let movieName = "", moviePoster = "";
              try {
                const raw = sessionStorage.getItem("stv_movie_meta");
                if (raw) {
                  const m = JSON.parse(raw);
                  if (String(m.id) === id) { movieName = m.name || ""; moviePoster = m.poster || ""; }
                }
              } catch {}
              saveMovieProgress({
                movieId: parseInt(id), movieName, poster: moviePoster,
                progressSeconds: t, durationSeconds: video?.duration || 0, updatedAt: Date.now(),
              });
            }
          }
        }
        syncCounter++;
        if (syncCounter % 6 === 0) {
          navigator.serviceWorker?.ready.then((reg) => (reg as any).sync.register("sync-watch-progress")).catch(() => {});
        }
      }, 5000);
    }

    const timeoutMs = isTranscode ? 45000 : 12000;
    const timeout = setTimeout(() => {
      if (phaseRef.current === "loading" || phaseRef.current === "probing") {
        timedOut = true;
        setPhase("error");
        if (isTranscode) { setErrorType("transcode_timeout"); setErrorMsg("Video conversion is taking longer than expected. Try again."); }
        else { setErrorType("timeout"); setErrorMsg("Stream is taking too long to load. The server may be slow."); }
      }
    }, timeoutMs);

    mpegtsCleanup.current = () => {
      clearTimeout(timeout);
      if (saveInterval) clearInterval(saveInterval);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("waiting", onWaiting);
    };
  }, [watchKey, type, seriesId, epId, id, onAutoplayMuted]);

  // ── Playback: HLS via hls.js (VOD, cached) ──────────────────
  const playHLS = useCallback((playlistUrl: string, startPos: number | null = null) => {
    const video = videoRef.current;
    if (!video) return;

    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    video.removeAttribute("src");

    let saveInterval: ReturnType<typeof setInterval> | null = null;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 30, maxMaxBufferLength: 60 });
      hlsRef.current = hls;
      hls.loadSource(playlistUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPhase("playing");
        setDuration(hls.levels[0]?.details?.totalduration || video.duration || 0);
        tryAutoplay(video, onAutoplayMuted).then((started) => { if (!started) setPhase("paused"); });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
            case Hls.ErrorTypes.MEDIA_ERROR: hls.recoverMediaError(); break;
            default: setPhase("error"); setErrorType("stream_error"); setErrorMsg("Playback error. Try again."); hls.destroy(); break;
          }
        }
      });

      if (startPos && startPos > 5) {
        const resumeHandler = () => { video.currentTime = startPos; hls.off(Hls.Events.MANIFEST_PARSED, resumeHandler); };
        hls.on(Hls.Events.MANIFEST_PARSED, resumeHandler);
      }
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlistUrl;
      video.addEventListener("loadedmetadata", () => {
        setDuration(video.duration || 0);
        if (startPos && startPos > 5) video.currentTime = startPos;
        setPhase("playing");
        tryAutoplay(video, onAutoplayMuted).then((started) => { if (!started) setPhase("paused"); });
      }, { once: true });
    } else {
      setPhase("error"); setErrorType("not_supported"); setErrorMsg("This video format is not supported by your browser.");
      return;
    }

    const onTimeUpdate = () => {
      setCurrentTime(video!.currentTime);
      if (video!.buffered.length > 0) setBuffered(video!.buffered.end(video!.buffered.length - 1));
    };
    const onDurationChange = () => { const d = video!.duration; if (d && isFinite(d)) setDuration(d); };
    const onEnded = () => { setPhase("paused"); };
    const onWaiting = () => { stallTimestampsRef.current.push(Date.now()); };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("ended", onEnded);
    video.addEventListener("waiting", onWaiting);

    if (watchKey) {
      let syncCounter = 0;
      saveInterval = setInterval(() => {
        if (!video!.paused && video!.currentTime > 5) {
          saveWatchPos(watchKey, video!.currentTime);
        }
        syncCounter++;
        if (syncCounter % 6 === 0) {
          navigator.serviceWorker?.ready.then((reg) => (reg as any).sync.register("sync-watch-progress")).catch(() => {});
        }
      }, 5000);
    }

    const timeout = setTimeout(() => {
      if (phaseRef.current === "loading" || phaseRef.current === "probing") {
        setPhase("error"); setErrorType("timeout"); setErrorMsg("Video is taking too long to start. Try again.");
      }
    }, 15000);

    const emptyCheck = setInterval(() => {
      if (video.readyState === 0 && phaseRef.current === "loading") {
        clearInterval(emptyCheck);
        setPhase("error"); setErrorType("empty_stream"); setErrorMsg("Stream returned empty data. The content may not be available on this server.");
      } else if (video.readyState > 0 || phaseRef.current !== "loading") {
        clearInterval(emptyCheck);
      }
    }, 2000);

    mpegtsCleanup.current = () => {
      clearTimeout(timeout);
      clearInterval(emptyCheck);
      if (saveInterval) clearInterval(saveInterval);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("waiting", onWaiting);
    };
  }, [watchKey, onAutoplayMuted]);

  // ── VOD startup ────────────────────────────────────────────
  const startVod = useCallback(async (isCancelled: () => boolean, seekPos?: number, needsTranscode: boolean = false) => {
    const streamUrl = needsTranscode ? vodTranscodeUrl : remuxUrl;
    if (!streamUrl) return;
    setPhase("loading");
    setErrorMsg(null);
    startLoadingTimeout();
    setLoadingStep(needsTranscode ? "Preparing H.264 conversion…" : "Starting stream…");
    if (needsTranscode) setTranscoding(true);
    playVodRemux(streamUrl, seekPos ?? null, needsTranscode);
    if (hlsInitUrl) { try { fetch(hlsInitUrl).catch(() => {}); } catch {} }
  }, [remuxUrl, vodTranscodeUrl, hlsInitUrl, playVodRemux]);

  const startVodHLS = useCallback(async (isCancelled: () => boolean, seekPos?: number) => {
    if (!hlsInitUrl) return;
    setPhase("loading");
    setErrorMsg(null);
    setLoadingStep("Checking for cached video…");
    try {
      const res = await fetch(`${hlsInitUrl}`);
      const data = await res.json();
      if (data.status === "ready") { playHLS(data.playlist, seekPos ?? null); return; }
      setPhase("error"); setErrorMsg("Video not cached yet. Using streaming mode.");
    } catch { setPhase("error"); setErrorMsg("Failed to load cached video."); }
  }, [hlsInitUrl, playHLS]);

  // ── DVR (Live TV buffer) ───────────────────────────────────
  const [isBehindLive, setIsBehindLive] = useState(false);
  const [secondsBehindLive, setSecondsBehindLive] = useState(0);
  const [liveSeekableStart, setLiveSeekableStart] = useState(0);
  const [liveSeekableEnd, setLiveSeekableEnd] = useState(0);

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
        let result: any;
        try { result = await probeStream(probeUrl, abortController.signal); }
        catch { result = { codec: "unknown" }; }
        clearTimeout(probeTimer);
        if (phaseTimedOut || cancelled) return;

        if (result.codec === "hevc") {
          needsTranscode = true;
          probeHeight = result.height || 0;
          transcodeCache.set(streamId, "hevc");
        } else if (result.codec === "unavailable") {
          if (isLive) { needsTranscode = false; transcodeCache.set(streamId, "native"); }
          else { setPhase("error"); setErrorType("empty_stream"); setErrorMsg("This video is not available on the current CDN edge server."); return; }
        } else { transcodeCache.set(streamId, "native"); }
      }
      if (cancelled || phaseTimedOut) return;

      if (needsTranscode && isLive && probeHeight >= 2160 && qualityIdx === 0) { setQualityIdx(1); }

      if (isLive) {
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
      if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
      try { hlsRef.current?.destroy(); } catch {}
      hlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPath, retryKey]);

  // ── Retry ──────────────────────────────────────────────────
  const retryStream = useCallback(() => {
    clearLoadingTimeout();
    const video = videoRef.current;
    if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    try { playerRef.current?.destroy(); } catch {}
    playerRef.current = null;
    try { hlsRef.current?.destroy(); } catch {}
    hlsRef.current = null;
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
    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    try { playerRef.current?.destroy(); } catch {}
    playerRef.current = null;
    try { hlsRef.current?.destroy(); } catch {}
    hlsRef.current = null;
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
    if (hlsRef.current) {
      v.currentTime = Math.max(0, time);
      setCurrentTime(v.currentTime);
      return;
    }
    if (!vodUrlRef.current) return;
    try {
      v.currentTime = Math.max(0, time);
      setCurrentTime(v.currentTime);
    } catch {
      const url = vodUrlRef.current;
      const isTC = vodTranscodeRef.current;
      if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
      setPhase("loading");
      playVodRemux(url, Math.max(0, time), isTC);
    }
  }, [isLive, playVodRemux]);

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
    if (hlsRef.current) { v.currentTime = target; setCurrentTime(target); return; }
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
      } catch {}
      const video = videoRef.current;
      if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
      if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
      try { playerRef.current?.destroy(); } catch {}
      playerRef.current = null;
      try { hlsRef.current?.destroy(); } catch {}
      hlsRef.current = null;
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
