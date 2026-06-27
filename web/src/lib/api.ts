const API = "/api";

// Route images from blocked CDNs through our proxy
// Also sanitizes malformed concatenated URLs (provider data quirk)
export function imageUrl(raw: string): string {
  if (!raw) return "";
  
  // Fix concatenated TMDB URLs: "image.tmdb.https//image.tmdb.org/t/p/original/X.jpgorg/t/p/w600..."
  // Extract the first valid TMDB image URL and fix any missing protocol colon
  const m = raw.match(
    /(https?:?\/\/image\.tmdb\.org\/t\/p\/\w+\/[a-zA-Z0-9]+\.(?:jpg|jpeg|png|webp))/i
  );
  if (m) {
    return m[1].replace(/^https\/\//, "https://").replace(/^http\/\//, "http://");
  }

  if (raw.includes("cmc.exchange-cdn.com")) {
    return `/api/image-proxy?url=${encodeURIComponent(raw)}`;
  }
  return raw;
}

// ── TMDB image helpers for responsive images ────────────────────
const TMDB_IMG_BASE = "https://image.tmdb.org/t/p";

// Poster sizes that map well to common viewport widths
const POSTER_SIZES = ["w92", "w154", "w185", "w342", "w500", "w780"];

/**
 * Return a full TMDB image URL for a given poster/backdrop path and size.
 * Falls back to a TMDB base URL check; if path is already a full URL, returns it as-is.
 */
export function tmdbImageUrl(path: string, size: string = "w342"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  if (path.startsWith("/")) return `${TMDB_IMG_BASE}/${size}${path}`;
  return `${TMDB_IMG_BASE}/${size}/${path}`;
}

/**
 * Generate a `srcset` attribute value for a TMDB poster/backdrop path.
 * Returns multiple resolutions so the browser picks the right one for the viewport.
 */
export function tmdbSrcset(path: string): string {
  if (!path) return "";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return POSTER_SIZES
    .map((s) => `${TMDB_IMG_BASE}/${s}${cleanPath} ${s === "w92" ? "92w" : s === "w154" ? "154w" : s === "w185" ? "185w" : s === "w342" ? "342w" : s === "w500" ? "500w" : "780w"}`)
    .join(", ");
}

/**
 * Get src + srcset + sizes props for a responsive TMDB image.
 * Spread directly onto an `<img>` element.
 */
export function tmdbImgProps(path: string, defaultSize: string = "w342", sizes: string = "(max-width: 640px) 185px, (max-width: 1024px) 342px, 500px") {
  const src = tmdbImageUrl(path, defaultSize);
  const srcset = tmdbSrcset(path);
  return { src, srcset, sizes, loading: "lazy" as const };
}

const FETCH_TIMEOUT = 15000; // 15s
const MAX_RETRIES = 1;

async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {}
): Promise<Response> {
  const { timeout = FETCH_TIMEOUT, ...fetchOptions } = options;
  const controller = new AbortController();
  const existingSignal = fetchOptions.signal;
  
  // Merge external signal with our timeout signal
  if (existingSignal) {
    existingSignal.addEventListener("abort", () => controller.abort());
  }
  
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number; retries?: number } = {}
): Promise<Response> {
  const { retries = MAX_RETRIES, ...fetchOptions } = options;
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, fetchOptions);
    } catch (e: unknown) {
      const err = e as Error;
      lastError = err;
      // Only retry on network errors (not HTTP 4xx/5xx)
      if (err.name === "AbortError" || err.name === "TypeError") {
        if (attempt < retries) continue;
      }
      throw e;
    }
  }
  throw lastError;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetchWithRetry(`${API}${path}`, { signal });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const api = {
  live: {
    categories: (signal?: AbortSignal) => get<{ categories: Category[] }>("/live/categories", signal),
    streams: (catId: string, signal?: AbortSignal) =>
      get<{ streams: LiveStream[] }>(`/live/streams?category_id=${catId}`, signal),
    all: (signal?: AbortSignal) => get<{ streams: LiveStream[] }>("/live/all", signal),
    info: (ids: number[], signal?: AbortSignal) =>
      get<{ streams: { stream_id: number; name: string; stream_icon: string }[] }>(
        `/live/info?ids=${ids.join(",")}`, signal
      ),
  },
  movies: {
    categories: (signal?: AbortSignal) => get<{ categories: Category[] }>("/movies/categories", signal),
    list: (catId: string, limit = 20, offset = 0, signal?: AbortSignal) =>
      get<{ movies: Movie[]; total: number; offset: number; limit: number }>(
        `/movies?category_id=${catId}&limit=${limit}&offset=${offset}`, signal
      ),
    details: (id: number, signal?: AbortSignal) => get<{ info: MovieInfo }>(`/movies/${id}`, signal),
    unified: (limit = 50, offset = 0, q?: string, signal?: AbortSignal) => {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (q) params.set("q", q);
      return get<{ movies: UnifiedMovie[]; total: number; offset: number; limit: number }>(
        `/movies/unified?${params}`, signal
      );
    },
  },
  series: {
    categories: (signal?: AbortSignal) => get<{ categories: Category[] }>("/series/categories", signal),
    list: (catId: string, limit = 20, offset = 0, signal?: AbortSignal) =>
      get<{ series: Series[]; total: number; offset: number; limit: number }>(
        `/series?category_id=${catId}&limit=${limit}&offset=${offset}`, signal
      ),
    details: (id: number, signal?: AbortSignal) => get<SeriesDetails>(`/series/${id}`, signal),
    probe: (id: number, signal?: AbortSignal) => get<ProbeResult>(`/api/series/probe/${id}`, signal),
  },
  guide: {
    get: (offset = 0, limit = 60, signal?: AbortSignal) =>
      get<GuideResponse>(
        `/guide?offset=${offset}&limit=${limit}`, signal
      ),
    enrich: (q: string, signal?: AbortSignal) =>
      get<GuideEnrichResponse>(
        `/guide/enrich?q=${encodeURIComponent(q)}`, signal
      ),
    now: (streamIds: number[], signal?: AbortSignal) =>
      get<GuideNowResponse>(
        `/guide/now?stream_ids=${streamIds.join(",")}`, signal
      ),
  },
  search: (q: string, signal?: AbortSignal, limit = 20, offset = 0, section?: string) =>
    get<{ live: LiveStream[]; movies: Movie[]; series: Series[]; totals: { live: number; movies: number; series: number } }>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}${section ? `&section=${section}` : ""}`, signal
    ),
  searchEnrich: (
    movies: { stream_id: number; tmdb_id: string }[],
    series: { series_id: number; tmdb_id: string }[],
    signal?: AbortSignal,
  ) =>
    fetch(`${API}/search/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movies, series }),
      signal,
    }).then((r) => r.json()) as Promise<SearchEnrichResponse>,
  watchlist: {
    progress: (signal?: AbortSignal) =>
      get<{ progress: Record<string, ServerProgressEntry[]> }>("/watchlist/progress", signal),
  },
  tmdb: {
    trending: (timeWindow: "day" | "week" = "week", page = 1, signal?: AbortSignal) =>
      get<TmdbTrendingResponse>(
        `/tmdb/trending?time_window=${timeWindow}&page=${page}`, signal
      ),
    search: (q: string, page = 1, signal?: AbortSignal) =>
      get<TmdbSearchResponse>(
        `/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`, signal
      ),
    details: (tmdbId: number, signal?: AbortSignal) =>
      get<TmdbDetailsResponse>(`/tmdb/movie/${tmdbId}`, signal),
    similar: (tmdbId: number, page = 1, signal?: AbortSignal) =>
      get<TmdbSimilarResponse>(`/tmdb/movie/${tmdbId}/similar?page=${page}`, signal),
    configuration: (signal?: AbortSignal) =>
      get<TmdbConfigResponse>(`/tmdb/configuration`, signal),
    // ── TV / Series TMDB endpoints ────────────────────────────────
    tv: {
      trending: (timeWindow: "day" | "week" = "week", page = 1, signal?: AbortSignal) =>
        get<TmdbTvTrendingResponse>(
          `/tmdb/tv/trending?time_window=${timeWindow}&page=${page}`, signal
        ),
      search: (q: string, page = 1, signal?: AbortSignal) =>
        get<TmdbTvSearchResponse>(
          `/tmdb/tv/search?q=${encodeURIComponent(q)}&page=${page}`, signal
        ),
      details: (seriesId: number, signal?: AbortSignal) =>
        get<TmdbTvDetailsResponse>(`/tmdb/tv/${seriesId}`, signal),
      similar: (seriesId: number, page = 1, signal?: AbortSignal) =>
        get<TmdbTvSimilarResponse>(`/tmdb/tv/${seriesId}/similar?page=${page}`, signal),
    },
    // ── Person / Cast TMDB endpoints ──────────────────────────────────
    person: {
      search: (q: string, page = 1, signal?: AbortSignal) =>
        get<TmdbPersonSearchResponse>(
          `/tmdb/person/search?q=${encodeURIComponent(q)}&page=${page}`, signal
        ),
      details: (personId: number, signal?: AbortSignal) =>
        get<TmdbPersonDetailsResponse>(`/tmdb/person/${personId}`, signal),
    },
  },
};

