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
  search: (q: string, signal?: AbortSignal) =>
    get<{ live: LiveStream[]; movies: Movie[]; series: Series[] }>(
      `/search?q=${encodeURIComponent(q)}`, signal
    ),
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
      credits: (personId: number, signal?: AbortSignal) =>
        get<TmdbPersonCreditsResponse>(`/tmdb/person/${personId}/combined_credits`, signal),
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

export interface TmdbDetailsResponse {
  enabled: boolean;
  info: Record<string, unknown> | null;
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
  info: Record<string, unknown> | null;
}

export interface TmdbTvSimilarResponse {
  results: TmdbTvResult[];
  total_pages: number;
  total_results: number;
  enabled: boolean;
}

// ── TMDB Person / Cast API types ──────────────────────────────────

export interface TmdbPersonResult {
  id: number;
  name: string;
  known_for_department: string;
  profile_path: string | null;
  popularity: number;
  known_for: TmdbMovieResult[];
  also_known_as?: string[];
  gender?: number;
  adult?: boolean;
}

export interface TmdbPersonSearchResponse {
  results: TmdbPersonResult[];
  total_pages: number;
  total_results: number;
  enabled: boolean;
}

export interface TmdbPersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
  also_known_as: string[];
  gender: number;
  popularity: number;
  homepage: string | null;
  imdb_id: string | null;
  adult: boolean;
}

export interface TmdbPersonDetailsResponse {
  enabled: boolean;
  info: TmdbPersonDetails | null;
}

export interface TmdbPersonCredit {
  id: number;
  title?: string;       // movies
  name?: string;        // TV
  original_title?: string;
  original_name?: string;
  media_type: string;   // "movie" | "tv"
  popularity: number;
  poster_path: string | null;
  backdrop_path: string | null;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  character?: string;
  department?: string;
  job?: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  credit_id: string;
  episode_count?: number;
}

export interface TmdbPersonCreditsResponse {
  enabled: boolean;
  credits: { cast: TmdbPersonCredit[]; crew: TmdbPersonCredit[] } | null;
}
