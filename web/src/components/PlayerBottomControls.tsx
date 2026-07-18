import { useState, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Download,
  Circle,
  Settings,
  RadioTower,
} from "lucide-react";
import { QUALITIES, SPEEDS } from "@/hooks/useVideoPlayer";
import { SleepTimer } from "@/components/SleepTimer";
import { SubtitleSelector } from "@/components/SubtitleSelector";
import { AudioSelector } from "@/components/AudioSelector";
import PlayerProgressBar from "@/components/PlayerProgressBar";

interface PlayerBottomControlsProps {
  controlsVisible: boolean;
  phase: string;
  isLive: boolean;
  isVod: boolean;
  isFullscreen: boolean;
  isRecording: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  qualityIdx: number;
  currentTime: number;
  duration: number;
  progressPct: number;
  bufferedPct: number;
  isBehindLive: boolean;
  secondsBehindLive: number;
  liveSeekableStart: number;
  liveSeekableEnd: number;
  transcoding: boolean;
  connectionQuality: string;
  downloadSpeed: number;
  stallCount: number;
  frameRate: { videoFps: number; displayHz: number; label: string };
  suggestLowerQuality: boolean;
  type: "live" | "movie" | "series";
  id?: string;
  epId?: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  fullscreenBtnRef: React.RefObject<HTMLButtonElement | null>;
  onTogglePlay: () => void;
  onSeekTo: (time: number) => void;
  onToggleMute: () => void;
  onSetVolume: (v: number) => void;
  onSetSpeed: (s: number) => void;
  onSetQuality: (idx: number) => void;
  onSeekToLive: () => void;
  onRecordToggle: () => void;
  onShowControls: (temporary?: boolean) => void;
  onToggleFullscreen: () => void;
  fmtTime: (t: number) => string;
  switchAudioTrack: (trackId: number) => void;
}

function ConnectionIndicator({
  connectionQuality,
  downloadSpeed,
  stallCount,
}: {
  connectionQuality: string;
  downloadSpeed: number;
  stallCount: number;
}) {
  const level =
    connectionQuality === "excellent"
      ? 4
      : connectionQuality === "good"
        ? 3
        : connectionQuality === "fair"
          ? 2
          : 1;

  return (
    <span
      className="inline-flex items-center gap-[2px] ml-1.5 align-middle"
      title={`Connection: ${connectionQuality}${downloadSpeed > 0 ? ` (${Math.round(downloadSpeed)} KB/s)` : ""}${stallCount > 0 ? `, ${stallCount} stall(s)` : ""}`}
      aria-label={`Connection quality: ${connectionQuality}`}
    >
      {[0, 1, 2, 3].map((i) => {
        const active = i < level;
        const color =
          connectionQuality === "poor"
            ? "bg-red-500"
            : connectionQuality === "fair"
              ? "bg-yellow-400"
              : "bg-green-500";
        return (
          <span
            key={i}
            className={`block w-[3px] rounded-sm transition-all duration-300 ${
              active ? color : "bg-white/15"
            }`}
            style={{ height: `${4 + i * 3}px` }}
          />
        );
      })}
    </span>
  );
}

function FrameRateIndicator({
  videoFps,
  label,
}: {
  videoFps: number;
  label: string;
}) {
  if (videoFps <= 0) return null;
  return (
    <span
      className="text-white/40 text-[10px] ml-1.5 tabular-nums align-middle"
      title={`Source: ${videoFps} fps`}
      aria-label={`Video frame rate: ${videoFps} fps`}
    >
      {label}
    </span>
  );
}

