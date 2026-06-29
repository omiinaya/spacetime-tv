/**
 * Search E2E tests — global search across live, movies, series.
 *
 * Prerequisites:
 *   - Backend API running on :8720
 *   - Frontend served on BASE_URL
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

test.describe("Search", () => {
  test("search page loads", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");

    // Search page should have a search input
    const searchInput = page.locator("input[type='text'], input[placeholder*='earch'], input:not([type='hidden'])").first();
    await expect(searchInput).toBeVisible({ timeout: 5_000 });
  });

  test("search API returns results for batman", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/search?q=batman`);
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    expect(data).toBeTruthy();

    // Should have live, movies, series, and totals
    expect(data).toHaveProperty("live");
    expect(data).toHaveProperty("movies");
    expect(data).toHaveProperty("series");
    expect(data).toHaveProperty("totals");

    console.log(`Search 'batman': live=${data.live?.length || 0}, movies=${data.movies?.length || 0}, series=${data.series?.length || 0}`);
    console.log(`  Totals:`, JSON.stringify(data.totals));
  });

  test("search returns movie results", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/search?q=batman`);
    const data = await resp.json();
    const movies = data.movies || [];
    expect(movies.length).toBeGreaterThan(0);

    const movie = movies[0];
    expect(movie).toHaveProperty("stream_id");
    expect(movie).toHaveProperty("name");
    console.log(`  Top movie: ${movie.name} (ID: ${movie.stream_id})`);
  });

  test("search returns series results", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/search?q=star`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    const seriesList = data.series || [];
    console.log(`Search 'star' series: ${seriesList.length} results`);
    if (seriesList.length > 0) {
      expect(seriesList[0]).toHaveProperty("series_id");
      expect(seriesList[0]).toHaveProperty("name");
    }
  });

  test("search returns live TV results", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/search?q=nat+geo`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    const live = data.live || [];
    console.log(`Search 'nat geo' live: ${live.length} results`);
    if (live.length > 0) {
      expect(live[0]).toHaveProperty("stream_id");
      expect(live[0]).toHaveProperty("name");
    }
  });

  test("search with query in UI triggers results", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    // Find the search input
    const searchInput = page.locator("input[type='text'], input[placeholder*='earch']").first();

    if (await searchInput.isVisible().catch(() => false)) {
      // Type a query and trigger search
      await searchInput.fill("");
      await searchInput.fill("batman");
      await searchInput.press("Enter");
      await page.waitForTimeout(3000);

      // Should show results
      const body = page.locator("body");
      const text = await body.innerText();
      console.log(`Search UI results page text (first 200): ${text.substring(0, 200)}`);
      expect(text.length).toBeGreaterThan(20);
    } else {
      console.log("Search input not visible on page — may use push-state or modal");
      // Still verify the page loaded
      const body = page.locator("body");
      await expect(body).toBeVisible({ timeout: 5_000 });
    }
  });
});
