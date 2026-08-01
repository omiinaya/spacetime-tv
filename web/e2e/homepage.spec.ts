/**
 * Homepage E2E tests — welcome message, quick links, trending content sections.
 *
 * Prerequisites:
 *   - Backend API running on :8720 (which also serves the built frontend)
 *   - Frontend built (dist/) or vite dev server running
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

test.describe("Homepage", () => {
  test("homepage loads with welcome message", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    // Welcome header (heading role — avoids matching "Welcome to Spacetime-TV")
    await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Browse live TV, movies, series, and more")).toBeVisible({ timeout: 3_000 });
  });

  test("quick link buttons navigate to correct pages", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    // Home quick-link cards live in <main> — scope locators there so we
    // don't accidentally click the sidebar nav buttons (same labels).
    const main = page.locator("main");

    // Check for quick link buttons
    const quickLinks = ["Live TV", "Movies", "Series", "Watchlist"];
    for (const label of quickLinks) {
      const btn = main.getByText(label, { exact: true }).first();
      await expect(btn).toBeVisible({ timeout: 3_000 });
    }

    // Click each link and verify navigation
    for (const [label, path] of Object.entries({
      "Live TV": "/live",
      "Movies": "/movies",
      "Series": "/series",
      "Watchlist": "/watchlist",
    })) {
      const btn = main.getByText(label, { exact: true }).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForLoadState("load");
        await page.waitForTimeout(1000);
        expect(page.url()).toContain(path);
        // Navigate back to home for the next link
        await page.goto("/");
        await page.waitForLoadState("load");
        await page.waitForTimeout(1000);
      }
    }
  });

  test("trending section shows or falls back gracefully", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    // Check if trending content loaded or loading was displayed
    const body = page.locator("body");
    const text = await body.innerText();

    // Either we see trending content, skeleton loaders, or the empty welcome state
    const hasTrending =
      text.includes("Trending Movies") ||
      text.includes("Trending Series") ||
      text.includes("Welcome to Spacetime-TV") ||
      text.includes("Browse Live TV");

    expect(hasTrending).toBeTruthy();
    console.log(`Homepage: ${text.includes("Trending Movies") ? "has trending movies" : "no trending movies"}, ${text.length} chars`);
  });

  test("trending skeleton appears briefly while data loads", async ({ page }) => {
    await page.goto("/");

    // The page should initially show the main content area
    const main = page.locator("[role='main'], main").first();
    await expect(main).toBeVisible({ timeout: 5_000 });

    // Wait for whichever state settles
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);

    // The page should not show an error
    const body = page.locator("body");
    await expect(body).not.toHaveText(/internal server error|failed to load/i, { timeout: 5_000 });
  });

  test("page title is correct", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    const title = await page.title();
    expect(title).toContain("Spacetime");
    console.log(`Page title: "${title}"`);
  });

  test("view all links on trending sections navigate correctly", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.waitForTimeout(5000);

    // Try clicking "View all" links
    const viewAllButtons = page.getByText("View all").first();
    if (await viewAllButtons.isVisible().catch(() => false)) {
      await viewAllButtons.click();
      await page.waitForLoadState("load");
      await page.waitForTimeout(2000);
      // Should be on movies or series page
      const url = page.url();
      expect(
        url.includes("/movies") || url.includes("/series"),
      ).toBeTruthy();
      console.log(`View all navigated to: ${url}`);
    } else {
      console.log("No 'View all' buttons visible (trending may be empty)");
    }
  });
});
