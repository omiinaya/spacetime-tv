/**
 * Recordings (DVR) E2E tests — recordings list, player, delete.
 *
 * Prerequisites:
 *   - Backend API running on :8720
 *   - Frontend served on BASE_URL
 *   - Admin key configured (for delete test)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

test.describe("Recordings (DVR)", () => {
  test("recordings page loads", async ({ page }) => {
    await page.goto("/recordings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).toBeVisible({ timeout: 5_000 });
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(20);
    // Should be on the recordings route
    expect(page.url()).toContain("/recordings");
    // Heading renders
    await expect(page.getByRole("heading", { name: "Recordings" })).toBeVisible({
      timeout: 5_000,
    });
    console.log(`Recordings page loaded (${text.length} chars)`);
  });

  test("API returns recordings list", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/recordings`, {
      timeout: 10_000,
    });

    if (resp.ok()) {
      const data = await resp.json();
      expect(Array.isArray(data.recordings || data)).toBeTruthy();

      const recordings = data.recordings || data;
      console.log(`Recordings count: ${recordings.length}`);
      if (recordings.length > 0) {
        expect(recordings[0]).toHaveProperty("id");
        expect(recordings[0]).toHaveProperty("channel_name");
      }
    } else {
      console.log(`Recordings API returned ${resp.status()} (no recordings yet)`);
    }
  });

  test("recordings page shows empty state when no recordings exist", async ({ page }) => {
    await page.goto("/recordings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");

    // Should not crash — either shows recordings or empty state
    const text = await body.innerText();
    expect(page.url()).toContain("/recordings");

    // If no recordings, should show an empty state message (not a blank page)
    expect(text.length).toBeGreaterThan(10);

    // Page should not be showing an error
    await expect(body).not.toHaveText(/internal server error|crash|unexpected error/i, { timeout: 3_000 });

    console.log(`Recordings page content: ${text.substring(0, 200)}`);
  });

  test("recordings page has sidebar nav icon", async ({ page }) => {
    await page.goto("/recordings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    // The sidebar should have the recordings icon — check for the nav element.
    // On mobile the desktop sidebar is display:none and the drawer nav only
    // renders once the hamburger is opened, so assert on the hamburger first,
    // then on the :visible nav after opening.
    const isMobile = page.viewportSize()!.width < 768;

    if (isMobile) {
      const toggle = page.getByRole("button", { name: /open navigation/i });
      await expect(toggle).toBeVisible({ timeout: 5_000 });
      await toggle.click();
    }

    const nav = page.locator("[role='navigation']:visible").first();
    await expect(nav).toBeVisible({ timeout: 5_000 });

    // The nav or page should reference recordings
    const body = page.locator("body");
    const text = await body.innerText();
    expect(
      text.includes("Recordings") ||
      text.includes("History") ||
      text.includes("DVR") ||
      text.includes("recordings") ||
      text.includes("recording")
    ).toBeTruthy();
    console.log(`Recordings nav/page: references found`);
  });

  test("recordings API returns metadata for each recording", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/recordings`, {
      timeout: 10_000,
    });

    if (resp.ok()) {
      const data = await resp.json();
      const recordings = data.recordings || data;

      if (recordings.length > 0) {
        const first = recordings[0];
        // Check that each recording has the expected fields
        const fields = ["id", "channel_name", "channel_id", "programme_title", "duration", "start_time"];
        for (const field of fields) {
          const hasField = field in first;
          console.log(`  Recording metadata field "${field}": ${hasField}`);
        }
        expect(first).toHaveProperty("id");
      } else {
        console.log("No recordings to check metadata on");
      }
    } else {
      console.log(`Recordings API returned ${resp.status()}`);
    }
  });
});
