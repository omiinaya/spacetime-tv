import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Play,
  ExternalLink,
  Clock,
  Calendar,
  Globe,
  ChevronDown,
  Heart,
} from "lucide-react";
import { api, tmdbSrcset } from "@/lib/api";
import {
  MovieInfo,
  UnifiedMovie,
  MovieLanguage,
} from "@/lib/types";
import MediaOverlay from "@/components/MediaOverlay";
import SimilarMovies from "@/components/SimilarMovies";
import TmdbSimilarMovies from "@/components/TmdbSimilarMovies";
import { isInWatchlist, toggleWatchlist } from "@/lib/watchlist";

interface MovieOverlayProps {
  movie: UnifiedMovie;
  onClose: () => void;
}

const LANG_LABELS: Record<string, string> = {
  EN: "English",
  FR: "French",
  DE: "German",
  ES: "Spanish",
  IT: "Italian",
  PT: "Portuguese",
  BR: "Brazilian",
  RU: "Russian",
  GR: "Greek",
  TR: "Turkish",
  NL: "Dutch",
  PL: "Polish",
  IN: "Indian",
  IR: "Persian",
  IL: "Hebrew",
  QC: "Canadian French",
  SO: "Somali",
  LA: "Latin",
  AF: "Afrikaans",
  RO: "Romanian",
  BG: "Bulgarian",
  AL: "Albanian",
  PK: "Urdu",
  KU: "Kurdish",
  PH: "Filipino",
  BN: "Bengali",
  BE: "Belarusian",
  MT: "Maltese",
  CN: "Chinese",
};

function langLabel(code: string): string {
  return LANG_LABELS[code] || code;
}

interface TmdbMovieEnrichment {
  overview?: string;
  backdrop_path?: string;
  poster_path?: string;
  vote_average?: number;
  genres?: { id: number; name: string }[];
  runtime?: number;
  status?: string;
  release_date?: string;
}

