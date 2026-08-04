const API = "/api";

import type {
  Category,
  LiveStream,
  Movie,
  MovieInfo,
  UnifiedMovie,
  Series,
  SeriesDetails,
  ProbeResult,
  GuideResponse,
  GuideEnrichResponse,
  GuideNowResponse,
  CatchupTimelineResponse,
  GuideSearchResponse,
  SearchEnrichResponse,
  ServerProgressEntry,
  TmdbTrendingResponse,
  TmdbSearchResponse,
  TmdbDetailsResponse,
  TmdbSimilarResponse,
  TmdbConfigResponse,
  TmdbTvTrendingResponse,
  TmdbTvSearchResponse,
  TmdbTvDetailsResponse,
  TmdbTvSimilarResponse,
  TmdbPersonSearchResponse,
  TmdbPersonDetailsResponse,
} from "./types";

// Route images from blocked CDNs through our proxy
// Also sanitizes malformed concatenated URLs (provider data quirk)
export function imageUrl(raw: string): string {
  if (!raw) return "";

  // Fix concatenated TMDB URLs: "image.tmdb.https//image.tmdb.org/t/p/original/X.jpgorg/t/p/w600..."
  // Extract the first valid TMDB image URL and fix any missing protocol colon
  const m = raw.match(
    /(https?:?\/\/image\.tmdb\.org\/t\/p\/\w+\/[a-zA-Z0-9]+\.(?:jpg|jpeg|png|webp))/i,
  );
  if (m) {
    return m[1]
      .replace(/^https\/\//, "https://")
      .replace(/^http\/\//, "http://");
  }

  if (raw.includes("cmc.exchange-cdn.com") || raw.includes("photo-tmdb.com")) {
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
  return POSTER_SIZES.map(
    (s) =>
      `${TMDB_IMG_BASE}/${s}${cleanPath} ${s === "w92" ? "92w" : s === "w154" ? "154w" : s === "w185" ? "185w" : s === "w342" ? "342w" : s === "w500" ? "500w" : "780w"}`,
  ).join(", ");
}

/**
 * Build the proxied URL for a provider channel logo.
 * The IPTV provider serves channel icons on the same origin that requires auth, so
 * they're fetched through the backend's raw IPTV proxy (strip scheme).
 */
export function channelIconUrl(rawIcon: string): string {
  if (!rawIcon) return "";
  return `/api/iptv/${rawIcon.replace("http://", "").replace("https://", "")}`;
}

/**
 * Get src + srcSet + sizes props for a responsive TMDB image.
 * Spread directly onto an `<img>` element.
 */
export function tmdbImgProps(
  path: string,
  defaultSize: string = "w342",
  sizes: string = "(max-width: 640px) 185px, (max-width: 1024px) 342px, 500px",
) {
  const src = tmdbImageUrl(path, defaultSize);
  const srcSet = tmdbSrcset(path);
  return { src, srcSet, sizes, loading: "lazy" as const };
}

const FETCH_TIMEOUT = 15000; // 15s
const MAX_RETRIES = 1;

export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
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
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit & { timeout?: number; retries?: number } = {},
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
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error(
        "Too many requests — please wait a moment and try again.",
      );
    }
    throw new Error(`API error ${res.status}`);
  }
  return res.json();
}

