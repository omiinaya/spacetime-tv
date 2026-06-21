import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
  const playMPEGTS = useCallback((url: string, liveFlag: boolean, isTranscode: boolean, timeoutMs = 15000) => {
    const video = videoRef.current;
    if (!video) return;

    if (mpegtsCleanup.current) { mpegtsCleanup.current(); mpegtsCleanup.current = null; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    video.removeAttribute("src");
    if (playerRef.current) { playerRef.current.destroy(); playerRef.current = null; }

    if (isTranscode) setTranscoding(true);

    const player = mpegts.createPlayer({ type: "mpegts", isLive: liveFlag, url });
    playerRef.current = player;
    let errorCount = 0;
    let timedOut = false;

    player.attachMediaElement(video);
    player.load();

    player.on(mpegts.Events.LOADING_COMPLETE, () => {
      setPhase("playing");
      video.muted = true; setMuted(true);
      video.play().catch(() => setPhase("paused"));
    });

    player.on(mpegts.Events.ERROR, (_t: string, detail: any) => {
      errorCount++;
      if (detail?.response?.code === 0 || errorCount < 3) return;
      if (!timedOut) {
        setPhase("error");
        setErrorMsg(isTranscode
          ? "Stream unavailable even with transcoding."
          : "Stream unavailable.");
      }
    });

    player.on(mpegts.Events.STATISTICS_INFO, () => {
      const p = phaseRef.current;
      if (p === "loading" || p === "probing") setPhase("playing");
    });

    const timeout = setTimeout(() => {
      const p = phaseRef.current;
      if (p === "loading" || p === "probing") {
        timedOut = true;
        setPhase("error");
        setErrorMsg("Stream timed out.");
      }
    }, timeoutMs);

    mpegtsCleanup.current = () => { clearTimeout(timeout); };
  }, []);

  // ── Playback: HLS via hls.js (VOD) ───────────────────────────
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

  // ── VOD startup: probe → HLS ─────────────────────────────────
  const startVod = useCallback(async (isCancelled: () => boolean, seekPos?: number) => {
    if (!hlsInitUrl) return;
    setPhase("loading");
    setErrorMsg(null);

    try {
      const seekParam = seekPos ? `?start=${seekPos}` : "";
      const res = await fetch(`${hlsInitUrl}${seekParam}`);
      const data = await res.json();

      if (data.status === "ready") {
        playHLS(data.playlist, seekPos ?? null);
        return;
      }

      setErrorMsg("Preparing video… (downloading full movie)");
      const pollStart = Date.now();
      let status = data.status;
      while (status !== "ready") {
        if (isCancelled()) return;
        if (Date.now() - pollStart > 600000) {
          setPhase("error"); setErrorMsg("Preparation timed out."); return;
        }
        await new Promise(r => setTimeout(r, 3000));
        const r2 = await fetch(hlsInitUrl);
        const d2 = await r2.json();
        status = d2.status;
        if (status === "ready") {
          setErrorMsg(null);
          playHLS(d2.playlist, seekPos ?? null);
          return;
        }
      }
    } catch (e) {
      setPhase("error"); setErrorMsg("Failed to prepare video.");
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
      if (transcodeCache.has(streamId)) {
        needsTranscode = transcodeCache.get(streamId) === "hevc";
      } else {
        const result = await probeStream(probeUrl);
        if (result.codec === "hevc") {
          needsTranscode = true;
          transcodeCache.set(streamId, "hevc");
        } else {
          transcodeCache.set(streamId, "native");
        }
      }
      if (cancelled) return;

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
          return;
        }
      }

      await startVod(() => cancelled);
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

  const seek = useCallback((delta: number) => {
    if (isLive) return;
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + delta));
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

  const setSpeed = useCallback((rate: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = rate;
    setPlaybackRate(rate); setShowSpeedMenu(false);
  }, []);

  const setQuality = useCallback((idx: number) => {
    setQualityIdx(idx); setShowQualityMenu(false);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFullscreen(false);
    }
  }, []);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isLive || !duration) return;
    const v = videoRef.current;
    if (!v) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    v.currentTime = fraction * duration;
    showControls(true);
  }, [isLive, duration, showControls]);

  const resumePlayback = useCallback(() => {
    setShowResumePrompt(false);
    startVod(() => false, resumePos ?? undefined);
  }, [resumePos, startVod]);

  const startFromBeginning = useCallback(() => {
    setShowResumePrompt(false);
    startVod(() => false);
  }, [startVod]);

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
      if (hlsRef.current) hlsRef.current.destroy();
      if (playerRef.current) playerRef.current.destroy();
      if (mpegtsCleanup.current) mpegtsCleanup.current();
    };
  }, []);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Render helpers ───────────────────────────────────────────
  const goBack = () => {
    if (type === "movie") navigate("/movies");
    else if (type === "series") navigate("/series");
    else navigate("/live-tv");
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black group"
      onMouseMove={() => showControls(true)}
      onMouseLeave={() => { if (phase === "playing") hideControls(); }}
      style={{ aspectRatio: "16 / 9", maxHeight: "calc(100vh - 4rem)" }}
    >
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-contain"
        playsInline
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
            onClick={() => startVod(() => false)}
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

        <div className="relative px-4 pb-3 pt-8">
          {isVod && (
            <div className="relative w-full h-1 bg-white/20 rounded cursor-pointer group/progress mb-3" onClick={handleProgressClick}>
              <div className="absolute inset-y-0 left-0 bg-white/30 rounded" style={{ width: `${bufferedPct}%` }} />
              <div className="absolute inset-y-0 left-0 bg-blue-500 rounded" style={{ width: `${progressPct}%` }}>
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={goBack} className="text-white/70 hover:text-white transition-colors p-1" title="Back">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <button onClick={togglePlay} className="text-white/70 hover:text-white transition-colors p-1" title={phase === "playing" ? "Pause" : "Play"}>
              {phase === "playing" ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
            </button>
            <button onClick={() => seek(-10)} className="text-white/60 hover:text-white transition-colors p-1 hidden sm:block" title="Rewind 10s">
              <SkipBack className="w-4 h-4" />
            </button>
            <button onClick={() => seek(10)} className="text-white/60 hover:text-white transition-colors p-1 hidden sm:block" title="Forward 10s">
              <SkipForward className="w-4 h-4" />
            </button>
            {isVod && (
              <span className="text-white/60 text-xs tabular-nums ml-1">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
            )}
            {isLive && (
              <span className="text-red-500 text-xs font-bold tracking-wider px-2 py-0.5 bg-red-500/10 rounded">LIVE</span>
            )}
            {transcoding && (
              <span className="text-yellow-500 text-xs px-2 py-0.5 bg-yellow-500/10 rounded">Transcoding</span>
            )}
            <div className="flex-1" />
            <button onClick={toggleMute} className="text-white/60 hover:text-white transition-colors p-1" title={muted ? "Unmute" : "Mute"}>
              {muted || volume === 0 ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              className="w-20 h-1 accent-blue-500 cursor-pointer hidden sm:block" />
            <div className="relative">
              <button onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="text-white/60 hover:text-white transition-colors p-1 text-xs tabular-nums min-w-[2rem]" title="Speed">
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[5rem] shadow-xl">
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => setSpeed(s)}
                      className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${playbackRate === s ? "text-blue-400" : "text-white/70"}`}
                    >{s}x</button>
                  ))}
                </div>
              )}
            </div>
            {isLive && (
              <div className="relative">
                <button onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="text-white/60 hover:text-white transition-colors p-1" title="Quality">
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
                        className={`block w-full text-left px-3 py-1.5 text-xs hover:bg-white/10 transition-colors ${qualityIdx === i ? "text-blue-400" : "text-white/70"}`}
                      >{q.label}</button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={toggleFullscreen} className="text-white/60 hover:text-white transition-colors p-1" title={fullscreen ? "Exit Fullscreen" : "Fullscreen"}>
              {fullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
