import { describe, it, expect, beforeEach } from "vitest";
import {
  getContinueWatching,
  saveSeriesProgress,
  removeSeriesProgress,
  getMovieContinueWatching,
  saveMovieProgress,
  type SeriesProgress,
  type MovieProgress,
} from "./continueWatching";

// These functions read/write localStorage — vitest/jsdom mocks it

describe("SeriesProgress CRUD", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const makeProgress = (overrides: Partial<SeriesProgress> = {}): SeriesProgress => ({
    seriesId: 42,
    seriesName: "Test Series",
    cover: "https://example.com/cover.jpg",
    seasonNumber: 1,
    episodeNum: 3,
    episodeId: "101",
    episodeTitle: "The One",
    progressSeconds: 600,
    durationSeconds: 1800,
    updatedAt: Date.now(),
    ...overrides,
  });

  it("saves and retrieves series progress", () => {
    saveSeriesProgress(makeProgress());
    const items = getContinueWatching();
    expect(items).toHaveLength(1);
    expect(items[0].seriesId).toBe(42);
    expect(items[0].seriesName).toBe("Test Series");
    expect(items[0].episodeTitle).toBe("The One");
  });

  it("updates existing entry for same series+season+episode", () => {
    saveSeriesProgress(makeProgress({ progressSeconds: 100 }));
    saveSeriesProgress(makeProgress({ progressSeconds: 200 }));
    const items = getContinueWatching();
    expect(items).toHaveLength(1);
    expect(items[0].progressSeconds).toBe(200);
  });

  it("stores separate entries for different episodes", () => {
    saveSeriesProgress(makeProgress({ episodeNum: 1, episodeId: "100" }));
    saveSeriesProgress(makeProgress({ episodeNum: 2, episodeId: "101" }));
    const items = getContinueWatching();
    expect(items).toHaveLength(2);
  });

  it("orders by most recent first", () => {
    saveSeriesProgress(makeProgress({ episodeId: "old", updatedAt: 100 }));
    saveSeriesProgress(makeProgress({ episodeId: "new", updatedAt: 200 }));
    const items = getContinueWatching();
    expect(items[0].episodeId).toBe("new");
  });

  it("removes series progress by seriesId", () => {
    saveSeriesProgress(makeProgress({ seriesId: 1 }));
    saveSeriesProgress(makeProgress({ seriesId: 2 }));
    removeSeriesProgress(1);
    const items = getContinueWatching();
    expect(items).toHaveLength(1);
    expect(items[0].seriesId).toBe(2);
  });

  it("filters out entries older than 30 days", () => {
    const old = Date.now() - 31 * 86400_000;
    saveSeriesProgress(makeProgress({ updatedAt: old }));
    const items = getContinueWatching();
    expect(items).toHaveLength(0);
  });

  it("caps at MAX_ITEMS (20)", () => {
    for (let i = 0; i < 25; i++) {
      saveSeriesProgress(makeProgress({ seriesId: i, episodeId: String(i), updatedAt: Date.now() + i }));
    }
    const items = getContinueWatching();
    expect(items.length).toBeLessThanOrEqual(20);
  });

  it("returns empty array when no data", () => {
    expect(getContinueWatching()).toEqual([]);
  });

  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("stv_continue_watching", "not-json");
    expect(getContinueWatching()).toEqual([]);
  });
});

describe("MovieProgress CRUD", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const makeProgress = (overrides: Partial<MovieProgress> = {}): MovieProgress => ({
    movieId: 7,
    movieName: "Test Movie",
    poster: "https://example.com/poster.jpg",
    progressSeconds: 300,
    durationSeconds: 7200,
    updatedAt: Date.now(),
    ...overrides,
  });

  it("saves and retrieves movie progress", () => {
    saveMovieProgress(makeProgress());
    const items = getMovieContinueWatching();
    expect(items).toHaveLength(1);
    expect(items[0].movieId).toBe(7);
    expect(items[0].movieName).toBe("Test Movie");
  });

  it("updates existing movie entry", () => {
    saveMovieProgress(makeProgress({ progressSeconds: 100 }));
    saveMovieProgress(makeProgress({ progressSeconds: 500 }));
    const items = getMovieContinueWatching();
    expect(items).toHaveLength(1);
    expect(items[0].progressSeconds).toBe(500);
  });

  it("stores separate entries for different movies", () => {
    saveMovieProgress(makeProgress({ movieId: 1 }));
    saveMovieProgress(makeProgress({ movieId: 2 }));
    const items = getMovieContinueWatching();
    expect(items).toHaveLength(2);
  });

  it("filters out stale entries", () => {
    const old = Date.now() - 31 * 86400_000;
    saveMovieProgress(makeProgress({ updatedAt: old }));
    expect(getMovieContinueWatching()).toHaveLength(0);
  });

  it("returns empty array when no data", () => {
    expect(getMovieContinueWatching()).toEqual([]);
  });
});
