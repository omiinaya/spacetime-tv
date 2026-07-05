import { useRef, useState, useCallback, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useVideoPlayer, fmtTime } from "@/hooks/useVideoPlayer";
import PlayerLoadingOverlay from "@/components/PlayerLoadingOverlay";
import PlayerErrorOverlay from "@/components/PlayerErrorOverlay";
import PlayerResumePrompt from "@/components/PlayerResumePrompt";
import PlayerTopBar from "@/components/PlayerTopBar";
import PlayerCenterControls from "@/components/PlayerCenterControls";
import PlayerBottomControls from "@/components/PlayerBottomControls";
import { CatchupTimeline } from "@/components/CatchupTimeline";
import { saveRecentChannel } from "@/lib/recentChannels";
import { api } from "@/lib/api";
import { useRecording } from "@/hooks/useRecording";
import { useDocumentPiP } from "@/hooks/useDocumentPiP";
import { useFrameRateDetector } from "@/hooks/useFrameRateDetector";

// ── Types ─────────────────────────────────────────────────────
interface PlayerProps { type: "live" | "movie" | "series"; }

// WebKit-prefixed fullscreen API (not in standard TS DOM types)
interface DocumentWithWebkit extends Document {
  webkitFullscreenElement: Element | null;
  webkitExitFullscreen: () => void;
}

interface VideoElementWithWebkit extends HTMLVideoElement {
  webkitRequestFullscreen?: () => Promise<void>;
  webkitEnterFullscreen?: () => void;
}

