// ── IPTV Data Types ───────────────────────────────────────────────

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
  tv_archive: number;
  tv_archive_duration: number;
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
  cover_big: string;
  season_number: number;
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

// ── EPG / Guide Types ────────────────────────────────────────────

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

/** Single programme entry in a catch-up timeline */
export interface CatchupProgramme {
  title: string;
  subtitle: string;
  start: string;
  stop: string;
  start_ts: number;
  stop_ts: number;
  start_offset: number;
  duration: number;
}

export interface CatchupTimelineResponse {
  programmes: CatchupProgramme[];
  channel_id: string | null;
  window_hours: number;
}

/** Single result from EPG search */
export interface GuideSearchResult {
  title: string;
  subtitle: string | null;
  description: string | null;
  channel_id: string;
  channel_name: string;
  start: string;
  stop: string;
  start_ts: number;
  stop_ts: number;
  duration: number;
}

export interface GuideSearchResponse {
  results: GuideSearchResult[];
  total: number;
  query: string;
  future_only: boolean;
}

// ── TMDB v3 API Proxy types ──────────────────────────────────────

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

// ── TMDB TV / Series API types ───────────────────────────────────

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

// ── TMDB Person / Cast API types ─────────────────────────────────

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

// ── Search Enrichment types ──────────────────────────────────────

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

// ── Server-side watch progress types ─────────────────────────────

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
