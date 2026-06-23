const WATCHLIST_KEY = "stv_watchlist";
const MAX_ITEMS = 500;

export function getWatchlist(): number[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
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
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
  } catch {}
  return idx < 0; // true = added, false = removed
}

export function getWatchlistCount(): number {
  return getWatchlist().length;
}
