import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

interface VolumeControlProps {
  muted: boolean;
  volume: number;
  onToggleMute: () => void;
  onSetVolume: (v: number) => void;
}

export default function VolumeControl({
  muted,
  volume,
  onToggleMute,
  onSetVolume,
}: VolumeControlProps) {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);

  return (
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
            onClick={onToggleMute}
            aria-label={muted || volume === 0 ? "Unmute" : "Mute"}
            className="text-white/60 hover:text-white/80"
          >
            {muted || volume === 0 ? (
              <VolumeX className="w-4 h-4" aria-hidden="true" />
            ) : (
              <Volume2 className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={muted ? 0 : volume}
            onChange={(e) => onSetVolume(parseFloat(e.target.value))}
            aria-label="Volume"
            className="h-24 w-1 accent-blue-500 cursor-pointer"
            style={
              {
                WebkitAppearance: "slider-vertical",
                writingMode: "vertical-lr",
                direction: "rtl",
              } as any
            }
          />
          <span className="text-[10px] text-white/40 tabular-nums">
            {Math.round((muted ? 0 : volume) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
