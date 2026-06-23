import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Play,
  Star,
  Film,
  ExternalLink,
  Loader2,
  AlertCircle,
  Clock,
  Calendar,
} from "lucide-react";
import { api, Movie, MovieInfo } from "@/lib/api";

interface MovieOverlayProps {
  movie: Movie;
  onClose: () => void;
}

export default function MovieOverlay({ movie, onClose }: MovieOverlayProps) {
  const navigate = useNavigate();
  const [info, setInfo] = useState<MovieInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFullPlot, setShowFullPlot] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Fetch movie details
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api.movies
      .details(movie.stream_id)
      .then((d) => {
        if (cancelled) return;
        if (d.info) {
          setInfo(d.info);
        } else {
          setError("No details available");
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [movie.stream_id]);

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

  // ── Derived ───────────────────────────────────────────────────
  const bannerUrl =
    info?.backdrop_path?.[0] || info?.cover_big || movie.stream_icon || "";
  const posterUrl =
    info?.movie_image || info?.cover_big || movie.stream_icon || "";
  const rating = info?.rating || movie.rating || "";
  const ratingNum = info?.rating
    ? parseFloat(info.rating) / 2 // convert /10 → /5
    : movie.rating_5based;
  const year = (
    info?.releasedate || ""
  ).slice(0, 4);
  const genre = info?.genre || "";
  const plot = info?.plot || info?.description || "";
  const cast = info?.cast || info?.actors || "";
  const director = info?.director || "";
  const duration = info?.duration || "";
  const trailer = info?.youtube_trailer || "";
  const tmdbId = info?.tmdb_id || movie.tmdb || "";
  const extension = (movie.container_extension || "").toUpperCase();
  const genres = genre
    ? genre.split(",").map((g) => g.trim()).filter(Boolean)
    : [];

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
              {/* Genre tags */}
              {genres.length > 0 && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {genres.slice(0, 4).map((g) => (
                    <span
                      key={g}
                      className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-white/10 text-white/80"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-2">
                {movie.name}
              </h2>

              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap text-sm text-white/70">
                {rating && (
                  <span className="inline-flex items-center gap-1 font-semibold text-yellow-400">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    {rating}
                  </span>
                )}
                {year && <span>{year}</span>}
                {duration && <span>{duration}</span>}
                {extension && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/50">
                    {extension}
                  </span>
                )}
              </div>

              {/* Play button */}
              <button
                onClick={play}
                className="mt-3 inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all hover:scale-105 active:scale-95"
              >
                <Play className="h-4 w-4 fill-black text-black" />
                Play Movie
              </button>
            </div>
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto">
          <div className="p-6 sm:px-10 sm:py-6 space-y-5">
            {/* Loading / Error */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-white/30" />
              </div>
            )}
            {error && !loading && (
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {!loading && !error && (
              <>
                {/* Plot */}
                {plot && (
                  <div>
                    <p
                      className={`text-sm text-white/60 leading-relaxed ${
                        !showFullPlot && plot.length > 250
                          ? "line-clamp-3"
                          : ""
                      }`}
                    >
                      {plot}
                    </p>
                    {plot.length > 250 && (
                      <button
                        onClick={() => setShowFullPlot(!showFullPlot)}
                        className="mt-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                      >
                        {showFullPlot ? "Show less" : "Read more"}
                      </button>
                    )}
                  </div>
                )}

                {/* Cast & Director */}
                <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
                  {cast && (
                    <div>
                      <span className="text-white/30">Cast: </span>
                      <span className="text-white/60">{cast}</span>
                    </div>
                  )}
                  {director && (
                    <div>
                      <span className="text-white/30">Director: </span>
                      <span className="text-white/60">{director}</span>
                    </div>
                  )}
                </div>

                {/* Extra info */}
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-white/40">
                  {info?.releasedate && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {info.releasedate}
                    </span>
                  )}
                  {duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {duration}
                    </span>
                  )}
                  {tmdbId && (
                    <a
                      href={`https://www.themoviedb.org/movie/${tmdbId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 hover:text-white/70 transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      TMDB
                    </a>
                  )}
                </div>

                {/* Trailer link */}
                {trailer && (
                  <a
                    href={`https://www.youtube.com/watch?v=${trailer}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
                  >
                    <Play className="h-4 w-4" />
                    Watch Trailer
                  </a>
                )}

                {/* Play button */}
                <div className="pt-2 border-t border-white/5">
                  <button
                    onClick={play}
                    className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all"
                  >
                    <Play className="h-4 w-4 fill-black text-black" />
                    Play
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
