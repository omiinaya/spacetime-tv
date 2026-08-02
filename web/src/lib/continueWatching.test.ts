import { describe, it, expect, beforeEach } from "vitest";
import {
  getContinueWatching,
  saveSeriesProgress,
  removeSeriesProgress,
  getMovieContinueWatching,
  saveMovieProgress,
  loadServerProgress,
  type SeriesProgress,
  type MovieProgress,
} from "./continueWatching";
import { api } from "@/lib/api";
import type {
  ServerProgressEntry,
  ServerSeriesProgressData,
  ServerMovieProgressData,
} from "@/lib/types";

// These functions read/write localStorage — vitest/jsdom mocks it

describe("SeriesProgress CRUD", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const makeProgress = (
    overrides: Partial<SeriesProgress> = {},
  ): SeriesProgress => ({
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
    // Write directly to localStorage since saveSeriesProgress always
    // overwrites updatedAt to Date.now()
    localStorage.setItem(
      "stv_continue_watching",
      JSON.stringify([makeProgress({ updatedAt: old })]),
    );
    const items = getContinueWatching();
    expect(items).toHaveLength(0);
  });

  it("caps at MAX_ITEMS (20)", () => {
    for (let i = 0; i < 25; i++) {
      saveSeriesProgress(
        makeProgress({
          seriesId: i,
          episodeId: String(i),
          updatedAt: Date.now() + i,
        }),
      );
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

  const makeProgress = (
    overrides: Partial<MovieProgress> = {},
  ): MovieProgress => ({
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
    // Write directly to localStorage since saveMovieProgress always
    // overwrites updatedAt to Date.now()
    localStorage.setItem(
      "stv_movie_watching",
      JSON.stringify([makeProgress({ updatedAt: old })]),
    );
    expect(getMovieContinueWatching()).toHaveLength(0);
  });

  it("returns empty array when no data", () => {
    expect(getMovieContinueWatching()).toEqual([]);
  });
});

// ── Helper: build a server series entry ──────────────────────────
function serverSeriesEntry(
  overrides: Partial<ServerSeriesProgressData> & {
    position?: number;
    timestamp?: number;
  } = {},
): ServerProgressEntry {
  const entry: ServerSeriesProgressData = {
    seriesId: 1,
    seriesName: "Server Series",
    cover: "https://example.com/series.jpg",
    seasonNumber: 1,
    episodeNum: 1,
    episodeId: "100",
    episodeTitle: "Server Episode",
    durationSeconds: 1800,
    ...overrides,
  };
  return {
    watchKey: `series:${entry.seriesId}:${entry.seasonNumber}:${entry.episodeNum}`,
    position: overrides.position ?? 500,
    timestamp: overrides.timestamp ?? Math.floor(Date.now() / 1000),
    seriesData: entry,
  };
}

// ── Helper: build a server movie entry ───────────────────────────
function serverMovieEntry(
  overrides: Partial<ServerMovieProgressData> & {
    position?: number;
    timestamp?: number;
  } = {},
): ServerProgressEntry {
  const entry: ServerMovieProgressData = {
    movieId: 10,
    movieName: "Server Movie",
    poster: "https://example.com/movie.jpg",
    durationSeconds: 7200,
    ...overrides,
  };
  return {
    watchKey: `movie:${entry.movieId}`,
    position: overrides.position ?? 300,
    timestamp: overrides.timestamp ?? Math.floor(Date.now() / 1000),
    movieData: entry,
  };
}

describe("loadServerProgress", () => {
  const NOW = Date.now(); // fixed reference timestamp for deterministic tests

  beforeEach(() => {
    localStorage.clear();
    // Default mock: server returns nothing
    api.watchlist.progress = async () => ({ progress: {} });
  });

  it("returns series and movie arrays when server has data", async () => {
    // Seed local data with a fresh timestamp
    localStorage.setItem(
      "stv_continue_watching",
      JSON.stringify([
        {
          seriesId: 1,
          seriesName: "Local Series",
          cover: "",
          seasonNumber: 1,
          episodeNum: 1,
          episodeId: "100",
          episodeTitle: "Local Episode",
          progressSeconds: 100,
          durationSeconds: 1800,
          updatedAt: NOW - 1000, // slightly older
        },
      ]),
    );
    // Mock server: newer series entry and a movie entry
    api.watchlist.progress = async () => ({
      progress: {
        key1: [
          serverSeriesEntry({ timestamp: (NOW - 100) / 1000, position: 800 }),
        ],
        key2: [
          serverMovieEntry({
            movieId: 99,
            movieName: "New Movie",
            timestamp: (NOW - 50) / 1000,
          }),
        ],
      },
    });
    const result = await loadServerProgress();
    // Series should use server entry (newer)
    expect(result.series).toHaveLength(1);
    expect(result.series[0].progressSeconds).toBe(800);
    // Movies should include the server movie
    expect(result.movies).toHaveLength(1);
    expect(result.movies[0].movieId).toBe(99);
  });

  it("prefers server entry when it is more recent", async () => {
    localStorage.setItem(
      "stv_continue_watching",
      JSON.stringify([
        {
          seriesId: 1,
          seriesName: "Local",
          cover: "",
          seasonNumber: 1,
          episodeNum: 1,
          episodeId: "100",
          episodeTitle: "Local",
          progressSeconds: 100,
          durationSeconds: 1800,
          updatedAt: NOW - 5000,
        },
      ]),
    );
    api.watchlist.progress = async () => ({
      progress: {
        k: [
          serverSeriesEntry({ timestamp: (NOW - 1000) / 1000, position: 900 }),
        ],
      },
    });
    const result = await loadServerProgress();
    expect(result.series[0].progressSeconds).toBe(900);
    expect(result.series[0].updatedAt).toBe(NOW - 1000);
  });

  it("prefers local entry when it is more recent", async () => {
    localStorage.setItem(
      "stv_continue_watching",
      JSON.stringify([
        {
          seriesId: 1,
          seriesName: "Local",
          cover: "",
          seasonNumber: 1,
          episodeNum: 1,
          episodeId: "100",
          episodeTitle: "Local",
          progressSeconds: 900,
          durationSeconds: 1800,
          updatedAt: NOW - 1000,
        },
      ]),
    );
    const serverEntry = serverSeriesEntry({
      timestamp: (NOW - 5000) / 1000,
      position: 100,
    });
    api.watchlist.progress = async () => ({
      progress: { k: [serverEntry] },
    });
    const result = await loadServerProgress();
    expect(result.series[0].progressSeconds).toBe(900); // local wins
    expect(result.series[0].updatedAt).toBe(NOW - 1000);
  });

  it("falls back to local data when server is unreachable", async () => {
    saveSeriesProgress({
      seriesId: 1,
      seriesName: "Offline",
      cover: "",
      seasonNumber: 1,
      episodeNum: 1,
      episodeId: "100",
      episodeTitle: "Offline",
      progressSeconds: 500,
      durationSeconds: 1800,
      updatedAt: 1000,
    });
    saveMovieProgress({
      movieId: 7,
      movieName: "Offline Movie",
      poster: "",
      progressSeconds: 200,
      durationSeconds: 3600,
      updatedAt: 1000,
    });
    api.watchlist.progress = async () => {
      throw new Error("Network error");
    };
    const result = await loadServerProgress();
    expect(result.series).toHaveLength(1);
    expect(result.series[0].seriesName).toBe("Offline");
    expect(result.movies).toHaveLength(1);
    expect(result.movies[0].movieName).toBe("Offline Movie");
  });

  it("returns local data unchanged when server returns empty", async () => {
    localStorage.setItem(
      "stv_continue_watching",
      JSON.stringify([
        {
          seriesId: 2,
          seriesName: "Local Only",
          cover: "",
          seasonNumber: 1,
          episodeNum: 1,
          episodeId: "101",
          episodeTitle: "Only",
          progressSeconds: 300,
          durationSeconds: 1800,
          updatedAt: NOW - 1000,
        },
      ]),
    );
    api.watchlist.progress = async () => ({ progress: {} });
    const result = await loadServerProgress();
    expect(result.series).toHaveLength(1);
    expect(result.series[0].seriesName).toBe("Local Only");
  });

  it("caps merged result at MAX_ITEMS", async () => {
    // Fill local with 15 entries
    for (let i = 0; i < 15; i++) {
      saveSeriesProgress({
        seriesId: i,
        seriesName: `S${i}`,
        cover: "",
        seasonNumber: 1,
        episodeNum: 1,
        episodeId: String(i),
        episodeTitle: `E${i}`,
        progressSeconds: 100,
        durationSeconds: 1800,
        updatedAt: 1000 + i,
      });
    }
    // Server adds 10 more (newer)
    const serverEntries = Array.from({ length: 10 }, (_, i) =>
      serverSeriesEntry({
        seriesId: 100 + i,
        timestamp: 2000 + i,
        position: 500,
        seriesName: `Server S${i}`,
      }),
    );
    const serverMap: Record<string, ServerProgressEntry[]> = {};
    serverEntries.forEach((e, i) => {
      serverMap[`k${i}`] = [e];
    });
    api.watchlist.progress = async () => ({ progress: serverMap });
    const result = await loadServerProgress();
    expect(result.series.length).toBeLessThanOrEqual(20);
  });
});
