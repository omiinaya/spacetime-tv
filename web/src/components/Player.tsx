import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Loader2, AlertCircle, ArrowLeft, Play, Pause, Maximize, Minimize,
  Volume2, VolumeX, SkipBack, SkipForward, Settings
} from "lucide-react";
import mpegts from "mpegts.js";

// ── Types ──────────────────────────────────────────────────────
interface PlayerProps { type: "live" | "movie" | "series"; }

interface ProbeResult {
  codec: string; codec_long?: string; width?: number; height?: number;
  profile?: string; error?: string;
}

const QUALITIES = [
  { label: "Original", height: null },
  { label: "1080p", height: 1080 },
  { label: "720p", height: 720 },
  { label: "360p", height: 360 },
];

const SPEEDS = [0.5, 1, 1.5, 2];

// ── Persistence ────────────────────────────────────────────────
const transcodeCache = new Map<string, boolean>();

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
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<mpegts.Player | null>(null);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── State ────────────────────────────────────────────────────
  const [phase, setPhase] = useState<"probing" | "loading" | "playing" | "paused" | "error">("loading");
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

  const retryKey = useRef(0);

  // ── Derived ──────────────────────────────────────────────────
  const isLive = type === "live";
  const watchKey = type === "movie" ? `vod_${id}` : type === "series" ? `ep_${seriesId}_${epId}` : "";
  const streamId = epId || id || "";

  // Stream URLs
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

  // ── Playback: Live TV (mpegts.js) ───────────────────────────
  const playLive = useCallback((useTranscode: boolean, qualityHeight: number | null) => {
    const video = videoRef.current;
    if (!video) return () => {};

    video.removeAttribute("src");
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }

    let url: string;
    if (useTranscode && transcodePath) {
      url = transcodePath;
      setTranscoding(true);
    } else {
      url = `${streamPath}?_=${retryKey.current}`;
    }

    const player = mpegts.createPlayer({ type: "mpegts", isLive: true, url });
    playerRef.current = player;
    let errorCount = 0;
    let timedOut = false;

    player.attachMediaElement(video);
    player.load();

    player.on(mpegts.Events.LOADING_COMPLETE, () => {
      setPhase("playing");
      video.play().catch(() => {});
    });

    player.on(mpegts.Events.ERROR, (_t: string, detail: any) => {
      errorCount++;
      if (detail?.response?.code === 0 || errorCount < 3) return;
      if (!timedOut) {
        setPhase("error");
        setErrorMsg(useTranscode
          ? "Stream unavailable even with transcoding. The channel may be offline."
          : "Stream unavailable. The channel may be offline.");
      }
    });

    player.on(mpegts.Events.STATISTICS_INFO, () => {
      if (phase === "loading") setPhase("playing");
    });

    const timeout = setTimeout(() => {
      if (phase === "loading" || phase === "probing") {
        timedOut = true;
        setPhase("error");
        setErrorMsg("Stream timed out. The channel may be offline.");
      }
    }, 15000);

    return () => { clearTimeout(timeout); };
  }, [streamPath, transcodePath, phase]);

  // ── Playback: VOD (native video) ────────────────────────────
  const playVod = useCallback((resumeFrom: number | null = null) => {
    const video = videoRef.current;
    if (!video) return () => {};

    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
    video.removeAttribute("src");

    const url = `${streamPath}?_=${retryKey.current}`;
    let resumed = false;

    const onLoaded = () => {
      if (resumeFrom && !resumed) {
        video.currentTime = resumeFrom;
        resumed = true;
      }
      setDuration(video.duration || 0);
      setPhase("playing");
      video.play().catch(() => {});
    };

    const onError = () => {
      const e = video.error;
      let msg = "Playback failed.";
      if (e) {
        switch (e.code) {
          case MediaError.MEDIA_ERR_ABORTED: msg = "Playback aborted."; break;
          case MediaError.MEDIA_ERR_NETWORK: msg = "Network error. The stream may be unavailable."; break;
          case MediaError.MEDIA_ERR_DECODE: msg = "Decode error. Video format may not be supported."; break;
          case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: msg = "Video format not supported by your browser."; break;
        }
      }
      setPhase("error"); setErrorMsg(msg);
    };

    const onTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      // Update buffered
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
      // Save position
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (watchKey && video.currentTime > 5) saveWatchPos(watchKey, video.currentTime);
      }, 5000);
    };

    const onEnded = () => { setPhase("paused"); };

    video.addEventListener("loadeddata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("durationchange", () => setDuration(video.duration || 0));
    video.addEventListener("ended", onEnded);
    video.addEventListener("progress", () => {
      if (video.buffered.length > 0) setBuffered(video.buffered.end(video.buffered.length - 1));
    });

    video.src = url;
    video.load();

    const timeout = setTimeout(() => {
      if (phase === "loading" || phase === "probing") {
        setPhase("error"); setErrorMsg("Stream timed out.");
      }
    }, 30000);

    return () => {
      clearTimeout(timeout);
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("ended", onEnded);
    };
  }, [streamPath, watchKey, phase]);

  // ── Main effect: probe → play ───────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const video = videoRef.current;
    if (video) { video.volume = volume; video.playbackRate = playbackRate; }

    const start = async () => {
      setPhase("probing"); setErrorMsg(null); setTranscoding(false);
      if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }

      // Check resume for VOD
      if (!isLive && watchKey) {
        const pos = getWatchPos(watchKey);
        if (pos && pos > 5) {
          setResumePos(pos);
          setShowResumePrompt(true);
          setPhase("playing"); // don't show loading behind the prompt
          return; // wait for user choice
        }
      }

      await startPlayback(false);
    };

    start();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamPath]);

  const startPlayback = useCallback(async (skipProbe: boolean) => {
    let needsTranscode = false;

    if (isLive && !skipProbe) {
      // Probe for codec
      if (transcodeCache.has(streamId)) {
        needsTranscode = transcodeCache.get(streamId) || false;
      } else {
        setPhase("probing");
        const result = await probeStream(probeUrl);
        if (result.codec === "hevc") {
          needsTranscode = true;
          transcodeCache.set(streamId, true);
        } else {
          transcodeCache.set(streamId, false);
        }
      }
    }

    setPhase("loading");
    if (isLive) {
      playLive(needsTranscode, QUALITIES[qualityIdx].height);
    } else {
      playVod(null);
    }
  }, [isLive, streamId, probeUrl, playLive, playVod, qualityIdx]);

  // ── Controls ─────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); setPhase("playing"); }
    else { v.pause(); setPhase("paused"); }
    showControls(true);
  }, [showControls]);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || isLive) return;
    v.currentTime = Math.max(0, Math.min(v.duration, v.currentTime + delta));
    showControls(true);
  }, [isLive, showControls]);

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
    if (muted) { v.volume = volume || 0.8; setMuted(false); setVolumeState(v.volume); }
    else { v.volume = 0; setMuted(true); }
  }, [muted, volume]);

  const changeSpeed = useCallback((s: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setPlaybackRate(s);
    setShowSpeedMenu(false);
  }, []);

  const changeQuality = useCallback((idx: number) => {
    setQualityIdx(idx);
    setShowQualityMenu(false);
    // Restart playback with new quality
    retryKey.current++;
    if (isLive) {
      const needsTranscode = transcodeCache.get(streamId) || false;
      playLive(needsTranscode || idx > 0, QUALITIES[idx].height);
    }
  }, [isLive, streamId, playLive]);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setFullscreen(false));
    }
  }, []);

  const retry = useCallback(() => {
    retryKey.current++;
    setErrorMsg(null);
    setShowResumePrompt(false);
    startPlayback(false);
  }, [startPlayback]);

  const resumePlayback = useCallback(() => {
    setShowResumePrompt(false);
    setPhase("loading");
    playVod(resumePos);
  }, [resumePos, playVod]);

  const startFromBeginning = useCallback(() => {
    setShowResumePrompt(false);
    setPhase("loading");
    playVod(null);
  }, [playVod]);

  // ── Keyboard ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": seek(-10); break;
        case "ArrowRight": seek(10); break;
        case "f": case "F": toggleFullscreen(); break;
        case "m": case "M": toggleMute(); break;
        case "ArrowUp": setVolume(Math.min(1, volume + 0.1)); break;
        case "ArrowDown": setVolume(Math.max(0, volume - 0.1)); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seek, toggleFullscreen, toggleMute, volume, setVolume]);

  // ── Fullscreen listener ──────────────────────────────────────
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────
  useEffect(() => () => {
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }
  }, []);

  // ── Progress bar click handler ───────────────────────────────
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isLive || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    const v = videoRef.current;
    if (v) v.currentTime = frac * duration;
    showControls(true);
  }, [isLive, duration, showControls]);

  // ── Render ───────────────────────────────────────────────────
  const showOverlay = phase === "probing" || phase === "loading" || phase === "error" || showResumePrompt;
  const barProgress = isLive ? 100 : duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = isLive ? 100 : duration > 0 ? (buffered/ duration) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <span className="text-sm font-medium text-muted-foreground">
          {type === "live" ? "Live TV" : type === "movie" ? "Movie" : "Series"}
        </span>
        {transcoding && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
            H.265→H.264
          </span>
        )}
        {isLive && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 animate-pulse">
            LIVE
          </span>
        )}
      </div>

      {/* Video container */}
      <div ref={containerRef}
        className={`video-container relative bg-black rounded-lg overflow-hidden group cursor-pointer ${
          fullscreen ? "fixed inset-0 z-50 rounded-none" : ""
        }`}
        onMouseMove={() => showControls(true)}
        onMouseLeave={hideControls}
        onClick={togglePlay}
      >
        {/* Video element */}
        <video ref={videoRef} playsInline autoPlay
          className="w-full h-full"
        />

        {/* Center overlay: loading / error / resume prompt */}
        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
            {showResumePrompt ? (
              <div className="text-center space-y-4">
                <p className="text-sm text-muted-foreground">
                  Resume from {fmtTime(resumePos || 0)}?
                </p>
                <div className="flex gap-3 justify-center">
                  <button onClick={resumePlayback}
                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/80">
                    Resume
                  </button>
                  <button onClick={startFromBeginning}
                    className="px-4 py-2 rounded-md bg-muted text-muted-foreground text-sm hover:bg-muted/80">
                    Start Over
                  </button>
                </div>
              </div>
            ) : phase === "probing" ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                <span className="text-[11px] text-blue-400/80">Detecting stream format...</span>
              </div>
            ) : phase === "loading" ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                {transcoding && (
                  <span className="text-[10px] text-yellow-500">Converting video codec...</span>
                )}
              </div>
            ) : phase === "error" ? (
              <div className="text-center space-y-3">
                <AlertCircle className="h-10 w-10 text-destructive mx-auto" />
                <p className="text-sm text-muted-foreground max-w-xs">{errorMsg}</p>
                <button onClick={retry}
                  className="px-3 py-1.5 rounded-md bg-primary/10 text-primary text-xs hover:bg-primary/20">
                  Retry
                </button>
              </div>
            ) : null}
          </div>
        )}

        {/* Center play/pause overlay (visible when paused) */}
        {phase === "paused" && !showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="p-5 rounded-full bg-white/10 backdrop-blur hover:bg-white/20 transition-colors">
              <Play className="h-8 w-8 text-white" fill="white" />
            </button>
          </div>
        )}

        {/* Bottom controls bar */}
        <div className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pt-8 pb-3 transition-opacity duration-300 z-10 ${
          controlsVisible && !showOverlay ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}>
          {/* Progress bar */}
          <div className="mb-2" onClick={(e) => { e.stopPropagation(); handleProgressClick(e as any); }}>
            <div className="relative h-1 bg-white/20 rounded-full cursor-pointer group/progress hover:h-2 transition-all">
              {/* Buffered */}
              <div className="absolute inset-y-0 left-0 bg-white/10 rounded-full"
                style={{ width: `${bufferedProgress}%` }} />
              {/* Played */}
              <div className="absolute inset-y-0 left-0 bg-primary rounded-full"
                style={{ width: `${barProgress}%` }} />
              {/* Thumb */}
              {!isLive && (
                <div className="absolute top-1/2 -translate-y-1/2 h-3 w-3 bg-primary rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity shadow-md"
                  style={{ left: `calc(${barProgress}% - 6px)` }} />
              )}
              {/* Buffered segments for VOD */}
              {!isLive && videoRef.current && videoRef.current.buffered.length > 0 && (
                Array.from({ length: videoRef.current.buffered.length }, (_, i) => {
                  const start = (videoRef.current!.buffered.start(i) / duration) * 100;
                  const end = (videoRef.current!.buffered.end(i) / duration) * 100;
                  return (
                    <div key={i} className="absolute inset-y-0 bg-white/20 rounded-full"
                      style={{ left: `${start}%`, width: `${end - start}%` }} />
                  );
                })
              )}
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="p-1 rounded hover:bg-white/10 transition-colors">
              {phase === "playing"
                ? <Pause className="h-5 w-5 text-white" />
                : <Play className="h-5 w-5 text-white" fill="white" />}
            </button>

            {/* Skip back */}
            {!isLive && (
              <button onClick={(e) => { e.stopPropagation(); seek(-10); }}
                className="p-1 rounded hover:bg-white/10 transition-colors">
                <SkipBack className="h-4 w-4 text-white/70" />
              </button>
            )}

            {/* Skip forward */}
            {!isLive && (
              <button onClick={(e) => { e.stopPropagation(); seek(10); }}
                className="p-1 rounded hover:bg-white/10 transition-colors">
                <SkipForward className="h-4 w-4 text-white/70" />
              </button>
            )}

            {/* Time */}
            <span className="text-xs text-white/70 tabular-nums min-w-[70px]">
              {isLive ? "LIVE" : `${fmtTime(currentTime)} / ${fmtTime(duration)}`}
            </span>

            <div className="flex-1" />

            {/* Volume */}
            <div className="flex items-center gap-1 group/vol">
              <button onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                className="p-1 rounded hover:bg-white/10 transition-colors">
                {muted || volume === 0
                  ? <VolumeX className="h-4 w-4 text-white/70" />
                  : <Volume2 className="h-4 w-4 text-white/70" />}
              </button>
              <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
                onChange={(e) => { e.stopPropagation(); setVolume(parseFloat(e.target.value)); }}
                className="w-0 group-hover/vol:w-20 transition-all h-1 accent-primary cursor-pointer"
              />
            </div>

            {/* Speed */}
            <div className="relative">
              <button onClick={(e) => { e.stopPropagation(); setShowSpeedMenu(!showSpeedMenu); setShowQualityMenu(false); }}
                className="text-[11px] px-1.5 py-0.5 rounded hover:bg-white/10 text-white/80 transition-colors">
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur border border-white/10 rounded-md py-1 min-w-[80px]">
                  {SPEEDS.map(s => (
                    <button key={s} onClick={(e) => { e.stopPropagation(); changeSpeed(s); }}
                      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                        playbackRate === s ? "text-primary" : "text-white/70"
                      }`}>
                      {s}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Quality (live only) */}
            {isLive && (
              <div className="relative">
                <button onClick={(e) => { e.stopPropagation(); setShowQualityMenu(!showQualityMenu); setShowSpeedMenu(false); }}
                  className="p-1 rounded hover:bg-white/10 transition-colors">
                  <Settings className="h-4 w-4 text-white/70" />
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-full right-0 mb-2 bg-black/90 backdrop-blur border border-white/10 rounded-md py-1 min-w-[100px]">
                    {QUALITIES.map((q, i) => (
                      <button key={q.label} onClick={(e) => { e.stopPropagation(); changeQuality(i); }}
                        className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${
                          qualityIdx === i ? "text-primary" : "text-white/70"
                        }`}>
                        {q.label} {q.height && <span className="text-[10px] opacity-50">{q.height}p</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
              className="p-1 rounded hover:bg-white/10 transition-colors">
              {fullscreen
                ? <Minimize className="h-4 w-4 text-white/70" />
                : <Maximize className="h-4 w-4 text-white/70" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
