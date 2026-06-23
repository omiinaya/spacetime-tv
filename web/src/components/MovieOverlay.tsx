import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { X, Play, Star, Film, ExternalLink } from "lucide-react";
import type { Movie } from "@/lib/api";

interface MovieOverlayProps {
  movie: Movie;
  onClose: () => void;
}

export default function MovieOverlay({ movie, onClose }: MovieOverlayProps) {
  const navigate = useNavigate();

  // Close on Escape, lock body scroll
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const posterUrl = movie.stream_icon || "";
  const bannerUrl = posterUrl;
  const rating = movie.rating || "";
  const ratingNum = movie.rating_5based;
  const tmdbId = movie.tmdb || "";
  const extension = (movie.container_extension || "").toUpperCase();

  const play = () => {
    navigate(`/watch/movie/${movie.stream_id}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md animate-in fade-in duration-300"
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-[960px] sm:max-h-[92vh] sm:rounded-2xl bg-[#0a0a0f] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-10 zoom-in-95 duration-300">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-30 p-2 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors backdrop-blur-sm"
        >
          <X className="h-5 w-5" />
        </button>

        {/* ── Hero Banner ─────────────────────────────────────── */}
        <div className="relative shrink-0 h-[260px] sm:h-[400px] bg-[#141420] overflow-hidden">
          {bannerUrl ? (
            <>
              <img
                src={bannerUrl}
                alt=""
                className="w-full h-full object-cover opacity-60"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
              {/* Gradient overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0f] via-[#0a0a0f]/40 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0a0a0f]/90 via-transparent to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] via-[#101020] to-[#0a0a0f]" />
          )}

          {/* Hero content */}
          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 flex gap-5 items-end">
            {/* Poster */}
            <div className="hidden sm:block w-[160px] shrink-0 rounded-lg overflow-hidden ring-1 ring-white/10 shadow-2xl -mb-2">
              {posterUrl ? (
                <img
                  src={posterUrl}
                  alt=""
                  className="w-full aspect-[2/3] object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <div className="w-full aspect-[2/3] bg-[#1a1a2e] flex items-center justify-center">
                  <Film className="h-10 w-10 text-white/10" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pb-1">
              {/* Badge row */}
              <div className="flex gap-1.5 mb-2 flex-wrap">
                {rating && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-full bg-yellow-500/15 text-yellow-400 border border-yellow-500/20">
                    <Star className="h-2.5 w-2.5 fill-yellow-400 text-yellow-400" />
                    {rating}
                  </span>
                )}
                {extension && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-white/10 text-white/60">
                    {extension}
                  </span>
                )}
                {tmdbId && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-white/5 text-white/40">
                    TMDB {tmdbId}
                  </span>
                )}
              </div>

              <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-2">
                {movie.name}
              </h2>

              {/* Rating bar */}
              {ratingNum && (
                <div className="flex items-center gap-2 text-sm text-white/60 mb-3">
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-3.5 w-3.5 ${
                          i < Math.round(ratingNum)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-white/15"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-xs text-white/40">
                    {ratingNum.toFixed(1)} / 5
                  </span>
                </div>
              )}

              {/* Play button */}
              <button
                onClick={play}
                className="mt-2 inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all hover:scale-105 active:scale-95"
              >
                <Play className="h-4 w-4 fill-black text-black" />
                Play Movie
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="p-6 sm:px-10 sm:py-6">
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div>
              <span className="text-white/30">Stream ID: </span>
              <span className="text-white/60 font-mono text-xs">
                {movie.stream_id}
              </span>
            </div>
            {tmdbId && (
              <a
                href={`https://www.themoviedb.org/movie/${tmdbId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                View on TMDB
              </a>
            )}
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 mt-6 pt-4 border-t border-white/5">
            <button
              onClick={play}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all"
            >
              <Play className="h-4 w-4 fill-black text-black" />
              Play
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
