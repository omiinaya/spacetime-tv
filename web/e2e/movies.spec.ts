/**
 * Movies E2E tests — catalog browsing, categories, movie detail, pagination.
 *
 * Prerequisites:
 *   - Backend API running on :8720
 *   - Frontend served on BASE_URL
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

test.describe("Movies Catalog", () => {
  test("movies page loads and shows categories", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should show movie content — categories or movie cards
    const body = page.locator("main, #root > div, [role='main']").first();
    const text = await body.innerText();

    // Either categories are shown or there's content
    expect(text.length).toBeGreaterThan(50);
  });

  test("movies API returns categories", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/movies/categories`);
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    const cats = data.categories || data;
    expect(Array.isArray(cats)).toBeTruthy();
    expect(cats.length).toBeGreaterThan(0);

    // Each category has required fields
    const cat = cats[0];
    expect(cat).toHaveProperty("category_id");
    expect(cat).toHaveProperty("category_name");
    console.log(`Movie categories: ${cats.length} total`);
  });

  test("movies API returns paginated results", async ({ page }) => {
    // Use a known movie category (272 = general movies)
    const resp = await page.request.get(`${API_BASE}/api/movies?category_id=272&page=1&limit=10`);
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    const movies = data.movies || data;
    expect(Array.isArray(movies)).toBeTruthy();
    expect(movies.length).toBeGreaterThan(0);

    // Each movie has required fields
    const movie = movies[0];
    expect(movie).toHaveProperty("stream_id");
    expect(movie).toHaveProperty("name");

    // Check pagination info
    if (data.total) {
      expect(typeof data.total).toBe("number");
      expect(data.total).toBeGreaterThan(0);
    }

    console.log(`Movies in category 272: ${movies.length} items`);
    console.log(`  First: ${movie.name?.substring(0, 60)}`);
  });

  test("movie detail loads", async ({ page }) => {
    // Get a known movie ID
    const listResp = await page.request.get(`${API_BASE}/api/movies?category_id=272&page=1&limit=5`);
    expect(listResp.ok()).toBeTruthy();
    const listData = await listResp.json();
    const movies = listData.movies || listData;
    expect(movies.length).toBeGreaterThan(0);

    const movieId = movies[0].stream_id;
    expect(movieId).toBeTruthy();

    // Fetch movie detail
    const detailResp = await page.request.get(`${API_BASE}/api/movies/${movieId}`);
    expect(detailResp.ok()).toBeTruthy();

    const detail = await detailResp.json();
    expect(detail).toBeTruthy();
    console.log(`Movie detail fetched for ${movieId}`);
  });

  test("category navigation: select category and see movies", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Look for category buttons or a category list
    const categoryElements = page.locator("button, a, [role='button'], .category-item, select, option").filter({
      hasText: /Action|Comedy|Drama|Horror|Thriller|Movie|Category/i,
    });

    const count = await categoryElements.count();
    if (count > 0) {
      // Click the first visible category
      for (let i = 0; i < count; i++) {
        const el = categoryElements.nth(i);
        if (await el.isVisible().catch(() => false)) {
          await el.click();
          await page.waitForTimeout(3000);
          break;
        }
      }
    }

    // The page should still be on /movies and show content
    expect(page.url()).toContain("/movies");
    const body = page.locator("body");
    await expect(body).not.toHaveText(/error|failed/i, { timeout: 5_000 });
  });

  test("unified movies endpoint works", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/movies/unified?page=1&limit=5`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    const movies = data.movies || data;
    expect(Array.isArray(movies)).toBeTruthy();
    if (movies.length > 0) {
      expect(movies[0]).toHaveProperty("stream_id");
      expect(movies[0]).toHaveProperty("name");
    }
    console.log(`Unified movies: ${movies.length} results`);
  });
});
