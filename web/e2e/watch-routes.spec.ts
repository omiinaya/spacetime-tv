/**
 * Watch route E2E tests — /watch/movie/:id, /watch/series/:seriesId/:epId,
 * /watch/recording/:id.
 *
 * Covers the player mounting for each media type. Uses real IDs fetched
 * from the live API (or falls back to known-good IDs for this provider).
 *
 * IMPORTANT: Do NOT use waitForLoadState("networkidle") on /watch/ pages —
 * live streams never idle. Use "load" + short waits.
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *   - Provider configured with movies/series data
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

async function fetchJson<T>(page: import("@playwright/test").Page, path: string): Promise<T> {
  const resp = await page.request.get(`${API_BASE}${path}`);
  if (!resp.ok()) throw new Error(`GET ${path} → ${resp.status()}`);
  return resp.json() as Promise<T>;
}

/** Resolve a real movie stream_id from the unified endpoint. */
async function resolveMovieId(page: import("@playwright/test").Page): Promise<string> {
  try {
    const data = await fetchJson<{ movies: { stream_id: number }[] }>(
      page,
      "/api/movies/unified?limit=1",
    );
    if (data.movies?.[0]?.stream_id) return String(data.movies[0].stream_id);
  } catch {
    /* fall through */
  }
  return "1976321"; // known-good fallback
}

/** Resolve a real (series_id, episode_id) pair. */
async function resolveSeriesEpisode(
  page: import("@playwright/test").Page,
): Promise<{ seriesId: string; epId: string }> {
  try {
    const cats = await fetchJson<{ categories: { category_id: string }[] }>(
      page,
      "/api/series/categories",
    );
    for (const cat of cats.categories.slice(0, 5)) {
      const list = await fetchJson<{ series: { series_id: number }[] }>(
        page,
        `/api/series?category_id=${cat.category_id}&limit=2`,
      );
      for (const s of list.series.slice(0, 2)) {
        const det = await fetchJson<{ episodes: Record<string, { id: number }[]> }>(
          page,
          `/api/series/${s.series_id}`,
        );
        for (const season of Object.keys(det.episodes || {})) {
          const eps = det.episodes[season];
          if (eps?.length) {
            return { seriesId: String(s.series_id), epId: String(eps[0].id) };
          }
        }
      }
    }
  } catch {
    /* fall through */
  }
  return { seriesId: "30720", epId: "1294647" }; // known-good fallback
}

test.describe("Watch Routes", () => {
  test("movie watch route mounts the player", async ({ page }) => {
    const movieId = await resolveMovieId(page);
    test.info().annotations.push({ type: "movie", description: movieId });

    await page.goto(`/watch/movie/${movieId}`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    expect(page.url()).toContain("/watch/movie/");
    const video = page.locator("video[aria-label='Movie player']");
    await expect(video).toBeVisible({ timeout: 10_000 });
    console.log(`Movie player mounted for id=${movieId}`);
  });

  test("series watch route mounts the player", async ({ page }) => {
    const { seriesId, epId } = await resolveSeriesEpisode(page);
    test.info().annotations.push({
      type: "series",
      description: `${seriesId} ep ${epId}`,
    });

    await page.goto(`/watch/series/${seriesId}/${epId}`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    expect(page.url()).toContain(`/watch/series/${seriesId}/`);
    const video = page.locator("video[aria-label='Series player']");
    await expect(video).toBeVisible({ timeout: 10_000 });
    console.log(`Series player mounted for series=${seriesId} ep=${epId}`);
  });

  test("recording watch route mounts the player", async ({ page }) => {
    // Use a synthetic id — WatchRecording mounts a <video> regardless of
    // whether the recording exists (the stream request fails later).
    await page.goto("/watch/recording/1");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    expect(page.url()).toContain("/watch/recording/");
    const video = page.locator("video");
    await expect(video).toBeVisible({ timeout: 10_000 });
    console.log("Recording player mounted");
  });

  test("watch routes never show the SPA not-found page", async ({ page }) => {
    for (const path of ["/watch/movie/1", "/watch/series/1/1", "/watch/recording/1"]) {
      await page.goto(path);
      await page.waitForLoadState("load");
      await page.waitForTimeout(2000);
      await expect(page.locator("body")).not.toHaveText(/Page not found/i, {
        timeout: 5_000,
      });
      // A video element should exist on every watch route
      await expect(page.locator("video").first()).toBeAttached({ timeout: 10_000 });
    }
    console.log("All watch routes mount a player (no NotFound)");
  });
});
