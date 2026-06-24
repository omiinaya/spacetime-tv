const MOVIE_WATCHLIST_KEY = "stv_watchlist";
const SERIES_WATCHLIST_KEY = "stv_watchlist_series";
const MAX_ITEMS = 500;

// ── Movies ──────────────────────────────────────────────────────────

export function getWatchlist(): number[] {
  try {
    const raw = localStorage.getItem(MOVIE_WATCHLIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function isInWatchlist(movieId: number): boolean {
  return getWatchlist().includes(movieId);
}

export function toggleWatchlist(movieId: number): boolean {
  const items = getWatchlist();
  const idx = items.indexOf(movieId);
  if (idx >= 0) {
    items.splice(idx, 1);
  } else if (items.length < MAX_ITEMS) {
    items.unshift(movieId);
  }
  try {
    localStorage.setItem(MOVIE_WATCHLIST_KEY, JSON.stringify(items));
  } catch {}
  return idx < 0; // true = added, false = removed
}

export function getWatchlistCount(): number {
  return getWatchlist().length;
}

// ── Series ──────────────────────────────────────────────────────────

export function getSeriesWatchlist(): number[] {
  try {
    const raw = localStorage.getItem(SERIES_WATCHLIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function isSeriesInWatchlist(seriesId: number): boolean {
  return getSeriesWatchlist().includes(seriesId);
}

export function toggleSeriesWatchlist(seriesId: number): boolean {
  const items = getSeriesWatchlist();
  const idx = items.indexOf(seriesId);
  if (idx >= 0) {
    items.splice(idx, 1);
  } else if (items.length < MAX_ITEMS) {
    items.unshift(seriesId);
  }
  try {
    localStorage.setItem(SERIES_WATCHLIST_KEY, JSON.stringify(items));
  } catch {}
  return idx < 0; // true = added, false = removed
}

export function getSeriesWatchlistCount(): number {
  return getSeriesWatchlist().length;
}
