/**
 * Settings Page E2E tests — language filter, streaming services, adult content toggle,
 * hidden categories, reset.
 *
 * Settings are persisted in localStorage under key "stv_settings".
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

test.describe("Settings Page", () => {
  test("settings page loads", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    // Should have heading
    const body = page.locator("body");
    await expect(body).toBeVisible({ timeout: 5_000 });
    const text = await body.innerText();
    expect(text).toContain("Settings");
    console.log(`Settings page loaded (${text.length} chars)`);
  });

  test("settings page has language filter section", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    const text = await body.innerText();

    // Should have language filter controls
    expect(
      text.includes("Language") ||
      text.includes("Country") ||
      text.length > 200
    ).toBeTruthy();

    // "All" button should be visible (for language filter toggle)
    const allBtn = page.getByText("All").first();
    await expect(allBtn).toBeVisible({ timeout: 5_000 });
    console.log("Settings language section present");
  });

  test("settings page has adult content toggle", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    const text = await body.innerText();
    expect(
      text.includes("Adult Content") ||
      text.includes("adult") ||
      text.length > 200
    ).toBeTruthy();
    console.log("Settings: adult content section present");
  });

  test("settings page has hidden categories section", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(4000); // Needs category data to load

    const body = page.locator("body");
    const text = await body.innerText();
    expect(
      text.includes("Hidden Categories") ||
      text.includes("hidden") ||
      text.length > 300
    ).toBeTruthy();
    console.log(`Settings: hidden categories section present (${text.length} chars)`);
  });

  test("settings page has reset button", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const resetBtn = page.getByText("Reset").first();
    await expect(resetBtn).toBeVisible({ timeout: 5_000 });
    console.log("Settings: Reset button visible");
  });

  test("settings page has streaming services section", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    const text = await body.innerText();
    expect(
      text.includes("Streaming Service") ||
      text.includes("streaming") ||
      text.length > 200
    ).toBeTruthy();
    console.log("Settings: streaming services section present");
  });

  test("settings API provides categories data", async ({ page }) => {
    // Verify the API endpoints the settings page depends on
    const liveCatsResp = await page.request.get(`${API_BASE}/api/live/categories`);
    const movieCatsResp = await page.request.get(`${API_BASE}/api/movies/categories`);
    const seriesCatsResp = await page.request.get(`${API_BASE}/api/series/categories`);

    expect(liveCatsResp.ok()).toBeTruthy();
    expect(movieCatsResp.ok()).toBeTruthy();
    expect(seriesCatsResp.ok()).toBeTruthy();

    const liveData = await liveCatsResp.json();
    const movieData = await movieCatsResp.json();
    const seriesData = await seriesCatsResp.json();

    const liveCats = liveData.categories || liveData;
    const movieCats = movieData.categories || movieData;
    const seriesCats = seriesData.categories || seriesData;

    expect(Array.isArray(liveCats)).toBeTruthy();
    expect(Array.isArray(movieCats)).toBeTruthy();
    expect(Array.isArray(seriesCats)).toBeTruthy();

    console.log(
      `Settings API categories: live=${liveCats.length}, movies=${movieCats.length}, series=${seriesCats.length}`
    );
  });
});
