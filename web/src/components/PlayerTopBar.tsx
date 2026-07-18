import { ArrowLeft, PictureInPicture2 } from "lucide-react";

interface PlayerTopBarProps {
  controlsVisible: boolean;
  phase: string;
  isPiPActive: boolean;
  onBack: () => void;
  onEnterPiP: () => void;
  onExitPiP: () => void;
}

export default function PlayerTopBar({
  controlsVisible,
  phase,
  isPiPActive,
  onBack,
  onEnterPiP,
  onExitPiP,
}: PlayerTopBarProps) {
  return (
    <div
      className={`absolute inset-x-0 top-0 z-20 transition-opacity duration-300 ${
        controlsVisible || phase !== "playing"
          ? "opacity-100"
          : "opacity-0 pointer-events-none"
      }`}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/20 to-transparent pointer-events-none" />
      <div
        className="relative px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between"
        style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={onBack}
          className="text-white/90 hover:text-white transition-colors p-2 flex items-center gap-1.5 min-w-[44px] min-h-[44px]"
          aria-label="Back to browsing"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          <span className="text-sm font-medium hidden sm:inline">Back</span>
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (isPiPActive) {
                onExitPiP();
              } else {
                onEnterPiP();
              }
            }}
            className={`text-white/80 hover:text-white transition-colors p-2 min-w-[44px] min-h-[44px] flex items-center justify-center ${
              isPiPActive ? "text-white bg-white/10 rounded-lg" : ""
            }`}
            aria-label={
              isPiPActive ? "Exit Picture in Picture" : "Picture in Picture"
            }
          >
            <PictureInPicture2
              className="w-4 h-4 sm:w-5 sm:h-5"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
