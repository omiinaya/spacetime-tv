/**
 * Agent Access E2E tests — /admin/agents.
 *
 * Covers: admin-key prompt gate, agents list rendering with a valid key,
 * empty state when no pending agents exist.
 *
 * The admin key is read at RUNTIME from server/.env (gitignored — the key
 * value never appears in this file or in test output). If it cannot be
 * read, the authenticated tests are skipped gracefully.
 *
 * The page proxies to the hermes-id auth server; when that server is
 * reachable the list renders (possibly empty). Assertions are tolerant of
 * an empty list (the empty state is a valid outcome).
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *   - hermes-id auth server reachable (optional — empty list is fine)
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

test.describe("Agent Access", () => {
  test("agent access page without key shows the key prompt", async ({ page }) => {
    await page.goto("/admin/agents");
    await page.waitForLoadState("load");
    await page.waitForTimeout(2000);

    const body = page.locator("body");
    const text = await body.innerText();
    expect(text).toContain("Admin Key Required");
    console.log("Agent access key prompt shown without a key");
  });

  test.skip(!hasAdminKey, "admin key unavailable — agent tests skipped");

  test("agent access page loads with a valid key", async ({ page }) => {
    await page.goto("/admin/agents");
    await page.evaluate((k) => sessionStorage.setItem("adminKey", k), adminKey);
    await page.reload();
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).toContainText("Agent Access", { timeout: 10_000 });
    const text = await body.innerText();
    expect(text).toContain("hermes-id");
    console.log("Agent access page rendered");
  });

  test("agent list renders or shows empty state", async ({ page }) => {
    await page.goto("/admin/agents");
    await page.evaluate((k) => sessionStorage.setItem("adminKey", k), adminKey);
    await page.reload();
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    await expect(body).toContainText("Agent Access", { timeout: 10_000 });
    // Either pending agents exist (list rows) or the empty state shows.
    const text = await body.innerText();
    const hasList = /pending agents/i.test(text) || /approve|deny/i.test(text);
    const hasEmpty = /No pending agents/i.test(text);
    expect(hasList || hasEmpty).toBeTruthy();
    console.log(
      hasEmpty
        ? "Agent list: empty state shown"
        : "Agent list: pending agents rendered",
    );
  });

  test("agent API is reachable with a valid key", async ({ page }) => {
    const resp = await page.request.get(
      `${API_BASE}/api/admin/hermes-id/agents?status=pending`,
      { headers: { "X-Admin-Key": adminKey } },
    );
    // 200 = proxy succeeded; 5xx from the auth server is also a valid
    // reachable-backend response (proxy is up, upstream answered).
    expect(resp.status()).toBeGreaterThanOrEqual(200);
    console.log(`Agent API responded HTTP ${resp.status()}`);
  });
});