export default function MovieOverlay({ movie, onClose }: MovieOverlayProps) {
  const navigate = useNavigate();
  const [selectedLang, setSelectedLang] = useState<MovieLanguage>(
    movie.languages[0],
  );
  const [showLangMenu, setShowLangMenu] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);
  const currentStreamId = selectedLang.stream_id;
  const [inWatchlist, setInWatchlist] = useState(() =>
    isInWatchlist(movie.stream_id),
  );

  const [info, setInfo] = useState<MovieInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── TMDB enrichment ──────────────────────────────────────────
  const [tmdb, setTmdb] = useState<TmdbMovieEnrichment | null>(null);
  const tmdbIdFromMovie = movie.tmdb ? parseInt(movie.tmdb, 10) : null;

  // Trailer — always from the EN version (or first language if no EN)
  const enLang =
    movie.languages.find((l) => l.code === "EN") || movie.languages[0];
  const [enTrailer, setEnTrailer] = useState<string>("");
  const [showTrailer, setShowTrailer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api.movies
      .details(enLang.stream_id)
      .then((d) => {
        if (cancelled) return;
        setEnTrailer(d.info?.youtube_trailer || "");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enLang.stream_id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const providerP = api.movies.details(currentStreamId);
    const tmdbP = tmdbIdFromMovie
      ? api.tmdb.details(tmdbIdFromMovie).catch(() => null)
      : Promise.resolve(null);

    Promise.all([providerP, tmdbP])
      .then(([providerData, tmdbData]) => {
        if (cancelled) return;
        if (providerData.info) setInfo(providerData.info);
        else setError("No details available");

        if (tmdbData && tmdbData.enabled && tmdbData.info) {
          const raw = tmdbData.info;
          setTmdb({
            overview: raw.overview || undefined,
            backdrop_path: raw.backdrop_path || undefined,
            poster_path: raw.poster_path || undefined,
            vote_average: raw.vote_average,
            genres: raw.genres || undefined,
            runtime: raw.runtime,
            status: raw.status,
            release_date: raw.release_date,
          });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentStreamId, tmdbIdFromMovie]);

  // Close language menu on outside click
  useEffect(() => {
    if (!showLangMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        langMenuRef.current &&
        !langMenuRef.current.contains(e.target as Node)
      ) {
        setShowLangMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showLangMenu]);

  // ── Derived ───────────────────────────────────────────────────
  const bannerUrl =
    info?.backdrop_path?.[0] ||
    info?.cover_big ||
    (tmdb?.backdrop_path
      ? `https://image.tmdb.org/t/p/original${tmdb.backdrop_path}`
      : "") ||
    movie.stream_icon ||
    "";
  const posterUrl =
    info?.movie_image ||
    info?.cover_big ||
    (tmdb?.poster_path
      ? `https://image.tmdb.org/t/p/w600${tmdb.poster_path}`
      : "") ||
    movie.stream_icon ||
    "";
  // Only generate srcset when the TMDB path actually wins the priority chain
  const useTmdbBanner =
    !info?.backdrop_path?.[0] && !info?.cover_big && !!tmdb?.backdrop_path;
  const useTmdbPoster =
    !info?.movie_image && !info?.cover_big && !!tmdb?.poster_path;
  const bannerSrcset =
    useTmdbBanner && tmdb?.backdrop_path
      ? tmdbSrcset(tmdb.backdrop_path)
      : undefined;
  const posterSrcset =
    useTmdbPoster && tmdb?.poster_path
      ? tmdbSrcset(tmdb.poster_path)
      : undefined;
  const rating =
    info?.rating ||
    movie.rating ||
    (tmdb?.vote_average ? tmdb.vote_average.toFixed(1) : "") ||
    "";
  const year = (info?.releasedate || tmdb?.release_date || "").slice(0, 4);
  const genre = info?.genre || "";
  const plot = tmdb?.overview || info?.plot || info?.description || "";
  const cast = info?.cast || info?.actors || "";
  const director = info?.director || "";
  const duration =
    info?.duration || (tmdb?.runtime ? `${tmdb.runtime}m` : "") || "";
  const trailer = enTrailer;
  const tmdbId =
    info?.tmdb_id || movie.tmdb || tmdbIdFromMovie?.toString() || "";
  const extension = (
    selectedLang.container_extension ||
    movie.container_extension ||
    ""
  ).toUpperCase();
  const providerGenres = genre
    ? genre
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
    : [];
  const tmdbGenreNames = tmdb?.genres?.map((g) => g.name) || [];
  const genres = tmdbGenreNames.length > 0 ? tmdbGenreNames : providerGenres;
  const displayName = movie.languages.length > 1 ? movie.base_name : movie.name;

  const play = () => {
    // Save movie metadata for Continue Watching
    try {
      sessionStorage.setItem(
        "stv_movie_meta",
        JSON.stringify({
          id: currentStreamId,
          name: displayName || movie.name || movie.base_name || "",
          poster: movie.stream_icon || "",
        }),
      );
    } catch {} // DOMException: storage quota
    navigate(`/watch/movie/${currentStreamId}`);
    onClose();
  };

  // Meta items shown in the hero row
  const metaItems: string[] = [];
  if (duration) metaItems.push(duration);
  if (extension) metaItems.push(extension);

  return (
    <MediaOverlay
      onClose={onClose}
      bannerUrl={bannerUrl || undefined}
      posterUrl={posterUrl || undefined}
      bannerSrcset={bannerSrcset}
      posterSrcset={posterSrcset}
      title={displayName}
      genres={genres}
      rating={rating ? Number(rating) : undefined}
      year={year || undefined}
      plot={plot || undefined}
      metaItems={metaItems.length ? metaItems : undefined}
      loading={loading}
      error={error}
      titleActions={
        /* Language dropdown — inside the hero, below title */
        <div className="relative inline-block mt-0.5" ref={langMenuRef}>
          <button
            onClick={() => setShowLangMenu(!showLangMenu)}
            className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg bg-white/10 text-[11px] sm:text-xs text-white/70 hover:bg-white/15 hover:text-white transition-colors"
          >
            <Globe className="h-3 w-3" />
            {langLabel(selectedLang.code)}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>
          {showLangMenu && (
            <div className="absolute top-full left-0 mt-1 w-44 rounded-lg bg-[#1a1a2e] border border-white/10 shadow-xl py-1 z-50 max-h-60 overflow-y-auto">
              {movie.languages.map((l) => (
                <button
                  key={l.code}
                  onClick={() => {
                    setSelectedLang(l);
                    setShowLangMenu(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition-colors flex items-center gap-2 ${
                    l.code === selectedLang.code
                      ? "text-white font-medium"
                      : "text-white/60"
                  }`}
                >
                  <span className="w-4 text-center text-[10px] font-bold opacity-50">
                    {l.code === selectedLang.code ? "✓" : ""}
                  </span>
                  {langLabel(l.code)}
                </button>
              ))}
            </div>
          )}
        </div>
      }
      playButton={
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={play}
            className="inline-flex items-center gap-2 px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg bg-white text-black text-sm font-semibold hover:bg-white/90 transition-all hover:scale-105 active:scale-95"
          >
            <Play className="h-4 w-4 fill-black text-black" />
            Play
          </button>
          <button
            onClick={() => {
              toggleWatchlist(movie.stream_id);
              setInWatchlist(!inWatchlist);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 text-xs sm:text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
            aria-label={
              inWatchlist ? "Remove from watchlist" : "Add to watchlist"
            }
          >
            <Heart
              className={`h-3.5 w-3.5 ${inWatchlist ? "fill-red-500 text-red-500" : ""}`}
            />
          </button>
          {trailer && (
            <button
              onClick={() => setShowTrailer(!showTrailer)}
              className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg bg-white/5 text-xs sm:text-sm text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors"
            >
              <Play className="h-3.5 w-3.5 sm:h-4 sm:w-4" />{" "}
              {showTrailer ? "Hide" : "Trailer"}
            </button>
          )}
        </div>
      }
      trailerEmbed={
        showTrailer && trailer ? (
          <div className="mt-4 aspect-video rounded-lg overflow-hidden bg-black">
            <iframe
              src={`https://www.youtube.com/embed/${trailer}?autoplay=1&rel=0`}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Movie Trailer"
            />
          </div>
        ) : null
      }
    >
      {/* Cast, Director, Extra info */}
      {!loading && !error && (
        <>
          {(cast || director) && (
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm">
              {cast && (
                <div>
                  <span className="text-white/30">Cast: </span>
                  <span className="text-white/60">
                    {cast.split(",").map((name, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-white/20">, </span>}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(
                              `/person/${encodeURIComponent(name.trim())}`,
                            );
                          }}
                          className="hover:text-primary transition-colors cursor-pointer inline"
                        >
                          {name.trim()}
                        </button>
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {director && (
                <div>
                  <span className="text-white/30">Director: </span>
                  <span className="text-white/60">{director}</span>
                </div>
              )}
            </div>
          )}
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
            {tmdb?.status && <span>{tmdb.status}</span>}
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
        </>
      )}
      {/* More Like This */}
      <SimilarMovies
        categoryId={movie.category_id}
        currentId={movie.stream_id}
      />
      {/* TMDB Recommendations */}
      <TmdbSimilarMovies tmdbId={tmdbIdFromMovie} />
    </MediaOverlay>
  );
}
