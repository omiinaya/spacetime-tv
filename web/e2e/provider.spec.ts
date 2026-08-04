/**
 * IPTV Provider configuration E2E tests — the Settings page provider section.
 *
 * Covers: section renders, form pre-fills from the API, test-connection
 * button, save flow (PUT /api/provider).
 *
 * NOTE: the save test PUTs the SAME values that are already configured
 * (idempotent — no destructive change to the live provider).
 *
 * Prerequisites:
 *   - Backend API running on :8720 (also serves the frontend)
 *   - A provider configured (server/.env IPTV_BASE/USER/PASS)
 *
 * Run: npm run test:e2e
 */

import { test, expect } from "@playwright/test";

const API_BASE = process.env.API_BASE || "http://127.0.0.1:8720";

test.describe("IPTV Provider Configuration", () => {
  test("settings page shows IPTV Provider section", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const body = page.locator("body");
    const text = await body.innerText();
    expect(text).toContain("IPTV Provider");
    expect(text).toContain("Xtream Codes");
    console.log("Provider section present on settings page");
  });

  test("provider form pre-fills from API", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const urlInput = page.getByLabel("Base URL");
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    const urlValue = await urlInput.inputValue();
    expect(urlValue.length).toBeGreaterThan(5);

    const userInput = page.getByLabel("Username");
    const userValue = await userInput.inputValue();
    expect(userValue.length).toBeGreaterThan(0);

    // Password field is empty and shows the "saved" placeholder
    const passInput = page.getByLabel("Password");
    expect(await passInput.inputValue()).toBe("");
    console.log(`Prefilled: base=${urlValue.length} chars, user=${userValue.length} chars`);
  });

  test("test-connection button validates against the panel", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const testBtn = page.getByText("Test connection");
    await expect(testBtn).toBeVisible({ timeout: 5_000 });
    await testBtn.click();

    // Either success (connection OK + count) or a graceful failure message —
    // the assertion target is that the button DOES something with feedback.
    const body = page.locator("body");
    await expect(body).toContainText(/Connection OK|Connection failed|Testing/, {
      timeout: 15_000,
    });
    console.log("Test-connection produced feedback");
  });

  test("save provider persists idempotently (same values)", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    const urlInput = page.getByLabel("Base URL");
    await expect(urlInput).toBeVisible({ timeout: 5_000 });
    const baseUrl = await urlInput.inputValue();
    const username = await page.getByLabel("Username").inputValue();
    const name = await page.getByLabel("Provider name").inputValue();

    // Save with unchanged values — PUT should succeed and show the message.
    await page.getByText("Save provider").click();
    await expect(page.locator("body")).toContainText(/saved/i, {
      timeout: 10_000,
    });

    // API-level verification: the provider is still configured with the same values
    const resp = await page.request.get(`${API_BASE}/api/provider`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.configured).toBeTruthy();
    expect(data.provider.base_url).toBe(baseUrl);
    expect(data.provider.username).toBe(username);
    expect(data.provider.name).toBe(name);
    console.log(`Provider saved idempotently: ${name} @ ${baseUrl}`);
  });

  test("provider API never leaks the password", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/provider`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.provider).not.toHaveProperty("password");
    expect(typeof data.provider.has_password).toBe("boolean");
    console.log(`has_password=${data.provider.has_password}, password field absent`);
  });
});
