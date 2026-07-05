import { useRef, useCallback, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useKeyboard } from "@/hooks/useKeyboard";
import { useVideoPlayer, fmtTime } from "@/hooks/useVideoPlayer";
import { useControlsVisibility } from "@/hooks/useControlsVisibility";
import { useSwipeToGoBack } from "@/hooks/useSwipeToGoBack";
import { DocumentWithWebkit, VideoElementWithWebkit } from "@/hooks/usePlayerTypes";
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

  // ── Controls visibility ─────────────────────────────────────
  const { controlsVisible, showControls, hideControls } = useControlsVisibility();

  // ── Swipe-to-go-back gesture ─────────────────────────────────
  const centerTouched = useRef(false);
  const { goBack, handleTouchStart, handleTouchMove, handleTouchEnd } = useSwipeToGoBack();

  // ── Video player hook (core playback logic) ──────────────────
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

  // ── Fullscreen ───────────────────────────────────────────────
  const { isFullscreen, setIsFullscreen } = useFullscreen();

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

  // ── Native fullscreen event listener ─────────────────────────
  const fullscreenBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const btn = fullscreenBtnRef.current;
    if (!btn) return;
    btn.addEventListener("click", toggleFullscreen);
    return () => btn.removeEventListener("click", toggleFullscreen);
  }, [toggleFullscreen]);

  // ── Recording ────────────────────────────────────────────────
  const { isRecording, startRecording, stopRecording } = useRecording();

  const handleRecordToggle = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else if (type === "live" && id) {
      startRecording(parseInt(id, 10));
    }
  }, [isRecording, stopRecording, startRecording, type, id]);

  // ── Document Picture-in-Picture ──────────────────────────────
  const { isPiPActive, enterPiP, exitPiP } = useDocumentPiP(videoRef, containerRef);

  // ── Frame rate detection ─────────────────────────────────────
  const frameRate = useFrameRateDetector(videoRef, phase === "playing");

  // ── Keyboard ─────────────────────────────────────────────────
  useKeyboard({ togglePlay, seek, toggleFullscreen, toggleMute, setVolume, volume });

  // ── Force a fresh video element on each mount ────────────────
  const mountKey = useRef(Date.now()).current;

  // ── Track recently played live channels ──────────────────────
  useEffect(() => {
    if (type !== "live" || !id) return;
    const sid = parseInt(id, 10);
    if (!sid) return;
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

  // ── Touch handler: toggle controls on tap while tracking swipe ─
  const onContainerTouchStart = (e: React.TouchEvent) => {
    handleTouchStart(e, centerTouched);
    if (controlsVisible) hideControls();
    else showControls(true);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-black group"
      onMouseMove={() => showControls(true)}
      onMouseLeave={() => { if (phase === "playing") hideControls(); }}
      onTouchStart={onContainerTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={(e) => handleTouchEnd(e, type)}
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
        onBack={() => goBack(type)}
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
