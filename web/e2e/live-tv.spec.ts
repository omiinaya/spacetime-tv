/**
 * Live TV E2E tests — real browser, real API.
 *
 * Prerequisites:
 *   - Backend API running (default http://127.0.0.1:8720)
 *   - Frontend served on BASE_URL (default http://192.0.2.10:5183)
 *
 * IMPORTANT: Do NOT use waitForLoadState("networkidle") on /watch/live/ pages
 * — the streaming endpoint keeps an open HTTP connection forever, so
 * networkidle never fires. Use "load" or "domcontentloaded" instead.
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

test.describe("Live TV channel playback", () => {
  test("Live TV page loads and shows channels", async ({ page }) => {
    await page.goto("/live");
    await page.waitForLoadState("networkidle");

    // Should show channel count (48k+)
    await expect(page.getByText(/channels/)).toBeVisible({ timeout: 10_000 });
    const text = await page.locator("main").innerText();
    expect(text).toMatch(/\d+,\d+ channels/);
  });

  test("navigating to /watch/live/:id shows video player", async ({ page }) => {
    // Navigate directly (same as clicking a channel card)
    await page.goto("/watch/live/483974");
    // Use "load" instead of "networkidle" — the stream keeps the connection open
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    // Should be on a /watch/live/ route
    expect(page.url()).toContain("/watch/live/");

    // Video element should exist
    const video = page.locator("video");
    await expect(video).toBeVisible({ timeout: 10_000 });

    // Video should have detected stream metadata (width/height populated)
    await page.waitForFunction(
      () => {
        const v = document.querySelector("video");
        return v && v.videoWidth > 0 && v.videoHeight > 0;
      },
      { timeout: 15_000 },
    );
  });

  test("channel playback starts within reasonable time", async ({ page }) => {
    await page.goto("/watch/live/483974");
    await page.waitForLoadState("load");

    const video = page.locator("video");
    await expect(video).toBeVisible({ timeout: 10_000 });

    // Wait for playback — readyState >= 2 means HAVE_CURRENT_DATA
    try {
      await page.waitForFunction(
        () => {
          const v = document.querySelector("video");
          if (!v) return false;
          return v.readyState >= 2 && !v.paused && v.currentTime > 0;
        },
        { timeout: 25_000 },
      );
    } catch {
      await page.screenshot({ path: "/tmp/e2e-playback-failure.png" });
      const state = await page.evaluate(() => {
        const v = document.querySelector("video");
        return {
          readyState: v?.readyState ?? -1,
          paused: v?.paused,
          currentTime: v?.currentTime,
          error: v?.error?.message ?? null,
          buffered: v?.buffered?.length ?? 0,
          innerText: document.querySelector("main")?.innerText?.substring(0, 200),
        };
      });
      console.log("Playback state:", JSON.stringify(state, null, 2));
      throw new Error("Video failed to start playing within 25s");
    }

    // Verify actively playing
    const ct = await page.evaluate(() => {
      const v = document.querySelector("video")!;
      return { readyState: v.readyState, currentTime: v.currentTime, paused: v.paused };
    });
    expect(ct.readyState).toBeGreaterThanOrEqual(2);
    expect(ct.paused).toBe(false);
    expect(ct.currentTime).toBeGreaterThan(0);
  });

  test("SPA navigation: live TV list -> channel URL", async ({ page }) => {
    // Start on live TV page
    await page.goto("/live");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Navigate to a known channel via URL (simulates clicking a card)
    await page.goto("/watch/live/483974");
    await page.waitForLoadState("load");

    const video = page.locator("video");
    await expect(video).toBeVisible({ timeout: 10_000 });

    // Wait for playback to start
    await page.waitForFunction(
      () => {
        const v = document.querySelector("video");
        return v && v.readyState >= 2 && !v.paused && v.currentTime > 0;
      },
      { timeout: 25_000 },
    );

    const ct = await page.evaluate(() => document.querySelector("video")!.currentTime);
    expect(ct).toBeGreaterThan(0);
  });

  test("multiple diverse channels via API probe all return valid codecs", async ({ page }) => {
    // Fetch channel list
    const resp = await page.request.get(`${API_BASE}/api/live/all-slim`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    const streams: any[] = data.streams || data;
    expect(streams.length).toBeGreaterThan(0);

    // Pick 5 channels across different categories
    const seen = new Set<string>();
    const picks: { id: number; name: string }[] = [];
    for (const s of streams) {
      const cid = String(s.category_id || "");
      if (!seen.has(cid) && !s.name?.startsWith("#") && s.stream_id) {
        seen.add(cid);
        picks.push({ id: s.stream_id, name: s.name || "?" });
        if (picks.length >= 5) break;
      }
    }
    expect(picks.length).toBe(5);

    // Probe all 5 via API
    for (const { id: sid, name } of picks) {
      const probeResp = await page.request.get(`${API_BASE}/api/live/probe/${sid}`, { timeout: 15_000 });
      expect(probeResp.ok()).toBeTruthy();
      const probe = await probeResp.json();
      expect(probe.codec).toBeTruthy();
      // Verify they're known codecs
      expect(["h264", "hevc", "h265", "mpeg4"]).toContain(probe.codec);
      console.log(`  ${sid}: ${probe.codec} ${probe.width || "?"}x${probe.height || "?"} — ${name.slice(0, 40)}`);
    }
  });
});
