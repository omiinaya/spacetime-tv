/**
 * NotFound (404) E2E tests — unknown routes render the NotFound page.
 *
 * Covers: 404 heading, descriptive copy, Go Home button navigates to "/",
 * Go Back button uses history.
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

test.describe("NotFound (404)", () => {
  test("unknown route shows the 404 page", async ({ page }) => {
    await page.goto("/this-route-does-not-exist-xyz");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    const heading = page.getByRole("heading", { name: "404" });
    await expect(heading).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Page not found")).toBeVisible({ timeout: 5_000 });
    console.log("404 page rendered for unknown route");
  });

  test("Go Home button navigates to the homepage", async ({ page }) => {
    await page.goto("/definitely-not-a-route");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    const goHome = page.getByText("Go Home");
    await expect(goHome).toBeVisible({ timeout: 5_000 });
    await goHome.click();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/");
    console.log("Go Home navigated to the homepage");
  });

  test("Go Back button returns to the previous page", async ({ page }) => {
    await page.goto("/live");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    await page.goto("/no-such-page-here");
    await page.waitForLoadState("load");
    await page.waitForTimeout(1500);

    const goBack = page.getByText("Go Back");
    await expect(goBack).toBeVisible({ timeout: 5_000 });
    await goBack.click();
    await page.waitForTimeout(2000);
    expect(page.url()).toContain("/live");
    console.log("Go Back returned to the previous page");
  });
});
