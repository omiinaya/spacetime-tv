/**
 * Person Page E2E tests — /person/:encodedName (TMDB person details).
 *
 * TMDB enrichment may be disabled on the server. This spec asserts the
 * page renders gracefully in BOTH cases: with data (name/credits) or
 * without (disabled/unknown → a friendly error + Back button). The
 * invariant is "the page loads and never crashes".
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

test.describe("Person Page", () => {
  test("person page loads for a known name without crashing", async ({ page }) => {
    await page.goto("/person/Tom%20Hanks");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).toBeVisible({ timeout: 5_000 });

    // Back button is always rendered
    const backBtn = page.getByText("Back").first();
    await expect(backBtn).toBeVisible({ timeout: 5_000 });

    // Either the person's info rendered, or a graceful error state
    const text = await body.innerText();
    const hasInfo = /Tom Hanks|known for|born/i.test(text);
    const hasError = /No results found|Could not search/i.test(text);
    expect(hasInfo || hasError).toBeTruthy();
    console.log(
      hasInfo ? "Person info rendered" : "Person page showed graceful error state",
    );
  });

  test("person page handles an unknown name gracefully", async ({ page }) => {
    await page.goto("/person/Definitely%20Not%20A%20Real%20Person%20XYZ");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).not.toHaveText(/internal server error|crash|unexpected error/i, {
      timeout: 5_000,
    });
    const text = await body.innerText();
    const hasError = /No results found|Could not search|not found/i.test(text);
    const hasBack = text.includes("Back");
    expect(hasBack).toBeTruthy();
    // Unknown names must show an error state — never a silent blank page
    expect(hasError || text.length > 100).toBeTruthy();
    console.log("Unknown person name handled gracefully");
  });

  test("person page back button navigates back", async ({ page }) => {
    // Land on the movies page first, then go to a person page
    await page.goto("/movies");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    await page.goto("/person/Tom%20Hanks");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    const backBtn = page.getByText("Back").first();
    await expect(backBtn).toBeVisible({ timeout: 5_000 });
    await backBtn.click();
    await page.waitForTimeout(1500);
    // History back lands on the previous SPA page (movies)
    expect(page.url()).toContain("/movies");
    console.log("Person page Back navigates to previous page");
  });
});