export const api = {
  live: {
    categories: (signal?: AbortSignal) =>
      get<{ categories: Category[] }>("/live/categories", signal),
    streams: (catId: string, signal?: AbortSignal) =>
      get<{ streams: LiveStream[] }>(
        `/live/streams?category_id=${catId}`,
        signal,
      ),
    all: (signal?: AbortSignal) =>
      get<{ streams: LiveStream[] }>("/live/all", signal),
    allSlim: (signal?: AbortSignal) =>
      get<{ streams: LiveStream[] }>("/live/all-slim", signal),
    info: (ids: number[], signal?: AbortSignal) =>
      get<{
        streams: { stream_id: number; name: string; stream_icon: string }[];
      }>(`/live/info?ids=${ids.join(",")}`, signal),
  },
  movies: {
    categories: (signal?: AbortSignal) =>
      get<{ categories: Category[] }>("/movies/categories", signal),
    list: (catId: string, limit = 20, offset = 0, signal?: AbortSignal) =>
      get<{ movies: Movie[]; total: number; offset: number; limit: number }>(
        `/movies?category_id=${catId}&limit=${limit}&offset=${offset}`,
        signal,
      ),
    details: (id: number, signal?: AbortSignal) =>
      get<{ info: MovieInfo }>(`/movies/${id}`, signal),
    unified: (limit = 50, offset = 0, q?: string, signal?: AbortSignal) => {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (q) params.set("q", q);
      return get<{
        movies: UnifiedMovie[];
        total: number;
        offset: number;
        limit: number;
      }>(`/movies/unified?${params}`, signal);
    },
  },
  series: {
    categories: (signal?: AbortSignal) =>
      get<{ categories: Category[] }>("/series/categories", signal),
    list: (catId: string, limit = 20, offset = 0, signal?: AbortSignal) =>
      get<{ series: Series[]; total: number; offset: number; limit: number }>(
        `/series?category_id=${catId}&limit=${limit}&offset=${offset}`,
        signal,
      ),
    details: (id: number, signal?: AbortSignal) =>
      get<SeriesDetails>(`/series/${id}`, signal),
    probe: (id: number, signal?: AbortSignal) =>
      get<ProbeResult>(`/series/probe/${id}`, signal),
  },
  guide: {
    get: (offset = 0, limit = 60, signal?: AbortSignal) =>
      get<GuideResponse>(`/guide?offset=${offset}&limit=${limit}`, signal),
    enrich: (q: string, signal?: AbortSignal) =>
      get<GuideEnrichResponse>(
        `/guide/enrich?q=${encodeURIComponent(q)}`,
        signal,
      ),
    now: (streamIds: number[], signal?: AbortSignal) =>
      get<GuideNowResponse>(
        `/guide/now?stream_ids=${streamIds.join(",")}`,
        signal,
      ),
    catchup: (streamId: number, hours = 4, signal?: AbortSignal) =>
      get<CatchupTimelineResponse>(
        `/guide/catchup?stream_id=${streamId}&hours=${hours}`,
        signal,
      ),
    search: (q: string, signal?: AbortSignal, futureOnly = true) =>
      get<GuideSearchResponse>(
        `/guide/search?q=${encodeURIComponent(q)}&future_only=${futureOnly}&limit=50`,
        signal,
      ),
  },
  search: (
    q: string,
    signal?: AbortSignal,
    limit = 20,
    offset = 0,
    section?: string,
  ) =>
    get<{
      live: LiveStream[];
      movies: Movie[];
      series: Series[];
      totals: { live: number; movies: number; series: number };
    }>(
      `/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}${section ? `&section=${section}` : ""}`,
      signal,
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
    }).then(async (r) => {
      // 502/error bodies were previously parsed as valid SearchEnrichResponse
      // data, silently corrupting the search UI on upstream failure. Check
      // .ok and reject so callers can fall back gracefully.
      if (!r.ok) {
        throw new Error(`Search enrich failed (${r.status})`);
      }
      return r.json() as Promise<SearchEnrichResponse>;
    }),
  watchlist: {
    progress: (signal?: AbortSignal) =>
      get<{ progress: Record<string, ServerProgressEntry[]> }>(
        "/watchlist/progress",
        signal,
      ),
  },
  tmdb: {
    trending: (
      timeWindow: "day" | "week" = "week",
      page = 1,
      signal?: AbortSignal,
    ) =>
      get<TmdbTrendingResponse>(
        `/tmdb/trending?time_window=${timeWindow}&page=${page}`,
        signal,
      ),
    search: (q: string, page = 1, signal?: AbortSignal) =>
      get<TmdbSearchResponse>(
        `/tmdb/search?q=${encodeURIComponent(q)}&page=${page}`,
        signal,
      ),
    details: (tmdbId: number, signal?: AbortSignal) =>
      get<TmdbDetailsResponse>(`/tmdb/movie/${tmdbId}`, signal),
    similar: (tmdbId: number, page = 1, signal?: AbortSignal) =>
      get<TmdbSimilarResponse>(
        `/tmdb/movie/${tmdbId}/similar?page=${page}`,
        signal,
      ),
    configuration: (signal?: AbortSignal) =>
      get<TmdbConfigResponse>(`/tmdb/configuration`, signal),
    // ── TV / Series TMDB endpoints ────────────────────────────────
    tv: {
      trending: (
        timeWindow: "day" | "week" = "week",
        page = 1,
        signal?: AbortSignal,
      ) =>
        get<TmdbTvTrendingResponse>(
          `/tmdb/tv/trending?time_window=${timeWindow}&page=${page}`,
          signal,
        ),
      search: (q: string, page = 1, signal?: AbortSignal) =>
        get<TmdbTvSearchResponse>(
          `/tmdb/tv/search?q=${encodeURIComponent(q)}&page=${page}`,
          signal,
        ),
      details: (seriesId: number, signal?: AbortSignal) =>
        get<TmdbTvDetailsResponse>(`/tmdb/tv/${seriesId}`, signal),
      similar: (seriesId: number, page = 1, signal?: AbortSignal) =>
        get<TmdbTvSimilarResponse>(
          `/tmdb/tv/${seriesId}/similar?page=${page}`,
          signal,
        ),
    },
    // ── Person / Cast TMDB endpoints ──────────────────────────────────
    person: {
      search: (q: string, page = 1, signal?: AbortSignal) =>
        get<TmdbPersonSearchResponse>(
          `/tmdb/person/search?q=${encodeURIComponent(q)}&page=${page}`,
          signal,
        ),
      details: (personId: number, signal?: AbortSignal) =>
        get<TmdbPersonDetailsResponse>(`/tmdb/person/${personId}`, signal),
    },
  },
};

// Re-export all types for backward compatibility with imports from "@/lib/api"
export type {
  Category,
  LiveStream,
  MovieLanguage,
  UnifiedMovie,
  Movie,
  MovieInfo,
  Series,
  Episode,
  Season,
  SeriesInfo,
  SeriesDetails,
  ProbeResult,
  Programme,
  ChannelGroup,
  GuideResponse,
  GuideEnrichResult,
  GuideEnrichResponse,
  GuideNowResult,
  GuideNowResponse,
  CatchupProgramme,
  CatchupTimelineResponse,
  GuideSearchResult,
  GuideSearchResponse,
  TmdbMovieResult,
  TmdbTrendingResponse,
  TmdbSearchResponse,
  TmdbInfoShape,
  TmdbDetailsResponse,
  TmdbSimilarResponse,
  TmdbConfigResponse,
  TmdbTvResult,
  TmdbTvTrendingResponse,
  TmdbTvSearchResponse,
  TmdbTvDetailsResponse,
  TmdbTvSimilarResponse,
  TmdbPersonInfo,
  TmdbPersonCredit,
  TmdbPersonSearchResponse,
  TmdbPersonDetailsResponse,
  TmdbEnrichData,
  SearchEnrichResponse,
  ServerSeriesProgressData,
  ServerMovieProgressData,
  ServerProgressEntry,
} from "./types";
