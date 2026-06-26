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
