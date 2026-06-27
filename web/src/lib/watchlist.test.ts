import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getWatchlist,
  isInWatchlist,
  toggleWatchlist,
  getWatchlistCount,
  getSeriesWatchlist,
  isSeriesInWatchlist,
  toggleSeriesWatchlist,
  getSeriesWatchlistCount,
} from "./watchlist";

const MOVIE_KEY = "stv_watchlist";
const SERIES_KEY = "stv_watchlist_series";

describe("watchlist (movies)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns empty list when nothing stored", () => {
    expect(getWatchlist()).toEqual([]);
  });

  it("returns empty list on corrupted JSON", () => {
    localStorage.setItem(MOVIE_KEY, "not-json");
    expect(getWatchlist()).toEqual([]);
  });

  it("returns what localStorage has for non-array JSON (function doesn't validate)", () => {
    localStorage.setItem(MOVIE_KEY, JSON.stringify({ not: "array" }));
    const result = getWatchlist();
    // The function parses and returns whatever is stored; it doesn't enforce array type
    expect(Array.isArray(result)).toBe(false);
  });

  it("returns stored watchlist", () => {
    localStorage.setItem(MOVIE_KEY, JSON.stringify([1, 2, 3]));
    expect(getWatchlist()).toEqual([1, 2, 3]);
  });

  it("isInWatchlist returns true for present movie", () => {
    localStorage.setItem(MOVIE_KEY, JSON.stringify([42, 7]));
    expect(isInWatchlist(42)).toBe(true);
  });

  it("isInWatchlist returns false for absent movie", () => {
    localStorage.setItem(MOVIE_KEY, JSON.stringify([42]));
    expect(isInWatchlist(99)).toBe(false);
  });

  it("isInWatchlist returns false for empty watchlist", () => {
    expect(isInWatchlist(1)).toBe(false);
  });

  it("toggleWatchlist adds a movie and returns true", () => {
    const added = toggleWatchlist(100);
    expect(added).toBe(true);
    expect(getWatchlist()).toContain(100);
  });

  it("adds new movies to the front (unshift)", () => {
    toggleWatchlist(1);
    toggleWatchlist(2);
    expect(getWatchlist()).toEqual([2, 1]);
  });

  it("toggleWatchlist removes a movie and returns false", () => {
    toggleWatchlist(100);
    const added = toggleWatchlist(100);
    expect(added).toBe(false);
    expect(getWatchlist()).not.toContain(100);
  });

  it("toggleWatchlist does not duplicate on re-add after remove", () => {
    toggleWatchlist(1);
    toggleWatchlist(2);
    toggleWatchlist(1); // remove
    toggleWatchlist(1); // re-add
    expect(getWatchlist()).toEqual([1, 2]);
  });

  it("getWatchlistCount returns 0 for empty list", () => {
    expect(getWatchlistCount()).toBe(0);
  });

  it("getWatchlistCount returns correct count", () => {
    toggleWatchlist(1);
    toggleWatchlist(2);
    toggleWatchlist(3);
    expect(getWatchlistCount()).toBe(3);
  });

  it("toggleWatchlist returns true when movie was not in list", () => {
    expect(toggleWatchlist(42)).toBe(true);
  });

  it("toggleWatchlist returns false when movie was already in list", () => {
    toggleWatchlist(42);
    expect(toggleWatchlist(42)).toBe(false);
  });
});

describe("watchlist (series)", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("returns empty list when nothing stored", () => {
    expect(getSeriesWatchlist()).toEqual([]);
  });

  it("returns empty list on corrupted JSON", () => {
    localStorage.setItem(SERIES_KEY, "garbage");
    expect(getSeriesWatchlist()).toEqual([]);
  });

  it("returns stored series watchlist", () => {
    localStorage.setItem(SERIES_KEY, JSON.stringify([10, 20]));
    expect(getSeriesWatchlist()).toEqual([10, 20]);
  });

  it("isSeriesInWatchlist returns true for present series", () => {
    localStorage.setItem(SERIES_KEY, JSON.stringify([5]));
    expect(isSeriesInWatchlist(5)).toBe(true);
  });

  it("isSeriesInWatchlist returns false for absent series", () => {
    expect(isSeriesInWatchlist(999)).toBe(false);
  });

  it("toggleSeriesWatchlist adds and returns true", () => {
    const added = toggleSeriesWatchlist(200);
    expect(added).toBe(true);
    expect(getSeriesWatchlist()).toContain(200);
  });

  it("toggleSeriesWatchlist removes and returns false", () => {
    toggleSeriesWatchlist(200);
    const added = toggleSeriesWatchlist(200);
    expect(added).toBe(false);
    expect(getSeriesWatchlist()).not.toContain(200);
  });

  it("getSeriesWatchlistCount returns 0 for empty", () => {
    expect(getSeriesWatchlistCount()).toBe(0);
  });

  it("getSeriesWatchlistCount returns correct count", () => {
    toggleSeriesWatchlist(1);
    toggleSeriesWatchlist(2);
    expect(getSeriesWatchlistCount()).toBe(2);
  });

  it("movie and series watchlists are independent", () => {
    toggleWatchlist(1);
    toggleSeriesWatchlist(100);
    expect(getWatchlist()).toEqual([1]);
    expect(getSeriesWatchlist()).toEqual([100]);
  });
});
