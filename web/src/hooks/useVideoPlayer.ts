import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import mpegts from "mpegts.js";
import Hls from "hls.js";
import { saveSeriesProgress, saveMovieProgress } from "@/lib/continueWatching";

// ── Types ──────────────────────────────────────────────────────
export interface ProbeResult {
  codec: string; codec_long?: string; width?: number; height?: number;
  profile?: string; container?: string; error?: string;
}

export type PlayPhase = "probing" | "loading" | "playing" | "paused" | "error";

export const QUALITIES = [
  { label: "Original", height: null },
  { label: "1080p", height: 1080 },
  { label: "720p", height: 720 },
  { label: "360p", height: 360 },
];
export const SPEEDS = [0.5, 1, 1.5, 2];

// ── Module-level helpers ──────────────────────────────────────
const transcodeCache = new Map<string, string>();

function getWatchPos(key: string): number | null {
  try {
    const d = JSON.parse(localStorage.getItem("stv_watch") || "{}");
    return d[key]?.pos ?? null;
  } catch { return null; }
}
function saveWatchPos(key: string, pos: number) {
  try {
    const d = JSON.parse(localStorage.getItem("stv_watch") || "{}");
    d[key] = { pos, ts: Date.now() };
    localStorage.setItem("stv_watch", JSON.stringify(d));
  } catch {}
}
function getVolume(): number {
  try { return parseFloat(localStorage.getItem("stv_volume") || "0.8"); }
  catch { return 0.8; }
}
function saveVolume(v: number) {
  try { localStorage.setItem("stv_volume", String(v)); } catch {}
}
function getMuted(): boolean {
  try { return localStorage.getItem("stv_muted") === "true"; }
  catch { return false; }
}
function saveMuted(m: boolean) {
  try { localStorage.setItem("stv_muted", String(m)); } catch {}
}

/**
 * Try to autoplay a video element. Browsers block autoplay with sound.
 * Strategy: try unmuted first, if rejected → mute and retry.
 * Returns true if playback started (possibly muted), false if fully blocked.
 * When muted fallback is used, onMutedFallback() is called so the caller
 * can sync React state without persisting to localStorage.
 */
async function tryAutoplay(video: HTMLVideoElement, onMutedFallback?: () => void): Promise<boolean> {
  try {
    await video.play();
    return true; // unmuted autoplay succeeded
  } catch {
    // Autoplay with sound was blocked — retry muted
    try {
      video.muted = true;
      await video.play();
      onMutedFallback?.();
      return true; // muted autoplay succeeded
    } catch {
      return false; // fully blocked (no user gesture at all)
    }
  }
}

async function probeStream(url: string, signal?: AbortSignal): Promise<ProbeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  // If an external signal fires first, forward it to our controller
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort, { once: true });

  try {
    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
    return await r.json();
  } catch {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
    return { codec: "unknown" };
  }
}

// ── Time formatter ────────────────────────────────────────────
export function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60),
        sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ── Hook ──────────────────────────────────────────────────────
interface UseVideoPlayerParams {
  type: "live" | "movie" | "series";
  id: string | undefined;
  seriesId: string | undefined;
  epId: string | undefined;
}

export interface UseVideoPlayerReturn {
  videoRef: React.RefObject<HTMLVideoElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  phase: PlayPhase;
  errorMsg: string | null;
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
  togglePlay: () => void;
  seekTo: (time: number) => void;
  seek: (delta: number) => void;
  setVolume: (val: number) => void;
  toggleMute: () => void;
  setSpeed: (rate: number) => void;
  setQuality: (idx: number) => void;
  resumePlayback: () => void;
  startFromBeginning: () => void;
  retryStream: () => void;
}

