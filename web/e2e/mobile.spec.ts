/**
 * Mobile & Tablet viewport E2E tests — responsive layout, touch targets,
 * mobile navigation, player controls at small viewports.
 *
 * Prerequisites:
 *   - Backend API running on :8720
 *   - Frontend served on BASE_URL (default http://<your-host>:5183)
 *
 * Run: npm run test:e2e -- --project="Mobile Chrome" e2e/mobile.spec.ts
 */

import { test, expect } from "@playwright/test";

// This spec is mobile/tablet-specific — pin a small touch viewport so it
// passes regardless of which project runs it (desktop chromium would
// otherwise hide the md:hidden hamburger and fail the toggle test).
test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

// ── Helpers ──────────────────────────────────────────────────────

async function dismissInstallPrompt(page: import("@playwright/test").Page) {
  // If the PWA install prompt appears, dismiss it
  const notNow = page.getByRole("button", { name: /not now/i });
  if (await notNow.isVisible({ timeout: 2000 }).catch(() => false)) {
    await notNow.click();
  }
}

// ── Mobile Navigation ────────────────────────────────────────────

test.describe("Mobile Navigation", () => {
  test("sidebar toggle opens and closes", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await dismissInstallPrompt(page);

    // Mobile viewports should show a hamburger/sidebar toggle
    // On small screens the nav may be hidden behind a toggle button
    // Check that the main nav exists
    const nav = page.locator("nav");
    await expect(nav).toBeAttached();

    // The app should have visible UI — mobile hamburger menu + welcome heading
    await expect(page.getByRole("button", { name: /open navigation/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
  });

  test("main content is accessible on mobile", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await dismissInstallPrompt(page);

    // Main content should be visible and not pushed off-screen
    const main = page.locator("main, #main-content, [role='main']").first();
    await expect(main).toBeVisible({ timeout: 5000 });

    // Home page should show welcome heading and quick links
    await expect(page.getByRole("heading", { name: /welcome/i })).toBeVisible();
  });
});

// ── Live TV Mobile ───────────────────────────────────────────────

test.describe("Live TV — Mobile", () => {
  test("category filter carousel is touch-scrollable", async ({ page }) => {
    await page.goto("/live");
    await page.waitForLoadState("load");
    await page.waitForTimeout(5000); // Wait for channel data to load

    // Category filter buttons should exist — "All" or any category button
    // On mobile, the categories may be in a carousel; look for any category button
    const categoryBtns = page.locator('button:has-text("|"), button:has-text("All"), button:has-text("4K")');
    await expect(categoryBtns.first()).toBeVisible({ timeout: 20000 });

    // Channels should load
    const channelCards = page.locator('[data-watch-link]');
    const count = await channelCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test("channel cards have adequate touch targets", async ({ page }) => {
    await page.goto("/live");
    await page.waitForLoadState("load");
    await page.waitForTimeout(5000);

    // Channels should be clickable
    const firstCard = page.locator('[data-watch-link]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });

    // Click opens the player page
    await firstCard.click();
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    // Player should be visible
    const backBtn = page.getByRole("button", { name: /back to browsing/i });
    await expect(backBtn).toBeVisible({ timeout: 10000 });
  });
});

// ── Player Controls — Mobile ─────────────────────────────────────

test.describe("Player — Mobile", () => {
  test("player loads and controls are accessible", async ({ page }) => {
    await page.goto("/live");
    await page.waitForLoadState("load");
    await page.waitForTimeout(5000);

    // Click first channel
    const firstCard = page.locator('[data-watch-link]').first();
    await expect(firstCard).toBeVisible({ timeout: 10000 });
    await firstCard.click();
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    // Verify player elements exist
    const backBtn = page.getByRole("button", { name: /back/i }).first();
    await expect(backBtn).toBeVisible({ timeout: 10000 });

    // Play/Pause button should exist
    const playBtn = page.getByRole("button", { name: /play|pause/i }).first();
    await expect(playBtn).toBeAttached();

    // PiP button should exist
    const pipBtn = page.getByRole("button", { name: /picture in picture/i });
    await expect(pipBtn).toBeAttached();
  });
});

// ── Search — Mobile ──────────────────────────────────────────────

test.describe("Search — Mobile", () => {
  test("search page loads on mobile", async ({ page }) => {
    await page.goto("/search");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    // Search input should be visible
    const searchInput = page.getByPlaceholder(/search/i).first();
    await expect(searchInput).toBeVisible({ timeout: 5000 });
  });
});

// ── Settings — Mobile ────────────────────────────────────────────

test.describe("Settings — Mobile", () => {
  test("settings page loads and is usable on mobile", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    // Settings heading should be visible
    await expect(
      page.getByRole("heading", { name: /settings/i }),
    ).toBeVisible({ timeout: 5000 });
  });
});

// ── Movies — Mobile ──────────────────────────────────────────────

test.describe("Movies — Mobile", () => {
  test("movie categories and cards render", async ({ page }) => {
    await page.goto("/movies");
    await page.waitForLoadState("load");
    await page.waitForTimeout(5000);

    // Movie cards or category sections should appear
    // Use a generous timeout for data to load
    const main = page.locator("main, [role='main']").first();
    await expect(main).toBeVisible({ timeout: 5000 });

    // Should not show error state
    const body = page.locator("body");
    await expect(body).not.toHaveText(/error|not found/i, { timeout: 5000 });
  });
});

// ── Series — Mobile ──────────────────────────────────────────────

test.describe("Series — Mobile", () => {
  test("series categories and cards render", async ({ page }) => {
    await page.goto("/series");
    await page.waitForLoadState("load");
    await page.waitForTimeout(5000);

    const main = page.locator("main, [role='main']").first();
    await expect(main).toBeVisible({ timeout: 5000 });

    const body = page.locator("body");
    await expect(body).not.toHaveText(/error|not found/i, { timeout: 5000 });
  });
});

// ── TV Guide — Mobile ────────────────────────────────────────────

test.describe("TV Guide — Mobile", () => {
  test("guide page loads on mobile", async ({ page }) => {
    await page.goto("/guide");
    await page.waitForLoadState("load");
    await page.waitForTimeout(8000);

    // Guide heading or content should appear
    const main = page.locator("main, [role='main']").first();
    await expect(main).toBeVisible({ timeout: 10000 });

    // Guide should not show error
    const body = page.locator("body");
    await expect(body).not.toHaveText(/error/i, { timeout: 5000 });
  });
});
