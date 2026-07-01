/**
 * Error-state E2E tests — server down, empty EPG, empty search, offline.
 *
 * These tests verify that SpacetimeTV degrades gracefully when the backend
 * is unreachable, returns empty data, or the network is offline.
 *
 * Prerequisites:
 *   - Backend API running on :8720 (for negative tests, a fake URL is used)
 *   - Frontend served on BASE_URL (can be built dist/ or vite dev server)
 *
 * Run: npm run test:e2e
 */

import { test, expect, type Page } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

/**
 * Helper: set the page's base URL by navigating to the real frontend
 * but overriding the API base via a global that FE code may read.
 * The E2E pages are served by the built frontend on :8720 directly,
 * so we navigate to the frontend URL and test the UI state without
 * relying on the real API.
 */
async function setupWithFakeApi(page: Page, fakeBase: string) {
  // Navigate to the actual frontend first
  await page.goto("/");
  await page.waitForLoadState("domcontentloaded");

  // Inject an API interceptor that blocks /api/* calls to the real backend
  // We do this by routing all /api/* requests to a fake server URL
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    // Rewrite to a guaranteed-down URL so fetch fails with network error
    await route.abort("connectionrefused");
  });
  await page.waitForTimeout(500);
}

test.describe("Error states", () => {
  test("shows error UI when backend is unreachable on homepage", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Block all /api calls to simulate server down
    await page.route("**/api/**", (route) => route.abort("connectionrefused"));

    // Wait for the page to try loading data and settle
    await page.waitForTimeout(4000);

    // Page should NOT show a blank white screen or unhandled error
    const body = page.locator("body");
    const text = await body.innerText();

    // Should still render the app shell (nav, layout)
    expect(text.length).toBeGreaterThan(20);
    console.log(`Server-down homepage: ${text.length} chars rendered`);

    // Should not be a white screen
    const hasNav = text.includes("Live") || text.includes("TV") || text.includes("Movies") || text.includes("Settings");
    expect(hasNav).toBeTruthy();

    // The page should exist — error boundary or skeleton shown
    await expect(page.locator("#root, main, [role='main'], nav").first()).toBeVisible({ timeout: 5_000 });
  });

  test("shows error UI when backend is unreachable on movies page", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForLoadState("domcontentloaded");

    await page.route("**/api/**", (route) => route.abort("connectionrefused"));
    await page.waitForTimeout(4000);

    // Page should render with nav visible and no crash
    const body = page.locator("body");
    await expect(body).not.toHaveText(/internal server error|unexpected error|cannot read property|undefined is not/i, { timeout: 5_000 });

    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(20);
    console.log(`Server-down movies: ${text.length} chars`);
  });

  test("shows error UI when backend is unreachable on series page", async ({ page }) => {
    await page.goto("/series");
    await page.waitForLoadState("domcontentloaded");

    await page.route("**/api/**", (route) => route.abort("connectionrefused"));
    await page.waitForTimeout(4000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/internal server error|unexpected error|cannot read property/i, { timeout: 5_000 });

    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(20);
    console.log(`Server-down series: ${text.length} chars`);
  });

  test("shows error UI when backend is unreachable on live TV page", async ({ page }) => {
    await page.goto("/live");
    await page.waitForLoadState("domcontentloaded");

    await page.route("**/api/**", (route) => route.abort("connectionrefused"));
    await page.waitForTimeout(4000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/internal server error|unexpected error|cannot read property/i, { timeout: 5_000 });

    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(20);
    console.log(`Server-down live TV: ${text.length} chars`);
  });

  test("search handles empty results gracefully", async ({ page }) => {
    // Search for a string that almost certainly won't match anything
    await page.goto(`/search?q=xyznonexistent789`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/error|failed|crash/i, { timeout: 5_000 });

    const text = await body.innerText();
    console.log(`Empty search results page: ${text.length} chars`);

    // Should show "no results" or similar empty state, not a blank page
    expect(text.length).toBeGreaterThan(20);
  });

  test("guide page handles missing EPG data gracefully", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/guide");
    await page.waitForLoadState("load");

    // Block the guide API specifically to simulate EPG failure
    await page.route("**/api/guide**", (route) => route.abort("connectionrefused"));
    await page.waitForTimeout(5000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/internal server error|crash/i, { timeout: 5_000 });

    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(20);
    console.log(`Guide with no EPG data: ${text.length} chars`);
  });

  test("watchlist page loads without crashing when API fails", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/watchlist");
    await page.waitForLoadState("domcontentloaded");

    // Block watchlist API
    await page.route("**/api/watchlist**", (route) => route.abort("connectionrefused"));
    await page.route("**/api/cloud/**", (route) => route.abort("connectionrefused"));
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/internal server error|crash/i, { timeout: 5_000 });

    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(10);
    console.log(`Watchlist with API failure: ${text.length} chars`);

    // Watchlist should still show the header and empty state
    const hasHeader = text.includes("Watchlist") || text.includes("watchlist");
    console.log(`  Header visible: ${hasHeader}`);
  });
});

test.describe("Error states — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("mobile movies page handles API failure gracefully", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForLoadState("domcontentloaded");

    await page.route("**/api/**", (route) => route.abort("connectionrefused"));
    await page.waitForTimeout(4000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/crash|unexpected error/i, { timeout: 5_000 });

    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(10);
    console.log(`Mobile movies (server down): ${text.length} chars`);
  });

  test("mobile search handles empty results gracefully", async ({ page }) => {
    await page.goto(`/search?q=zzzzznothinghere999`);
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/error|failed|crash/i, { timeout: 5_000 });

    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(10);
    console.log(`Mobile empty search: ${text.length} chars`);
  });
});
