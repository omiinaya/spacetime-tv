/**
 * Navigation & Routing E2E tests — SPA nav, page loads, layout basics.
 *
 * IMPORTANT: Use waitForLoadState("load") instead of "networkidle" for pages
 * that may have long-running data fetches (live, guide) — large datasets like
 * 48k channels or full EPG guide keep network activity going for a while.
 * The player tests already use this pattern (see live-tv.spec.ts).
 *
 * Prerequisites:
 *   - Backend API running on :8720
 *   - Frontend served on BASE_URL (default http://192.0.2.10:5183)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const SLOW_PAGES = ["/live", "/guide"];

test.describe("Navigation & Routing", () => {
  test.describe("static page loads", () => {
    const NAV_ITEMS = [
      { path: "/" },
      { path: "/live" },
      { path: "/guide" },
      { path: "/movies" },
      { path: "/series" },
      { path: "/search" },
      { path: "/watchlist" },
      { path: "/history" },
      { path: "/settings" },
    ];

    for (const { path } of NAV_ITEMS) {
      test(`/${path} loads successfully`, async ({ page }) => {
        await page.goto(path);
        // Use "load" for pages with large data fetches (live, guide)
        await page.waitForLoadState("load");
        // Give data a moment to render after initial DOM load
        await page.waitForTimeout(SLOW_PAGES.includes(path) ? 10000 : 3000);

        // The page should show content, not an error state
        // Avoid broad regex like /404/ — numbers like 404 appear legitimately
        // in channel names across 48K+ channels
        const body = page.locator("body");
        await expect(body).not.toHaveText(/Not Found|internal server error/i, { timeout: 5_000 });

        // Main content area should exist and not be empty
        const main = page.locator("main, #root > div, [role='main'], .container").first();
        await expect(main).toBeVisible({ timeout: 5_000 });
      });
    }
  });

  test("SPA navigation between pages works", async ({ page }) => {
    // Set a reasonable navigation timeout
    test.setTimeout(120_000);

    // Start at home
    await page.goto("/");
    await page.waitForLoadState("load");
    expect(page.url()).toContain("/");

    // Navigate to live TV
    await page.goto("/live");
    await page.waitForLoadState("load");
    await page.waitForTimeout(5000);
    expect(page.url()).toContain("/live");

    // Navigate to movies
    await page.goto("/movies");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/movies");

    // Navigate to series
    await page.goto("/series");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/series");

    // Navigate to search
    await page.goto("/search");
    await page.waitForLoadState("load");
    expect(page.url()).toContain("/search");

    // Navigate to watchlist
    await page.goto("/watchlist");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/watchlist");
  });

  test("back and forward browser navigation", async ({ page }) => {
    test.setTimeout(120_000);

    // Start at home
    await page.goto("/");
    await page.waitForLoadState("load");

    // Go to movies
    await page.goto("/movies");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/movies");

    // Go to search
    await page.goto("/search");
    await page.waitForLoadState("load");
    expect(page.url()).toContain("/search");

    // Back to movies
    await page.goBack();
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/movies");

    // Back to home
    await page.goBack();
    await page.waitForLoadState("load");
    expect(page.url()).toContain("/");

    // Forward to movies again
    await page.goForward();
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/movies");
  });

  test("navbar navigation links are present and clickable", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");

    // Check for navigation elements — links/buttons in nav/header.
    // On mobile the desktop sidebar is display:none (hidden md:flex) and the
    // drawer nav only renders once the hamburger is opened, so assert on the
    // hamburger first, then on the :visible nav after opening.
    const isMobile = page.viewportSize()!.width < 768;

    if (isMobile) {
      const toggle = page.getByRole("button", { name: /open navigation/i });
      await expect(toggle).toBeVisible({ timeout: 5_000 });
      await toggle.click();
    }

    const nav = page.locator("[role='navigation']:visible").first();
    await expect(nav).toBeVisible({ timeout: 5_000 });

    // Key nav links should be present
    const links = ["Live", "Movies", "Series", "Guide", "Search", "Watchlist"];
    const visibleLinks: string[] = [];
    for (const label of links) {
      const link = nav.getByText(label, { exact: false }).first();
      if (await link.isVisible().catch(() => false)) {
        visibleLinks.push(label);
      }
    }
    // At least some nav links should be visible
    expect(visibleLinks.length).toBeGreaterThanOrEqual(3);
  });

  test("watch route redirects to player", async ({ page }) => {
    // Navigate to a /watch/live/ URL directly
    await page.goto("/watch/live/483974");
    await page.waitForLoadState("load");

    // Should be on a /watch/live/ route
    expect(page.url()).toContain("/watch/live/");

    // Video element should exist
    const video = page.locator("video");
    await expect(video).toBeVisible({ timeout: 10_000 });
  });
});