export interface Category {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface LiveStream {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  category_id: string;
}

export interface MovieLanguage {
  code: string;
  name: string;
  stream_id: number;
  container_extension: string;
}

export interface UnifiedMovie extends Movie {
  base_name: string;
  languages: MovieLanguage[];
  language_count: number;
}

export interface Movie {
  num: number;
  name: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  tmdb?: string;
  category_id: string;
  container_extension: string;
  added?: string;
}

export interface MovieInfo {
  name?: string;
  plot?: string;
  description?: string;
  cast?: string;
  actors?: string;
  director?: string;
  genre?: string;
  rating?: string;
  releasedate?: string;
  backdrop_path?: string[];
  cover_big?: string;
  movie_image?: string;
  youtube_trailer?: string;
  duration?: string;
  duration_secs?: number;
  episode_run_time?: number;
  tmdb_id?: string;
  kinopoisk_url?: string;
}

export interface Series {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  rating: string;
  rating_5based: string;
  tmdb: string;
  youtube_trailer: string;
  category_id: string;
}

export interface Episode {
  id: string;
  episode_num: number;
  title: string;
  container_extension: string;
  info: {
    air_date?: string;
    rating?: number;
    id?: number;
    duration_secs?: number;
    movie_image?: string;
    plot?: string;
    release_date?: string;
    season?: number;
  };
}

export interface Season {
  name: string;
  episode_count: string;
  overview: string;
  air_date: string;
  cover: string;
  cover_tmdb: string;
  season_number: number;
  cover_big: string;
  releaseDate: string;
  duration: string;
}

export interface SeriesInfo {
  name: string;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  release_date: string;
  last_modified: string;
  rating: string;
  rating_5based: string;
  backdrop_path: string[];
  tmdb: string;
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
  category_ids: number[];
}

export interface SeriesDetails {
  seasons: Season[];
  info: SeriesInfo;
  episodes: Record<string, Episode[]>;
}

export interface ProbeResult {
  codec?: string;
  width?: number;
  height?: number;
  bitrate?: string;
  duration?: string;
}

export interface Programme {
  start: string;
  stop: string;
  title: string;
  subtitle: string;
  desc: string;
  category: string;
  is_live: boolean;
}

export interface ChannelGroup {
  channel_id: string;
  channel_name: string;
  channel_icon: string;
  stream_id: number | null;
  programmes: Programme[];
}

export interface GuideResponse {
  channel_groups: ChannelGroup[];
  total_channels: number;
  offset: number;
  limit: number;
}

export interface GuideEnrichResult {
  type: "movie" | "tv";
  title: string;
  overview: string;
  poster: string | null;
  rating: number;
  year: string;
  tmdb_id: number;
  score: number;
}

export interface GuideEnrichResponse {
  enabled: boolean;
  result: GuideEnrichResult | null;
}

export interface GuideNowResult {
  title: string;
  channel_name: string;
}

export interface GuideNowResponse {
  programmes: Record<string, GuideNowResult | null>;
}

// ── TMDB v3 API Proxy types ─────────────────────────────────────────────

export interface TmdbMovieResult {
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  id: number;
  original_language: string;
  original_title: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  release_date: string;
  title: string;
  video: boolean;
  vote_average: number;
  vote_count: number;
}

export interface TmdbTrendingResponse {
  trending: TmdbMovieResult[];
  total_pages: number;
  total_results: number;
  enabled: boolean;
}

export interface TmdbSearchResponse {
  results: TmdbMovieResult[];
  total_pages: number;
  total_results: number;
  enabled: boolean;
}

export interface TmdbInfoShape {
  overview?: string;
  backdrop_path?: string;
  poster_path?: string;
  vote_average?: number;
  genres?: Array<{ id: number; name: string }>;
  runtime?: number;
  status?: string;
  release_date?: string;
  networks?: Array<{ id: number; name: string }>;
  created_by?: Array<{ id: number; name: string }>;
  number_of_seasons?: number;
  number_of_episodes?: number;
  episode_run_time?: number[];
  homepage?: string;
  first_air_date?: string;
  seasons?: Array<{
    season_number: number;
    name: string;
    episode_count: number;
    overview: string;
    poster_path?: string;
  }>;
}

export interface TmdbDetailsResponse {
  enabled: boolean;
  info: TmdbInfoShape | null;
}

export interface TmdbSimilarResponse {
  results: TmdbMovieResult[];
  total_pages: number;
  total_results: number;
  enabled: boolean;
}

export interface TmdbConfigResponse {
  enabled: boolean;
  images: Record<string, unknown> | null;
}

// ── TMDB TV / Series API types ────────────────────────────────────

export interface TmdbTvResult {
  adult: boolean;
  backdrop_path: string | null;
  genre_ids: number[];
  id: number;
  origin_country: string[];
  original_language: string;
  original_name: string;
  overview: string;
  popularity: number;
  poster_path: string | null;
  first_air_date: string;
  name: string;
  vote_average: number;
  vote_count: number;
}

export interface TmdbTvTrendingResponse {
  trending: TmdbTvResult[];
  total_pages: number;
  total_results: number;
  enabled: boolean;
}

export interface TmdbTvSearchResponse {
  results: TmdbTvResult[];
  total_pages: number;
  total_results: number;
  enabled: boolean;
}

export interface TmdbTvDetailsResponse {
  enabled: boolean;
  info: TmdbInfoShape | null;
}

export interface TmdbTvSimilarResponse {
  results: TmdbTvResult[];
  total_pages: number;
  total_results: number;
  enabled: boolean;
}

// ── TMDB Person / Cast API types (CLI-backed, no API key needed) ──

export interface TmdbPersonInfo {
  id: number;
  name: string;
  birthday: string | null;
  gender: string;
  image: string;
  roles: string[];
  known_for: TmdbPersonCredit[];
}

export interface TmdbPersonCredit {
  path: string;
  tmdb_id: number;
  type: "movie" | "tv";
  title: string;
  poster: string;
}

export interface TmdbPersonSearchResponse {
  enabled: boolean;
  info: TmdbPersonInfo | null;
}

export type TmdbPersonDetailsResponse = TmdbPersonSearchResponse;

// ── Search Enrichment types ────────────────────────────────────────────

export interface TmdbEnrichData {
  genres: string[];
  rating: number | null;
  poster: string | null;
  overview: string | null;
}

export interface SearchEnrichResponse {
  movies: Record<string, TmdbEnrichData>;
  series: Record<string, TmdbEnrichData>;
}

// ── Server-side watch progress types ─────────────────────────────────

export interface ServerSeriesProgressData {
  seriesId: number;
  seriesName: string;
  cover: string;
  seasonNumber: number;
  episodeNum: number;
  episodeId: string;
  episodeTitle: string;
  durationSeconds: number;
}

export interface ServerMovieProgressData {
  movieId: number;
  movieName: string;
  poster: string;
  durationSeconds: number;
}

export interface ServerProgressEntry {
  watchKey: string;
  position: number;
  timestamp: number;
  seriesData?: ServerSeriesProgressData;
  movieData?: ServerMovieProgressData;
}
