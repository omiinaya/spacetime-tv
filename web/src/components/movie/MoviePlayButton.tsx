import { Play, Heart } from "lucide-react";

interface MoviePlayButtonProps {
  onPlay: () => void;
  inWatchlist: boolean;
  onToggleWatchlist: () => void;
  trailer?: string;
  showTrailer: boolean;
  onToggleTrailer: () => void;
}

export function MoviePlayButton({
  onPlay,
  inWatchlist,
  onToggleWatchlist,
  trailer,
  showTrailer,
  onToggleTrailer,
}: MoviePlayButtonProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onPlay}
        className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all hover:scale-105 active:scale-95"
      >
        <Play className="h-4 w-4 fill-black text-black" />
        Play
      </button>
      <button
        onClick={onToggleWatchlist}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-xs sm:text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
        aria-label={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      >
        <Heart
          className={`h-3.5 w-3.5 ${inWatchlist ? "fill-red-500 text-red-500" : ""}`}
        />
      </button>
      {trailer && (
        <button
          onClick={onToggleTrailer}
          className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-white/5 text-xs sm:text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
        >
          <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" />{" "}
          {showTrailer ? "Hide" : "Trailer"}
        </button>
      )}
    </div>
  );
}

interface TrailerEmbedProps {
  trailer: string;
}

export function TrailerEmbed({ trailer }: TrailerEmbedProps) {
  return (
    <div className="mt-4 aspect-video rounded-lg overflow-hidden bg-black">
      <iframe
        src={`https://www.youtube.com/embed/${trailer}?autoplay=1&rel=0`}
        className="w-full h-full"
        allow="autoplay; encrypted-media"
        allowFullScreen
        title="Movie Trailer"
      />
    </div>
  );
}
