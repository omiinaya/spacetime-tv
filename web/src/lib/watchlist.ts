const MOVIE_WATCHLIST_KEY = "stv_watchlist";
const SERIES_WATCHLIST_KEY = "stv_watchlist_series";
const MAX_ITEMS = 500;

// ── Cached Sets for O(1) membership lookups ─────────────────────────
// Cards call isInWatchlist()/isSeriesInWatchlist() twice per render.
// Previously each call did getWatchlist() → JSON.parse of the whole array
// + .includes() (O(n)) — with ~200 cards per page that's 400 parses per
// render, doubling on every heart toggle. Now membership goes through a
// memoized Set, rebuilt only when the version counter changes (toggle) or
// when an external writer calls resetWatchlistCaches().
let _movieSet: Set<number> | null = null;
let _seriesSet: Set<number> | null = null;

function getMovieSet(): Set<number> {
  if (_movieSet === null) {
    _movieSet = new Set(parseIds(localStorage.getItem(MOVIE_WATCHLIST_KEY)));
  }
  return _movieSet;
}

function getSeriesSet(): Set<number> {
  if (_seriesSet === null) {
    _seriesSet = new Set(parseIds(localStorage.getItem(SERIES_WATCHLIST_KEY)));
  }
  return _seriesSet;
}

function invalidateMovieCache() {
  _movieSet = null;
}

function invalidateSeriesCache() {
  _seriesSet = null;
}

/**
 * Drop cached Sets. External writers (cloud restore, tests) that touch the
 * localStorage keys directly must call this so membership lookups re-read.
 */
export function resetWatchlistCaches() {
  invalidateMovieCache();
  invalidateSeriesCache();
}

function parseIds(raw: string | null): number[] {
  try {
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((n) => typeof n === "number")
      : [];
  } catch {
    return [];
  }
}

// ── Movies ──────────────────────────────────────────────────────────

/** Normalized array read (legacy record-shapes like {"550": true} → []). */
export function getWatchlist(): number[] {
  return parseIds(localStorage.getItem(MOVIE_WATCHLIST_KEY));
}

export function isInWatchlist(movieId: number): boolean {
  return getMovieSet().has(movieId);
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
  } catch {} // DOMException: localStorage quota
  invalidateMovieCache();
  return idx < 0; // true = added, false = removed
}

export function getWatchlistCount(): number {
  return getMovieSet().size;
}

// ── Series ──────────────────────────────────────────────────────────

/** Normalized array read (legacy record-shapes like {"550": true} → []). */
export function getSeriesWatchlist(): number[] {
  return parseIds(localStorage.getItem(SERIES_WATCHLIST_KEY));
}

export function isSeriesInWatchlist(seriesId: number): boolean {
  return getSeriesSet().has(seriesId);
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
  } catch {} // DOMException: localStorage quota
  invalidateSeriesCache();
  return idx < 0; // true = added, false = removed
}

export function getSeriesWatchlistCount(): number {
  return getSeriesSet().size;
}