export default function PlayerBottomControls({
  controlsVisible,
  phase,
  isLive,
  isVod,
  isFullscreen,
  isRecording,
  muted,
  volume,
  playbackRate,
  qualityIdx,
  currentTime,
  duration,
  progressPct,
  bufferedPct,
  isBehindLive,
  secondsBehindLive,
  liveSeekableStart,
  liveSeekableEnd,
  transcoding,
  connectionQuality,
  downloadSpeed,
  stallCount,
  frameRate,
  suggestLowerQuality,
  type,
  id,
  epId,
  videoRef,
  fullscreenBtnRef,
  onSeekTo,
  onToggleMute,
  onSetVolume,
  onSetSpeed,
  onSetQuality,
  onSeekToLive,
  onRecordToggle,
  onShowControls,
  fmtTime,
  switchAudioTrack,
}: PlayerBottomControlsProps) {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const handleRecordToggle = useCallback(() => {
    onRecordToggle();
  }, [onRecordToggle]);

  const handleFullscreenClick = useCallback(() => {
    const btn = fullscreenBtnRef.current;
    if (btn) btn.click();
  }, [fullscreenBtnRef]);

  const toggleMute = onToggleMute;
  const setVolume = onSetVolume;

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 transition-opacity duration-300 ${
        controlsVisible || phase !== "playing"
          ? "opacity-100"
          : "opacity-0 pointer-events-none"
      }`}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-x-0 bottom-0 h-36 sm:h-32 bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />

      <div
        className="relative px-3 pb-3 sm:px-4 sm:pb-3 pt-10 sm:pt-8"
        style={{
          paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {/* Timeline */}
        <PlayerProgressBar
          isLive={isLive}
          isVod={isVod}
          liveSeekableStart={liveSeekableStart}
          liveSeekableEnd={liveSeekableEnd}
          currentTime={currentTime}
          duration={duration}
          progressPct={progressPct}
          bufferedPct={bufferedPct}
          secondsBehindLive={secondsBehindLive}
          onSeekTo={onSeekTo}
          onShowControls={onShowControls}
          fmtTime={fmtTime}
        />

        {/* Row 1: Time / Status + Fullscreen */}
        <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
          <div>
            {isVod && (
              <span className="text-white/70 text-xs sm:text-sm tabular-nums whitespace-nowrap">
                {fmtTime(currentTime)} / {fmtTime(duration)}
              </span>
            )}
            {isLive && (
              <span
                className={`text-xs font-bold tracking-wider px-2 py-0.5 rounded whitespace-nowrap flex items-center gap-1 ${
                  isBehindLive
                    ? "text-yellow-400 bg-yellow-400/10"
                    : "text-red-500 bg-red-500/10"
                }`}
              >
                {isBehindLive ? (
                  <>
                    <RadioTower className="h-3 w-3" />
                    {-Math.round(secondsBehindLive)}s
                  </>
                ) : (
                  "LIVE"
                )}
              </span>
            )}
            {transcoding && (
              <span className="text-yellow-500 text-xs px-2 py-0.5 bg-yellow-500/10 rounded whitespace-nowrap ml-1">
                {"\u23F3"}
              </span>
            )}
            <ConnectionIndicator
              connectionQuality={connectionQuality}
              downloadSpeed={downloadSpeed}
              stallCount={stallCount}
            />
            <FrameRateIndicator
              videoFps={frameRate.videoFps}
              label={frameRate.label}
            />
          </div>

          <div className="flex-1" />

          {/* Go Live */}
          {isLive && isBehindLive && (
            <button
              onClick={onSeekToLive}
              className="flex items-center gap-1 px-2.5 py-1 mr-1 rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white text-[11px] font-medium transition-colors"
              aria-label="Return to live"
            >
              <RadioTower className="h-3 w-3" />
              Go Live
            </button>
          )}

          {/* Lower quality suggestion */}
          {suggestLowerQuality && qualityIdx < QUALITIES.length - 1 && (
            <button
              onClick={() => onSetQuality(qualityIdx + 1)}
              className="flex items-center gap-1 px-2 py-1 mr-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400 text-[11px] font-medium transition-colors"
              aria-label="Lower video quality for smoother playback"
              title={`Connection is poor (${connectionQuality}). Switch to ${QUALITIES[qualityIdx + 1]?.label || "lower"} quality?`}
            >
              <span className="h-3 w-3">{"\u2B07"}</span>
              Lower quality
            </button>
          )}

          <button
            onClick={handleFullscreenClick}
            className="text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize className="w-5 h-5" aria-hidden="true" />
            ) : (
              <Maximize className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Row 2: Secondary controls */}
        <div className="flex items-center gap-0.5 sm:gap-1.5">
          {/* Volume — mobile: tap for popup */}
          <div className="relative">
            <button
              onClick={() => setShowVolumeSlider(!showVolumeSlider)}
              className="text-white/60 hover:text-white/80 transition-colors p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? (
                <VolumeX className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Volume2 className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
            {showVolumeSlider && (
              <div className="absolute bottom-full mb-2 left-0 flex flex-col items-center gap-2 bg-zinc-900/95 border border-white/10 rounded-lg px-1.5 py-3 shadow-xl z-30">
                <button
                  onClick={() => {
                    toggleMute();
                  }}
                  className="text-white/60 hover:text-white/80"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={muted ? 0 : volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  aria-label="Volume"
                  className="h-24 w-1 accent-blue-500 cursor-pointer"
                  style={{
                    WebkitAppearance: "slider-vertical",
                    writingMode: "vertical-lr",
                    direction: "rtl",
                  }}
                />
                <span className="text-[10px] text-white/40 tabular-nums">
                  {Math.round((muted ? 0 : volume) * 100)}%
                </span>
              </div>
            )}
          </div>

          {/* Speed */}
          <div className="relative">
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              className="text-white/60 hover:text-white/80 transition-colors px-2 py-1 text-xs tabular-nums min-w-[40px] min-h-[40px] flex items-center justify-center rounded"
              aria-label={`Playback speed ${playbackRate}x`}
            >
              {playbackRate}x
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full mb-2 left-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[5rem] shadow-xl z-30">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      onSetSpeed(s);
                      setShowSpeedMenu(false);
                    }}
                    className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${playbackRate === s ? "text-blue-400" : "text-white/70"}`}
                  >
                    {s}x
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Volume slider — desktop only */}
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            aria-label="Volume"
            className="w-14 sm:w-20 h-1 accent-blue-500 cursor-pointer hidden sm:block"
          />

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
                <circle cx="3" cy="8" r="1.5" />
                <circle cx="8" cy="8" r="1.5" />
                <circle cx="13" cy="8" r="1.5" />
              </svg>
            </button>
            {showMoreMenu && (
              <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[10rem] shadow-xl z-30">
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
                {type === "live" && (
                  <button
                    onClick={() => {
                      handleRecordToggle();
                      setShowMoreMenu(false);
                    }}
                    className={`flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      isRecording
                        ? "text-red-400 hover:bg-red-500/10"
                        : "text-white/70 hover:bg-white/10"
                    }`}
                  >
                    <Circle
                      className={`w-4 h-4 ${isRecording ? "animate-pulse fill-current" : ""}`}
                    />
                    {isRecording ? "Stop Recording" : "Record"}
                  </button>
                )}
                <div className="px-2">
                  <SleepTimer
                    onPause={() => {
                      const v = videoRef.current;
                      if (v && !v.paused) {
                        v.pause();
                      }
                    }}
                  />
                </div>
                <button
                  onClick={() => {
                    setShowMoreMenu(false);
                    window.dispatchEvent(
                      new CustomEvent("stv:toggle-shortcuts"),
                    );
                  }}
                  className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
                >
                  <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-mono text-white/60">
                    {"?"}
                  </span>
                  Shortcuts
                </button>
                <div className="px-2">
                  <AudioSelector
                    mediaType={type === "series" ? "series" : "movie"}
                    streamId={epId || id || ""}
                    onSwitchTrack={switchAudioTrack}
                  />
                </div>
                <div className="px-2">
                  <SubtitleSelector
                    mediaType={type === "series" ? "series" : "movie"}
                    streamId={epId || id || ""}
                    videoRef={videoRef as React.RefObject<HTMLVideoElement>}
                  />
                </div>
                {isLive && (
                  <div className="border-t border-white/10 mt-1 pt-1 px-2">
                    <p className="px-2 py-1 text-[10px] text-white/40 uppercase tracking-wider">
                      Quality
                    </p>
                    {QUALITIES.map((q, i) => (
                      <button
                        key={q.label}
                        onClick={() => {
                          onSetQuality(i);
                          setShowMoreMenu(false);
                        }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors rounded ${qualityIdx === i ? "text-blue-400" : "text-white/70"}`}
                      >
                        {q.label}
                      </button>
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
                if (v && !v.paused) {
                  v.pause();
                }
              }}
            />
            {type === "live" && (
              <button
                onClick={handleRecordToggle}
                className={`p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center transition-colors ${
                  isRecording
                    ? "text-red-500"
                    : "text-white/60 hover:text-white/80"
                }`}
                aria-label={isRecording ? "Stop recording" : "Start recording"}
              >
                <Circle
                  className={`w-4 h-4 ${isRecording ? "animate-pulse fill-current" : ""}`}
                  aria-hidden="true"
                />
              </button>
            )}
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
              onSwitchTrack={switchAudioTrack}
            />
            <SubtitleSelector
              mediaType={type === "series" ? "series" : "movie"}
              streamId={epId || id || ""}
              videoRef={videoRef as React.RefObject<HTMLVideoElement>}
            />
            {isLive && (
              <div className="relative">
                <button
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  className="text-white/60 hover:text-white/80 transition-colors p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center"
                  aria-label="Stream quality"
                >
                  <Settings className="w-4 h-4" aria-hidden="true" />
                </button>
                {showQualityMenu && (
                  <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[7rem] shadow-xl z-30">
                    {QUALITIES.map((q, i) => (
                      <button
                        key={q.label}
                        onClick={() => {
                          onSetQuality(i);
                          setShowQualityMenu(false);
                        }}
                        className={`block w-full text-left px-4 py-2 text-sm hover:bg-white/10 transition-colors ${qualityIdx === i ? "text-blue-400" : "text-white/70"}`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export { PlayerProgressBar };
