const KEY = "stv_continue_watching";
const MOVIE_KEY = "stv_movie_watching";
const MAX_ITEMS = 20;

export interface SeriesProgress {
  seriesId: number;
  seriesName: string;
  cover: string;
  seasonNumber: number;
  episodeNum: number;
  episodeId: string;
  episodeTitle: string;
  progressSeconds: number;
  durationSeconds: number;
  updatedAt: number;
}

export function getContinueWatching(): SeriesProgress[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const items: SeriesProgress[] = JSON.parse(raw);
    // Filter out anything older than 30 days
    const cutoff = Date.now() - 30 * 86400_000;
    return items
      .filter((i) => i.updatedAt > cutoff)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveSeriesProgress(progress: SeriesProgress) {
  const items = getContinueWatching();
  // Remove existing entry for same series+season+episode
  const filtered = items.filter(
    (i) =>
      !(
        i.seriesId === progress.seriesId &&
        i.seasonNumber === progress.seasonNumber &&
        i.episodeNum === progress.episodeNum
      )
  );
  filtered.unshift({ ...progress, updatedAt: Date.now() });
  // Keep top N
  const trimmed = filtered.slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {}
}

export function removeSeriesProgress(seriesId: number) {
  const items = getContinueWatching().filter((i) => i.seriesId !== seriesId);
  try {
    localStorage.setItem(KEY, JSON.stringify(items));
  } catch {}
}

// ── Movie continue-watching ────────────────────────────────────────────

export interface MovieProgress {
  movieId: number;
  movieName: string;
  poster: string;
  progressSeconds: number;
  durationSeconds: number;
  updatedAt: number;
}

export function getMovieContinueWatching(): MovieProgress[] {
  try {
    const raw = localStorage.getItem(MOVIE_KEY);
    if (!raw) return [];
    const items: MovieProgress[] = JSON.parse(raw);
    const cutoff = Date.now() - 30 * 86400_000;
    return items
      .filter((i) => i.updatedAt > cutoff)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function saveMovieProgress(progress: MovieProgress) {
  const items = getMovieContinueWatching();
  const filtered = items.filter((i) => i.movieId !== progress.movieId);
  filtered.unshift({ ...progress, updatedAt: Date.now() });
  try {
    localStorage.setItem(MOVIE_KEY, JSON.stringify(filtered.slice(0, MAX_ITEMS)));
  } catch {}
}

export function removeMovieProgress(movieId: number) {
  const items = getMovieContinueWatching().filter((i) => i.movieId !== movieId);
  try {
    localStorage.setItem(MOVIE_KEY, JSON.stringify(items));
  } catch {}
}

/**
 * Get progress for all episodes of a specific series.
 * Returns a map keyed by "season:episodeNum" → progress info.
 */
export function getSeriesProgress(
  seriesId: number
): Map<string, { progressSeconds: number; durationSeconds: number; updatedAt: number }> {
  const items = getContinueWatching().filter((i) => i.seriesId === seriesId);
  const map = new Map<string, { progressSeconds: number; durationSeconds: number; updatedAt: number }>();
  for (const item of items) {
    map.set(`${item.seasonNumber}:${item.episodeNum}`, {
      progressSeconds: item.progressSeconds,
      durationSeconds: item.durationSeconds,
      updatedAt: item.updatedAt,
    });
  }
  return map;
}

// ── Server-side progress merge ────────────────────────────────────────────

import { api, type ServerProgressEntry } from "@/lib/api";

/**
 * Convert server progress entries into local SeriesProgress[] format.
 */
function seriesFromServerEntry(
  entry: ServerProgressEntry
): SeriesProgress | null {
  if (!entry.seriesData) return null;
  return {
    seriesId: entry.seriesData.seriesId,
    seriesName: entry.seriesData.seriesName,
    cover: entry.seriesData.cover,
    seasonNumber: entry.seriesData.seasonNumber,
    episodeNum: entry.seriesData.episodeNum,
    episodeId: entry.seriesData.episodeId,
    episodeTitle: entry.seriesData.episodeTitle,
    progressSeconds: entry.position,
    durationSeconds: entry.seriesData.durationSeconds,
    updatedAt: entry.timestamp * 1000, // server stores seconds, local uses ms
  };
}

/**
 * Convert server progress entries into local MovieProgress[] format.
 */
function movieFromServerEntry(
  entry: ServerProgressEntry
): MovieProgress | null {
  if (!entry.movieData) return null;
  return {
    movieId: entry.movieData.movieId,
    movieName: entry.movieData.movieName,
    poster: entry.movieData.poster,
    progressSeconds: entry.position,
    durationSeconds: entry.movieData.durationSeconds,
    updatedAt: entry.timestamp * 1000,
  };
}

/**
 * Fetch progress from the server (synced via PWA background sync)
 * and merge into the local continue-watching state.
 *
 * For each entry, if the local state has a matching entry, keep whichever
 * was updated more recently. If the local state has no matching entry,
 * add the server entry. Returns an object with merged series and movie arrays.
 */
export async function loadServerProgress(): Promise<{
  series: SeriesProgress[];
  movies: MovieProgress[];
}> {
  try {
    const res = await api.watchlist.progress();
    const allEntries = Object.values(res.progress).flat();

    // Convert server entries to local format
    const serverSeries: SeriesProgress[] = [];
    const serverMovies: MovieProgress[] = [];

    for (const entry of allEntries) {
      const seriesItem = seriesFromServerEntry(entry);
      if (seriesItem) serverSeries.push(seriesItem);
      const movieItem = movieFromServerEntry(entry);
      if (movieItem) serverMovies.push(movieItem);
    }

    // Merge series: take most recent per (seriesId, seasonNumber, episodeNum)
    const seriesMap = new Map<string, SeriesProgress>();
    for (const item of getContinueWatching()) {
      const key = `${item.seriesId}:${item.seasonNumber}:${item.episodeNum}`;
      const existing = seriesMap.get(key);
      if (!existing || item.updatedAt > existing.updatedAt) {
        seriesMap.set(key, item);
      }
    }
    for (const item of serverSeries) {
      const key = `${item.seriesId}:${item.seasonNumber}:${item.episodeNum}`;
      const existing = seriesMap.get(key);
      if (!existing || item.updatedAt > existing.updatedAt) {
        seriesMap.set(key, item);
      }
    }
    const mergedSeries = [...seriesMap.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ITEMS);

    // Merge movies: take most recent per movieId
    const movieMap = new Map<number, MovieProgress>();
    for (const item of getMovieContinueWatching()) {
      const existing = movieMap.get(item.movieId);
      if (!existing || item.updatedAt > existing.updatedAt) {
        movieMap.set(item.movieId, item);
      }
    }
    for (const item of serverMovies) {
      const existing = movieMap.get(item.movieId);
      if (!existing || item.updatedAt > existing.updatedAt) {
        movieMap.set(item.movieId, item);
      }
    }
    const mergedMovies = [...movieMap.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ITEMS);

    return { series: mergedSeries, movies: mergedMovies };
  } catch {
    // Server may be unreachable — silently fall back to local
    return {
      series: getContinueWatching(),
      movies: getMovieContinueWatching(),
    };
  }
}
