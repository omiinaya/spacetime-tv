/**
 * Admin Dashboard E2E tests — /admin.
 *
 * Covers: admin-key prompt gate, dashboard stats load with a valid key,
 * cache controls and EPG refresh sections render, provider status in the
 * admin API.
 *
 * The admin key is read at RUNTIME from server/.env (gitignored — the key
 * value never appears in this file or in test output). If it cannot be
 * read, the dashboard tests are skipped gracefully.
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

/**
 * Read ADMIN_API_KEY at runtime from the sources the server actually uses.
 * Priority: process env → systemd EnvironmentFile → server/.env.
 * The key value is never printed or committed.
 */
function readAdminKey(): string {
  if (process.env.ADMIN_API_KEY) return process.env.ADMIN_API_KEY;
  const candidates = [
    new URL("../../../.hermes/auth/projects/spacetime-tv.env", import.meta.url),
    new URL("../../server/.env", import.meta.url),
  ];
  for (const envPath of candidates) {
    try {
      const env = readFileSync(envPath, "utf8");
      const m = env.match(/^ADMIN_API_KEY=(.*)$/m);
      if (m && m[1].trim()) return m[1].trim();
    } catch {
      /* try next source */
    }
  }
  return "";
}

const adminKey = readAdminKey();
const hasAdminKey = adminKey.length > 0;

test.describe("Admin Dashboard", () => {
  test("admin page without key shows the key prompt", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    const body = page.locator("body");
    const text = await body.innerText();
    expect(text).toContain("Admin Key Required");
    console.log("Admin key prompt shown without a key");
  });

  test("admin API rejects requests without a key", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/admin/stats`);
    expect(resp.status()).toBeGreaterThanOrEqual(400);
    console.log(`Admin stats without key → HTTP ${resp.status()}`);
  });

  test.skip(!hasAdminKey, "admin key unavailable — dashboard tests skipped");

  test("dashboard loads stats with a valid key", async ({ page }) => {
    // Seed sessionStorage before the app reads it (page is loaded at /admin
    // first, then the key is set and the page reloads).
    await page.goto("/admin");
    await page.evaluate((k) => sessionStorage.setItem("adminKey", k), adminKey);
    await page.reload();
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).toContainText("Admin Dashboard", { timeout: 15_000 });
    // Stats cards render after the stats fetch resolves — poll for each label.
    await expect(body).toContainText("Cache Entries", { timeout: 15_000 });
    await expect(body).toContainText("Cache Hit Rate", { timeout: 10_000 });
    await expect(body).toContainText("EPG Age", { timeout: 10_000 });
    console.log("Admin dashboard stats rendered");
  });

  test("cache controls and EPG refresh sections render", async ({ page }) => {
    await page.goto("/admin");
    await page.evaluate((k) => sessionStorage.setItem("adminKey", k), adminKey);
    await page.reload();
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).toContainText("Cache Controls", { timeout: 10_000 });
    await expect(body).toContainText("Clear Cache");
    await expect(body).toContainText("EPG Guide");
    await expect(body).toContainText("Refresh EPG Now");
    console.log("Cache controls + EPG refresh sections present");
  });

  test("admin API returns provider status with a valid key", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/admin/providers`, {
      headers: { "X-Admin-Key": adminKey },
    });
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(Array.isArray(data.providers)).toBeTruthy();
    expect(data.providers.length).toBeGreaterThan(0);
    // Provider entries include health but never the password
    expect(data.providers[0]).toHaveProperty("health");
    expect(data.providers[0]).not.toHaveProperty("password");
    console.log(`Admin provider status: ${data.providers.length} provider(s)`);
  });
});
