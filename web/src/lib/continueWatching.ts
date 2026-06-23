const KEY = "stv_continue_watching";
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