export function useVideoPlayer({ type, id, seriesId, epId }: UseVideoPlayerParams): UseVideoPlayerReturn {
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
  const autoRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // Stable callback — syncs React mute state when browser mutes video for autoplay fallback.
  // Does NOT persist to localStorage (user didn't intentionally mute).
  const onAutoplayMuted = useCallback(() => { setMuted(true); }, []);

  const clearLoadingTimeout = useCallback(() => {
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
  }, []);

  const startLoadingTimeout = useCallback(() => {
    clearLoadingTimeout();
    loadingTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current === "loading") {
        // For live, auto-retry instead of showing a dead error.
        // The mpegts player may need more time or a fresh connection.
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
        _setPhase("error");
        setErrorMsg("Stream unavailable. The content may have been removed or is temporarily offline.");
      }
    }, 20_000);
  }, [type]);

  // ── State ──────────────────────────────────────────────────
  const [phase, _setPhase] = useState<PlayPhase>("loading");
  const setPhase = useCallback((p: PlayPhase) => {
    phaseRef.current = p;
    _setPhase(p);
  }, []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
      const player = mpegts.createPlayer({
        type: "mpegts",
        isLive: liveFlag,
        url: streamUrl,
      });
      playerRef.current = player;

      player.attachMediaElement(video);
      player.load();

      let loadStarted = false;
      player.on(mpegts.Events.MEDIA_INFO, () => {
        if (loadStarted) return;
        loadStarted = true;
        tryAutoplay(video, onAutoplayMuted).then((started) => {
          if (!started) {
            // Fully blocked (no user gesture at all) — show paused state
            clearLoadingTimeout();
            const p = phaseRef.current;
            if (p === "loading" || p === "probing") {
              setPhase("paused");
            }
          }
        });
      });

      player.on(mpegts.Events.LOADING_COMPLETE, () => {
        if (!loadStarted) {
          loadStarted = true;
          tryAutoplay(video, onAutoplayMuted).then((started) => {
            if (!started) {
              clearLoadingTimeout();
              const p = phaseRef.current;
              if (p === "loading" || p === "probing") {
                setPhase("paused");
              }
            }
          });
        }
        reconnectAttempts = 0;
      });

      let playingFired = false;
      const onPlaying = () => {
        if (!playingFired) {
          playingFired = true;
          clearLoadingTimeout();
          const p = phaseRef.current;
          if (p === "loading" || p === "probing") setPhase("playing");
        }
      };
      video.addEventListener("playing", onPlaying);

      let lastStatsTime = Date.now();
      player.on(mpegts.Events.STATISTICS_INFO, () => {
        lastStatsTime = Date.now();
      });

      player.on(mpegts.Events.ERROR, (_t: string, detail: { response?: { code?: number } }) => {
        if (detail?.response?.code === 0) return;
        if (!liveFlag) return;

        if (reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts++;
          try { player.destroy(); } catch {}
          playerRef.current = null;
          video.removeEventListener("playing", onPlaying);
          setTimeout(() => {
            if (playerRef.current === null) {
              createPlayer();
            }
          }, Math.min(reconnectAttempts * 1000, 5000));
        }
      });

      const healthCheck = setInterval(() => {
        if (Date.now() - lastStatsTime > 15000 && liveFlag) {
          clearInterval(healthCheck);
          if (reconnectAttempts < MAX_RECONNECTS) {
            reconnectAttempts++;
            try { player.destroy(); } catch {}
            playerRef.current = null;
            video.removeEventListener("playing", onPlaying);
            setTimeout(() => {
              if (playerRef.current === null) {
                createPlayer();
              }
            }, Math.min(reconnectAttempts * 1000, 5000));
          }
        }
      }, 5000);

      mpegtsCleanup.current = () => {
        clearInterval(healthCheck);
        video.removeEventListener("playing", onPlaying);
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
    const startOffset = startPos && startPos > 5 ? startPos : 0;
    const vodStartTime = Date.now();

    vodUrlRef.current = streamUrl;
    vodTranscodeRef.current = isTranscode;

    const player = mpegts.createPlayer({ type: "mpegts", isLive: true, url });
    playerRef.current = player;
    let errorCount = 0;
    let timedOut = false;

    player.attachMediaElement(video);
    player.load();

    player.on(mpegts.Events.LOADING_COMPLETE, () => {
      tryAutoplay(video, onAutoplayMuted).then(() => {});
    });

    let playStarted = false;
    const tryPlay = () => {
      if (playStarted) return;
      playStarted = true;
      clearLoadingTimeout();
      tryAutoplay(video, onAutoplayMuted).then(() => {});
    };
    player.on(mpegts.Events.MEDIA_INFO, () => tryPlay());

    let timeAdvancing = false;
    const onTimeUpdate = () => {
      if (!timeAdvancing && video.currentTime > 0.1) {
        timeAdvancing = true;
        clearLoadingTimeout();
        setCurrentTime(video.currentTime);
        const p = phaseRef.current;
        if (p === "loading" || p === "probing") setPhase("playing");
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);

    player.on(mpegts.Events.MEDIA_INFO, (info: { duration?: number }) => {
      if (info.duration && isFinite(info.duration)) {
        setDuration(info.duration);
      }
    });

    player.on(mpegts.Events.ERROR, (_t: string, detail: { response?: { code?: number } }) => {
      errorCount++;
      if (detail?.response?.code === 0 || errorCount < 3) return;
      if (!timedOut) {
        setPhase("error");
        setErrorMsg("Stream unavailable.");
      }
    });

    const timeInterval = setInterval(() => {
      if (video && !video.paused) {
        const elapsed = (Date.now() - vodStartTime) / 1000;
        setCurrentTime(startOffset + elapsed);
      }
    }, 500);

    let saveInterval: ReturnType<typeof setInterval> | null = null;
    if (watchKey) {
      saveInterval = setInterval(() => {
        const t = startOffset + (Date.now() - vodStartTime) / 1000;
        if (t > 5) {
          saveWatchPos(watchKey, t);
          if (type === "series" && seriesId) {
            saveSeriesProgress({
              seriesId: parseInt(seriesId),
              seriesName: "",
              cover: "",
              seasonNumber: 0,
              episodeNum: 0,
              episodeId: epId || "",
              episodeTitle: "",
              progressSeconds: t,
              durationSeconds: video?.duration || 0,
              updatedAt: Date.now(),
            });
          } else if (type === "movie" && id) {
            saveMovieProgress({
              movieId: parseInt(id),
              movieName: "",
              poster: "",
              progressSeconds: t,
              durationSeconds: video?.duration || 0,
              updatedAt: Date.now(),
            });
          }
        }
      }, 5000);
    }

    const timeoutMs = isTranscode ? 45000 : 12000;
    const timeout = setTimeout(() => {
      const p = phaseRef.current;
      if (p === "loading" || p === "probing") {
        timedOut = true;
        setPhase("error");
        setErrorMsg(isTranscode ? "Transcode is taking too long. Try again." : "Stream timed out. Try again.");
      }
    }, timeoutMs);

    mpegtsCleanup.current = () => {
      clearTimeout(timeout);
      clearInterval(timeInterval);
      if (saveInterval) clearInterval(saveInterval);
      video.removeEventListener("timeupdate", onTimeUpdate);
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
      const hls = new Hls({
        enableWorker: false,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });
      hlsRef.current = hls;

      hls.loadSource(playlistUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setPhase("playing");
        setDuration(hls.levels[0]?.details?.totalduration || video.duration || 0);
        tryAutoplay(video, onAutoplayMuted).then((started) => {
          if (!started) setPhase("paused");
        });
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              setPhase("error");
              setErrorMsg("Playback error. Try again.");
              hls.destroy();
              break;
          }
        }
      });

      if (startPos && startPos > 5) {
        const resumeHandler = () => {
          video.currentTime = startPos;
          hls.off(Hls.Events.MANIFEST_PARSED, resumeHandler);
        };
        hls.on(Hls.Events.MANIFEST_PARSED, resumeHandler);
      }
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = playlistUrl;
      video.addEventListener("loadedmetadata", () => {
        setDuration(video.duration || 0);
        if (startPos && startPos > 5) video.currentTime = startPos;
        setPhase("playing");
        tryAutoplay(video, onAutoplayMuted).then((started) => {
          if (!started) setPhase("paused");
        });
      }, { once: true });
    } else {
      setPhase("error");
      setErrorMsg("HLS playback not supported.");
      return;
    }

    const onTimeUpdate = () => {
      setCurrentTime(video!.currentTime);
      if (video!.buffered.length > 0) {
        setBuffered(video!.buffered.end(video!.buffered.length - 1));
      }
    };
    const onDurationChange = () => {
      const d = video!.duration;
      if (d && isFinite(d)) setDuration(d);
    };
    const onEnded = () => { setPhase("paused"); };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", onDurationChange);
    video.addEventListener("ended", onEnded);

    if (watchKey) {
      saveInterval = setInterval(() => {
        if (!video!.paused && video!.currentTime > 5) {
          saveWatchPos(watchKey, video!.currentTime);
        }
      }, 5000);
    }

    const timeout = setTimeout(() => {
      const p = phaseRef.current;
      if (p === "loading" || p === "probing") {
        setPhase("error");
        setErrorMsg("Stream unavailable. The content may have been removed or is temporarily offline.");
      }
    }, 15000);

    const emptyCheck = setInterval(() => {
      if (video.readyState === 0 && phaseRef.current === "loading") {
        clearInterval(emptyCheck);
        setPhase("error");
        setErrorMsg("Stream unavailable. The content may have been removed or is temporarily offline.");
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

    if (hlsInitUrl) {
      try {
        fetch(hlsInitUrl).catch(() => {});
      } catch {}
    }
  }, [remuxUrl, vodTranscodeUrl, hlsInitUrl, playVodRemux]);

  const startVodHLS = useCallback(async (isCancelled: () => boolean, seekPos?: number) => {
    if (!hlsInitUrl) return;
    setPhase("loading");
    setErrorMsg(null);
    setLoadingStep("Checking for cached video…");

    try {
      const res = await fetch(`${hlsInitUrl}`);
      const data = await res.json();

      if (data.status === "ready") {
        playHLS(data.playlist, seekPos ?? null);
        return;
      }

      setPhase("error");
      setErrorMsg("Video not cached yet. Using streaming mode.");
    } catch {
      setPhase("error"); setErrorMsg("Failed to load cached video.");
    }
  }, [hlsInitUrl, playHLS]);

  // ── Main effect ────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let phaseTimedOut = false;
    const abortController = new AbortController();
    const video = videoRef.current;
    if (video) { video.volume = volume; video.playbackRate = playbackRate; }

    // Safety timeout — if probe hangs >18s, skip it and start loading.
    // startLoadingTimeout (20s) handles the loading phase separately.
    const safetyTimer = setTimeout(() => {
      if (cancelled) return;
      const p = phaseRef.current;
      if (p === "probing") {
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
        try {
          result = await probeStream(probeUrl, abortController.signal);
        } catch {
          result = { codec: "unknown" };
        }
        clearTimeout(probeTimer);
        if (phaseTimedOut || cancelled) return;

        if (result.codec === "hevc") {
          needsTranscode = true;
          probeHeight = result.height || 0;
          transcodeCache.set(streamId, "hevc");
        } else if (result.codec === "unavailable") {
          // For live, probe "unavailable" is typically a transient CDN edge issue.
          // Don't block playback — skip transcode and try native playback.
          if (isLive) {
            needsTranscode = false;
            transcodeCache.set(streamId, "native");
          } else {
            setPhase("error");
            setErrorMsg("This video is not available on the current CDN edge server.");
            return;
          }
        } else {
          transcodeCache.set(streamId, "native");
        }
      }
      if (cancelled || phaseTimedOut) return;

      if (needsTranscode && isLive && probeHeight >= 2160 && qualityIdx === 0) {
        setQualityIdx(1);
      }

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
      if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
      }

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
    // Kill everything
    clearLoadingTimeout();
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
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

  // ── Controls ───────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPhase("playing"); }
    else { v.pause(); setPhase("paused"); }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (isLive) return;
    const v = videoRef.current;
    if (!v) return;

    // HLS (cached) — native seeking, no player recreation needed
    if (hlsRef.current) {
      v.currentTime = Math.max(0, time);
      setCurrentTime(v.currentTime);
      return;
    }

    // mpegts VOD — recreate player with start offset
    if (!vodUrlRef.current) return;
    const url = vodUrlRef.current;
    const isTC = vodTranscodeRef.current;
    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    setPhase("loading");
    playVodRemux(url, Math.max(0, time), isTC);
  }, [isLive, playVodRemux]);

  const seek = useCallback((delta: number) => {
    if (isLive) return;
    const v = videoRef.current;
    if (!v) return;
    const target = Math.max(0, (v.currentTime || 0) + delta);

    // HLS — native seeking is instant
    if (hlsRef.current) {
      v.currentTime = target;
      setCurrentTime(target);
      return;
    }

    seekTo(target);
  }, [isLive, seekTo]);

  const setVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (v) {
      v.volume = val;
      if (val > 0 && muted) {
        v.muted = false;
        userTouchedMuteRef.current = true;
        setMuted(false);
        saveMuted(false);
      }
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

  const setQuality = useCallback((idx: number) => {
    setQualityIdx(idx);
  }, []);

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
        const doc = document as any;
        if (doc.webkitFullscreenElement) doc.webkitExitFullscreen();
      } catch {}

      // Aggressive kill — same pattern as main effect cleanup
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
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
    phase,
    errorMsg,
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
  };
}
