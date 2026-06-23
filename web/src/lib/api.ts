const API = "/api";

// Route images from blocked CDNs through our proxy
export function imageUrl(raw: string): string {
  if (!raw) return "";
  if (raw.includes("cmc.exchange-cdn.com")) {
    return `/api/image-proxy?url=${encodeURIComponent(raw)}`;
  }
  return raw;
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}${path}`, { signal });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export const api = {
  live: {
    categories: (signal?: AbortSignal) => get<{ categories: Category[] }>("/live/categories", signal),
    streams: (catId: string, signal?: AbortSignal) =>
      get<{ streams: LiveStream[] }>(`/live/streams?category_id=${catId}`, signal),
    all: (signal?: AbortSignal) => get<{ streams: LiveStream[] }>("/live/all", signal),
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
  },
  search: (q: string, signal?: AbortSignal) =>
    get<{ live: LiveStream[]; movies: Movie[]; series: Series[] }>(
      `/search?q=${encodeURIComponent(q)}`, signal
    ),
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
