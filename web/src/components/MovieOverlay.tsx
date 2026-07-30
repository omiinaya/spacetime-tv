import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router";
import { api } from "@/lib/api";
import { UnifiedMovie, MovieLanguage } from "@/lib/types";
import MediaOverlay from "@/components/MediaOverlay";
import SimilarMovies from "@/components/SimilarMovies";
import TmdbSimilarMovies from "@/components/TmdbSimilarMovies";
import { isInWatchlist, toggleWatchlist } from "@/lib/watchlist";
import { MovieLanguageSelector } from "@/components/movie/MovieLanguageSelector";
import { MoviePlayButton, TrailerEmbed } from "@/components/movie/MoviePlayButton";
import { MediaCastSection } from "@/components/media/MediaCastSection";
import { MediaInfoBar } from "@/components/media/MediaInfoBar";

interface MovieOverlayProps {
  movie: UnifiedMovie;
  onClose: () => void;
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

  const [info, setInfo] = useState<import("@/lib/types").MovieInfo | null>(
    null,
  );
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
      title={displayName}
      genres={genres}
      rating={rating ? Number(rating) : undefined}
      year={year || undefined}
      plot={plot || undefined}
      metaItems={metaItems.length ? metaItems : undefined}
      loading={loading}
      error={error}
      titleActions={
        /* Language dropdown */
        <MovieLanguageSelector
          languages={movie.languages}
          selectedLang={selectedLang}
          onSelect={setSelectedLang}
          isOpen={showLangMenu}
          onToggle={() => setShowLangMenu(!showLangMenu)}
          menuRef={langMenuRef}
        />
      }
      playButton={
        <MoviePlayButton
          onPlay={play}
          inWatchlist={inWatchlist}
          onToggleWatchlist={() => {
            toggleWatchlist(movie.stream_id);
            setInWatchlist(!inWatchlist);
          }}
          trailer={trailer}
          showTrailer={showTrailer}
          onToggleTrailer={() => setShowTrailer(!showTrailer)}
        />
      }
      trailerEmbed={showTrailer && trailer ? <TrailerEmbed trailer={trailer} /> : null}
    >
      {/* Cast, Director, Extra info */}
      {!loading && !error && (
        <>
          <MediaCastSection cast={cast} director={director} />
          <MediaInfoBar
            date={info?.releasedate}
            duration={duration}
            status={tmdb?.status}
            tmdbId={tmdbId}
            mediaType="movie"
          />
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
