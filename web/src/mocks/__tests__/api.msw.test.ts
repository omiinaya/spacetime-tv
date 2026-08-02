/**
 * Integration tests for the `api` module using MSW (Mock Service Worker).
 *
 * Unlike the unit tests in src/lib/api.test.ts which use vi.spyOn(globalThis, 'fetch'),
 * these tests exercise the *real* api module with actual fetch() calls intercepted
 * by MSW handlers. This validates URL construction, parameter passing, and JSON
 * parsing without needing a running backend.
 *
 * ── Pattern ───────────────────────────────────────────────────────
 *
 *   - MSW server is started globally in test-setup.ts
 *   - Each test can override handlers with server.use() for custom scenarios
 *   - No vi.mock("@/lib/api") needed — the real module fetches from /api/* URLs
 *   - server.resetHandlers() is called afterEach to restore defaults
 */

import { describe, it, expect } from "vitest";
import { api } from "@/lib/api";
import { server } from "@/mocks/server";
import { http, HttpResponse } from "msw";

describe("api.msw — MSW integration tests", () => {
  // Test the series API endpoints via real fetch + MSW interception
  describe("series", () => {
    it("api.series.categories() returns categories from MSW handler", async () => {
      const result = await api.series.categories();
      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].category_name).toBe("Action");
    });

    it("api.series.list() filters by category_id", async () => {
      const result = await api.series.list("1");
      // Only Stranger Things and The Office are in category "1"
      expect(result.series).toHaveLength(2);
      expect(result.series[0].name).toBe("Stranger Things");
    });

    it("api.series.list() returns correct total count", async () => {
      const result = await api.series.list("2");
      // Only Breaking Bad is in category "2"
      expect(result.total).toBe(1);
      expect(result.series[0].name).toBe("Breaking Bad");
    });

    it("api.series.details() returns series info and episodes", async () => {
      const result = await api.series.details(101);
      expect(result.info.name).toBe("Breaking Bad");
      expect(result.seasons).toHaveLength(1);
      // Episodes should be keyed by season number
      const episodes = result.episodes["1"];
      expect(episodes).toHaveLength(1);
      expect(episodes[0].title).toBe("Pilot");
    });

    it("api.series.details() throws 404 for unknown series", async () => {
      await expect(api.series.details(999)).rejects.toThrow("API error 404");
    });
  });

  // Test movies API with real fetch + MSW
  describe("movies", () => {
    it("api.movies.categories() returns categories", async () => {
      const result = await api.movies.categories();
      expect(result.categories).toHaveLength(2);
    });

    it("api.movies.unified() returns all movies", async () => {
      const result = await api.movies.unified();
      expect(result.movies).toHaveLength(2);
      expect(result.movies[0].name).toBe("The Matrix");
    });

    it("api.movies.unified() filters by search query", async () => {
      const result = await api.movies.unified(50, 0, "Inception");
      expect(result.movies).toHaveLength(1);
      expect(result.movies[0].name).toBe("Inception");
    });

    it("api.movies.details() returns movie info", async () => {
      const result = await api.movies.details(201);
      expect(result.info.name).toBe("The Matrix");
      expect(result.info.director).toBe("Director Name");
    });
  });

  // Test live TV API
  describe("live", () => {
    it("api.live.categories() returns categories", async () => {
      const result = await api.live.categories();
      expect(result.categories).toHaveLength(2);
    });

    it("api.live.streams() filters by category", async () => {
      const result = await api.live.streams("1");
      expect(result.streams).toHaveLength(1);
      expect(result.streams[0].name).toBe("CNN");
    });

    it("api.live.all() returns all streams", async () => {
      const result = await api.live.all();
      expect(result.streams).toHaveLength(2);
    });

    it("api.live.info() returns stream metadata", async () => {
      const result = await api.live.info([301, 302]);
      expect(result.streams).toHaveLength(2);
    });
  });

  // Test search
  describe("search", () => {
    it("api.search() returns combined results", async () => {
      const result = await api.search("Matrix");
      expect(result.movies).toHaveLength(1);
      expect(result.movies[0].name).toBe("The Matrix");
      expect(result.totals.movies).toBe(1);
    });

    it("api.search() returns empty results for no matches", async () => {
      const result = await api.search("xyznonexistent");
      expect(result.movies).toHaveLength(0);
      expect(result.series).toHaveLength(0);
      expect(result.live).toHaveLength(0);
    });
  });

  // Test guide
  describe("guide", () => {
    it("api.guide.get() returns channel groups", async () => {
      const result = await api.guide.get();
      expect(result.channel_groups).toHaveLength(1);
      expect(result.channel_groups[0].channel_name).toBe("CNN");
    });

    it("api.guide.now() returns now-playing info", async () => {
      const result = await api.guide.now([301]);
      expect(result.programmes[301]?.title).toBe("Morning News");
    });
  });

  // Test per-test handler overrides
  describe("handler overrides", () => {
    it("can override a handler with server.use()", async () => {
      // Override the categories handler for just this test
      server.use(
        http.get("/api/series/categories", () =>
          HttpResponse.json({
            categories: [
              { category_id: "99", category_name: "Custom Cat", parent_id: 0 },
            ],
          }),
        ),
      );

      const result = await api.series.categories();
      expect(result.categories).toHaveLength(1);
      expect(result.categories[0].category_name).toBe("Custom Cat");
    });

    it("resets to default handlers after each test", async () => {
      // The override from the previous test should be gone
      const result = await api.series.categories();
      expect(result.categories).toHaveLength(2);
      expect(result.categories[0].category_name).toBe("Action");
    });
  });

  // Test error state simulation
  describe("error states", () => {
    it("handle 500 errors from MSW handlers", async () => {
      server.use(
        http.get(
          "/api/series/categories",
          () => new HttpResponse(null, { status: 500 }),
        ),
      );
      await expect(api.series.categories()).rejects.toThrow("API error 500");
    });

    it("handle empty responses from server", async () => {
      server.use(
        http.get("/api/movies/unified", () =>
          HttpResponse.json({ movies: [], total: 0, offset: 0, limit: 50 }),
        ),
      );
      const result = await api.movies.unified();
      expect(result.movies).toHaveLength(0);
    });
  });
});
