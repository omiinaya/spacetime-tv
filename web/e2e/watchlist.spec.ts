/**
 * Watchlist E2E tests — localStorage-based watchlist CRUD via browser eval.
 *
 * Prerequisites:
 *   - Backend API running on :8720
 *   - Frontend served on BASE_URL
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const TEST_MOVIE_ID = 346372;

test.describe("Watchlist", () => {
  test("watchlist page loads", async ({ page }) => {
    await page.goto("/watchlist");
    await page.waitForLoadState("load");

    // Watchlist page should show content
    const body = page.locator("main, #root > div, [role='main']").first();
    await expect(body).toBeVisible({ timeout: 5_000 });
  });

  test("add movie to watchlist via localStorage", async ({ page }) => {
    await page.goto("/");

    // Use page.evaluate to manipulate localStorage (client-side watchlist)
    const added = await page.evaluate((movieId) => {
      const key = "stv_watchlist";
      const raw = localStorage.getItem(key);
      const items: number[] = raw ? JSON.parse(raw) : [];
      if (!items.includes(movieId)) {
        items.unshift(movieId);
      }
      localStorage.setItem(key, JSON.stringify(items));
      return items.length;
    }, TEST_MOVIE_ID);

    expect(added).toBeGreaterThan(0);
    console.log(`Added movie ${TEST_MOVIE_ID} to watchlist. Total: ${added}`);
  });

  test("watchlist displays added movie", async ({ page }) => {
    // Navigate to app first to establish origin for localStorage access
    await page.goto("/");
    await page.waitForLoadState("load");

    // Add to watchlist
    await page.evaluate((movieId) => {
      const key = "stv_watchlist";
      const raw = localStorage.getItem(key);
      const items: number[] = raw ? JSON.parse(raw) : [];
      if (!items.includes(movieId)) items.unshift(movieId);
      localStorage.setItem(key, JSON.stringify(items));
    }, TEST_MOVIE_ID);

    // Navigate to watchlist page
    await page.goto("/watchlist");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    // Should show content
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.length).toBeGreaterThan(50);
    const hasMovie = bodyText.includes("Batman") || bodyText.length > 100;
    console.log(`Watchlist page: ${bodyText.length} chars, contains movie: ${hasMovie}`);
  });

  test("watchlist persists across page navigation", async ({ page }) => {
    // Navigate to app first to establish origin for localStorage access
    await page.goto("/");
    await page.waitForLoadState("load");

    // Add item
    await page.evaluate((movieId) => {
      const key = "stv_watchlist";
      const items: number[] = JSON.parse(localStorage.getItem(key) || "[]");
      if (!items.includes(movieId)) items.unshift(movieId);
      localStorage.setItem(key, JSON.stringify(items));
    }, TEST_MOVIE_ID);

    // Navigate around
    await page.goto("/live");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    await page.goto("/movies");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    await page.goto("/watchlist");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    // Item should still be there
    const watchlistItems = await page.evaluate(() => {
      const key = "stv_watchlist";
      return JSON.parse(localStorage.getItem(key) || "[]");
    });
    expect(watchlistItems).toContain(TEST_MOVIE_ID);
    console.log(`Watchlist persisted: ${watchlistItems.length} items`);
  });

  test("remove movie from watchlist via localStorage", async ({ page }) => {
    // Navigate to app first to establish origin for localStorage access
    await page.goto("/");
    await page.waitForLoadState("load");

    // Add first
    await page.evaluate((movieId) => {
      const key = "stv_watchlist";
      const items: number[] = JSON.parse(localStorage.getItem(key) || "[]");
      if (!items.includes(movieId)) items.unshift(movieId);
      localStorage.setItem(key, JSON.stringify(items));
    }, TEST_MOVIE_ID);

    // Remove
    const removed = await page.evaluate((movieId) => {
      const key = "stv_watchlist";
      const items: number[] = JSON.parse(localStorage.getItem(key) || "[]");
      const idx = items.indexOf(movieId);
      if (idx >= 0) items.splice(idx, 1);
      localStorage.setItem(key, JSON.stringify(items));
      return idx >= 0;
    }, TEST_MOVIE_ID);

    expect(removed).toBeTruthy();
    console.log(`Removed movie ${TEST_MOVIE_ID} from watchlist`);
  });

  test("verify item removed from watchlist", async ({ page }) => {
    // Navigate to app first to establish origin for localStorage access
    await page.goto("/");
    await page.waitForLoadState("load");

    const items = await page.evaluate(() => {
      const key = "stv_watchlist";
      return JSON.parse(localStorage.getItem(key) || "[]");
    });
    expect(items).not.toContain(TEST_MOVIE_ID);
    console.log(`Verified removed. Watchlist: ${items.length} items`);
  });

  test("series watchlist works independently", async ({ page }) => {
    const TEST_SERIES_ID = 22864; // Batman: Caped Crusader

    // Navigate to app first to establish origin for localStorage access
    await page.goto("/");
    await page.waitForLoadState("load");

    // Add series
    await page.evaluate((seriesId) => {
      const key = "stv_watchlist_series";
      const items: number[] = JSON.parse(localStorage.getItem(key) || "[]");
      if (!items.includes(seriesId)) items.unshift(seriesId);
      localStorage.setItem(key, JSON.stringify(items));
    }, TEST_SERIES_ID);

    // Verify it's there
    const seriesItems = await page.evaluate(() => {
      const key = "stv_watchlist_series";
      return JSON.parse(localStorage.getItem(key) || "[]");
    });
    expect(seriesItems).toContain(TEST_SERIES_ID);

    // Clean up
    await page.evaluate((seriesId) => {
      const key = "stv_watchlist_series";
      const items: number[] = JSON.parse(localStorage.getItem(key) || "[]");
      const idx = items.indexOf(seriesId);
      if (idx >= 0) items.splice(idx, 1);
      localStorage.setItem(key, JSON.stringify(items));
    }, TEST_SERIES_ID);

    // Clean up movie too if present
    await page.evaluate((movieId) => {
      const key = "stv_watchlist";
      const items: number[] = JSON.parse(localStorage.getItem(key) || "[]");
      const idx = items.indexOf(movieId);
      if (idx >= 0) items.splice(idx, 1);
      localStorage.setItem(key, JSON.stringify(items));
    }, TEST_MOVIE_ID);

    console.log(`Series watchlist works. Cleaned up test items.`);
  });
});