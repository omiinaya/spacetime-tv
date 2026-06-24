import { useRef, useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Loader2, AlertCircle, ArrowLeft, Play, Pause, Maximize, Minimize,
  Volume2, VolumeX, SkipBack, SkipForward, Settings, PictureInPicture2, Download
} from "lucide-react";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useVideoPlayer, fmtTime, QUALITIES, SPEEDS } from "@/hooks/useVideoPlayer";
import { SubtitleSelector } from "@/components/SubtitleSelector";
import { AudioSelector } from "@/components/AudioSelector";
import { SleepTimer } from "@/components/SleepTimer";

// ── Types ─────────────────────────────────────────────────────
interface PlayerProps { type: "live" | "movie" | "series"; }

// ── Component ─────────────────────────────────────────────────
export default function Player({ type }: PlayerProps) {
  const { id, seriesId, epId } = useParams();
  const {
    videoRef, containerRef, phase, errorMsg, loadingStep, transcoding,
    volume, muted, playbackRate, qualityIdx, currentTime, duration, buffered,
    resumePos, showResumePrompt, isLive, isVod,
    togglePlay, seekTo, seek, setVolume, toggleMute, setSpeed, setQuality,
    resumePlayback, startFromBeginning,
  } = useVideoPlayer({ type, id, seriesId, epId });

  // ── UI State ─────────────────────────────────────────────────
  const { isFullscreen, setIsFullscreen } = useFullscreen();
  const [controlsVisible, setControlsVisible] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);

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

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const isFS = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
    if (isFS) {
      document.exitFullscreen?.().catch(() => {});
      (document as any).webkitExitFullscreen?.();
      setIsFullscreen(false);
    } else {
      const el = video as any;
      el.requestFullscreen?.().then(() => setIsFullscreen(true)).catch(() => {});
      el.webkitRequestFullscreen?.();
      el.webkitEnterFullscreen?.();
      setIsFullscreen(true);
    }
  }, []);

  // ── Native fullscreen handler ────────────────────────────────
  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const btn = fullscreenBtnRef.current;
    if (!btn) return;
    btn.addEventListener("click", toggleFullscreen);
    return () => btn.removeEventListener("click", toggleFullscreen);
  }, [toggleFullscreen]);

  // ── Progress bar interaction ─────────────────────────────────
  const progressDragRef = useRef(false);

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isLive || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(fraction * duration);
    showControls(true);
  }, [isLive, duration, seekTo, showControls]);

  const handleProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isLive || !duration) return;
    e.preventDefault();
    progressDragRef.current = true;
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const fraction = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    seekTo(fraction * duration);
    showControls(true);
  }, [isLive, duration, seekTo, showControls]);

  const handleProgressTouchMove = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (!progressDragRef.current || isLive || !duration) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const fraction = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
    seekTo(fraction * duration);
  }, [isLive, duration, seekTo]);

  const handleProgressTouchEnd = useCallback(() => {
    progressDragRef.current = false;
  }, []);

  // ── Keyboard ─────────────────────────────────────────────────
  useKeyboard({ togglePlay, seek, toggleFullscreen, toggleMute, setVolume, volume });

  // ── Back navigation ──────────────────────────────────────────
  const goBack = () => {
    let backUrl = "";
    try { backUrl = sessionStorage.getItem("stv_back_url") || ""; } catch {}
    if (!backUrl) {
      backUrl = type === "movie" ? "/movies" : type === "series" ? "/series" : "/live";
    }
    window.location.href = backUrl;
  };

  // ── Derived ──────────────────────────────────────────────────
  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black group"
      onMouseMove={() => showControls(true)}
      onMouseLeave={() => { if (phase === "playing") hideControls(); }}
      onTouchStart={(e) => {
        // Track swipe start for swipe-to-go-back
        if (e.touches.length === 1) {
          swipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        // Toggle controls on tap
        if (controlsVisible) hideControls();
        else showControls(true);
      }}
      onTouchMove={(e) => {
        if (!swipeStart.current || e.touches.length !== 1) return;
        // Only handle horizontal swipes (not vertical scrolls)
        const dx = e.touches[0].clientX - swipeStart.current.x;
        const dy = e.touches[0].clientY - swipeStart.current.y;
        if (Math.abs(dx) > Math.abs(dy) && dx > 30) {
          e.preventDefault(); // prevent page scroll during swipe
        }
      }}
      onTouchEnd={(e) => {
        if (!swipeStart.current) return;
        const dx = (e.changedTouches[0]?.clientX || 0) - swipeStart.current.x;
        const dy = Math.abs((e.changedTouches[0]?.clientY || 0) - swipeStart.current.y);
        // Rightward swipe > 80px, horizontal dominance → go back
        if (dx > 80 && dx > dy * 1.5) {
          goBack();
        }
        swipeStart.current = null;
      }}
      style={{ aspectRatio: "16 / 9", maxHeight: "min(calc(100dvh - 2rem), 90dvh)" }}
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
            {loadingStep || (phase === "probing" ? "Detecting video format…" : "Loading…")}
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
            onClick={() => isVod && resumePlayback?.()}
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

      {/* ── Top bar ─────────────────────────────────────────── */}
      <div className={`absolute inset-x-0 top-0 z-20 transition-opacity duration-300 ${controlsVisible || phase !== "playing" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-transparent pointer-events-none" />
        <div className="relative px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between">
          <button onClick={goBack} className="text-white/90 hover:text-white transition-colors p-2 flex items-center gap-1.5 min-w-[44px] min-h-[44px]" aria-label="Back to browsing">
            <ArrowLeft className="w-5 h-5" aria-hidden="true" />
            <span className="text-sm font-medium hidden sm:inline">Back</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                const v = videoRef.current;
                if (v) {
                  if (document.pictureInPictureElement) document.exitPictureInPicture();
                  else v.requestPictureInPicture().catch(() => {});
                }
              }}
              className="text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Picture in Picture"
            >
              <PictureInPicture2 className="w-4 h-4 sm:w-5 sm:h-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Center play overlay ─────────────────────────────── */}
      <div
        className={`absolute inset-0 flex items-center justify-center z-10 transition-opacity duration-200 pointer-events-none ${phase !== "playing" || !controlsVisible ? "opacity-100" : "opacity-0"}`}
        onClick={togglePlay}
      >
        <div className="pointer-events-auto">
          {phase === "playing" ? null : (
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/15 backdrop-blur-sm flex items-center justify-center">
              {phase === "paused" ? (
                <Play className="w-8 h-8 sm:w-10 sm:h-10 text-white fill-white ml-1" aria-hidden="true" />
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom controls ─────────────────────────────────── */}
      <div className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300 ${controlsVisible || phase !== "playing" ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="absolute inset-x-0 bottom-0 h-36 sm:h-32 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />

        <div className="relative px-3 pb-3 sm:px-4 sm:pb-3 pt-10 sm:pt-8">
          {/* Timeline */}
          {isVod && (
            <div
              className="relative w-full cursor-pointer group/progress mb-3 sm:mb-3"
              onClick={handleProgressClick}
              onTouchStart={handleProgressTouchStart}
              onTouchMove={handleProgressTouchMove}
              onTouchEnd={handleProgressTouchEnd}
              role="slider"
              aria-label="Seek"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={Math.round(currentTime)}
              aria-valuetext={`${fmtTime(currentTime)} of ${fmtTime(duration)}`}
              tabIndex={0}
            >
              <div className="absolute inset-x-0 -top-2 -bottom-2" />
              <div className="relative w-full h-1.5 sm:h-1 bg-white/20 rounded">
                <div className="absolute inset-y-0 left-0 bg-white/30 rounded" style={{ width: `${bufferedPct}%` }} />
                <div className="absolute inset-y-0 left-0 bg-blue-500 rounded" style={{ width: `${progressPct}%` }}>
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-3 sm:h-3 bg-blue-500 rounded-full opacity-0 group-hover/progress:opacity-100 transition-opacity" />
                </div>
              </div>
            </div>
          )}

          {/* Row 1: Transport + Time + Fullscreen */}
          <div className="flex items-center gap-1.5 sm:gap-2 mb-1.5 sm:mb-2">
            <button onClick={() => seek(-10)} className="text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Rewind 10 seconds">
              <SkipBack className="w-5 h-5" aria-hidden="true" />
            </button>
            <button onClick={togglePlay} className="text-white hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label={phase === "playing" ? "Pause" : "Play"}>
              {phase === "playing" ? <Pause className="w-7 h-7" aria-hidden="true" /> : <Play className="w-7 h-7 fill-white" aria-hidden="true" />}
            </button>
            <button onClick={() => seek(10)} className="text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Forward 10 seconds">
              <SkipForward className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Time / Status */}
            <div className="ml-1.5 sm:ml-2">
              {isVod && (
                <span className="text-white/70 text-xs sm:text-sm tabular-nums whitespace-nowrap">
                  {fmtTime(currentTime)} / {fmtTime(duration)}
                </span>
              )}
              {isLive && (
                <span className="text-red-500 text-xs font-bold tracking-wider px-2 py-0.5 bg-red-500/10 rounded whitespace-nowrap">LIVE</span>
              )}
              {transcoding && (
                <span className="text-yellow-500 text-xs px-2 py-0.5 bg-yellow-500/10 rounded whitespace-nowrap ml-1">⏳</span>
              )}
            </div>

            <div className="flex-1" />

            <button ref={fullscreenBtnRef} className="text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
              {isFullscreen ? <Minimize className="w-5 h-5" aria-hidden="true" /> : <Maximize className="w-5 h-5" aria-hidden="true" />}
            </button>
          </div>

          {/* Row 2: Secondary controls */}
          <div className="flex items-center gap-0.5 sm:gap-1.5">
            <button onClick={toggleMute} className="text-white/60 hover:text-white/80 transition-colors p-1.5 sm:p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center" aria-label={muted ? "Unmute" : "Mute"}>
              {muted || volume === 0 ? <VolumeX className="w-4 h-4" aria-hidden="true" /> : <Volume2 className="w-4 h-4" aria-hidden="true" />}
            </button>

            {/* Speed */}
            <div className="relative">
              <button onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="text-white/60 hover:text-white/80 transition-colors px-2 py-1 text-xs tabular-nums min-w-[40px] min-h-[40px] flex items-center justify-center rounded" aria-label={`Playback speed ${playbackRate}x`}>
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full mb-2 left-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[5rem] shadow-xl z-30">
                  {SPEEDS.map(s => (
                    <button key={s} onClick={() => { setSpeed(s); setShowSpeedMenu(false); }}
                      className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${playbackRate === s ? "text-blue-400" : "text-white/70"}`}
                    >{s}x</button>
                  ))}
                </div>
              )}
            </div>

            {/* Volume slider — desktop only */}
            <input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume}
              onChange={e => setVolume(parseFloat(e.target.value))}
              aria-label="Volume"
              className="w-14 sm:w-20 h-1 accent-blue-500 cursor-pointer hidden sm:block" />

            <div className="flex-1 sm:hidden" />
            <div className="hidden sm:block flex-1" />

            {/* More menu — mobile overflow */}
            <div className="relative sm:hidden">
              <button
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                className="text-white/60 hover:text-white/80 transition-colors p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center rounded"
                aria-label="More options"
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  <circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/>
                </svg>
              </button>
              {showMoreMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[10rem] shadow-xl z-30">
                  {/* Download */}
                  {isVod && (
                    <a
                      href={`/api/download/${type === "series" ? "series" : "movie"}/${epId || id}`}
                      download
                      className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
                      onClick={() => setShowMoreMenu(false)}
                    >
                      <Download className="w-4 h-4" /> Download
                    </a>
                  )}
                  {/* Sleep Timer */}
                  <div className="px-2">
                    <SleepTimer
                      onPause={() => {
                        const v = videoRef.current;
                        if (v && !v.paused) { v.pause(); }
                      }}
                    />
                  </div>
                  {/* Audio selector */}
                  <div className="px-2">
                    <AudioSelector
                      mediaType={type === "series" ? "series" : "movie"}
                      streamId={epId || id || ""}
                    />
                  </div>
                  {/* Subtitles */}
                  <div className="px-2">
                    <SubtitleSelector
                      mediaType={type === "series" ? "series" : "movie"}
                      streamId={epId || id || ""}
                      videoRef={videoRef}
                    />
                  </div>
                  {/* Quality (live) */}
                  {isLive && (
                    <div className="border-t border-white/10 mt-1 pt-1 px-2">
                      <p className="px-2 py-1 text-[10px] text-white/40 uppercase tracking-wider">Quality</p>
                      {QUALITIES.map((q, i) => (
                        <button key={q.label}
                          onClick={() => { setQuality(i); setShowMoreMenu(false); }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors rounded ${qualityIdx === i ? "text-blue-400" : "text-white/70"}`}
                        >{q.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Desktop: show remaining controls inline */}
            <div className="hidden sm:flex sm:items-center sm:gap-1">
              <SleepTimer
                onPause={() => {
                  const v = videoRef.current;
                  if (v && !v.paused) { v.pause(); }
                }}
              />
              {isVod && (
                <a
                  href={`/api/download/${type === "series" ? "series" : "movie"}/${epId || id}`}
                  download
                  className="text-white/60 hover:text-white/80 transition-colors p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label="Download for offline"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                </a>
              )}
              <AudioSelector
                mediaType={type === "series" ? "series" : "movie"}
                streamId={epId || id || ""}
              />
              <SubtitleSelector
                mediaType={type === "series" ? "series" : "movie"}
                streamId={epId || id || ""}
                videoRef={videoRef}
              />
              {isLive && (
                <div className="relative">
                  <button onClick={() => setShowQualityMenu(!showQualityMenu)}
                    className="text-white/60 hover:text-white/80 transition-colors p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center" aria-label="Stream quality">
                    <Settings className="w-4 h-4" aria-hidden="true" />
                  </button>
                  {showQualityMenu && (
                    <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[7rem] shadow-xl z-30">
                      {QUALITIES.map((q, i) => (
                        <button key={q.label}
                          onClick={() => { setQuality(i); setShowQualityMenu(false); }}
                          className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${qualityIdx === i ? "text-blue-400" : "text-white/70"}`}
                        >{q.label}</button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
