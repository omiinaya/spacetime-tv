import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Loader2, AlertCircle, ArrowLeft, Play, Pause, Maximize, Minimize,
  Volume2, VolumeX, SkipBack, SkipForward, Settings
} from "lucide-react";
import mpegts from "mpegts.js";
import Hls from "hls.js";

// ── Types ──────────────────────────────────────────────────────
interface PlayerProps { type: "live" | "movie" | "series"; }

interface ProbeResult {
  codec: string; codec_long?: string; width?: number; height?: number;
  profile?: string; container?: string; error?: string;
}

const QUALITIES = [
  { label: "Original", height: null },
  { label: "1080p", height: 1080 },
  { label: "720p", height: 720 },
  { label: "360p", height: 360 },
];
const SPEEDS = [0.5, 1, 1.5, 2];

// ── Persistence ────────────────────────────────────────────────
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

async function probeStream(url: string): Promise<ProbeResult> {
  try { const r = await fetch(url); return await r.json(); }
  catch { return { codec: "unknown" }; }
}

// ── Time formatter ─────────────────────────────────────────────
function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60),
        sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ── Component ──────────────────────────────────────────────────
export default function Player({ type }: PlayerProps) {
  const { id, seriesId, epId } = useParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const mpegtsCleanup = useRef<(() => void) | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef<string>("loading");

  // ── State ────────────────────────────────────────────────────
  const [phase, _setPhase] = useState<"probing" | "loading" | "playing" | "paused" | "error">("loading");
  const setPhase = useCallback((p: typeof phase) => {
    phaseRef.current = p;
    _setPhase(p);
  }, []);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transcoding, setTranscoding] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(getVolume());
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [qualityIdx, setQualityIdx] = useState(0);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [resumePos, setResumePos] = useState<number | null>(null);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [buffered, setBuffered] = useState(0);

  // ── Derived ──────────────────────────────────────────────────
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

  // ── Helpers ──────────────────────────────────────────────────
  const showControls = useCallback((temporary = false) => {
    setControlsVisible(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    if (temporary) {
      controlsTimer.current = setTimeout(() => setControlsVisible(false), 3000);
    }
  }, []);

  const hideControls = useCallback(() => {
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    setControlsVisible(false);
  }, []);

  // ── Playback: MPEG-TS via mpegts.js (live TV only) ────────────
  const playMPEGTS = useCallback((url: string, liveFlag: boolean, isTranscode: boolean) => {
    const video = videoRef.current;
    if (!video) return;

    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    video.removeAttribute("src");
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }

    if (isTranscode) setTranscoding(true);

    // Store the URL for reconnection
    const streamUrl = url;
    let reconnectAttempts = 0;
    const MAX_RECONNECTS = 100; // effectively infinite

    const createPlayer = () => {
      const player = mpegts.createPlayer({
        type: "mpegts",
        isLive: liveFlag,
        url: streamUrl,
      });
      playerRef.current = player;

      player.attachMediaElement(video);
      player.load();

      // MEDIA_INFO fires once the stream is recognized — call play() here
      // because LOADING_COMPLETE never fires for live (unbounded) streams.
      let loadStarted = false;
      player.on(mpegts.Events.MEDIA_INFO, () => {
        if (loadStarted) return;
        loadStarted = true;
        video.muted = true; setMuted(true);
        video.play().catch(() => {});
      });

      player.on(mpegts.Events.LOADING_COMPLETE, () => {
        // Fallback if both events fire (some stream types do)
        if (!loadStarted) {
          loadStarted = true;
          video.muted = true; setMuted(true);
          video.play().catch(() => {});
        }
        reconnectAttempts = 0;
      });

      // Hide spinner only when video is actually rendering frames
      let playingFired = false;
      const onPlaying = () => {
        if (!playingFired) {
          playingFired = true;
          const p = phaseRef.current;
          if (p === "loading" || p === "probing") setPhase("playing");
        }
      };
      video.addEventListener("playing", onPlaying);

      // Track statistics to detect stream drops
      let lastStatsTime = Date.now();
      player.on(mpegts.Events.STATISTICS_INFO, () => {
        lastStatsTime = Date.now();
      });

      // Auto-reconnect on fatal errors or stream drops
      player.on(mpegts.Events.ERROR, (_t: string, detail: any) => {
        // Only reconnect on real errors, not network noise
        if (detail?.response?.code === 0) return;
        if (!liveFlag) return; // VOD errors handled by VOD path
        
        if (reconnectAttempts < MAX_RECONNECTS) {
          reconnectAttempts++;
          // Clean up and retry after a short delay
          try { player.destroy(); } catch {}
          playerRef.current = null;
          video.removeEventListener("playing", onPlaying);
          setTimeout(() => {
            if (playerRef.current === null) {
              createPlayer();
            }
          }, Math.min(reconnectAttempts * 1000, 5000)); // 1s, 2s, 3s, 4s, 5s max
        }
      });

      // Detect silent stream drops (no data for 15 seconds)
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
  }, []);

  // ── Playback: VOD via mpegts remux (instant start, no download wait) ──
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

    // Store for seeking (MSE doesn't support currentTime seeks — must restart)
    vodUrlRef.current = streamUrl;
    vodTranscodeRef.current = isTranscode;

    const player = mpegts.createPlayer({ type: "mpegts", isLive: true, url });
    playerRef.current = player;
    let errorCount = 0;
    let timedOut = false;

    player.attachMediaElement(video);
    player.load();

    player.on(mpegts.Events.LOADING_COMPLETE, () => {
      // Don't hide spinner yet — wait for video to actually advance past frame 0
      video.muted = true; setMuted(true);
      video.play().catch(() => {});
    });

    // Fallback: start playback when media info is available (covers cases where
    // LOADING_COMPLETE is delayed or doesn't fire for unbounded streams)
    let playStarted = false;
    const tryPlay = () => {
      if (playStarted) return;
      playStarted = true;
      video.muted = true; setMuted(true);
      video.play().catch(() => {});
    };
    player.on(mpegts.Events.MEDIA_INFO, () => tryPlay());

    // Hide spinner only when currentTime has meaningfully advanced (frames are flowing)
    let timeAdvancing = false;
    const onTimeUpdate = () => {
      if (!timeAdvancing && video.currentTime > 0.1) {
        timeAdvancing = true;
        setCurrentTime(video.currentTime);
        const p = phaseRef.current;
        if (p === "loading" || p === "probing") setPhase("playing");
      }
    };
    video.addEventListener("timeupdate", onTimeUpdate);

    player.on(mpegts.Events.MEDIA_INFO, (info: any) => {
      if (info.duration && isFinite(info.duration)) {
        setDuration(info.duration);
      }
    });

    player.on(mpegts.Events.ERROR, (_t: string, detail: any) => {
      errorCount++;
      if (detail?.response?.code === 0 || errorCount < 3) return;
      if (!timedOut) {
        setPhase("error");
        setErrorMsg("Stream unavailable.");
      }
    });

    // VOD time tracking: elapsed + start offset
    const timeInterval = setInterval(() => {
      if (video && !video.paused) {
        const elapsed = (Date.now() - vodStartTime) / 1000;
        setCurrentTime(startOffset + elapsed);
      }
    }, 500);

    // Watch position saving
    let saveInterval: ReturnType<typeof setInterval> | null = null;
    if (watchKey) {
      saveInterval = setInterval(() => {
        const t = startOffset + (Date.now() - vodStartTime) / 1000;
        if (t > 5) {
          saveWatchPos(watchKey, t);
        }
      }, 5000);
    }

    const timeoutMs = isTranscode ? 90000 : 30000;
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
  }, [watchKey]);

  // ── Playback: HLS via hls.js (VOD, cached) ───────────────────
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
        // Start muted for browser autoplay policy
        video.muted = true;
        setMuted(true);
        video.play().catch(() => setPhase("paused"));
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
        video.muted = true; setMuted(true);
        video.play().catch(() => setPhase("paused"));
      }, { once: true });
    } else {
      setPhase("error");
      setErrorMsg("HLS playback not supported.");
      return;
    }

    // Time tracking
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
        setErrorMsg("Stream timed out.");
      }
    }, 30000);

    mpegtsCleanup.current = () => {
      clearTimeout(timeout);
      if (saveInterval) clearInterval(saveInterval);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("durationchange", onDurationChange);
      video.removeEventListener("ended", onEnded);
    };
  }, [watchKey]);

  // ── VOD startup: remux immediately (transcode for HEVC) + background HLS cache ──
  const startVod = useCallback(async (isCancelled: () => boolean, seekPos?: number, needsTranscode: boolean = false) => {
    const streamUrl = needsTranscode ? vodTranscodeUrl : remuxUrl;
    if (!streamUrl) return;
    setPhase("loading");
    setErrorMsg(null);

    if (needsTranscode) setTranscoding(true);

    // 1. Start playback immediately (remux for h264, transcode for HEVC)
    playVodRemux(streamUrl, seekPos ?? null, needsTranscode);

    // 2. Trigger HLS download/cache in background for future visits
    if (hlsInitUrl) {
      try {
        fetch(hlsInitUrl).catch(() => {});
      } catch {}
    }
  }, [remuxUrl, vodTranscodeUrl, hlsInitUrl, playVodRemux]);

  // ── VOD startup via HLS (for already-cached movies, used on retry) ──
  const startVodHLS = useCallback(async (isCancelled: () => boolean, seekPos?: number) => {
    if (!hlsInitUrl) return;
    setPhase("loading");
    setErrorMsg(null);

    try {
      const res = await fetch(`${hlsInitUrl}`);
      const data = await res.json();

      if (data.status === "ready") {
        playHLS(data.playlist, seekPos ?? null);
        return;
      }

      setPhase("error");
      setErrorMsg("Video not cached yet. Using streaming mode.");
    } catch (e) {
      setPhase("error"); setErrorMsg("Failed to load cached video.");
    }
  }, [hlsInitUrl, playHLS]);

  // ── Main effect ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (video) { video.volume = volume; video.playbackRate = playbackRate; }

    const start = async () => {
      setPhase("probing"); setErrorMsg(null); setTranscoding(false);

      let needsTranscode = false;
      let probeHeight = 0;
      if (transcodeCache.has(streamId)) {
        needsTranscode = transcodeCache.get(streamId) === "hevc";
      } else {
        const result = await probeStream(probeUrl);
        if (result.codec === "hevc") {
          needsTranscode = true;
          probeHeight = result.height || 0;
          transcodeCache.set(streamId, "hevc");
        } else if (result.codec === "unavailable") {
          setPhase("error");
          setErrorMsg("This video is not available on the current CDN edge server.");
          return;
        } else {
          transcodeCache.set(streamId, "native");
        }
      }
      if (cancelled) return;

      // 4K HEVC → ffmpeg software encode at original res drops frames.
      // Default to 1080p when transcoding 4K live streams.
      if (needsTranscode && isLive && probeHeight >= 2160 && qualityIdx === 0) {
        setQualityIdx(1); // 1080p
      }

      if (isLive) {
        const url = needsTranscode ? (transcodePath || streamPath) : streamPath;
        playMPEGTS(url, true, needsTranscode);
        return;
      }

      // VOD: check resume
      if (watchKey) {
        const pos = getWatchPos(watchKey);
        if (pos && pos > 5) {
          setResumePos(pos);
          setShowResumePrompt(true);
          setPhase("playing");
          // Store needsTranscode state for resume callbacks
          transcodeCache.set(`_last_${streamId}`, needsTranscode ? "hevc" : "native");
          return;
        }
      }

      await startVod(() => cancelled, undefined, needsTranscode);
    };

    start();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPath]);

  // ── Controls ─────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPhase("playing"); }
    else { v.pause(); setPhase("paused"); }
    showControls(true);
  }, [showControls]);

  // ── Seeking: restart mpegts.js VOD at new position (MSE doesn't support currentTime seeks) ──
  const vodUrlRef = useRef<string | null>(null);
  const vodTranscodeRef = useRef<boolean>(false);

  const seekTo = useCallback((time: number) => {
    if (isLive || !vodUrlRef.current) return;
    const url = vodUrlRef.current;
    const isTC = vodTranscodeRef.current;
    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    setPhase("loading");
    playVodRemux(url, Math.max(0, time), isTC);
  }, [isLive, playVodRemux]);

  const seek = useCallback((delta: number) => {
    if (isLive || !vodUrlRef.current) return;
    const v = videoRef.current;
    if (!v) return;
    const target = Math.max(0, (v.currentTime || 0) + delta);
    seekTo(target);
    showControls(true);
  }, [isLive, seekTo, showControls]);

  const setVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (v) v.volume = val;
    setVolumeState(val);
    setMuted(val === 0);
    saveVolume(val);
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (muted) { v.muted = false; v.volume = volume || 0.8; setMuted(false); setVolumeState(v.volume); }
    else { v.muted = true; v.volume = 0; setMuted(true); }
  }, [muted, volume]);

  const setSpeed = useCallback((rate: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
    setPlaybackRate(rate); setShowSpeedMenu(false);
  }, []);

  const setQuality = useCallback((idx: number) => {
    setQualityIdx(idx); setShowQualityMenu(false);
  }, []);

  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);

    if (isFS) {
      // Exit fullscreen
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
      }
      setFullscreen(false);
    } else {
      // Enter fullscreen — video element only (works everywhere: Chrome, Firefox, iOS Safari)
      const el = video as any;
      if (el.requestFullscreen) {
        el.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
        setFullscreen(true);
      } else if (el.webkitEnterFullscreen) {
        el.webkitEnterFullscreen();
        setFullscreen(true);
      }
    }
  }, []);

  // Native fullscreen handler — bypasses React synthetic events to preserve
  // the user gesture chain required by iOS Safari's Fullscreen API
  useEffect(() => {
    const btn = fullscreenBtnRef.current;
    if (!btn) return;
    const handler = () => {
      toggleFullscreen();
    };
    btn.addEventListener("click", handler);
    return () => btn.removeEventListener("click", handler);
  }, [toggleFullscreen]);


  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isLive || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(fraction * duration);
    showControls(true);
  }, [isLive, duration, seekTo, showControls]);

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

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      switch (e.key) {
        case " ": case "k": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": case "j": e.preventDefault(); seek(-10); break;
        case "ArrowRight": case "l": e.preventDefault(); seek(10); break;
        case "f": toggleFullscreen(); break;
        case "m": toggleMute(); break;
        case "ArrowUp": setVolume(Math.min(1, volume + 0.1)); break;
        case "ArrowDown": setVolume(Math.max(0, volume - 0.1)); break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay, seek, toggleFullscreen, toggleMute, setVolume, volume]);

  // ── Cleanup ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      // 1. Exit fullscreen first
      try {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        const doc = document as any;
        if (doc.webkitFullscreenElement) doc.webkitExitFullscreen();
      } catch {}
      
      // 2. Run ephemeral cleanup (timers, listeners)
      if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
      
      // 3. Destroy players on the NEXT tick, after React has removed
      //    the video element from DOM. On iOS Safari, destroying
      //    mpegts.js/HLS while the video is still in the DOM tree
      //    triggers synchronous MediaSource teardown that corrupts
      //    the WebKit rendering pipeline → black screen on nav.
      const hls = hlsRef.current;
      const player = playerRef.current;
      if (hls || player) {
        hlsRef.current = null;
        playerRef.current = null;
        setTimeout(() => {
          if (hls) { try { hls.destroy(); } catch {} }
          if (player) { try { player.destroy(); } catch {} }
        }, 0);
      }
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      setFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  // ── Render helpers ───────────────────────────────────────────
  const goBack = () => {
    // Full page redirect — sessionStorage survives reload, so the
    // back URL set by AppLayout on the previous page is still available.
    // This bypasses React unmount entirely, avoiding iOS Safari
    // rendering corruption from video element teardown.
    let backUrl = "";
    try { backUrl = sessionStorage.getItem("stv_back_url") || ""; } catch {}
    if (!backUrl) {
      backUrl = type === "movie" ? "/movies" : type === "series" ? "/series" : "/live";
    }
    window.location.href = backUrl;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black group"
      onMouseMove={() => showControls(true)}
      onMouseLeave={() => { if (phase === "playing") hideControls(); }}
      onTouchStart={() => {
        // Toggle controls on tap
        if (controlsVisible) hideControls();
        else showControls(true);
      }}
      style={{ aspectRatio: "16 / 9", maxHeight: "calc(100vh - 4rem)" }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
        onClick={togglePlay}
      />

      {/* Loading */}
      {(phase === "loading" || phase === "probing") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-white/70" />
          <span className="text-white/60 text-sm">
            {phase === "probing" ? "Detecting video format…" : "Loading…"}
          </span>
          {errorMsg && <span className="text-white/40 text-xs">{errorMsg}</span>}
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-10 gap-4">
          <AlertCircle className="w-10 h-10 text-red-400" />
          <p className="text-white/70 text-sm max-w-md text-center">{errorMsg || "Playback failed."}</p>
          <button
            onClick={() => {
              if (isVod) startVod(() => false);
            }}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white text-sm transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Resume prompt */}
      {showResumePrompt && resumePos && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20 gap-4">
          <p className="text-white/80 text-lg">Resume from {fmtTime(resumePos)}?</p>
          <div className="flex gap-3">
            <button onClick={resumePlayback} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white transition-colors">
              Resume
            </button>
            <button onClick={startFromBeginning} className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      <div className={`absolute inset-x-0 bottom-0 transition-opacity duration-300 z-10 ${controlsVisible || phase !== "playing" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none" />

        <div className="relative px-3 sm:px-4 pb-2 sm:pb-3 pt-8">
          {isVod && (
            <div className="relative w-full cursor-pointer group/progress mb-3" onClick={handleProgressClick}>
              {/* Touch-friendly progress bar: taller, invisible hit area */}
              <div className="absolute inset-x-0 -top-2 -bottom-2" />
              <div className="relative w-full h-1 sm:h-1 bg-white/20 rounded">
                <div className="absolute inset-y-0 left-0 bg-white/30 rounded" style={{ width: `${bufferedPct}%` }} />
                <div className="absolute inset-y-0 left-0 bg-blue-500 rounded" style={{ width: `${progressPct}%` }}>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-3 sm:h-3 bg-blue-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 sm:gap-3">
            <button onClick={goBack} className="text-white/70 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] flex items-center justify-center" title="Back">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={togglePlay} className="text-white/70 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] flex items-center justify-center" title={phase === "playing" ? "Pause" : "Play"}>
              {phase === "playing" ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            <button onClick={() => seek(-10)} className="text-white/60 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] hidden sm:flex items-center justify-center" title="Rewind 10s">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={() => seek(10)} className="text-white/60 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] hidden sm:flex items-center justify-center" title="Forward 10s">
              <SkipForward className="w-4 h-4" />
            </button>
            {isVod && (
              <span className="text-white/60 text-xs sm:text-xs tabular-nums ml-1 whitespace-nowrap">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
            )}
            {isLive && (
              <span className="text-red-500 text-xs font-bold tracking-wider px-2 py-0.5 bg-red-500/10 rounded whitespace-nowrap">LIVE</span>
            )}
            {transcoding && (
              <span className="text-yellow-500 text-xs px-2 py-0.5 bg-yellow-500/10 rounded whitespace-nowrap hidden sm:inline">Transcoding</span>
            )}
            <div className="flex-1" />
            <button onClick={toggleMute} className="text-white/60 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] flex items-center justify-center" title={muted ? "Unmute" : "Mute"}>
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="w-16 sm:w-20 h-1 accent-blue-500 cursor-pointer hidden sm:block" />
            <div className="relative">
              <button onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="text-white/60 hover:text-white transition-colors p-2 sm:p-1 text-xs tabular-nums min-w-[40px] min-h-[40px] flex items-center justify-center" title="Speed">
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[5rem] shadow-xl">
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => setSpeed(s)}
                      className={`block w-full text-left px-4 py-2 text-sm sm:text-xs hover:bg-white/10 transition-colors ${playbackRate === s ? "text-blue-400" : "text-white/70"}`}
                    >{s}x</button>
                  ))}
                </div>
              )}
            </div>
            {isLive && (
              <div className="relative">
                <button onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="text-white/60 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] flex items-center justify-center" title="Quality">
                  <Settings className="w-4 h-4" />
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[7rem] shadow-xl">
                    {QUALITIES.map((q, i) => (
                      <button key={q.label}
                        onClick={() => {
                          setQuality(i);
                          const url = i === 0 ? streamPath : `/api/stream/live/${id}/quality/${q.height}`;
                          playMPEGTS(url, true, false);
                        }}
                        className={`block w-full text-left px-4 py-2 text-sm sm:text-xs hover:bg-white/10 transition-colors ${qualityIdx === i ? "text-blue-400" : "text-white/70"}`}
                      >{q.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button ref={fullscreenBtnRef} className="text-white/60 hover:text-white transition-colors p-2 sm:p-1 min-w-[40px] min-h-[40px] flex items-center justify-center" title={fullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
