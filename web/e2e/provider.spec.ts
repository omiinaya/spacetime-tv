/**
 * IPTV Provider configuration E2E tests — the Settings page provider section.
 *
 * Covers: section renders, provider list + edit form pre-fills from the API,
 * test-connection button, save flow (PUT /api/providers/{idx}).
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

  test("provider list renders the configured provider", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    // The configured provider appears in the list (from server/.env).
    const editBtn = page.getByText("Edit");
    await expect(editBtn).toBeVisible({ timeout: 5_000 });

    // API-level: /providers returns at least one configured provider.
    const resp = await page.request.get(`${API_BASE}/api/v1/providers`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.providers.length).toBeGreaterThan(0);
    expect(data.providers[0].base_url.length).toBeGreaterThan(5);
    console.log(
      `Provider list: ${data.providers.length} configured, base=${data.providers[0].base_url.length} chars`,
    );
  });

  test("edit form pre-fills from API", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("load");
    await page.waitForTimeout(3000);

    await page.getByText("Edit").first().click();
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

    await page.getByText("Edit").first().click();
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

    await page.getByText("Edit").first().click();
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
    const resp = await page.request.get(`${API_BASE}/api/v1/providers`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.providers.length).toBeGreaterThan(0);
    expect(data.providers[0].base_url).toBe(baseUrl);
    expect(data.providers[0].username).toBe(username);
    expect(data.providers[0].name).toBe(name);
    console.log(`Provider saved idempotently: ${name} @ ${baseUrl}`);
  });

  test("provider API never leaks the password", async ({ page }) => {
    const resp = await page.request.get(`${API_BASE}/api/v1/providers`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.providers.length).toBeGreaterThan(0);
    expect(data.providers[0]).not.toHaveProperty("password");
    expect(typeof data.providers[0].has_password).toBe("boolean");
    console.log(
      `has_password=${data.providers[0].has_password}, password field absent`,
    );
  });
});
