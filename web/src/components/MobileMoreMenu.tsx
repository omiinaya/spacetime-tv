import { useState } from "react";
import { Download, Circle } from "lucide-react";
import { QUALITIES } from "@/hooks/useVideoPlayer";
import { SleepTimer } from "@/components/SleepTimer";
import { SubtitleSelector } from "@/components/SubtitleSelector";
import { AudioSelector } from "@/components/AudioSelector";

interface MobileMoreMenuProps {
  isVod: boolean;
  isLive: boolean;
  isRecording: boolean;
  qualityIdx: number;
  type: "live" | "movie" | "series";
  id?: string;
  epId?: string;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onRecordToggle: () => void;
  onSetQuality: (idx: number) => void;
  switchAudioTrack: (trackId: number) => void;
}

export default function MobileMoreMenu({
  isVod,
  isLive,
  isRecording,
  qualityIdx,
  type,
  id,
  epId,
  videoRef,
  onRecordToggle,
  onSetQuality,
  switchAudioTrack,
}: MobileMoreMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative sm:hidden">
      <button
        onClick={() => setOpen(!open)}
        className="text-white/60 hover:text-white/80 transition-colors p-1.5 min-w-[44px] min-h-[44px] flex items-center justify-center rounded"
        aria-label="More options"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </button>
      {open && (
        <div className="absolute bottom-full mb-2 right-0 bg-zinc-900/95 border border-white/10 rounded-lg py-1 min-w-[10rem] shadow-xl z-30">
          {isVod && (
            <a
              href={`/api/download/${type === "series" ? "series" : "movie"}/${epId || id}`}
              download
              className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-white/70 hover:bg-white/10 transition-colors"
              onClick={() => setOpen(false)}
            >
              <Download className="w-4 h-4" /> Download
            </a>
          )}
          {isLive && (
            <button
              onClick={() => {
                onRecordToggle();
                setOpen(false);
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
              setOpen(false);
              window.dispatchEvent(new CustomEvent("stv:toggle-shortcuts"));
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
                    setOpen(false);
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
  );
}
