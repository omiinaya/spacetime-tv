import { SkipBack, Play, Pause, SkipForward } from "lucide-react";

interface PlayerCenterControlsProps {
  controlsVisible: boolean;
  phase: string;
  onTogglePlay: () => void;
  onSeek: (delta: number) => void;
  onCenterTouch: () => void;
}

export default function PlayerCenterControls({
  controlsVisible, phase, onTogglePlay, onSeek, onCenterTouch,
}: PlayerCenterControlsProps) {
  const visible =
    (controlsVisible || phase !== "playing") &&
    phase !== "error" &&
    phase !== "loading" &&
    phase !== "probing";

  return (
    <div
      className={`absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center gap-3 sm:gap-5 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <button
        onTouchStart={() => { onCenterTouch(); }}
        onClick={() => onSeek(-10)}
        className="text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Rewind 10 seconds"
      >
        <SkipBack className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
      </button>
      <button
        onTouchStart={() => { onCenterTouch(); }}
        onClick={onTogglePlay}
        className="text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label={phase === "playing" ? "Pause" : "Play"}
      >
        {phase === "playing" ? (
          <Pause className="w-8 h-8 sm:w-10 sm:h-10" aria-hidden="true" />
        ) : (
          <Play className="w-8 h-8 sm:w-10 sm:h-10 fill-white ml-1" aria-hidden="true" />
        )}
      </button>
      <button
        onTouchStart={() => { onCenterTouch(); }}
        onClick={() => onSeek(10)}
        className="text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Forward 10 seconds"
      >
        <SkipForward className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
      </button>
    </div>
  );
}
