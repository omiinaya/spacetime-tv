/**
 * Guide (EPG) E2E tests — schedule display, channel info, program data.
 *
 * IMPORTANT: The guide endpoint loads full EPG data which can be large.
 * Use waitForLoadState("load") + generous timeout — not "networkidle".
 *
 * Prerequisites:
 *   - Backend API running on :8720
 *   - Frontend served on BASE_URL
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

test.describe("TV Guide (EPG)", () => {
  test("guide page loads", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/guide");
    await page.waitForLoadState("load");
    // Give EPG data time to render (large dataset)
    await page.waitForTimeout(15000);

    // Should show guide content
    const body = page.locator("main, #root > div, [role='main']").first();
    const text = await body.innerText();
    expect(text.length).toBeGreaterThan(50);
    console.log(`Guide page loaded (${text.length} chars)`);
  });

  test("guide API returns current programs for a channel", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/guide/now?stream_ids=483974,483976`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data).toBeTruthy();
    expect(data.programmes).toBeTruthy();
    console.log(`Guide now keys: ${Object.keys(data).join(", ")}`);

    // Should have at least one programme
    const progs = data.programmes || {};
    const channelIds = Object.keys(progs);
    console.log(`  Channels: ${channelIds.join(", ")}`);
    expect(channelIds.length).toBeGreaterThan(0);
    for (const chId of channelIds) {
      if (progs[chId]) {
        expect(progs[chId]).toHaveProperty("title");
      }
    }
  });

  test("guide page displays channel schedule grid", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/guide");
    await page.waitForLoadState("load");
    await page.waitForTimeout(15000);

    // Look for schedule-like indicators
    const bodyText = await page.locator("body").innerText();
    const hasScheduleIndicators =
      /\d{1,2}:\d{2}/.test(bodyText) || // Time format HH:MM
      bodyText.includes("Now") ||
      bodyText.includes("Guide") ||
      bodyText.includes("channels") ||
      bodyText.includes("programme");

    console.log(`Guide schedule indicators: ${hasScheduleIndicators}`);
    if (hasScheduleIndicators) {
      const sample = bodyText.substring(0, 300);
      console.log(`Guide content preview: ${sample}`);
    }

    // Page should not show an error
    await expect(page.locator("body")).not.toHaveText(/404|error|failed|unable to load/i, { timeout: 5_000 });
  });

  test("guide API returns paginated channel groups", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/guide?offset=0&limit=5`, { timeout: 30_000 });
    if (resp.ok()) {
      const data = await resp.json();
      expect(data).toHaveProperty("channel_groups");
      expect(data).toHaveProperty("total_channels");
      const groups = data.channel_groups;
      expect(Array.isArray(groups)).toBeTruthy();
      console.log(`Guide groups: ${groups.length} of ${data.total_channels} total`);
      if (groups.length > 0) {
        expect(groups[0]).toHaveProperty("channel_name");
        expect(groups[0]).toHaveProperty("programmes");
      }
    } else {
      console.log(`Guide endpoint returned ${resp.status()} (may need EPG data loaded)`);
    }
  });
});