// ── Component ─────────────────────────────────────────────────
export default function Player({ type }: PlayerProps) {
  const { id, seriesId, epId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Timeshift / catch-up mode ──────────────────────────────
  const tsParam = searchParams.get("ts");
  const timeshiftDuration = tsParam ? parseInt(tsParam, 10) : undefined;
  const isTimeshiftMode = timeshiftDuration !== undefined && timeshiftDuration > 0;

  const setTimeshift = useCallback((durationSeconds: number) => {
    setSearchParams({ ts: String(durationSeconds) });
  }, [setSearchParams]);

  const goLive = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const {
    videoRef, containerRef, phase, errorMsg, errorType, loadingStep, transcoding,
    volume, muted, playbackRate, qualityIdx, currentTime, duration, buffered,
    resumePos, showResumePrompt, isLive, isVod,
    togglePlay, seekTo, seek, setVolume, toggleMute, setSpeed, setQuality,
    resumePlayback, startFromBeginning,
    retryStream, isBehindLive, secondsBehindLive, seekToLive,
    liveSeekableStart, liveSeekableEnd, switchAudioTrack,
    connectionQuality, stallCount, suggestLowerQuality, downloadSpeed,
  } = useVideoPlayer({
    type, id, seriesId, epId, timeshiftDuration,
    onAutoAdvance: useCallback((url: string) => {
      navigate(url);
    }, [navigate]),
  });

  // ── UI State ─────────────────────────────────────────────────
  const { isFullscreen, setIsFullscreen } = useFullscreen();

  // ── Recording ────────────────────────────────────────────────
  const { isRecording, startRecording, stopRecording } = useRecording();

  // ── Document Picture-in-Picture ──────────────────────────────
  const { isPiPActive, enterPiP, exitPiP } = useDocumentPiP(videoRef, containerRef);

  // ── Frame rate detection ─────────────────────────────────────
  const frameRate = useFrameRateDetector(videoRef, phase === "playing");

  const handleRecordToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else if (type === "live" && id) {
      startRecording(parseInt(id, 10));
    }
  }, [isRecording, stopRecording, startRecording, type, id]);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const swipeStart = useRef<{ x: number; y: number } | null>(null);
  const centerTouched = useRef(false);
  // Force a fresh video element on each mount (page refresh) to avoid
  // any browser-cached state interfering with mpegts.js initialization.
  const mountKey = useRef(Date.now()).current;

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
    const doc = document as DocumentWithWebkit;
    const isFS = !!(document.fullscreenElement || doc.webkitFullscreenElement);
    if (isFS) {
      document.exitFullscreen?.().catch(() => {});
      doc.webkitExitFullscreen?.();
      setIsFullscreen(false);
    } else {
      const el = video as VideoElementWithWebkit;
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

  // ── Track recently played live channels ──────────────────────
  useEffect(() => {
    if (type !== "live" || !id) return;
    const sid = parseInt(id, 10);
    if (!sid) return;
    // Try to fetch channel name; if it fails, just record the ID
    api.live.info([sid]).then((res) => {
      const ch = res.streams[0];
      saveRecentChannel({ stream_id: sid, name: ch?.name || `Channel ${sid}`, icon: ch?.stream_icon || "" });
    }).catch(() => {
      saveRecentChannel({ stream_id: sid, name: `Channel ${sid}`, icon: "" });
    });
  }, [type, id]);

  // ── Derived ──────────────────────────────────────────────────
  const progressPct = isLive
    ? (liveSeekableEnd - liveSeekableStart > 0
        ? ((currentTime - liveSeekableStart) / (liveSeekableEnd - liveSeekableStart)) * 100
        : 0)
    : duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedPct = isLive
    ? 100
    : duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black group"
      onMouseMove={() => showControls(true)}
      onMouseLeave={() => { if (phase === "playing") hideControls(); }}
      onTouchStart={(e) => {
        // If a center button was just touched, skip controls toggle
        if (centerTouched.current) {
          centerTouched.current = false;
          return;
        }
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
          e.preventDefault();
        }
      }}
      onTouchEnd={(e) => {
        if (!swipeStart.current) return;
        const dx = (e.changedTouches[0]?.clientX || 0) - swipeStart.current.x;
        const dy = Math.abs((e.changedTouches[0]?.clientY || 0) - swipeStart.current.y);
        if (dx > 80 && dx > dy * 1.5) {
          goBack();
        }
        swipeStart.current = null;
      }}
      style={{ aspectRatio: "16 / 9", maxHeight: "100dvh" }}
    >
      <video
        ref={videoRef}
        key={mountKey}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ pointerEvents: "none" }}
        playsInline
        webkit-playsinline="true"
        x-webkit-airplay="allow"
      />

      {/* Transparent overlay to handle play/pause taps */}
      <div className="absolute inset-0 z-[1]" onClick={togglePlay} />

      {/* Loading */}
      <PlayerLoadingOverlay phase={phase} loadingStep={loadingStep} errorMsg={errorMsg} />

      {/* Error */}
      <PlayerErrorOverlay phase={phase} errorMsg={errorMsg} errorType={errorType} onRetry={retryStream} />

      {/* Resume prompt */}
      <PlayerResumePrompt
        showResumePrompt={showResumePrompt}
        resumePos={resumePos}
        onResume={resumePlayback}
        onStartOver={startFromBeginning}
        fmtTime={fmtTime}
      />

      {/* ── Top bar ─────────────────────────────────────────── */}
      <PlayerTopBar
        controlsVisible={controlsVisible}
        phase={phase}
        isPiPActive={isPiPActive}
        onBack={goBack}
        onEnterPiP={enterPiP}
        onExitPiP={exitPiP}
      />

      {/* ── Center controls ────────────────────────────────── */}
      <PlayerCenterControls
        controlsVisible={controlsVisible}
        phase={phase}
        onTogglePlay={togglePlay}
        onSeek={seek}
        onCenterTouch={() => { centerTouched.current = true; }}
      />

      {/* ── Bottom controls ─────────────────────────────────── */}
      <PlayerBottomControls
        controlsVisible={controlsVisible}
        phase={phase}
        isLive={isLive}
        isVod={isVod}
        isFullscreen={isFullscreen}
        isRecording={isRecording}
        muted={muted}
        volume={volume}
        playbackRate={playbackRate}
        qualityIdx={qualityIdx}
        currentTime={currentTime}
        duration={duration}
        progressPct={progressPct}
        bufferedPct={bufferedPct}
        isBehindLive={isBehindLive}
        secondsBehindLive={secondsBehindLive}
        liveSeekableStart={liveSeekableStart}
        liveSeekableEnd={liveSeekableEnd}
        transcoding={transcoding}
        connectionQuality={connectionQuality}
        downloadSpeed={downloadSpeed}
        stallCount={stallCount}
        frameRate={frameRate}
        suggestLowerQuality={suggestLowerQuality}
        type={type}
        id={id}
        epId={epId}
        videoRef={videoRef}
        fullscreenBtnRef={fullscreenBtnRef}
        onTogglePlay={togglePlay}
        onSeekTo={seekTo}
        onToggleMute={toggleMute}
        onSetVolume={setVolume}
        onSetSpeed={setSpeed}
        onSetQuality={setQuality}
        onSeekToLive={seekToLive}
        onRecordToggle={handleRecordToggle}
        onShowControls={showControls}
        onToggleFullscreen={toggleFullscreen}
        fmtTime={fmtTime}
        switchAudioTrack={switchAudioTrack}
      />

      {/* ── Catch-up timeline (live only) ─────────────────────── */}
      {isLive && id && (
        <CatchupTimeline
          streamId={parseInt(id, 10)}
          onSelectProgramme={(startOffset) => setTimeshift(startOffset)}
          onGoLive={goLive}
          isTimeshiftMode={isTimeshiftMode}
        />
      )}
    </div>
  );
}
