/**
 * Series E2E tests — catalog browsing, categories, series detail, seasons/episodes.
 *
 * Prerequisites:
 *   - Backend API running on :8720
 *   - Frontend served on BASE_URL
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

test.describe("Series Catalog", () => {
  test("series page loads and shows content", async ({ page }) => {
    await page.goto("/series");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Should show series content
    const body = page.locator("main, #root > div, [role='main']").first();
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
  });

  test("series API returns categories", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/series/categories`);
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    const cats = data.categories || data;
    expect(Array.isArray(cats)).toBeTruthy();
    expect(cats.length).toBeGreaterThan(0);

    const cat = cats[0];
    expect(cat).toHaveProperty("category_id");
    expect(cat).toHaveProperty("category_name");
    console.log(`Series categories: ${cats.length} total`);
  });

  test("series API returns paginated results", async ({ page }) => {
    // Use a known series category
    const resp = await page.request.get(`${API_BASE}/api/series?category_id=1315&page=1&limit=10`);
    expect(resp.ok()).toBeTruthy();

    const data = await resp.json();
    const seriesList = data.series || data;
    expect(Array.isArray(seriesList)).toBeTruthy();
    expect(seriesList.length).toBeGreaterThan(0);

    const series = seriesList[0];
    expect(series).toHaveProperty("series_id");
    expect(series).toHaveProperty("name");
    expect(series).toHaveProperty("cover");

    if (data.total) {
      expect(typeof data.total).toBe("number");
      expect(data.total).toBeGreaterThan(0);
    }

    console.log(`Series in category 1315: ${seriesList.length} items`);
    console.log(`  First: ${series.name?.substring(0, 60)}`);
  });

  test("series detail with seasons and episodes loads", async ({ page }) => {
    // Get a known series ID
    const listResp = await page.request.get(`${API_BASE}/api/series?category_id=1315&page=1&limit=5`);
    const listData = await listResp.json();
    const seriesList = listData.series || listData;
    expect(seriesList.length).toBeGreaterThan(0);

    const seriesId = seriesList[0].series_id;
    expect(seriesId).toBeTruthy();

    // Fetch series detail
    const detailResp = await page.request.get(`${API_BASE}/api/series/${seriesId}`);
    expect(detailResp.ok()).toBeTruthy();

    const detail = await detailResp.json();
    expect(detail).toBeTruthy();

    // Should have seasons/episodes (seasons may be empty)
    if (detail.episodes) {
      const seasonKeys = Object.keys(detail.episodes);
      console.log(`Series ${seriesId}: ${seasonKeys.length} seasons`);
      if (seasonKeys.length > 0) {
        const firstSeason = detail.episodes[seasonKeys[0]];
        console.log(`  Season ${seasonKeys[0]}: ${firstSeason?.length || 0} episodes`);
        expect(Array.isArray(firstSeason)).toBeTruthy();
      }
    } else {
      console.log(`Series ${seriesId}: detail loaded, checking for episodes`);
    }
  });

  test("category navigation on series page", async ({ page }) => {
    await page.goto("/series");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Look for category selectors or buttons
    const categoryElements = page.locator("button, a, [role='button'], select, option").filter({
      hasText: /Series|Action|Drama|Category/i,
    });

    const count = await categoryElements.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        const el = categoryElements.nth(i);
        if (await el.isVisible().catch(() => false)) {
          await el.click();
          await page.waitForTimeout(3000);
          break;
        }
      }
    }

    expect(page.url()).toContain("/series");
    const body = page.locator("body");
    await expect(body).not.toHaveText(/error|failed/i, { timeout: 5_000 });
  });
});
